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

  it('preserves error diagnostics while redacting known secret values from messages', () => {
    expect.hasAssertions()

    const error = new Error(
      'Token exchange failed with authorization code raw-oauth-code-123 and Authorization: Bearer raw-bearer-token'
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
      message:
        'Token exchange failed with authorization code secret_redacted and Authorization=secret_redacted',
      name: 'OAuthTokenExchangeError',
      status: 'FORBIDDEN',
      statusCode: 403,
      type: 'object'
    })
    expect(serialized).toContain('OAuthTokenExchangeError')
    expect(serialized).toContain('Token exchange failed')
    expect(serialized).not.toContain('raw-oauth-code')
    expect(serialized).not.toContain('raw-bearer-token')
    expect(serialized).not.toContain('raw-access-token')
    expect(serialized).not.toContain('raw-cookie')
    expect(serialized).not.toContain('headers')
  })

  it.each([
    'sk-secret-request-token',
    '_secret_oauth_access_raw-token',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature'
  ])('rejects known secret values used as error names from safe diagnostics: %s', (name) => {
    expect.hasAssertions()

    const error = new Error('failed without exposing raw secret details')
    error.name = name

    const details = createSafeErrorLogDetails(error)
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      message: 'failed without exposing raw secret details',
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
  ])('preserves auth-shaped diagnostic error names by default: %s', (name) => {
    expect.hasAssertions()

    const error = new Error('failed without exposing raw credential details')
    error.name = name

    const details = createSafeErrorLogDetails(error)
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      message: 'failed without exposing raw credential details',
      name,
      type: 'object'
    })
    expect(serialized).toContain(name)
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
  ])('preserves auth-shaped diagnostic error codes by default: %s', (code) => {
    expect.hasAssertions()

    const error = new Error('failed without exposing raw api key details') as Error & { code: string }
    error.code = code

    const details = createSafeErrorLogDetails(error)
    const serialized = JSON.stringify(details)

    expect(details).toStrictEqual({
      code,
      message: 'failed without exposing raw api key details',
      name: 'Error',
      type: 'object'
    })
    expect(serialized).toContain(code)
  })

  it.each(['UNAUTHORIZED', 'ERR_UNAUTHORIZED', 'ERR_NOT_AUTHORIZED'])(
    'preserves auth-shaped body codes and status values from safe diagnostics: %s',
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
        code: value,
        message: 'failed without exposing authorization details',
        name: 'Error',
        status: value,
        type: 'object'
      })
      expect(serialized).toContain(value)
    }
  )

  it('preserves Better Auth API unauthorized identifiers as diagnostic facts', () => {
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
      code: 'UNAUTHORIZED',
      name: 'APIError',
      status: 'UNAUTHORIZED',
      statusCode: 401,
      type: 'object'
    })
    expect(serialized).toContain('UNAUTHORIZED')
  })

  it('preserves auth-shaped Better Auth metadata in log details', () => {
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
      code: 'UNAUTHORIZED',
      error: {
        code: 'UNAUTHORIZED',
        name: 'UnauthorizedError',
        status: 'UNAUTHORIZED',
        statusCode: 401,
        type: 'object'
      },
      level: 'error',
      operation: 'better_auth_event',
      status: 'UNAUTHORIZED',
      statusCode: 401
    })
    expect(serialized).toContain('UNAUTHORIZED')
    expect(serialized).toContain('UnauthorizedError')
  })

  it('preserves ordinary safe error names and codes', () => {
    expect.hasAssertions()

    const error = new TypeError('validation failed') as TypeError & { code: string }
    error.code = 'ERR_VALIDATION_FAILED'

    expect(createSafeErrorLogDetails(error)).toStrictEqual({
      code: 'ERR_VALIDATION_FAILED',
      message: 'validation failed',
      name: 'TypeError',
      type: 'object'
    })

    const validationError = new Error('validation failed')
    validationError.name = 'ValidationError'

    expect(createSafeErrorLogDetails(validationError)).toStrictEqual({
      message: 'validation failed',
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
        message: 'Provider returned access token secret_redacted',
        name: 'Error',
        type: 'object'
      },
      level: 'error',
      operation: 'token_exchange_failed_for_authorization_code_secret_redacted',
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
      '/rpc/auth/api/oauth2/callback/cloudflare'
    )
    expect(sanitizePathnameForLogging('/rpc/auth/api/reset-password/raw-reset-token')).toBe(
      '/rpc/auth/api/reset-password/:token'
    )
    expect(sanitizePathnameForLogging('/rpc/auth/api/token/_secret_oauth_access_raw-token')).toBe(
      '/rpc/auth/api/token/:value'
    )
    expect(sanitizePathnameForLogging('/rpc/auth/api/session/018f3a9e-42c0-7dc3-8dc7-3051b7867a9a')).toBe(
      '/rpc/auth/api/session/018f3a9e-42c0-7dc3-8dc7-3051b7867a9a'
    )
  })
})
