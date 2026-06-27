/* eslint-disable no-restricted-syntax */
// env.ts
import debug from 'debug'
import { z } from 'zod'

import { resolveEnvironment } from './resolve-environment'

const log = debug('app:env')

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
)

const publicHostname = z
  .string()
  .trim()
  .min(1, 'PUBLIC_HOSTNAME is required')
  .pipe(z.url('PUBLIC_HOSTNAME must be an absolute URL'))
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    } catch {
      return true
    }
  }, 'PUBLIC_HOSTNAME must use http or https')

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PUBLIC_DEBUG: z.string().optional(),
    PUBLIC_HOSTNAME: publicHostname,
    PUBLIC_GOOGLE_CLIENT_ID: optionalNonEmptyString,
    PUBLIC_LINKEDIN_CLIENT_ID: optionalNonEmptyString
  })
  .transform((parsed) => {
    // Force DEV, PROD, TEST based on NODE_ENV:
    const dev = parsed.NODE_ENV === 'development'
    const prod = parsed.NODE_ENV === 'production'
    const test = parsed.NODE_ENV === 'test'

    const PUBLIC_HTTPS_PROTO = parsed.PUBLIC_HOSTNAME
      ? new URL(parsed.PUBLIC_HOSTNAME).protocol === 'https:'
      : false

    return {
      ...parsed,
      DEV: dev,
      PROD: prod,
      TEST: test,
      PUBLIC_HTTPS_PROTO
    }
  })

export const PUBLIC_VARS = resolveEnvironment(envSchema)

log(`Env - PROD(${PUBLIC_VARS.PROD}) SECURE(${PUBLIC_VARS.PUBLIC_HTTPS_PROTO})`)
log(`Env - Hostname(${PUBLIC_VARS.PUBLIC_HOSTNAME})`)
