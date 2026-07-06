import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage } from 'node:http'
import type { ServerRequest } from 'srvx'

type FetchHandler = (request: ServerRequest) => Promise<Response>

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

  it('strips OAuth callback query values and redacts Better Auth path tokens', async () => {
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

  it('logs unhandled request errors without raw error messages or token-bearing paths', async () => {
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
      errorStatus: 502,
      errorType: 'object',
      event: 'web_server_request_unhandled_error',
      level: 'error',
      path: '/rpc/auth/api/reset-password/:redacted'
    })
    expect(errorLog).not.toHaveProperty('errorCode')
    expect(errorLog).not.toHaveProperty('errorName')
    expect(logs.text()).not.toContain('ERR_UPSTREAM_OAUTH')
    expect(logs.text()).not.toContain('UpstreamOAuthError')
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

  it('redacts token-shaped error names from unhandled request diagnostics', async () => {
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
      errorType: 'object',
      event: 'web_server_request_unhandled_error',
      level: 'error',
      path: '/rpc/mailboxes'
    })
    expect(errorLog).not.toHaveProperty('errorName')
    expect(logs.text()).not.toContain('JWTAccessTokenError')
    expect(logs.text()).not.toContain('token-bearing error name must not leak')
  })

  it('redacts secret-shaped error codes from unhandled request diagnostics', async () => {
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
      errorName: 'Error',
      errorStatus: 503,
      errorType: 'object',
      event: 'web_server_request_unhandled_error',
      level: 'error',
      path: '/rpc/cloudflare/accounts'
    })
    expect(errorLog).not.toHaveProperty('errorCode')
    expect(logs.text()).not.toContain('ERR_API_KEY_EXPIRED')
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
