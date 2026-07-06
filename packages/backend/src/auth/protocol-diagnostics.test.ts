import { describe, expect, it } from 'vitest'

import { createBetterAuthLogDetails } from './log-redaction'
import {
  createBetterAuthProtocolDiagnosticContext,
  createBetterAuthProtocolResponseLogDetails,
  getBetterAuthProtocolDiagnosticContext,
  runWithBetterAuthProtocolDiagnosticContext,
  sanitizeUrlForProtocolLogging
} from './protocol-diagnostics'

describe('Better Auth protocol diagnostics', () => {
  it('preserves OAuth callback diagnostic values and narrowly redacts credential parameters', () => {
    expect.hasAssertions()

    const callbackUri =
      'https://mail.example.test/rpc/cloudflare/oauth/callback?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains&access_token=raw-nested-access-token&code=raw-nested-code'
    const redirectUri =
      'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?returnTarget=settings-domains&client_secret=raw-client-secret'
    const requestUrl = new URL('https://mail.example.test/oauth2/callback/cloudflare')
    requestUrl.searchParams.set('code', 'raw-oauth-code')
    requestUrl.searchParams.set('state', 'raw-oauth-state')
    requestUrl.searchParams.set('error', 'access_denied')
    requestUrl.searchParams.set(
      'error_description',
      'Cloudflare denied zone for cloudflareIntentId cf-intent-123 returnTarget settings-domains'
    )
    requestUrl.searchParams.set('callbackUri', callbackUri)
    requestUrl.searchParams.set('redirect_uri', redirectUri)
    requestUrl.searchParams.set('cloudflareIntentId', 'cf-intent-123')
    requestUrl.searchParams.set('returnTarget', 'settings-domains')
    requestUrl.searchParams.set('access_token', 'raw-access-token')
    const logicalRequestUrl = new URL(requestUrl)
    logicalRequestUrl.pathname = `/api${requestUrl.pathname}`

    const context = createBetterAuthProtocolDiagnosticContext({
      basePath: '/api',
      logicalRequest: new Request(logicalRequestUrl, {
        headers: {
          'x-request-id': 'auth-request-123'
        },
        method: 'GET'
      }),
      request: new Request(requestUrl, {
        headers: {
          'x-request-id': 'auth-request-123'
        },
        method: 'GET'
      })
    })
    const serialized = JSON.stringify(context)

    expect(context).toMatchObject({
      basePath: '/api',
      callbackUri:
        'https://mail.example.test/rpc/cloudflare/oauth/callback?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains&access_token=secret_redacted&code=secret_redacted',
      flow: 'oauth_callback',
      logicalPath: '/api/oauth2/callback/cloudflare',
      method: 'GET',
      operation: 'better_auth_protocol_request',
      provider: 'cloudflare',
      providerError: 'access_denied',
      providerErrorDescription:
        'Cloudflare denied zone for cloudflareIntentId cf-intent-123 returnTarget settings-domains',
      providerId: 'cloudflare',
      requestId: 'auth-request-123',
      requestPath: '/oauth2/callback/cloudflare',
      returnTarget: 'settings-domains'
    })
    expect(context?.redirectUri).toBe(
      'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?returnTarget=settings-domains&client_secret=secret_redacted'
    )
    expect(context?.requestQueryParameterNames).toContain('callbackUri')
    expect(context?.requestQueryParameterNames).toContain('redirect_uri')
    expect(serialized).toContain('cf-intent-123')
    expect(serialized).toContain('settings-domains')
    expect(serialized).toContain('Cloudflare denied zone')
    expect(serialized).toContain('secret_redacted')
    expect(serialized).not.toContain('raw-oauth-code')
    expect(serialized).not.toContain('raw-oauth-state')
    expect(serialized).not.toContain('raw-access-token')
    expect(serialized).not.toContain('raw-nested-access-token')
    expect(serialized).not.toContain('raw-nested-code')
    expect(serialized).not.toContain('raw-client-secret')
  })

  it('redacts embedded credential fragments inside provider diagnostic strings', () => {
    expect.hasAssertions()

    const callbackUri =
      'https://mail.example.test/settings/domains?cloudflareIntentId=cf-intent-embedded&returnTarget=settings-domains&clientSecret=raw-nested-client-secret&codeVerifier=raw-nested-code-verifier&assertion=raw-nested-assertion&verifier=raw-nested-verifier&accessToken=raw-nested-access-token'
    const requestUrl = new URL('https://mail.example.test/oauth2/callback/cloudflare')
    requestUrl.searchParams.set('callbackUri', callbackUri)
    requestUrl.searchParams.set(
      'returnTarget',
      'https://mail.example.test/settings/domains?apiKey=raw-return-api-key&cloudflareIntentId=cf-intent-embedded'
    )
    requestUrl.searchParams.set(
      'error_description',
      'Provider kept cf-intent-embedded with client_secret=raw-client-secret clientSecret: raw-camel-client code=raw-code state=raw-state code_verifier=raw-code-verifier codeVerifier=raw-camel-code-verifier assertion=raw-assertion verifier=raw-verifier accessToken=raw-access-token credential=raw-credential jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature Authorization: Bearer raw-bearer-token'
    )
    requestUrl.searchParams.set('error_message', 'Provider message token=raw-token refreshToken=raw-refresh-token')

    const context = createBetterAuthProtocolDiagnosticContext(
      new Request(requestUrl),
      new Request(new URL(`/api${requestUrl.pathname}${requestUrl.search}`, requestUrl).toString())
    )
    const serialized = JSON.stringify(context)

    expect(context).toMatchObject({
      callbackUri:
        'https://mail.example.test/settings/domains?cloudflareIntentId=cf-intent-embedded&returnTarget=settings-domains&clientSecret=secret_redacted&codeVerifier=secret_redacted&assertion=secret_redacted&verifier=secret_redacted&accessToken=secret_redacted',
      providerErrorDescription:
        'Provider kept cf-intent-embedded with client_secret=secret_redacted clientSecret: secret_redacted code=secret_redacted state=secret_redacted code_verifier=secret_redacted codeVerifier=secret_redacted assertion=secret_redacted verifier=secret_redacted accessToken=secret_redacted credential=secret_redacted jwt=secret_redacted Authorization: Bearer secret_redacted',
      providerErrorMessage: 'Provider message token=secret_redacted refreshToken=secret_redacted',
      returnTarget:
        'https://mail.example.test/settings/domains?apiKey=secret_redacted&cloudflareIntentId=cf-intent-embedded'
    })
    expect(serialized).toContain('cf-intent-embedded')
    expect(serialized).toContain('settings-domains')
    expect(serialized).not.toContain('raw-client-secret')
    expect(serialized).not.toContain('raw-camel-client')
    expect(serialized).not.toContain('raw-code')
    expect(serialized).not.toContain('raw-state')
    expect(serialized).not.toContain('raw-code-verifier')
    expect(serialized).not.toContain('raw-camel-code-verifier')
    expect(serialized).not.toContain('raw-assertion')
    expect(serialized).not.toContain('raw-verifier')
    expect(serialized).not.toContain('raw-access-token')
    expect(serialized).not.toContain('raw-credential')
    expect(serialized).not.toContain('raw-bearer-token')
    expect(serialized).not.toContain('raw-token')
    expect(serialized).not.toContain('raw-refresh-token')
    expect(serialized).not.toContain('raw-return-api-key')
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(serialized).not.toContain('raw-nested-client-secret')
    expect(serialized).not.toContain('raw-nested-code-verifier')
    expect(serialized).not.toContain('raw-nested-assertion')
    expect(serialized).not.toContain('raw-nested-verifier')
    expect(serialized).not.toContain('raw-nested-access-token')
  })

  it('preserves redirect Location details while redacting only credential query values', async () => {
    expect.hasAssertions()

    const context = createBetterAuthProtocolDiagnosticContext(
      new Request(
        'https://mail.example.test/oauth2/callback/cloudflare?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains'
      ),
      new Request(
        'https://mail.example.test/api/oauth2/callback/cloudflare?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains'
      )
    )
    const response = Response.redirect(
      'https://mail.example.test/settings/domains?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains&error_description=Provider%20message%20kept&access_token=raw-location-access-token',
      302
    )

    expect(context).not.toBeNull()
    const details = await createBetterAuthProtocolResponseLogDetails(context!, response)
    const serialized = JSON.stringify(details)

    expect(details).toMatchObject({
      phase: 'handler_response',
      redirectLocation:
        'https://mail.example.test/settings/domains?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains&error_description=Provider+message+kept&access_token=secret_redacted',
      responseStatus: 302
    })
    expect(serialized).toContain('cf-intent-123')
    expect(serialized).toContain('settings-domains')
    expect(serialized).toContain('Provider+message+kept')
    expect(serialized).not.toContain('raw-location-access-token')
  })

  it('keeps relative redirect Location values relative while adding parsed fields', async () => {
    expect.hasAssertions()

    const context = createBetterAuthProtocolDiagnosticContext(
      new Request(
        'https://mail.example.test/oauth2/callback/cloudflare?cloudflareIntentId=cf-intent-relative&returnTarget=settings-domains'
      ),
      new Request(
        'https://mail.example.test/api/oauth2/callback/cloudflare?cloudflareIntentId=cf-intent-relative&returnTarget=settings-domains'
      )
    )
    const response = new Response(null, {
      headers: {
        Location:
          '/settings/domains?cloudflareIntentId=cf-intent-relative&returnTarget=settings-domains&code=raw-relative-code'
      },
      status: 302
    })

    expect(context).not.toBeNull()
    const details = await createBetterAuthProtocolResponseLogDetails(context!, response)
    const serialized = JSON.stringify(details)

    expect(details).toMatchObject({
      phase: 'handler_response',
      redirectLocation:
        '/settings/domains?cloudflareIntentId=cf-intent-relative&returnTarget=settings-domains&code=secret_redacted',
      redirectLocationOrigin: 'https://mail.example.test',
      redirectLocationPath: '/settings/domains',
      redirectQueryParameterNames: ['cloudflareIntentId', 'code', 'returnTarget'],
      responseStatus: 302
    })
    expect(serialized).toContain('cf-intent-relative')
    expect(serialized).toContain('settings-domains')
    expect(serialized).not.toContain('raw-relative-code')
  })

  it('adds the active protocol context to Better Auth internal logger details', () => {
    expect.hasAssertions()

    const context = createBetterAuthProtocolDiagnosticContext(
      new Request(
        'https://mail.example.test/oauth2/callback/cloudflare?callbackUri=https%3A%2F%2Fmail.example.test%2Fsettings%2Fdomains%3FcloudflareIntentId%3Dcf-intent-123%26returnTarget%3Dsettings-domains&code=raw-code'
      ),
      new Request(
        'https://mail.example.test/api/oauth2/callback/cloudflare?callbackUri=https%3A%2F%2Fmail.example.test%2Fsettings%2Fdomains%3FcloudflareIntentId%3Dcf-intent-123%26returnTarget%3Dsettings-domains&code=raw-code'
      )
    )

    expect(context).not.toBeNull()
    runWithBetterAuthProtocolDiagnosticContext(context, () => {
      const protocol = getBetterAuthProtocolDiagnosticContext()
      const details = createBetterAuthLogDetails(
        'error',
        'Better Auth callback failed',
        [{ providerId: 'cloudflare', statusCode: 400 }],
        protocol
      )
      const serialized = JSON.stringify(details)

      expect(details.protocol).toMatchObject({
        callbackUri:
          'https://mail.example.test/settings/domains?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains',
        phase: 'better_auth_internal',
        providerId: 'cloudflare'
      })
      expect(serialized).toContain('cf-intent-123')
      expect(serialized).toContain('settings-domains')
      expect(serialized).not.toContain('raw-code')
    })
  })

  it('preserves Better Auth logger message-only diagnostics under protocol context', () => {
    expect.hasAssertions()

    const context = createBetterAuthProtocolDiagnosticContext(
      new Request('https://mail.example.test/oauth2/callback/cloudflare?code=raw-context-code'),
      new Request('https://mail.example.test/api/oauth2/callback/cloudflare?code=raw-context-code')
    )

    expect(context).not.toBeNull()
    runWithBetterAuthProtocolDiagnosticContext(context, () => {
      const protocol = getBetterAuthProtocolDiagnosticContext()
      const details = createBetterAuthLogDetails(
        'error',
        'Provider callback failed at https://provider.example.test/oauth?error_description=cloudflareIntentId%20cf-intent-message%20returnTarget%20settings-domains&client_secret=raw-message-client-secret',
        [],
        protocol
      )
      const serialized = JSON.stringify(details)

      expect(details).toMatchObject({
        message:
          'Provider callback failed at https://provider.example.test/oauth?error_description=cloudflareIntentId+cf-intent-message+returnTarget+settings-domains&client_secret=secret_redacted',
        protocol: {
          phase: 'better_auth_internal',
          providerId: 'cloudflare'
        }
      })
      expect(serialized).toContain('https://provider.example.test/oauth')
      expect(serialized).toContain('cf-intent-message')
      expect(serialized).toContain('settings-domains')
      expect(serialized).not.toContain('raw-message-client-secret')
      expect(serialized).not.toContain('raw-context-code')
    })
  })

  it('uses protocol-aware error diagnostics for Better Auth internal logger errors', () => {
    expect.hasAssertions()

    const context = createBetterAuthProtocolDiagnosticContext(
      new Request('https://mail.example.test/oauth2/callback/cloudflare?code=raw-context-code'),
      new Request('https://mail.example.test/api/oauth2/callback/cloudflare?code=raw-context-code')
    )
    const error = new Error(
      'Provider token exchange failed at https://provider.example.test/oauth?error_description=cloudflareIntentId%20cf-intent-internal%20returnTarget%20settings-domains&clientSecret=raw-error-client-secret&codeVerifier=raw-error-code-verifier&state=raw-error-state'
    ) as Error & {
      body: Record<string, unknown>
      status: string
      statusCode: number
    }
    error.name = 'APIError'
    error.status = 'BAD_REQUEST'
    error.statusCode = 400
    error.body = {
      code: 'invalid_grant',
      details: {
        callback:
          'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?returnTarget=settings-domains&client_secret=raw-nested-body-client-secret',
        message: 'Nested provider body kept cf-intent-internal with oauth_token=raw-nested-oauth-token',
        retries: [
          {
            assertion: 'raw-array-assertion',
            returnTarget: 'settings-domains',
            state: 'raw-array-state'
          }
        ]
      },
      error_description:
        'Provider body kept cf-intent-internal with assertion=raw-body-assertion and verifier=raw-body-verifier',
      redirect_uri:
        'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?returnTarget=settings-domains&client_secret=raw-body-client-secret'
    }

    expect(context).not.toBeNull()
    runWithBetterAuthProtocolDiagnosticContext(context, () => {
      const protocol = getBetterAuthProtocolDiagnosticContext()
      const details = createBetterAuthLogDetails('error', 'Better Auth callback failed', [error], protocol)
      const serialized = JSON.stringify(details)

      expect(details.error).toMatchObject({
        body: {
          code: 'invalid_grant',
          details: {
            callback:
              'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?returnTarget=settings-domains&client_secret=secret_redacted',
            message: 'Nested provider body kept cf-intent-internal with oauth_token=secret_redacted',
            retries: [
              {
                assertion: 'secret_redacted',
                returnTarget: 'settings-domains',
                state: 'secret_redacted'
              }
            ]
          },
          error_description:
            'Provider body kept cf-intent-internal with assertion=secret_redacted and verifier=secret_redacted',
          redirect_uri:
            'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?returnTarget=settings-domains&client_secret=secret_redacted'
        },
        message:
          'Provider token exchange failed at https://provider.example.test/oauth?error_description=cloudflareIntentId+cf-intent-internal+returnTarget+settings-domains&clientSecret=secret_redacted&codeVerifier=secret_redacted&state=secret_redacted',
        name: 'APIError',
        status: 'BAD_REQUEST',
        statusCode: 400,
        type: 'object'
      })
      expect(details.protocol).toMatchObject({
        phase: 'better_auth_internal',
        providerId: 'cloudflare'
      })
      expect(serialized).toContain('https://provider.example.test/oauth')
      expect(serialized).toContain('cf-intent-internal')
      expect(serialized).toContain('settings-domains')
      expect(serialized).not.toContain('raw-context-code')
      expect(serialized).not.toContain('raw-error-client-secret')
      expect(serialized).not.toContain('raw-error-code-verifier')
      expect(serialized).not.toContain('raw-error-state')
      expect(serialized).not.toContain('raw-body-assertion')
      expect(serialized).not.toContain('raw-body-verifier')
      expect(serialized).not.toContain('raw-body-client-secret')
      expect(serialized).not.toContain('raw-nested-body-client-secret')
      expect(serialized).not.toContain('raw-nested-oauth-token')
      expect(serialized).not.toContain('raw-array-assertion')
      expect(serialized).not.toContain('raw-array-state')
    })
  })

  it('preserves long protocol diagnostics instead of truncating them', () => {
    expect.hasAssertions()

    const longMarker = `diagnostic-${'x'.repeat(1500)}-tail-kept`
    const context = createBetterAuthProtocolDiagnosticContext(
      new Request('https://mail.example.test/oauth2/callback/cloudflare?code=raw-code'),
      new Request(
        `https://mail.example.test/api/oauth2/callback/cloudflare?error_description=${encodeURIComponent(longMarker)}&code=raw-code`
      )
    )

    expect(context?.providerErrorDescription).toBe(longMarker)
    expect(JSON.stringify(context)).toContain('tail-kept')
    expect(JSON.stringify(context)).not.toContain('raw-code')
  })

  it('redacts URL userinfo credentials without dropping the URL context', () => {
    expect.hasAssertions()

    const sanitized = sanitizeUrlForProtocolLogging(
      'https://client-id:client-secret@provider.example.test/oauth/callback?returnTarget=settings-domains&clientSecret=raw-client-secret'
    )

    expect(sanitized).toBe(
      'https://secret_redacted:secret_redacted@provider.example.test/oauth/callback?returnTarget=settings-domains&clientSecret=secret_redacted'
    )
    expect(sanitized).toContain('provider.example.test/oauth/callback')
    expect(sanitized).toContain('settings-domains')
    expect(sanitized).not.toContain('client-id')
    expect(sanitized).not.toContain('client-secret')
    expect(sanitized).not.toContain('raw-client-secret')
  })
})
