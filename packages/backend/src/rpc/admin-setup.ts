import { randomUUID } from 'node:crypto'

import { HttpStatusCode } from '@main/common'
import debug from 'debug'
import { Elysia, t } from 'elysia'

import { createSafeErrorLogDetails, createSafeRequestLogDetails } from '../auth/log-redaction'
import { globals } from '../globals'
import {
  createSafeRequestCorrelationLogDetails,
  mapPublicErrorResponse,
  publicErrorResponseBodySchema
} from '../public-error-response'
import { PUBLIC_VARS } from '../vars.public'
import type { PublicErrorResponse, PublicErrorResponseBody } from '../public-error-response'

const FIRST_ADMIN_SETUP_LOCK_KEY = 'admin-setup:first-admin'
const FIRST_ADMIN_SETUP_LOCK_TTL_MS = 10 * 60 * 1000
const log = debug('app:rpc:admin-setup')

type AdminSetupDatabase = Awaited<ReturnType<typeof globals>>['db']
type AdminSetupResponseSet = {
  status?: number | string
}

const adminSetup = new Elysia({
  name: 'admin-setup',
  prefix: '/admin/setup'
}).post(
  '/first-admin',
  async ({ body, request, set }) => {
    const email = body.email.trim().toLowerCase()
    const name = body.name?.trim() || email.split('@', 1)[0] || 'Admin'

    if (body.password !== body.confirmPassword) {
      return adminSetupStatusErrorResponse({
        reason: 'password_mismatch',
        request,
        set,
        statusCode: HttpStatusCode.BadRequest
      })
    }

    const { auth, db } = await globals()
    if (await hasAdminUser(db)) {
      return adminSetupStatusErrorResponse({
        reason: 'admin_setup_already_complete',
        request,
        set,
        statusCode: HttpStatusCode.Conflict
      })
    }

    const setupLockToken = await tryAcquireFirstAdminSetupLock(db)
    if (!setupLockToken) {
      return adminSetupStatusErrorResponse({
        reason: 'first_admin_setup_lock_held',
        request,
        set,
        statusCode: HttpStatusCode.Conflict
      })
    }

    try {
      if (await hasAdminUser(db)) {
        return adminSetupStatusErrorResponse({
          reason: 'admin_setup_completed_during_lock',
          request,
          set,
          statusCode: HttpStatusCode.Conflict
        })
      }

      let signUpResult: unknown
      try {
        signUpResult = await auth.api.signUpEmail({
          body: {
            email,
            name,
            password: body.password,
            rememberMe: false
          },
          headers: new Headers({
            accept: 'application/json',
            origin: PUBLIC_VARS.PUBLIC_HOSTNAME
          })
        })
      } catch (error) {
        return adminSetupStatusErrorResponse({
          error,
          reason: 'better_auth_signup_failed',
          request,
          set,
          statusCode: HttpStatusCode.BadRequest
        })
      }

      const createdUserId = readSignUpUserId(signUpResult)
      if (!createdUserId) {
        return adminSetupStatusErrorResponse({
          reason: 'missing_signup_user_id',
          request,
          set,
          statusCode: HttpStatusCode.Conflict
        })
      }

      const createdUser = await db.models.user.findById(createdUserId).exec()
      if (!createdUser || createdUser.email !== email) {
        return adminSetupStatusErrorResponse({
          reason: 'created_user_mismatch',
          request,
          set,
          statusCode: HttpStatusCode.Conflict
        })
      }

      if (await hasAdminUser(db)) {
        return adminSetupStatusErrorResponse({
          reason: 'admin_setup_completed_before_promotion',
          request,
          set,
          statusCode: HttpStatusCode.Conflict
        })
      }

      const updateResult = await db.models.user
        .updateOne(
          {
            _id: createdUser._id,
            role: { $ne: 'admin' }
          },
          {
            $set: {
              emailVerified: true,
              role: 'admin'
            }
          }
        )
        .exec()

      if (updateResult.matchedCount !== 1) {
        return adminSetupStatusErrorResponse({
          reason: 'admin_promotion_not_matched',
          request,
          set,
          statusCode: HttpStatusCode.Conflict
        })
      }

      return {
        redirectTo: '/signin/'
      }
    } finally {
      try {
        await releaseFirstAdminSetupLock(db, setupLockToken)
      } catch (error) {
        logAdminSetupLockReleaseFailure(error, request)
        // The lock has a TTL, and admin existence remains the setup-complete source of truth.
      }
    }
  },
  {
    body: t.Object({
      confirmPassword: t.String({ minLength: 1 }),
      email: t.String({ format: 'email', minLength: 1 }),
      name: t.Optional(t.String({ minLength: 1 })),
      password: t.String({ maxLength: 128, minLength: 8 })
    }),
    response: {
      200: t.Object({
        redirectTo: t.Literal('/signin/')
      }),
      400: publicErrorResponseBodySchema,
      409: publicErrorResponseBodySchema
    }
  }
)

async function hasAdminUser(db: AdminSetupDatabase): Promise<boolean> {
  const adminUserCount = await db.models.user.countDocuments({ role: 'admin' }).exec()
  return adminUserCount > 0
}

async function tryAcquireFirstAdminSetupLock(db: AdminSetupDatabase): Promise<string | null> {
  const now = new Date()
  const token = randomUUID()
  await db.models.betterAuthSecondaryStorage
    .deleteOne({
      expiresAt: { $lte: now },
      key: FIRST_ADMIN_SETUP_LOCK_KEY
    })
    .exec()

  try {
    await db.models.betterAuthSecondaryStorage.create({
      expiresAt: new Date(now.getTime() + FIRST_ADMIN_SETUP_LOCK_TTL_MS),
      key: FIRST_ADMIN_SETUP_LOCK_KEY,
      value: token
    })
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return null
    }
    throw error
  }

  return token
}

async function releaseFirstAdminSetupLock(db: AdminSetupDatabase, setupLockToken: string): Promise<void> {
  await db.models.betterAuthSecondaryStorage
    .deleteOne({
      key: FIRST_ADMIN_SETUP_LOCK_KEY,
      value: setupLockToken
    })
    .exec()
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000
  )
}

function readSignUpUserId(result: unknown): string | null {
  if (!result || typeof result !== 'object') {
    return null
  }

  const user = (result as { user?: unknown }).user
  if (!user || typeof user !== 'object') {
    return null
  }

  const id = (user as { id?: unknown }).id
  return typeof id === 'string' && id.trim() ? id : null
}

function adminSetupStatusErrorResponse({
  error,
  reason,
  request,
  set,
  statusCode
}: {
  error?: unknown
  reason: string
  request: Request
  set: AdminSetupResponseSet
  statusCode: number
}): PublicErrorResponseBody {
  const publicError = mapPublicErrorResponse({
    code: statusCode,
    error: error ?? { status: statusCode },
    request
  })
  logAdminSetupHandledError(error ?? { status: statusCode }, publicError, request, reason)
  set.status = publicError.status
  return publicError.body
}

function logAdminSetupHandledError(
  error: unknown,
  publicError: PublicErrorResponse,
  request: Request,
  reason: string
) {
  const errorLogDetails = createSafeErrorLogDetails(error)
  log('first_admin_setup_handled_error %o', {
    error: errorLogDetails,
    ...(errorLogDetails.code ? { errorCode: errorLogDetails.code } : {}),
    operation: 'first_admin_setup',
    publicError: {
      code: publicError.body.code,
      status: publicError.status,
      ...(publicError.body.supportReference ? { supportReference: publicError.body.supportReference } : {})
    },
    reason,
    ...createSafeRequestCorrelationLogDetails(request),
    ...createSafeRequestLogDetails(request)
  })
}

function logAdminSetupLockReleaseFailure(error: unknown, request: Request) {
  const errorLogDetails = createSafeErrorLogDetails(error)
  log('first_admin_setup_lock_release_failed %o', {
    error: errorLogDetails,
    ...(errorLogDetails.code ? { errorCode: errorLogDetails.code } : {}),
    operation: 'first_admin_setup_lock_release',
    reason: 'lock_release_failed',
    ...createSafeRequestCorrelationLogDetails(request),
    ...createSafeRequestLogDetails(request)
  })
}

export default adminSetup
