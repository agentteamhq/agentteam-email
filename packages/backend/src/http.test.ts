import { beforeEach, describe, expect, it, vi } from 'vitest'

const httpBoundaryTestState = vi.hoisted(() => ({
  authHandler: vi.fn(),
  globals: vi.fn()
}))

vi.mock('./globals', () => ({
  globals: httpBoundaryTestState.globals
}))

describe('backend HTTP boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    httpBoundaryTestState.authHandler.mockReset()
    httpBoundaryTestState.globals.mockReset()
    httpBoundaryTestState.globals.mockResolvedValue({
      auth: {
        handler: httpBoundaryTestState.authHandler
      }
    })
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
})
