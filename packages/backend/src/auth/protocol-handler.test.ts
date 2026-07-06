import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getBetterAuthProtocolDiagnosticContext } from './protocol-diagnostics'
import { handleBetterAuthProtocolRequest } from './protocol-handler'

const protocolHandlerTestState = vi.hoisted(() => ({
  ...(() => {
    const debugLog = vi.fn()
    return {
      debugFactory: Object.assign(
        vi.fn(() => debugLog),
        {
          disable: vi.fn(),
          enable: vi.fn(),
          enabled: vi.fn()
        }
      ),
      debugLog
    }
  })(),
  globals: vi.fn(),
  handler: vi.fn()
}))

vi.mock('debug', () => ({
  default: protocolHandlerTestState.debugFactory
}))

vi.mock('../globals', () => ({
  globals: protocolHandlerTestState.globals
}))

describe('Better Auth protocol handler diagnostics', () => {
  beforeEach(() => {
    protocolHandlerTestState.debugFactory.mockClear()
    protocolHandlerTestState.debugFactory.mockImplementation(() => protocolHandlerTestState.debugLog)
    protocolHandlerTestState.debugLog.mockReset()
    protocolHandlerTestState.globals.mockReset()
    protocolHandlerTestState.handler.mockReset()
    protocolHandlerTestState.globals.mockResolvedValue({
      auth: {
        handler: protocolHandlerTestState.handler
      }
    })
  })

  it('logs OAuth callback request and redirect response diagnostics with concrete values', async () => {
    expect.hasAssertions()

    const callbackUri =
      'https://mail.example.test/rpc/cloudflare/oauth/callback?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains&refresh_token=raw-nested-refresh-token'
    let activeProtocolContext: ReturnType<typeof getBetterAuthProtocolDiagnosticContext>
    protocolHandlerTestState.handler.mockImplementation(async () => {
      activeProtocolContext = getBetterAuthProtocolDiagnosticContext()
      return Response.redirect(
        'https://mail.example.test/settings/domains?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains&error_description=Cloudflare%20intent%20kept&access_token=raw-redirect-access-token',
        302
      )
    })

    const requestUrl = new URL('https://mail.example.test/api/oauth2/callback/cloudflare')
    requestUrl.searchParams.set('code', 'raw-oauth-code')
    requestUrl.searchParams.set('state', 'raw-oauth-state')
    requestUrl.searchParams.set('error_description', 'Cloudflare provider said keep cf-intent-123')
    requestUrl.searchParams.set('callbackUri', callbackUri)
    requestUrl.searchParams.set('cloudflareIntentId', 'cf-intent-123')
    requestUrl.searchParams.set('returnTarget', 'settings-domains')
    const response = await handleBetterAuthProtocolRequest(
      new Request(requestUrl, {
        headers: {
          'cf-ray': 'abc123-SFO',
          'x-request-id': 'request-123'
        }
      }),
      {
        consumerClass: 'browser-internal',
        publicMountPath: '/rpc/auth'
      }
    )

    expect(response.status).toBe(302)
    const completed = protocolHandlerTestState.debugLog.mock.calls.find(
      ([message]) => message === 'better_auth_oauth_callback_completed %o'
    )?.[1]
    const received = protocolHandlerTestState.debugLog.mock.calls.find(
      ([message]) => message === 'better_auth_oauth_callback_received %o'
    )?.[1]
    const serializedCalls = JSON.stringify(protocolHandlerTestState.debugLog.mock.calls)

    expect(received).toMatchObject({
      callbackUri:
        'https://mail.example.test/rpc/cloudflare/oauth/callback?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains&refresh_token=secret_redacted',
      cfRay: 'abc123-SFO',
      callbackPath: '/rpc/auth/api/oauth2/callback/cloudflare',
      cloudflareIntentId: 'cf-intent-123',
      consumerClass: 'browser-internal',
      logicalBetterAuthRequestUrl:
        'https://mail.example.test/api/oauth2/callback/cloudflare?code=secret_redacted&state=secret_redacted&error_description=Cloudflare+provider+said+keep+cf-intent-123&callbackUri=https%3A%2F%2Fmail.example.test%2Frpc%2Fcloudflare%2Foauth%2Fcallback%3FcloudflareIntentId%3Dcf-intent-123%26returnTarget%3Dsettings-domains%26refresh_token%3Dsecret_redacted&cloudflareIntentId=cf-intent-123&returnTarget=settings-domains',
      mountPath: '/rpc/auth',
      mountedRequestUrl:
        'https://mail.example.test/api/oauth2/callback/cloudflare?code=secret_redacted&state=secret_redacted&error_description=Cloudflare+provider+said+keep+cf-intent-123&callbackUri=https%3A%2F%2Fmail.example.test%2Frpc%2Fcloudflare%2Foauth%2Fcallback%3FcloudflareIntentId%3Dcf-intent-123%26returnTarget%3Dsettings-domains%26refresh_token%3Dsecret_redacted&cloudflareIntentId=cf-intent-123&returnTarget=settings-domains',
      phase: 'handler_entry',
      providerErrorDescription: 'Cloudflare provider said keep cf-intent-123',
      providerId: 'cloudflare',
      publicMountPath: '/rpc/auth',
      requestId: 'request-123',
      requestUrl:
        'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?code=secret_redacted&state=secret_redacted&error_description=Cloudflare+provider+said+keep+cf-intent-123&callbackUri=https%3A%2F%2Fmail.example.test%2Frpc%2Fcloudflare%2Foauth%2Fcallback%3FcloudflareIntentId%3Dcf-intent-123%26returnTarget%3Dsettings-domains%26refresh_token%3Dsecret_redacted&cloudflareIntentId=cf-intent-123&returnTarget=settings-domains',
      returnTarget: 'settings-domains'
    })
    expect(completed).toMatchObject({
      phase: 'handler_response',
      redirectLocation:
        'https://mail.example.test/settings/domains?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains&error_description=Cloudflare+intent+kept&access_token=secret_redacted',
      responseStatus: 302
    })
    expect(activeProtocolContext).toMatchObject({
      callbackUri:
        'https://mail.example.test/rpc/cloudflare/oauth/callback?cloudflareIntentId=cf-intent-123&returnTarget=settings-domains&refresh_token=secret_redacted',
      phase: 'better_auth_internal',
      providerId: 'cloudflare'
    })
    expect(serializedCalls).toContain('cf-intent-123')
    expect(serializedCalls).toContain('settings-domains')
    expect(serializedCalls).toContain('Cloudflare provider said keep cf-intent-123')
    expect(serializedCalls).toContain('Cloudflare+intent+kept')
    expect(serializedCalls).not.toContain('raw-oauth-code')
    expect(serializedCalls).not.toContain('raw-oauth-state')
    expect(serializedCalls).not.toContain('raw-nested-refresh-token')
    expect(serializedCalls).not.toContain('raw-redirect-access-token')
  })

  it('logs thrown OAuth callback errors without dropping concrete provider diagnostics', async () => {
    expect.hasAssertions()

    protocolHandlerTestState.handler.mockRejectedValue(
      new Error(
        'Provider failed at https://provider.example.test/oauth?error_description=cloudflareIntentId%20cf-intent-err%20returnTarget%20settings-domains&client_secret=raw-error-client-secret'
      )
    )
    const requestUrl = new URL('https://mail.example.test/oauth2/callback/cloudflare')
    requestUrl.searchParams.set(
      'callbackUri',
      'https://mail.example.test/settings/domains?cloudflareIntentId=cf-intent-err&returnTarget=settings-domains'
    )
    requestUrl.searchParams.set('code', 'raw-error-code')

    await expect(handleBetterAuthProtocolRequest(new Request(requestUrl))).rejects.toThrow('Provider failed')

    const exception = protocolHandlerTestState.debugLog.mock.calls.find(
      ([message]) => message === 'better_auth_oauth_callback_exception %o'
    )?.[1]
    const serializedException = JSON.stringify(exception)

    expect(exception).toMatchObject({
      error: {
        message:
          'Provider failed at https://provider.example.test/oauth?error_description=cloudflareIntentId+cf-intent-err+returnTarget+settings-domains&client_secret=secret_redacted',
        name: 'Error',
        type: 'object'
      },
      phase: 'handler_exception',
      providerId: 'cloudflare'
    })
    expect(serializedException).toContain('cf-intent-err')
    expect(serializedException).toContain('settings-domains')
    expect(serializedException).not.toContain('raw-error-client-secret')
    expect(serializedException).not.toContain('raw-error-code')
  })

  it('logs non-redirect Better Auth error response bodies with concrete diagnostics', async () => {
    expect.hasAssertions()

    protocolHandlerTestState.handler.mockResolvedValue(
      Response.json(
        {
          code: 'invalid_grant',
          details: {
            callback:
              'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?returnTarget=settings-domains&client_secret=raw-response-client-secret',
            providerMessage:
              'Provider kept cloudflareIntentId cf-intent-json returnTarget settings-domains verifier=raw-response-verifier',
            retryable: false
          },
          error: 'OAuthTokenExchangeError'
        },
        { status: 400 }
      )
    )
    const requestUrl = new URL('https://mail.example.test/oauth2/callback/cloudflare')
    requestUrl.searchParams.set(
      'callbackUri',
      'https://mail.example.test/settings/domains?cloudflareIntentId=cf-intent-json&returnTarget=settings-domains'
    )
    requestUrl.searchParams.set('code', 'raw-response-code')

    const response = await handleBetterAuthProtocolRequest(new Request(requestUrl))
    const completed = protocolHandlerTestState.debugLog.mock.calls.find(
      ([message]) => message === 'better_auth_oauth_callback_completed %o'
    )?.[1]
    const serializedCompleted = JSON.stringify(completed)

    expect(response.status).toBe(400)
    expect(completed).toMatchObject({
      phase: 'handler_response',
      responseBodyJson: {
        code: 'invalid_grant',
        details: {
          callback:
            'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?returnTarget=settings-domains&client_secret=secret_redacted',
          providerMessage:
            'Provider kept cloudflareIntentId cf-intent-json returnTarget settings-domains verifier=secret_redacted',
          retryable: false
        },
        error: 'OAuthTokenExchangeError'
      },
      responseContentType: 'application/json',
      responseStatus: 400
    })
    expect(completed?.responseBody).toContain('cf-intent-json')
    expect(completed?.responseBody).toContain('settings-domains')
    expect(completed?.responseBody).toContain('OAuthTokenExchangeError')
    expect(serializedCompleted).toContain('cf-intent-json')
    expect(serializedCompleted).toContain('settings-domains')
    expect(serializedCompleted).not.toContain('raw-response-client-secret')
    expect(serializedCompleted).not.toContain('raw-response-verifier')
    expect(serializedCompleted).not.toContain('raw-response-code')
  })
})
