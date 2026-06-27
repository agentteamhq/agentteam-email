import { randomUUID } from 'node:crypto'

import { HttpStatusCode } from '@main/common'
import { Elysia, t } from 'elysia'

import { globals } from '../globals'
import { PUBLIC_VARS } from '../vars.public'

const FIRST_ADMIN_SETUP_LOCK_KEY = 'admin-setup:first-admin'
const FIRST_ADMIN_SETUP_LOCK_TTL_MS = 10 * 60 * 1000

type AdminSetupDatabase = Awaited<ReturnType<typeof globals>>['db']

const adminSetup = new Elysia({
  name: 'admin-setup',
  prefix: '/admin/setup'
}).post(
  '/first-admin',
  async ({ body, status }) => {
    const email = body.email.trim().toLowerCase()
    const name = body.name?.trim() || email.split('@', 1)[0] || 'Admin'

    if (body.password !== body.confirmPassword) {
      return status(HttpStatusCode.BadRequest, {
        error: 'Passwords do not match.'
      })
    }

    const { auth, db } = await globals()
    if (await hasAdminUser(db)) {
      return status(HttpStatusCode.Conflict, {
        error: 'Admin setup is already complete.'
      })
    }

    const setupLockToken = await tryAcquireFirstAdminSetupLock(db)
    if (!setupLockToken) {
      return status(HttpStatusCode.Conflict, {
        error: 'Admin setup is already complete.'
      })
    }

    try {
      if (await hasAdminUser(db)) {
        return status(HttpStatusCode.Conflict, {
          error: 'Admin setup is already complete.'
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
      } catch {
        return status(HttpStatusCode.BadRequest, {
          error: 'Admin account could not be created.'
        })
      }

      const createdUserId = readSignUpUserId(signUpResult)
      if (!createdUserId) {
        return status(HttpStatusCode.Conflict, {
          error: 'Admin account could not be created.'
        })
      }

      const createdUser = await db.models.user.findById(createdUserId).exec()
      if (!createdUser || createdUser.email !== email) {
        return status(HttpStatusCode.Conflict, {
          error: 'Admin account could not be created.'
        })
      }

      if (await hasAdminUser(db)) {
        return status(HttpStatusCode.Conflict, {
          error: 'Admin setup is already complete.'
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
        return status(HttpStatusCode.Conflict, {
          error: 'Admin setup is already complete.'
        })
      }

      return {
        redirectTo: '/signin/'
      }
    } finally {
      try {
        await releaseFirstAdminSetupLock(db, setupLockToken)
      } catch {
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
      400: t.Object({
        error: t.String()
      }),
      409: t.Object({
        error: t.String()
      })
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

export default adminSetup
