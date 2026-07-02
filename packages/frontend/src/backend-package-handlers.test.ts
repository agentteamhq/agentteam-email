import { beforeEach, describe, expect, it, vi } from 'vitest'

const backendPackageHandlersTestState = vi.hoisted(() => ({
  backendHttpHandle: vi.fn(),
  handleEmailVerifiedRedirect: vi.fn(),
  handleStripeCheckoutRedirect: vi.fn(),
  handleStripePortalRedirect: vi.fn(),
  handleStripeRedirect: vi.fn()
}))

vi.mock('@main/backend', () => ({
  backendHttpApp: {
    handle: backendPackageHandlersTestState.backendHttpHandle
  },
  isBackendHttpRequestPath: (pathname: string) =>
    pathname === '/health' ||
    pathname === '/.well-known/agent-configuration' ||
    pathname === '/.well-known/at-email.json' ||
    pathname === '/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/openid-configuration' ||
    pathname === '/.well-known/oauth-protected-resource/api' ||
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/rpc' ||
    pathname.startsWith('/rpc/')
}))

vi.mock('@main/backend/routes/webapp', () => ({
  handleEmailVerifiedRedirect: backendPackageHandlersTestState.handleEmailVerifiedRedirect,
  handleStripeCheckoutRedirect: backendPackageHandlersTestState.handleStripeCheckoutRedirect,
  handleStripePortalRedirect: backendPackageHandlersTestState.handleStripePortalRedirect,
  handleStripeRedirect: backendPackageHandlersTestState.handleStripeRedirect
}))

describe('backend package request handler', () => {
  beforeEach(() => {
    backendPackageHandlersTestState.backendHttpHandle.mockReset()
    backendPackageHandlersTestState.handleEmailVerifiedRedirect.mockReset()
    backendPackageHandlersTestState.handleStripeCheckoutRedirect.mockReset()
    backendPackageHandlersTestState.handleStripePortalRedirect.mockReset()
    backendPackageHandlersTestState.handleStripeRedirect.mockReset()
  })

  it('delegates /api/auth registration to the backend HTTP boundary without rewriting', async () => {
    expect.hasAssertions()
    const capturedRequests: Request[] = []
    backendPackageHandlersTestState.backendHttpHandle.mockImplementation(async (request: Request) => {
      capturedRequests.push(request)
      return Response.json({
        body: await request.clone().json(),
        ok: true,
        path: new URL(request.url).pathname,
        query: new URL(request.url).search,
        requestId: request.headers.get('x-request-id')
      })
    })
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    const response = await handleBackendPackageRequest(
      new Request('https://mail.example.com/api/auth/agent/register?source=cli', {
        body: JSON.stringify({ mode: 'delegated', name: 'CLI agent' }),
        headers: {
          authorization: 'Bearer header.payload.signature',
          'content-type': 'application/json',
          'x-request-id': 'request-1'
        },
        method: 'POST'
      })
    )

    await expect(response?.json()).resolves.toStrictEqual({
      body: { mode: 'delegated', name: 'CLI agent' },
      ok: true,
      path: '/api/auth/agent/register',
      query: '?source=cli',
      requestId: 'request-1'
    })
    expect(capturedRequests).toHaveLength(1)
    expect(capturedRequests[0]?.method).toBe('POST')
    expect(capturedRequests[0]?.headers.get('authorization')).toBe('Bearer header.payload.signature')
  })

  it('delegates /api/auth capability requests without changing the method or body', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendHttpHandle.mockImplementation(async (request: Request) =>
      Response.json({
        body: await request.clone().json(),
        method: request.method,
        path: new URL(request.url).pathname
      })
    )
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    const response = await handleBackendPackageRequest(
      new Request('https://mail.example.com/api/auth/agent/request-capability', {
        body: JSON.stringify({
          capabilities: [{ name: 'email.message.read' }],
          reason: 'read mailbox'
        }),
        headers: {
          authorization: 'Bearer header.payload.signature',
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    await expect(response?.json()).resolves.toStrictEqual({
      body: {
        capabilities: [{ name: 'email.message.read' }],
        reason: 'read mailbox'
      },
      method: 'POST',
      path: '/api/auth/agent/request-capability'
    })
  })

  it('does not rewrite /api/auth grant mutation paths to RPC deny routes', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendHttpHandle.mockImplementation(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      return Response.json(
        {
          error: 'Not found',
          path: pathname
        },
        { status: pathname === '/api/auth/agent/grant-capability' ? 404 : 500 }
      )
    })
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    const response = await handleBackendPackageRequest(
      new Request('https://mail.example.com/api/auth/agent/grant-capability', {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response?.status).toBe(404)
    await expect(response?.json()).resolves.toStrictEqual({
      error: 'Not found',
      path: '/api/auth/agent/grant-capability'
    })
  })

  it('routes canonical Agent Mail ingest requests through the backend HTTP boundary', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendHttpHandle.mockImplementation(async (request: Request) =>
      Response.json({
        method: request.method,
        path: new URL(request.url).pathname
      })
    )
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    const response = await handleBackendPackageRequest(
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1/conn_public_test', {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    await expect(response?.json()).resolves.toStrictEqual({
      method: 'POST',
      path: '/rpc/agent-mail/ingest/v1/conn_public_test'
    })
    expect(backendPackageHandlersTestState.backendHttpHandle).toHaveBeenCalledTimes(1)
  })

  it('routes Cloudflare generic OAuth callbacks through the mounted Better Auth RPC path', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendHttpHandle.mockImplementation(async (request: Request) =>
      Response.json({
        path: new URL(request.url).pathname,
        query: new URL(request.url).search
      })
    )
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    const response = await handleBackendPackageRequest(
      new Request('https://mail.example.com/rpc/auth/api/oauth2/callback/cloudflare?code=code-1&state=state-1')
    )

    await expect(response?.json()).resolves.toStrictEqual({
      path: '/rpc/auth/api/oauth2/callback/cloudflare',
      query: '?code=code-1&state=state-1'
    })
    expect(backendPackageHandlersTestState.backendHttpHandle).toHaveBeenCalledTimes(1)
  })

  it('delegates legacy API OAuth callback paths to the backend boundary without rewriting', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendHttpHandle.mockImplementation(async (request: Request) =>
      Response.json(
        {
          error: 'Not found',
          path: new URL(request.url).pathname
        },
        { status: 404 }
      )
    )
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    const response = await handleBackendPackageRequest(
      new Request('https://mail.example.com/api/oauth2/callback/cloudflare?code=code-1&state=state-1')
    )

    expect(response?.status).toBe(404)
    await expect(response?.json()).resolves.toStrictEqual({
      error: 'Not found',
      path: '/api/oauth2/callback/cloudflare'
    })
    expect(backendPackageHandlersTestState.backendHttpHandle).toHaveBeenCalledTimes(1)
  })

  it('routes API mail requests through the backend HTTP boundary', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendHttpHandle.mockImplementation(async (request: Request) =>
      Response.json({
        path: new URL(request.url).pathname,
        query: new URL(request.url).search
      })
    )
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    const response = await handleBackendPackageRequest(
      new Request('https://mail.example.com/api/mail/workspace?limit=20')
    )

    await expect(response?.json()).resolves.toStrictEqual({
      path: '/api/mail/workspace',
      query: '?limit=20'
    })
    expect(backendPackageHandlersTestState.backendHttpHandle).toHaveBeenCalledTimes(1)
  })

  it('routes public metadata through the backend HTTP boundary', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendHttpHandle.mockImplementation(async (request: Request) =>
      Response.json({
        path: new URL(request.url).pathname
      })
    )
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    await expect(
      handleBackendPackageRequest(
        new Request('https://mail.example.com/.well-known/agent-configuration')
      )
    ).resolves.toBeDefined()
    expect(backendPackageHandlersTestState.backendHttpHandle).toHaveBeenCalledTimes(1)
  })

  it('delegates mounted Better Auth error paths through the backend HTTP boundary', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendHttpHandle.mockImplementation(async (request: Request) =>
      Response.json({
        path: new URL(request.url).pathname,
        query: new URL(request.url).search
      })
    )
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    const response = await handleBackendPackageRequest(
      new Request('https://mail.example.com/rpc/auth/api/error?error=invalid_request')
    )

    await expect(response?.json()).resolves.toStrictEqual({
      path: '/rpc/auth/api/error',
      query: '?error=invalid_request'
    })
    expect(backendPackageHandlersTestState.backendHttpHandle).toHaveBeenCalledTimes(1)
  })

  it('leaves the app-owned redirect error route to the frontend router', async () => {
    expect.hasAssertions()
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    await expect(
      handleBackendPackageRequest(
        new Request('https://mail.example.com/redirect/error?provider=cloudflare&error=invalid_request')
      )
    ).resolves.toBeNull()
    expect(backendPackageHandlersTestState.backendHttpHandle).not.toHaveBeenCalled()
  })

  it('returns null for non-backend paths', async () => {
    expect.hasAssertions()
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    await expect(
      handleBackendPackageRequest(new Request('https://mail.example.com/dashboard/'))
    ).resolves.toBeNull()
    expect(backendPackageHandlersTestState.backendHttpHandle).not.toHaveBeenCalled()
  })
})
