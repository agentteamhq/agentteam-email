import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { HttpStatusCode } from '@main/common'
import { Elysia, t } from 'elysia'

import { globals } from '../globals'
import { PRIVATE_VARS } from '../vars.private'
import { PUBLIC_VARS } from '../vars.public'

const TEST_SUPPORT_SEED = 'e2e-test-support'

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  const prefix = 'Bearer '
  if (!authorization?.startsWith(prefix)) {
    return null
  }
  const token = authorization.slice(prefix.length).trim()
  return token || null
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
  async ({ body, request, status }) => {
    if (!PRIVATE_VARS.E2E_TEST_SUPPORT_ENABLED) {
      return status(HttpStatusCode.NotFound, { message: 'Not found' })
    }
    if (!PRIVATE_VARS.E2E_TEST_SUPPORT_TOKEN) {
      return status(500, {
        message: 'E2E test support token is not configured'
      })
    }
    if (!hasValidSupportToken(request)) {
      return status(HttpStatusCode.Unauthorized, { message: 'Unauthorized' })
    }

    const email = normalizeTestEmail(body.email)
    if (!email) {
      return status(HttpStatusCode.BadRequest, {
        message: 'E2E test principal email must use a .test domain'
      })
    }

    const name = body.name.trim()
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
      return status(500, {
        message: 'Failed to provision E2E test principal'
      })
    }

    if (user.generatedFromSeed && user.generatedFromSeed !== TEST_SUPPORT_SEED) {
      return status(HttpStatusCode.Conflict, {
        message: 'Email belongs to a non-E2E test principal'
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
      return status(500, {
        message: 'Failed to read E2E test principal'
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
  },
  {
    body: t.Object({
      email: t.String({ minLength: 3 }),
      name: t.String({ minLength: 1 }),
      password: t.String({ minLength: 8 })
    })
  }
)

export default e2eTestSupport
