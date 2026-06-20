// env.ts
import { base64urlnopad as base64url } from '@scure/base'
import debug from 'debug'
import { z } from 'zod'

import { PUBLIC_VARS } from './vars.public'
import { resolveEnvironment } from './resolve-environment'

const parseStringToNumber = (value: string) => {
  const port = parseInt(value, 10)
  if (isNaN(port)) {
    throw new Error(`Invalid: "${value}" is not a number.`)
  }
  return port
}

const optionalStringToBoolean = (name: string) => {
  return (val: unknown): boolean => {
    if (val === null || val === undefined || val === '') {
      return false
    }

    if (val === true || val === 'true' || val === '1') {
      return true
    }

    if (val === false || val === 'false' || val === '0') {
      return false
    }

    throw new Error(`${name} must be "true"/"false" or "1"/"0", got: ${JSON.stringify(val)}`)
  }
}

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
)

const optionalBase64Url32ByteSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .min(1)
    .superRefine((value, context) => {
      let decoded: Uint8Array
      try {
        decoded = base64url.decode(value)
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'ENCRYPT_SECRET_KEY must be base64url-encoded'
        })
        return
      }

      if (decoded.byteLength !== 32) {
        context.addIssue({
          code: 'custom',
          message: 'ENCRYPT_SECRET_KEY must decode to exactly 32 bytes'
        })
      }
    })
    .optional()
)

// Define your environment schema.
const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().optional(),
  ENCRYPT_SECRET_KEY: optionalBase64Url32ByteSecret,
  E2E_TEST_SUPPORT_ENABLED: z
    .preprocess(optionalStringToBoolean('E2E_TEST_SUPPORT_ENABLED'), z.boolean())
    .default(false),
  E2E_TEST_SUPPORT_TOKEN: optionalNonEmptyString,

  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),

  CLOUDFLARE_API_BASE_URL: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_AUTHORIZATION_URL: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_CLIENT_ID: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_CLIENT_SECRET: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_ISSUER: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_REVOKE_URL: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_SCOPES: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_TOKEN_URL: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_USERINFO_URL: optionalNonEmptyString,

  DATABASE_URL: z.string().min(1),

  DEBUG: z.string().optional(),

  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),

  SMTP_ADDRESS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_PORT: z.string().default('1025').transform(parseStringToNumber),
  SMTP_REPLY_TO_EMAIL: z.string().optional(),
  SMTP_SECURE_TLS: z.preprocess(optionalStringToBoolean('SMTP_SECURE_TLS'), z.boolean()).default(false),
  SMTP_SEND_AS_EMAIL: z.string().optional(),
  SMTP_USERNAME: z.string().optional(),

  TMP_DIR: z.string().default('tmp').optional()
})

export const PRIVATE_VARS = resolveEnvironment(envSchema)

if (PUBLIC_VARS.PROD && !PRIVATE_VARS.ENCRYPT_SECRET_KEY) {
  throw new Error('ENCRYPT_SECRET_KEY is required in production')
}

if (PRIVATE_VARS.DEBUG) {
  debug.enable(PRIVATE_VARS.DEBUG)
}
