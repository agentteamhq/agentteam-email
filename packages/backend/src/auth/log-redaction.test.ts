import { describe, expect, it } from 'vitest'

import {
  createBetterAuthLogDetails,
  createProtocolDiagnosticErrorLogDetails,
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

  it('preserves Better Fetch provider OAuth error payloads from token exchange failures', () => {
    expect.hasAssertions()

    const error = new Error('Forbidden') as Error & {
      error: Record<string, unknown>
      status: number
      statusText: string
    }
    error.status = 403
    error.statusText = 'Forbidden'
    error.error = {
      access_token: 'raw-provider-access-token',
      error: 'invalid_client',
      error_description: 'Client authentication failed',
      messages: [{ code: 1000, message: 'Cloudflare rejected token endpoint auth method none' }]
    }

    const safeDetails = createSafeErrorLogDetails(error)
    const protocolDetails = createProtocolDiagnosticErrorLogDetails(error)
    const betterAuthDetails = createBetterAuthLogDetails('error', 'Better Auth callback failed', [error])
    const serialized = JSON.stringify(protocolDetails)

    expect(safeDetails).toMatchObject({
      code: 'invalid_client',
      message: 'Forbidden',
      name: 'Error',
      status: '403',
      statusCode: 403,
      type: 'object'
    })
    expect(protocolDetails).toMatchObject({
      body: {
        access_token: 'secret_redacted',
        error: 'invalid_client',
        error_description: 'Client authentication failed',
        messages: [{ code: 1000, message: 'Cloudflare rejected token endpoint auth method none' }]
      },
      code: 'invalid_client',
      message: 'Forbidden',
      name: 'Error',
      statusCode: 403,
      type: 'object'
    })
    expect(betterAuthDetails).toMatchObject({
      code: 'invalid_client',
      error: {
        code: 'invalid_client',
        message: 'Forbidden',
        status: '403',
        statusCode: 403
      },
      operation: 'better_auth_callback_failed',
      status: '403',
      statusCode: 403
    })
    expect(serialized).toContain('invalid_client')
    expect(serialized).toContain('Client authentication failed')
    expect(serialized).toContain('Cloudflare rejected token endpoint auth method none')
    expect(serialized).not.toContain('raw-provider-access-token')
  })

  it('classifies Cloudflare OAuth browser challenges while preserving response diagnostics', () => {
    expect.hasAssertions()

    const error = new Error('Forbidden') as Error & {
      error: string
      headers: Headers
      status: number
      statusText: string
    }
    error.name = 'BetterFetchError'
    error.status = 403
    error.statusText = 'Forbidden'
    error.headers = new Headers({
      authorization: 'Bearer raw-response-bearer-token',
      'cf-mitigated': 'challenge',
      'cf-ray': 'a16ea5346947fef9-PDX',
      'content-type': 'text/html; charset=UTF-8',
      server: 'cloudflare'
    })
    error.error =
      '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1 code=raw-oauth-code code_verifier=raw-code-verifier</body></html>'

    const details = createBetterAuthLogDetails('error', 'OAuth token exchange failed', [error], {
      basePath: '/api',
      callbackPath: '/rpc/auth/api/oauth2/callback/cloudflare',
      flow: 'oauth_callback',
      logicalBetterAuthRequestUrl: 'https://mail.example.test/api/oauth2/callback/cloudflare?code=secret_redacted',
      logicalPath: '/api/oauth2/callback/cloudflare',
      logicalQueryParameterNames: ['code', 'state'],
      method: 'GET',
      mountPath: '/rpc/auth',
      mountedRequestUrl: 'https://mail.example.test/api/oauth2/callback/cloudflare?code=secret_redacted',
      operation: 'better_auth_protocol_request',
      phase: 'better_auth_internal',
      provider: 'cloudflare',
      providerId: 'cloudflare',
      publicRequestUrl: 'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?code=secret_redacted',
      requestPath: '/oauth2/callback/cloudflare',
      requestQueryParameterNames: ['code', 'state'],
      requestUrl: 'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?code=secret_redacted'
    })
    const serialized = JSON.stringify(details)

    expect(details).toMatchObject({
      error: {
        message: 'Forbidden',
        name: 'BetterFetchError',
        responseBody: expect.stringContaining('Just a moment...'),
        responseHeaders: {
          authorization: 'secret_redacted',
          'cf-mitigated': 'challenge',
          'cf-ray': 'a16ea5346947fef9-PDX',
          'content-type': 'text/html; charset=UTF-8',
          server: 'cloudflare'
        },
        statusCode: 403,
        type: 'object'
      },
      providerFailure: {
        code: 'CLOUDFLARE_OAUTH_BROWSER_CHALLENGE',
        reason: 'cloudflare_oauth_token_endpoint_browser_challenge'
      },
      protocol: {
        providerId: 'cloudflare'
      }
    })
    expect(serialized).toContain('cf-mitigated')
    expect(serialized).toContain('a16ea5346947fef9-PDX')
    expect(serialized).toContain('/cdn-cgi/challenge-platform')
    expect(serialized).not.toContain('raw-oauth-code')
    expect(serialized).not.toContain('raw-code-verifier')
    expect(serialized).not.toContain('raw-response-bearer-token')
  })

  it('treats status-only Better Fetch failures as error-like diagnostics', () => {
    expect.hasAssertions()

    const error = {
      error: {
        error: 'invalid_client',
        error_description: 'Client authentication failed'
      },
      status: 403,
      statusText: 'Forbidden'
    }

    const details = createBetterAuthLogDetails('error', '', [error])

    expect(details).toMatchObject({
      argumentCount: 1,
      argumentTypes: ['object'],
      code: 'invalid_client',
      error: {
        code: 'invalid_client',
        message: 'Forbidden',
        name: 'object',
        status: '403',
        statusCode: 403,
        type: 'object'
      },
      level: 'error',
      operation: 'better_auth_event',
      status: '403',
      statusCode: 403
    })
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
