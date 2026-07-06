import { describe, expect, it } from 'vitest'

import {
  createBetterAuthLogDetails,
  createSafeErrorLogDetails,
  createSafeRequestLogDetails,
  sanitizePathnameForLogging
} from './log-redaction'

describe('auth log redaction', () => {
  it('sanitizes request paths without logging query strings or auth path tokens', () => {
    expect.hasAssertions()

    const request = new Request(
      'https://mail.example.test/rpc/auth/api/reset-password/raw-reset-token?code=raw-oauth-code&callbackURL=https%3A%2F%2Fcallback.example.test%2Fdone&token=raw-query-token',
      {
        headers: {
          authorization: 'Bearer raw-bearer-token',
          cookie: 'better-auth.session_token=raw-cookie'
        },
        method: 'post'
      }
    )

    const details = createSafeRequestLogDetails(request)
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      method: 'POST',
      path: '/rpc/auth/api/reset-password/:token'
    })
    expect(serialized).not.toContain('raw-reset-token')
    expect(serialized).not.toContain('raw-oauth-code')
    expect(serialized).not.toContain('callback.example.test')
    expect(serialized).not.toContain('raw-query-token')
    expect(serialized).not.toContain('raw-bearer-token')
    expect(serialized).not.toContain('raw-cookie')
  })

  it('summarizes errors without raw messages, stacks, tokens, headers, or bodies', () => {
    expect.hasAssertions()

    const error = new Error(
      'Token exchange failed with code=raw-oauth-code and Authorization: Bearer raw-bearer-token'
    ) as Error & {
      body: { code: string }
      headers: { authorization: string; cookie: string }
      status: string
      statusCode: number
    }
    error.name = 'OAuthTokenExchangeError'
    error.stack = 'Error stack containing raw-access-token'
    error.body = { code: 'EMAIL_NOT_VERIFIED' }
    error.headers = {
      authorization: 'Bearer raw-bearer-token',
      cookie: 'better-auth.session_token=raw-cookie'
    }
    error.status = 'FORBIDDEN'
    error.statusCode = 403

    const details = createSafeErrorLogDetails(error)
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      code: 'EMAIL_NOT_VERIFIED',
      name: 'object',
      status: 'FORBIDDEN',
      statusCode: 403,
      type: 'object'
    })
    expect(serialized).not.toContain('OAuthTokenExchangeError')
    expect(serialized).not.toContain('raw-oauth-code')
    expect(serialized).not.toContain('raw-bearer-token')
    expect(serialized).not.toContain('raw-access-token')
    expect(serialized).not.toContain('raw-cookie')
    expect(serialized).not.toContain('Token exchange failed')
    expect(serialized).not.toContain('headers')
  })

  it.each([
    'sk-secret-request-token',
    'api-key:raw-key-value',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature'
  ])('rejects secret-shaped error names from safe diagnostics: %s', (name) => {
    expect.hasAssertions()

    const error = new Error('failed without exposing raw secret details')
    error.name = name

    const details = createSafeErrorLogDetails(error)
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      name: 'object',
      type: 'object'
    })
    expect(serialized).not.toContain(name)
  })

  it.each([
    'AuthError',
    'Authenticated',
    'Unauthenticated',
    'UnauthenticatedError',
    'Authorized',
    'Unauthorized',
    'UnauthorizedError',
    'JWTAccessTokenError',
    'OAuthTokenExchangeError',
    'SessionCookieError',
    'CredentialEnvelopeError',
    'ApiKeyRefreshError',
    'not_authorized',
    'authorization_required'
  ])('rejects semantic credential-bearing error names from safe diagnostics: %s', (name) => {
    expect.hasAssertions()

    const error = new Error('failed without exposing raw credential details')
    error.name = name

    const details = createSafeErrorLogDetails(error)
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      name: 'object',
      type: 'object'
    })
    expect(serialized).not.toContain(name)
  })

  it.each([
    'ERR_AUTH_FAILED',
    'ERR_UNAUTHENTICATED',
    'ERR_API_KEY_EXPIRED',
    'ERR_UNAUTHORIZED',
    'ERR_NOT_AUTHORIZED',
    'UNAUTHORIZED',
    'CLOUDFLARE_TOKEN_REJECTED',
    'PAPERCLIP_TOKEN_REJECTED',
    'authorization_required'
  ])('rejects semantic credential-bearing error codes from safe diagnostics: %s', (code) => {
    expect.hasAssertions()

    const error = new Error('failed without exposing raw api key details') as Error & { code: string }
    error.code = code

    const details = createSafeErrorLogDetails(error)
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      name: 'Error',
      type: 'object'
    })
    expect(serialized).not.toContain(code)
  })

  it.each(['UNAUTHORIZED', 'ERR_UNAUTHORIZED', 'ERR_NOT_AUTHORIZED'])(
    'rejects auth-shaped body codes and status values from safe diagnostics: %s',
    (value) => {
      expect.hasAssertions()

      const error = new Error('failed without exposing authorization details') as Error & {
        body: { code: string }
        code: string
        status: string
      }
      error.body = { code: value }
      error.code = value
      error.status = value

      const details = createSafeErrorLogDetails(error)
      const serialized = JSON.stringify(details)

      expect(details).toStrictEqual({
        name: 'Error',
        type: 'object'
      })
      expect(serialized).not.toContain(value)
    }
  )

  it('redacts Better Auth API unauthorized identifiers while preserving numeric status', () => {
    expect.hasAssertions()

    const error = {
      body: { code: 'UNAUTHORIZED' },
      name: 'APIError',
      status: 'UNAUTHORIZED',
      statusCode: 401
    }

    const details = createSafeErrorLogDetails(error)
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      name: 'APIError',
      statusCode: 401,
      type: 'object'
    })
    expect(serialized).not.toContain('UNAUTHORIZED')
  })

  it('rejects auth-shaped Better Auth metadata from log details', () => {
    expect.hasAssertions()

    const details = createBetterAuthLogDetails('error', 'Better Auth event', [
      {
        code: 'UNAUTHORIZED',
        errorCode: 'ERR_NOT_AUTHORIZED',
        name: 'UnauthorizedError',
        status: 'UNAUTHORIZED',
        statusCode: 401
      }
    ])
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      argumentCount: 1,
      argumentTypes: ['object'],
      error: {
        statusCode: 401,
        name: 'object',
        type: 'object'
      },
      level: 'error',
      operation: 'better_auth_event',
      statusCode: 401
    })
    expect(serialized).not.toContain('UNAUTHORIZED')
    expect(serialized).not.toContain('ERR_NOT_AUTHORIZED')
    expect(serialized).not.toContain('UnauthorizedError')
  })

  it('preserves ordinary safe error names and codes', () => {
    expect.hasAssertions()

    const error = new TypeError('validation failed') as TypeError & { code: string }
    error.code = 'ERR_VALIDATION_FAILED'

    expect(createSafeErrorLogDetails(error)).toStrictEqual({
      code: 'ERR_VALIDATION_FAILED',
      name: 'TypeError',
      type: 'object'
    })

    const validationError = new Error('validation failed')
    validationError.name = 'ValidationError'

    expect(createSafeErrorLogDetails(validationError)).toStrictEqual({
      name: 'ValidationError',
      type: 'object'
    })
  })

  it('normalizes Better Auth logger events to bounded metadata', () => {
    expect.hasAssertions()

    const error = new Error('Provider returned access token _secret_oauth_access_raw-token')
    const details = createBetterAuthLogDetails(
      'error',
      'Token exchange failed for authorization code raw-oauth-code-123: https://callback.example.test/oauth?code=raw-oauth-code-123',
      [
        error,
        {
          body: {
            password: 'raw-password'
          },
          code: 'raw-oauth-code-123',
          headers: {
            authorization: 'Bearer raw-bearer-token',
            cookie: 'better-auth.session_token=raw-cookie'
          },
          providerId: 'cloudflare',
          statusCode: 403
        }
      ]
    )
    const serialized = JSON.stringify(details)

    expect(details).toMatchObject({
      argumentCount: 2,
      argumentTypes: ['object', 'object'],
      error: {
        name: 'Error',
        type: 'object'
      },
      level: 'error',
      operation: 'token_exchange_failed_for_secret_redacted',
      providerId: 'cloudflare',
      statusCode: 403
    })
    expect(details).not.toHaveProperty('code')
    expect(serialized).not.toContain('raw-oauth-code-123')
    expect(serialized).not.toContain('callback.example.test')
    expect(serialized).not.toContain('raw-token')
    expect(serialized).not.toContain('raw-password')
    expect(serialized).not.toContain('raw-bearer-token')
    expect(serialized).not.toContain('raw-cookie')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('headers')
    expect(serialized).not.toContain('body')
  })

  it('turns dynamic auth path segments into path patterns', () => {
    expect.hasAssertions()

    expect(sanitizePathnameForLogging('/rpc/auth/api/oauth2/callback/cloudflare')).toBe(
      '/rpc/auth/api/oauth2/callback/:providerId'
    )
    expect(sanitizePathnameForLogging('/rpc/auth/api/reset-password/raw-reset-token')).toBe(
      '/rpc/auth/api/reset-password/:token'
    )
    expect(sanitizePathnameForLogging('/rpc/auth/api/token/_secret_oauth_access_raw-token')).toBe(
      '/rpc/auth/api/token/:value'
    )
  })
})
