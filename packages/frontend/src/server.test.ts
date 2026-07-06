import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRedirectErrorDiagnosticLogDetails } from './lib/redirect-error-page'
import type { IncomingMessage } from 'node:http'
import type { RedirectErrorDiagnosticLogDetails } from './lib/redirect-error-page'
import type { ServerRequest } from 'srvx'

type FetchHandler = (request: ServerRequest) => Promise<Response>
type RedirectErrorLogger = (details: RedirectErrorDiagnosticLogDetails) => void
type StartWebServerFetchOptions = { context?: { logRedirectError?: RedirectErrorLogger } }

const restoreLogSpies: Array<() => void> = []

const serverTestState = vi.hoisted(() => ({
  backendPackageRequestHandler: vi.fn(),
  fetchNodeHandler: vi.fn(),
  resolveClientStaticAssetPath: vi.fn(),
  serve: vi.fn(),
  serveOptions: null as { fetch: FetchHandler } | null,
  startWebServerFetch: vi.fn()
}))

vi.mock('srvx/node', () => ({
  fetchNodeHandler: serverTestState.fetchNodeHandler,
  serve: vi.fn((options: { fetch: FetchHandler }) => {
    serverTestState.serveOptions = options

    return {
      serve: serverTestState.serve
    }
  })
}))

vi.mock('./backend-package-handlers', () => ({
  handleBackendPackageRequest: serverTestState.backendPackageRequestHandler
}))

vi.mock('./static-assets', () => ({
  resolveClientStaticAssetPath: serverTestState.resolveClientStaticAssetPath
}))

vi.mock('./start-web-server.js', () => ({
  default: {
    fetch: serverTestState.startWebServerFetch
  }
}))

describe('frontend web-server default logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serverTestState.backendPackageRequestHandler.mockReset()
    serverTestState.fetchNodeHandler.mockReset()
    serverTestState.resolveClientStaticAssetPath.mockReset()
    serverTestState.serve.mockReset()
    serverTestState.serveOptions = null
    serverTestState.startWebServerFetch.mockReset()
    serverTestState.backendPackageRequestHandler.mockResolvedValue(new Response(null, { status: 204 }))
    serverTestState.resolveClientStaticAssetPath.mockResolvedValue(null)
    serverTestState.serve.mockResolvedValue(undefined)
  })

  afterEach(() => {
    for (const restore of restoreLogSpies.splice(0)) {
      restore()
    }
  })

  it('logs request completion with redacted path secrets and bounded correlation headers', async () => {
    expect.hasAssertions()
    const logs = captureDefaultLogs()
    const fetch = await startTestServer()

    await fetch(
      createServerRequest({
        headers: {
          authorization: 'Bearer raw-authorization-token',
          'cf-ray': '8d18f1d2c4a12345-SJC',
          cookie: 'better-auth.session_token=raw-cookie-token',
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          'x-request-id': 'request-1'
        },
        method: 'GET',
        url: '/agent/claim/claim-token-1?token=query-token&state=oauth-state'
      })
    )

    const requestLog = logs.entries().find((entry) => entry.event === 'web_server_request_completed')

    expect(requestLog).toMatchObject({
      cfRay: '8d18f1d2c4a12345-SJC',
      event: 'web_server_request_completed',
      level: 'info',
      method: 'GET',
      path: '/agent/claim/:redacted',
      requestId: 'request-1',
      status: 204,
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    })
    expect(logs.text()).not.toContain('claim-token-1')
    expect(logs.text()).not.toContain('query-token')
    expect(logs.text()).not.toContain('oauth-state')
    expect(logs.text()).not.toContain('raw-authorization-token')
    expect(logs.text()).not.toContain('raw-cookie-token')
  })

  it('keeps generic request completion logs path-only while detailed OAuth diagnostics carry query context', async () => {
    expect.hasAssertions()
    const logs = captureDefaultLogs()
    const fetch = await startTestServer()

    await fetch(
      createServerRequest({
        method: 'GET',
        url: '/rpc/auth/api/oauth2/callback/cloudflare?code=oauth-code-secret&state=oauth-state-secret'
      })
    )
    await fetch(
      createServerRequest({
        method: 'GET',
        url: '/rpc/auth/api/reset-password/reset-token-secret?callbackURL=%2Freset-password%2F'
      })
    )

    const completedLogs = logs.entries().filter((entry) => entry.event === 'web_server_request_completed')

    expect(completedLogs.map((entry) => entry.path)).toStrictEqual([
      '/rpc/auth/api/oauth2/callback/cloudflare',
      '/rpc/auth/api/reset-password/:redacted'
    ])
    expect(logs.text()).not.toContain('oauth-code-secret')
    expect(logs.text()).not.toContain('oauth-state-secret')
    expect(logs.text()).not.toContain('reset-token-secret')
    expect(logs.text()).not.toContain('callbackURL')
  })

  it('logs unhandled request error names and codes without raw error messages or token-bearing paths', async () => {
    expect.hasAssertions()
    const logs = captureDefaultLogs()
    const fetch = await startTestServer()
    const error = new Error('Cloudflare OAuth callback leaked oauth-token-secret')
    error.name = 'UpstreamOAuthError'

    Object.assign(error, {
      code: 'ERR_UPSTREAM_OAUTH',
      statusCode: 502
    })
    serverTestState.backendPackageRequestHandler.mockRejectedValue(error)

    await expect(
      fetch(
        createServerRequest({
          method: 'GET',
          url: '/rpc/auth/api/reset-password/reset-token-secret?token=query-token'
        })
      )
    ).rejects.toThrow(error)

    const errorLog = logs.entries().find((entry) => entry.event === 'web_server_request_unhandled_error')

    expect(errorLog).toMatchObject({
      errorCode: 'ERR_UPSTREAM_OAUTH',
      errorName: 'UpstreamOAuthError',
      errorStatus: 502,
      errorType: 'object',
      event: 'web_server_request_unhandled_error',
      level: 'error',
      path: '/rpc/auth/api/reset-password/:redacted'
    })
    expect(logs.text()).not.toContain('oauth-token-secret')
    expect(logs.text()).not.toContain('reset-token-secret')
    expect(logs.text()).not.toContain('query-token')
  })

  it('preserves ordinary safe error names and codes in unhandled request diagnostics', async () => {
    expect.hasAssertions()
    const logs = captureDefaultLogs()
    const fetch = await startTestServer()
    const error = new Error('validation failed')
    error.name = 'ValidationError'

    Object.assign(error, {
      code: 'ERR_VALIDATION_FAILED',
      statusCode: 400
    })
    serverTestState.backendPackageRequestHandler.mockRejectedValue(error)

    await expect(
      fetch(
        createServerRequest({
          method: 'GET',
          url: '/rpc/mailboxes'
        })
      )
    ).rejects.toThrow(error)

    const errorLog = logs.entries().find((entry) => entry.event === 'web_server_request_unhandled_error')

    expect(errorLog).toMatchObject({
      errorCode: 'ERR_VALIDATION_FAILED',
      errorName: 'ValidationError',
      errorStatus: 400,
      errorType: 'object',
      event: 'web_server_request_unhandled_error',
      level: 'error',
      path: '/rpc/mailboxes'
    })
    expect(logs.text()).not.toContain('validation failed')
  })

  it('preserves auth-shaped error names in unhandled request diagnostics', async () => {
    expect.hasAssertions()
    const logs = captureDefaultLogs()
    const fetch = await startTestServer()
    const error = new Error('token-bearing error name must not leak')
    error.name = 'JWTAccessTokenError'

    serverTestState.backendPackageRequestHandler.mockRejectedValue(error)

    await expect(
      fetch(
        createServerRequest({
          method: 'GET',
          url: '/rpc/mailboxes'
        })
      )
    ).rejects.toThrow(error)

    const errorLog = logs.entries().find((entry) => entry.event === 'web_server_request_unhandled_error')

    expect(errorLog).toMatchObject({
      errorName: 'JWTAccessTokenError',
      errorType: 'object',
      event: 'web_server_request_unhandled_error',
      level: 'error',
      path: '/rpc/mailboxes'
    })
    expect(logs.text()).toContain('JWTAccessTokenError')
    expect(logs.text()).not.toContain('token-bearing error name must not leak')
  })

  it('logs concrete OAuth redirect error diagnostics with narrow query secret redactions', async () => {
    expect.hasAssertions()
    const logs = captureDefaultLogs()
    const fetch = await startTestServer()
    serverTestState.backendPackageRequestHandler.mockResolvedValue(null)
    serverTestState.startWebServerFetch.mockImplementation(
      async (request: Request, options?: StartWebServerFetchOptions) => {
        options?.context?.logRedirectError?.(
          createRedirectErrorDiagnosticLogDetails({
            occurredAt: new Date('2026-07-06T06:45:42.151Z'),
            publicHostname: 'https://mail.example.test',
            url: request.url
          })
        )

        return new Response(null, { status: 200 })
      }
    )

    await fetch(
      createServerRequest({
        headers: {
          authorization: 'Bearer raw-authorization-token',
          'cf-ray': '8d18f1d2c4a12345-SJC',
          cookie: 'better-auth.session_token=raw-cookie-token',
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          'x-request-id': 'request-redirect-1'
        },
        method: 'GET',
        url:
          '/redirect/error?' +
          new URLSearchParams({
            access_token: 'cloudflare-access-token',
            admission_token: 'admission-token-secret',
            authorization: 'Bearer provider-secret',
            bearer: 'bearer-param-secret',
            callbackURL:
              '/settings/connected-accounts/?sessionToken=callback-url-session-token&returnTarget=settings-connected-accounts',
            callbackUri:
              'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?state=callback-state-secret',
            client_secret: 'client-secret-value',
            cloudflareIntentId: 'intent_public_test',
            code: 'cloudflare-code',
            error: 'oauth_code_verification_failed',
            error_description:
              'JWTAccessTokenError authorization=Bearer provider-secret client_secret=client-secret-value jwt=jwt-message-secret oauth_token=oauth-token-message-secret',
            flow: 'connected-account',
            jwt: 'jwt-param-secret',
            oauth_token: 'oauth-token-secret',
            provider: 'cloudflare',
            redirect_uri:
              'https://provider.example.test/oauth/callback?clientSecret=redirect-client-secret&scope=read',
            returnTarget: 'settings-connected-accounts',
            state: 'cloudflare-state'
          }).toString()
      })
    )

    const redirectLog = logs.entries().find((entry) => entry.event === 'oauth_redirect_error')

    expect(redirectLog).toMatchObject({
      callbackURL:
        '/settings/connected-accounts/?sessionToken=%5Bredacted%5D&returnTarget=settings-connected-accounts',
      callbackURLPath: '/settings/connected-accounts/',
      callbackURLQueryParameterNames: ['returnTarget', 'sessionToken'],
      callbackUri: 'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?state=%5Bredacted%5D',
      callbackPath: '/rpc/auth/api/oauth2/callback/cloudflare',
      cfRay: '8d18f1d2c4a12345-SJC',
      cloudflareIntentId: 'intent_public_test',
      errorCode: 'oauth_code_verification_failed',
      error_description:
        'JWTAccessTokenError authorization=[redacted] client_secret=[redacted] jwt=[redacted] oauth_token=[redacted]',
      event: 'oauth_redirect_error',
      flow: 'connected-account',
      level: 'error',
      method: 'GET',
      operation: 'oauth_redirect_error',
      path: '/redirect/error',
      provider: 'cloudflare',
      providerId: 'cloudflare',
      providerMessage:
        'JWTAccessTokenError authorization=[redacted] client_secret=[redacted] jwt=[redacted] oauth_token=[redacted]',
      redirect_uri: 'https://provider.example.test/oauth/callback?clientSecret=%5Bredacted%5D&scope=read',
      redirectUriPath: '/oauth/callback',
      redirectUriQueryParameterNames: ['clientSecret', 'scope'],
      redactedQueryKeys: [
        'access_token',
        'admission_token',
        'authorization',
        'bearer',
        'client_secret',
        'code',
        'jwt',
        'oauth_token',
        'state'
      ],
      requestId: 'request-redirect-1',
      returnTarget: 'settings-connected-accounts',
      supportReference:
        'redirect-error:cloudflare:connected-account:oauth_code_verification_failed:2026-07-06T06:45:42.151Z',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    })
    expect(redirectLog?.requestSequence).toStrictEqual(expect.any(Number))
    expect(redirectLog?.pageUri).toStrictEqual(
      expect.stringContaining('cloudflareIntentId=intent_public_test')
    )
    expect(redirectLog?.redactedQuery).toStrictEqual(
      expect.stringContaining('cloudflareIntentId=intent_public_test')
    )
    expect(redirectLog?.redactedQuery).toStrictEqual(expect.stringContaining('JWTAccessTokenError'))
    expect(logs.text()).not.toContain('cloudflare-code')
    expect(logs.text()).not.toContain('cloudflare-state')
    expect(logs.text()).not.toContain('cloudflare-access-token')
    expect(logs.text()).not.toContain('admission-token-secret')
    expect(logs.text()).not.toContain('bearer-param-secret')
    expect(logs.text()).not.toContain('provider-secret')
    expect(logs.text()).not.toContain('client-secret-value')
    expect(logs.text()).not.toContain('jwt-message-secret')
    expect(logs.text()).not.toContain('jwt-param-secret')
    expect(logs.text()).not.toContain('oauth-token-message-secret')
    expect(logs.text()).not.toContain('oauth-token-secret')
    expect(logs.text()).not.toContain('callback-state-secret')
    expect(logs.text()).not.toContain('callback-url-session-token')
    expect(logs.text()).not.toContain('redirect-client-secret')
    expect(logs.text()).toContain('intent_public_test')
    expect(logs.text()).toContain('JWTAccessTokenError')
    expect(logs.text()).not.toContain('raw-authorization-token')
    expect(logs.text()).not.toContain('raw-cookie-token')
  })

  it('preserves auth-shaped error codes in unhandled request diagnostics', async () => {
    expect.hasAssertions()
    const logs = captureDefaultLogs()
    const fetch = await startTestServer()
    const error = new Error('secret-bearing error code must not leak')

    Object.assign(error, {
      code: 'ERR_API_KEY_EXPIRED',
      statusCode: 503
    })
    serverTestState.backendPackageRequestHandler.mockRejectedValue(error)

    await expect(
      fetch(
        createServerRequest({
          method: 'GET',
          url: '/rpc/cloudflare/accounts'
        })
      )
    ).rejects.toThrow(error)

    const errorLog = logs.entries().find((entry) => entry.event === 'web_server_request_unhandled_error')

    expect(errorLog).toMatchObject({
      errorCode: 'ERR_API_KEY_EXPIRED',
      errorName: 'Error',
      errorStatus: 503,
      errorType: 'object',
      event: 'web_server_request_unhandled_error',
      level: 'error',
      path: '/rpc/cloudflare/accounts'
    })
    expect(logs.text()).toContain('ERR_API_KEY_EXPIRED')
    expect(logs.text()).not.toContain('secret-bearing error code must not leak')
  })
})

async function startTestServer(): Promise<FetchHandler> {
  const { startFrontendServer } = await import('./server')

  startFrontendServer({ host: '127.0.0.1', port: 4321 })
  await Promise.resolve()

  if (!serverTestState.serveOptions) {
    throw new Error('Expected test server options to be captured.')
  }

  return serverTestState.serveOptions.fetch
}

function createServerRequest({
  headers = {},
  method,
  url
}: {
  headers?: IncomingMessage['headers']
  method: string
  url: string
}): ServerRequest {
  const nodeRequest = {
    headers: {
      host: 'mail.example.test',
      ...headers
    },
    method,
    socket: {
      remoteAddress: '127.0.0.1'
    },
    url
  } as IncomingMessage

  return {
    runtime: {
      node: {
        req: nodeRequest
      }
    }
  } as ServerRequest
}

function captureDefaultLogs() {
  const stdout: string[] = []
  const stderr: string[] = []

  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(String(chunk))
    return true
  })
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderr.push(String(chunk))
    return true
  })
  restoreLogSpies.push(
    () => {
      stdoutSpy.mockRestore()
    },
    () => {
      stderrSpy.mockRestore()
    }
  )

  return {
    entries: () =>
      [...stdout, ...stderr]
        .join('')
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    text: () => [...stdout, ...stderr].join('')
  }
}
