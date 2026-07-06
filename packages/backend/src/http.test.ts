import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AtEmailMetadata from './auth/at-email-metadata'
import type * as RuntimeProjection from './agent-mail/runtime-projection'

const httpBoundaryTestState = vi.hoisted(() => ({
  atEmailMetadataHandler: vi.fn(),
  authHandler: vi.fn(),
  debugFactory: Object.assign(vi.fn(), {
    disable: vi.fn(),
    enable: vi.fn(),
    enabled: vi.fn()
  }),
  debugLog: vi.fn(),
  globals: vi.fn(),
  runtimeSnapshotHandler: vi.fn()
}))

vi.mock('debug', () => ({
  default: httpBoundaryTestState.debugFactory
}))

vi.mock('./globals', () => ({
  globals: httpBoundaryTestState.globals
}))

vi.mock('./auth/at-email-metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof AtEmailMetadata>()

  return {
    ...actual,
    handleAtEmailMetadataRequest: httpBoundaryTestState.atEmailMetadataHandler
  }
})

vi.mock('./agent-mail/runtime-projection', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeProjection>()

  return {
    ...actual,
    handleAgentMailRuntimeSnapshotRequest: httpBoundaryTestState.runtimeSnapshotHandler
  }
})

describe('backend HTTP boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    httpBoundaryTestState.atEmailMetadataHandler.mockReset()
    httpBoundaryTestState.authHandler.mockReset()
    httpBoundaryTestState.debugFactory.mockClear()
    httpBoundaryTestState.debugFactory.mockImplementation(() => httpBoundaryTestState.debugLog)
    httpBoundaryTestState.debugLog.mockReset()
    httpBoundaryTestState.globals.mockReset()
    httpBoundaryTestState.globals.mockResolvedValue({
      auth: {
        handler: httpBoundaryTestState.authHandler
      }
    })
    httpBoundaryTestState.runtimeSnapshotHandler.mockReset()
  })

  it('mounts /api/auth as the API-client Better Auth protocol boundary', async () => {
    expect.hasAssertions()
    httpBoundaryTestState.authHandler.mockImplementation(async (request: Request) =>
      Response.json({
        path: new URL(request.url).pathname
      })
    )
    const { backendHttpApp } = await import('./http')

    const response = await backendHttpApp.handle(
      new Request('https://mail.example.com/api/auth/agent/register', {
        body: '{}',
        headers: {
          authorization: 'Bearer header.payload.signature',
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({ path: '/api/agent/register' })
    expect(httpBoundaryTestState.authHandler).toHaveBeenCalledOnce()
  })

  it('keeps /rpc/auth/api available as the browser/internal Better Auth protocol boundary', async () => {
    expect.hasAssertions()
    httpBoundaryTestState.authHandler.mockImplementation(async (request: Request) =>
      Response.json({
        path: new URL(request.url).pathname
      })
    )
    const { backendHttpApp } = await import('./http')

    const response = await backendHttpApp.handle(
      new Request('https://mail.example.com/rpc/auth/api/agent/register', {
        body: '{}',
        headers: {
          authorization: 'Bearer header.payload.signature',
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({ path: '/api/agent/register' })
    expect(httpBoundaryTestState.authHandler).toHaveBeenCalledOnce()
  })

  it('redacts unhandled HTTP boundary errors from public responses and logs safe diagnostics', async () => {
    expect.hasAssertions()
    const error = Object.assign(
      new Error('MongoDB connection failed with password=_secret_database_password'),
      {
        code: 'MONGODB_DOWN',
        statusCode: 503
      }
    )
    error.stack = 'stack with _secret_database_password'
    httpBoundaryTestState.globals.mockRejectedValue(error)

    const { backendHttpApp } = await import('./http')
    const response = await backendHttpApp.handle(
      new Request('https://mail.example.com/health?token=raw-query-token', {
        headers: {
          authorization: 'Bearer raw-bearer-token',
          cookie: 'better-auth.session_token=raw-cookie',
          'x-request-id': 'request-1'
        }
      })
    )
    const bodyText = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(bodyText)).toStrictEqual({
      code: 'SERVICE_UNAVAILABLE',
      error: 'Service unavailable.',
      supportReference: 'request-id:request-1'
    })
    expect(bodyText).not.toContain('_secret_database_password')
    expect(bodyText).not.toContain('raw-query-token')
    expect(bodyText).not.toContain('raw-bearer-token')
    expect(bodyText).not.toContain('raw-cookie')
    expect(httpBoundaryTestState.debugLog).toHaveBeenCalledWith('backend_http_unhandled_error %o', {
      error: {
        code: 'MONGODB_DOWN',
        name: 'Error',
        statusCode: 503,
        type: 'object'
      },
      errorCode: 'MONGODB_DOWN',
      method: 'GET',
      operation: 'backend_http_unhandled_error',
      path: '/health',
      publicError: {
        code: 'SERVICE_UNAVAILABLE',
        status: 503,
        supportReference: 'request-id:request-1'
      },
      requestId: 'request-1'
    })
    const serializedLogCalls = JSON.stringify(httpBoundaryTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('_secret_database_password')
    expect(serializedLogCalls).not.toContain('raw-query-token')
    expect(serializedLogCalls).not.toContain('raw-bearer-token')
    expect(serializedLogCalls).not.toContain('raw-cookie')
    expect(serializedLogCalls).not.toContain('MongoDB connection failed')
    expect(serializedLogCalls).not.toContain('stack with')
  })

  it('redacts unhandled mounted RPC errors instead of returning framework fallback bodies', async () => {
    expect.hasAssertions()
    const error = new Error(
      'control snapshot failed with Authorization Bearer raw-control-token for support@example.test'
    )
    error.name = 'ControlSnapshotTransportError'
    error.stack = 'stack with raw-control-token'
    httpBoundaryTestState.runtimeSnapshotHandler.mockRejectedValue(error)

    const { backendHttpApp } = await import('./http')
    const response = await backendHttpApp.handle(
      new Request('https://mail.example.com/rpc/internal/agent-mail/runtime/snapshot?code=raw-oauth-code', {
        headers: {
          'cf-ray': '8d18f1d2c4a12345-SJC',
          cookie: 'better-auth.session_token=raw-cookie',
          'x-request-id': 'sk-secret-request-token'
        }
      })
    )
    const bodyText = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(bodyText)).toStrictEqual({
      code: 'INTERNAL_SERVER_ERROR',
      error: 'Internal server error.',
      supportReference: 'cf-ray:8d18f1d2c4a12345-SJC'
    })
    expect(bodyText).not.toContain('raw-control-token')
    expect(bodyText).not.toContain('support@example.test')
    expect(bodyText).not.toContain('raw-oauth-code')
    expect(bodyText).not.toContain('sk-secret-request-token')
    expect(bodyText).not.toContain('raw-cookie')
    expect(httpBoundaryTestState.debugLog).toHaveBeenCalledWith('backend_http_unhandled_error %o', {
      cfRay: '8d18f1d2c4a12345-SJC',
      error: {
        name: 'ControlSnapshotTransportError',
        type: 'object'
      },
      method: 'GET',
      operation: 'backend_http_unhandled_error',
      path: '/rpc/internal/agent-mail/runtime/snapshot',
      publicError: {
        code: 'INTERNAL_SERVER_ERROR',
        status: 500,
        supportReference: 'cf-ray:8d18f1d2c4a12345-SJC'
      }
    })
    const serializedLogCalls = JSON.stringify(httpBoundaryTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('raw-control-token')
    expect(serializedLogCalls).not.toContain('support@example.test')
    expect(serializedLogCalls).not.toContain('raw-oauth-code')
    expect(serializedLogCalls).not.toContain('sk-secret-request-token')
    expect(serializedLogCalls).not.toContain('raw-cookie')
    expect(serializedLogCalls).not.toContain('control snapshot failed')
    expect(serializedLogCalls).not.toContain('stack with')
  })

  it('redacts unhandled direct RPC boundary errors and logs safe diagnostics', async () => {
    expect.hasAssertions()
    const error = new Error(
      'control snapshot failed with Authorization Bearer raw-control-token for support@example.test'
    )
    error.name = 'ControlSnapshotTransportError'
    error.stack = 'stack with raw-control-token'
    httpBoundaryTestState.runtimeSnapshotHandler.mockRejectedValue(error)

    const { backendRpcApp } = await import('./rpc')
    const response = await backendRpcApp.handle(
      new Request('https://mail.example.com/rpc/internal/agent-mail/runtime/snapshot?code=raw-oauth-code', {
        headers: {
          'cf-ray': '8d18f1d2c4a12345-SJC',
          cookie: 'better-auth.session_token=raw-cookie',
          'x-request-id': 'sk-secret-request-token'
        }
      })
    )
    const bodyText = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(bodyText)).toStrictEqual({
      code: 'INTERNAL_SERVER_ERROR',
      error: 'Internal server error.',
      supportReference: 'cf-ray:8d18f1d2c4a12345-SJC'
    })
    expect(bodyText).not.toContain('raw-control-token')
    expect(bodyText).not.toContain('support@example.test')
    expect(bodyText).not.toContain('raw-oauth-code')
    expect(bodyText).not.toContain('sk-secret-request-token')
    expect(bodyText).not.toContain('raw-cookie')
    expect(httpBoundaryTestState.debugLog).toHaveBeenCalledWith('rpc_unhandled_error %o', {
      cfRay: '8d18f1d2c4a12345-SJC',
      error: {
        name: 'ControlSnapshotTransportError',
        type: 'object'
      },
      method: 'GET',
      operation: 'rpc_unhandled_error',
      path: '/rpc/internal/agent-mail/runtime/snapshot',
      publicError: {
        code: 'INTERNAL_SERVER_ERROR',
        status: 500,
        supportReference: 'cf-ray:8d18f1d2c4a12345-SJC'
      }
    })
    const serializedLogCalls = JSON.stringify(httpBoundaryTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('raw-control-token')
    expect(serializedLogCalls).not.toContain('support@example.test')
    expect(serializedLogCalls).not.toContain('raw-oauth-code')
    expect(serializedLogCalls).not.toContain('sk-secret-request-token')
    expect(serializedLogCalls).not.toContain('raw-cookie')
    expect(serializedLogCalls).not.toContain('control snapshot failed')
    expect(serializedLogCalls).not.toContain('stack with')
  })

  it('uses the shared public error contract for direct metadata fallback 404 responses', async () => {
    expect.hasAssertions()
    httpBoundaryTestState.atEmailMetadataHandler.mockResolvedValue(null)

    const { backendHttpApp } = await import('./http')
    const response = await backendHttpApp.handle(
      new Request('https://mail.example.com/.well-known/at-email.json?token=raw-query-token', {
        headers: {
          'x-request-id': 'metadata-fallback-1'
        }
      })
    )
    const bodyText = await response.text()

    expect(response.status).toBe(404)
    expect(JSON.parse(bodyText)).toStrictEqual({
      code: 'NOT_FOUND',
      error: 'Not found.',
      supportReference: 'request-id:metadata-fallback-1'
    })
    expect(bodyText).not.toContain('raw-query-token')
  })
})
