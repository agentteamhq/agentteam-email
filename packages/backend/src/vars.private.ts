// env.ts
import { base64urlnopad as base64url } from '@scure/base'
import debug from 'debug'
import { z } from 'zod'

import { PUBLIC_VARS } from './vars.public'
import { resolveEnvironment } from './resolve-environment'

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

const optionalPositiveInteger = (name: string) =>
  z.preprocess((value) => {
    if (value === null || value === undefined || value === '') {
      return undefined
    }

    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (!Number.isInteger(parsed)) {
      throw new Error(`${name} must be an integer`)
    }
    return parsed
  }, z.number().int().positive())

const optionalNonNegativeInteger = (name: string) =>
  z.preprocess((value) => {
    if (value === null || value === undefined || value === '') {
      return undefined
    }

    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (!Number.isInteger(parsed)) {
      throw new Error(`${name} must be an integer`)
    }
    return parsed
  }, z.number().int().nonnegative())

// Define your environment schema.
const envSchema = z.object({
  BETTER_AUTH_SECRET: optionalNonEmptyString,
  ENCRYPT_SECRET_KEY: optionalBase64Url32ByteSecret,
  E2E_TEST_SUPPORT_ENABLED: z
    .preprocess(optionalStringToBoolean('E2E_TEST_SUPPORT_ENABLED'), z.boolean())
    .default(false),
  E2E_TEST_SUPPORT_TOKEN: optionalNonEmptyString,

  GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
  LINKEDIN_CLIENT_SECRET: optionalNonEmptyString,

  CLOUDFLARE_API_BASE_URL: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_AUTHORIZATION_URL: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_CLIENT_ID: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_ISSUER: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_REVOKE_URL: optionalNonEmptyString,
  CLOUDFLARE_OAUTH_TOKEN_URL: optionalNonEmptyString,
  AT_EMAIL_ADMIN_CONTROL_API_BASE_URL: optionalNonEmptyString,
  AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN: optionalNonEmptyString,
  AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL: optionalNonEmptyString,
  AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN: optionalNonEmptyString,
  AT_EMAIL_ADMIN_TRIAL_CAPABILITIES: z
    .string()
    .default(
      'email.status,email.message.list,email.message.read,email.message.search,email.message.create_draft,email.message.send,email.message.reply'
    ),
  AT_EMAIL_ADMIN_TRIAL_CLAIM_INTENT_TTL_SECONDS: optionalPositiveInteger(
    'AT_EMAIL_ADMIN_TRIAL_CLAIM_INTENT_TTL_SECONDS'
  ).default(60 * 60 * 24),
  AT_EMAIL_ADMIN_TRIAL_DAILY_SEND_LIMIT: optionalNonNegativeInteger(
    'AT_EMAIL_ADMIN_TRIAL_DAILY_SEND_LIMIT'
  ).default(10),
  AT_EMAIL_ADMIN_TRIAL_ENABLED: z
    .preprocess(optionalStringToBoolean('AT_EMAIL_ADMIN_TRIAL_ENABLED'), z.boolean())
    .default(false),
  AT_EMAIL_ADMIN_TRIAL_DOMAIN: optionalNonEmptyString,
  AT_EMAIL_ADMIN_TRIAL_MAILBOX_LIFETIME_SECONDS: optionalPositiveInteger(
    'AT_EMAIL_ADMIN_TRIAL_MAILBOX_LIFETIME_SECONDS'
  ).default(60 * 60 * 24 * 7),
  AT_EMAIL_ADMIN_TRIAL_ADMISSION_TOKEN: optionalNonEmptyString,
  AT_EMAIL_ADMIN_TRIAL_MAILBOX_LOCAL_PREFIX: z.string().min(1).default('trial'),
  AT_EMAIL_ADMIN_TRIAL_MAX_ACTIVE: optionalPositiveInteger('AT_EMAIL_ADMIN_TRIAL_MAX_ACTIVE').default(25),
  AT_EMAIL_ADMIN_TRIAL_ORGANIZATION_ID: optionalNonEmptyString,
  AT_EMAIL_ADMIN_TRIAL_TOTAL_SEND_LIMIT: optionalNonNegativeInteger(
    'AT_EMAIL_ADMIN_TRIAL_TOTAL_SEND_LIMIT'
  ).default(50),

  DATABASE_MAX_POOL_SIZE: optionalPositiveInteger('DATABASE_MAX_POOL_SIZE').default(8),
  DATABASE_URL: z.string().min(1),

  DEBUG: z.string().optional(),

  STRIPE_PUBLISHABLE_KEY: optionalNonEmptyString,
  STRIPE_SECRET_KEY: optionalNonEmptyString,

  SMTP_ADDRESS: optionalNonEmptyString,
  SMTP_FROM_EMAIL: optionalNonEmptyString,
  SMTP_PASSWORD: optionalNonEmptyString,
  SMTP_PORT: optionalPositiveInteger('SMTP_PORT').default(1025),
  SMTP_REPLY_TO_EMAIL: optionalNonEmptyString,
  SMTP_SECURE_TLS: z.preprocess(optionalStringToBoolean('SMTP_SECURE_TLS'), z.boolean()).default(false),
  SMTP_SEND_AS_EMAIL: optionalNonEmptyString,
  SMTP_USERNAME: optionalNonEmptyString,

  TMP_DIR: z.string().default('tmp').optional()
})

export const PRIVATE_VARS = resolveEnvironment(envSchema)

if (PUBLIC_VARS.PROD && !PRIVATE_VARS.ENCRYPT_SECRET_KEY) {
  throw new Error('ENCRYPT_SECRET_KEY is required in production')
}

if (PUBLIC_VARS.PROD && !PRIVATE_VARS.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET is required in production')
}

if (PRIVATE_VARS.DEBUG) {
  debug.enable(PRIVATE_VARS.DEBUG)
}
