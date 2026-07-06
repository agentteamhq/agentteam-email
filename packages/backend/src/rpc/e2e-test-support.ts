import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { HttpStatusCode } from '@main/common'
import debug from 'debug'
import { Elysia, t } from 'elysia'

import { globals } from '../globals'
import { parseBearerAuthorization } from '../auth/authorization-header'
import { createSafeErrorLogDetails, createSafeRequestLogDetails } from '../auth/log-redaction'
import { createSafeRequestCorrelationLogDetails, mapPublicErrorResponse } from '../public-error-response'
import { PRIVATE_VARS } from '../vars.private'
import { PUBLIC_VARS } from '../vars.public'
import type { PublicErrorResponse, PublicErrorResponseBody } from '../public-error-response'

const TEST_SUPPORT_SEED = 'e2e-test-support'
const E2E_TEST_SUPPORT_BEARER_CHALLENGE = 'Bearer realm="agentteam-e2e-test-support"'
const HTTP_STATUS_UNAUTHORIZED: number = HttpStatusCode.Unauthorized
const log = debug('app:rpc:e2e-test-support')

type E2eTestSupportResponseSet = {
  headers: Record<string, number | string>
  status?: number | string
}

function bearerToken(request: Request): string | null {
  const bearer = parseBearerAuthorization(request.headers)
  return bearer.status === 'present' ? bearer.token : null
}

function constantTimeStringEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

function hasValidSupportToken(request: Request): boolean {
  const expected = PRIVATE_VARS.E2E_TEST_SUPPORT_TOKEN
  const actual = bearerToken(request)
  return Boolean(expected && actual && constantTimeStringEqual(actual, expected))
}

function normalizeTestEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  if (!normalized.endsWith('.test')) {
    return null
  }
  return normalized
}

export const e2eTestSupport = new Elysia({
  name: 'e2e-test-support',
  prefix: '/e2e'
}).post(
  '/test-principals',
  async ({ body, request, set, status }) => {
    if (!PRIVATE_VARS.E2E_TEST_SUPPORT_ENABLED) {
      return e2eTestSupportErrorResponse({
        reason: 'support_disabled',
        request,
        set,
        statusCode: HttpStatusCode.NotFound
      })
    }
    if (!PRIVATE_VARS.E2E_TEST_SUPPORT_TOKEN) {
      return e2eTestSupportErrorResponse({
        reason: 'support_token_missing',
        request,
        set,
        statusCode: 500
      })
    }
    if (!hasValidSupportToken(request)) {
      return e2eTestSupportErrorResponse({
        reason: 'invalid_support_token',
        request,
        set,
        statusCode: HttpStatusCode.Unauthorized
      })
    }

    const email = normalizeTestEmail(body.email)
    if (!email) {
      return e2eTestSupportErrorResponse({
        reason: 'invalid_test_principal_email',
        request,
        set,
        statusCode: HttpStatusCode.BadRequest
      })
    }

    const name = body.name.trim()
    try {
      const { auth, db } = await globals()
      let user = await db.models.user.findOne({ email }).exec()

      if (!user) {
        await auth.api.signUpEmail({
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

        user = await db.models.user.findOne({ email }).exec()
      }

      if (!user) {
        return e2eTestSupportErrorResponse({
          reason: 'principal_missing_after_signup',
          request,
          set,
          statusCode: 500
        })
      }

      if (user.generatedFromSeed && user.generatedFromSeed !== TEST_SUPPORT_SEED) {
        return e2eTestSupportErrorResponse({
          reason: 'non_e2e_principal_conflict',
          request,
          set,
          statusCode: HttpStatusCode.Conflict
        })
      }

      await db.models.user
        .updateOne(
          { _id: user._id },
          {
            $set: {
              emailVerified: true,
              generatedFromSeed: TEST_SUPPORT_SEED,
              isGenerated: true,
              name
            }
          }
        )
        .exec()

      const verifiedUser = await db.models.user.findById(user._id).exec()

      if (!verifiedUser) {
        return e2eTestSupportErrorResponse({
          reason: 'principal_missing_after_update',
          request,
          set,
          statusCode: 500
        })
      }

      return status(HttpStatusCode.Ok, {
        principal: {
          email: verifiedUser.email,
          emailVerified: true,
          name: verifiedUser.name,
          userId: verifiedUser._id
        }
      })
    } catch (error) {
      return e2eTestSupportErrorResponse({
        error,
        reason: 'principal_provision_failed',
        request,
        set,
        statusCode: 500
      })
    }
  },
  {
    body: t.Object({
      email: t.String({ minLength: 3 }),
      name: t.String({ minLength: 1 }),
      password: t.String({ minLength: 8 })
    })
  }
)

function e2eTestSupportErrorResponse({
  error,
  reason,
  request,
  set,
  statusCode
}: {
  error?: unknown
  reason: string
  request: Request
  set: E2eTestSupportResponseSet
  statusCode: number
}): PublicErrorResponseBody {
  const errorForLog = error ?? { status: statusCode }
  const publicError = mapPublicErrorResponse({
    code: statusCode,
    error: errorForLog,
    request
  })
  if (publicError.status === HTTP_STATUS_UNAUTHORIZED) {
    set.headers['WWW-Authenticate'] = E2E_TEST_SUPPORT_BEARER_CHALLENGE
  }
  set.status = publicError.status
  logE2eTestSupportHandledError(errorForLog, publicError, request, reason)
  return publicError.body
}

function logE2eTestSupportHandledError(
  error: unknown,
  publicError: PublicErrorResponse,
  request: Request,
  reason: string
) {
  const errorLogDetails = createSafeErrorLogDetails(error)
  log('e2e_test_support_handled_error %o', {
    error: errorLogDetails,
    ...(errorLogDetails.code ? { errorCode: errorLogDetails.code } : {}),
    operation: 'e2e_test_support_principal_create',
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

export default e2eTestSupport
