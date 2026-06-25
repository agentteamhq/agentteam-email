import { beforeEach, describe, expect, it, vi } from 'vitest'

const backendPackageHandlersTestState = vi.hoisted(() => ({
  backendRpcHandle: vi.fn(),
  handleAgentAuthConfigurationRequest: vi.fn(),
  handleAtEmailMetadataRequest: vi.fn(),
  handleCloudflareOAuthCallbackRequest: vi.fn(),
  handleEmailVerifiedRedirect: vi.fn(),
  handleOAuthMetadataRequest: vi.fn(),
  handleStripeCheckoutRedirect: vi.fn(),
  handleStripePortalRedirect: vi.fn(),
  handleStripeRedirect: vi.fn()
}))

vi.mock('@main/backend', () => ({
  backendRpcApp: {
    handle: backendPackageHandlersTestState.backendRpcHandle
  },
  handleAgentAuthConfigurationRequest: backendPackageHandlersTestState.handleAgentAuthConfigurationRequest,
  handleAtEmailMetadataRequest: backendPackageHandlersTestState.handleAtEmailMetadataRequest,
  handleCloudflareOAuthCallbackRequest:
    backendPackageHandlersTestState.handleCloudflareOAuthCallbackRequest,
  handleOAuthMetadataRequest: backendPackageHandlersTestState.handleOAuthMetadataRequest,
  isAgentAuthConfigurationRequestPath: (pathname: string) =>
    pathname === '/.well-known/agent-configuration',
  isAtEmailMetadataRequestPath: (pathname: string) => pathname === '/.well-known/at-email',
  isCloudflareOAuthCallbackRequestPath: (pathname: string) =>
    pathname === '/cloudflare/oauth/callback',
  isOAuthMetadataRequestPath: (pathname: string) =>
    pathname === '/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/openid-configuration'
}))

vi.mock('@main/backend/routes/webapp', () => ({
  handleEmailVerifiedRedirect: backendPackageHandlersTestState.handleEmailVerifiedRedirect,
  handleStripeCheckoutRedirect: backendPackageHandlersTestState.handleStripeCheckoutRedirect,
  handleStripePortalRedirect: backendPackageHandlersTestState.handleStripePortalRedirect,
  handleStripeRedirect: backendPackageHandlersTestState.handleStripeRedirect
}))

describe('backend package request handler', () => {
  beforeEach(() => {
    backendPackageHandlersTestState.backendRpcHandle.mockReset()
    backendPackageHandlersTestState.handleAgentAuthConfigurationRequest.mockReset()
    backendPackageHandlersTestState.handleAtEmailMetadataRequest.mockReset()
    backendPackageHandlersTestState.handleCloudflareOAuthCallbackRequest.mockReset()
    backendPackageHandlersTestState.handleEmailVerifiedRedirect.mockReset()
    backendPackageHandlersTestState.handleOAuthMetadataRequest.mockReset()
    backendPackageHandlersTestState.handleStripeCheckoutRedirect.mockReset()
    backendPackageHandlersTestState.handleStripePortalRedirect.mockReset()
    backendPackageHandlersTestState.handleStripeRedirect.mockReset()
  })

  it('bridges public Agent Auth registration to the backend RPC auth mount with body and headers', async () => {
    expect.hasAssertions()
    const capturedRequests: Request[] = []
    backendPackageHandlersTestState.backendRpcHandle.mockImplementation(async (request: Request) => {
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
      path: '/rpc/auth/api/agent/register',
      query: '?source=cli',
      requestId: 'request-1'
    })
    expect(capturedRequests).toHaveLength(1)
    expect(capturedRequests[0]?.method).toBe('POST')
    expect(capturedRequests[0]?.headers.get('authorization')).toBe('Bearer header.payload.signature')
  })

  it('bridges public Agent Auth capability requests without changing the method or body', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendRpcHandle.mockImplementation(async (request: Request) =>
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
      path: '/rpc/auth/api/agent/request-capability'
    })
  })

  it('bridges raw Agent Auth grant mutation paths to the backend deny route', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendRpcHandle.mockImplementation(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      return Response.json(
        {
          error: 'Not found',
          path: pathname
        },
        { status: pathname === '/rpc/auth/api/agent/grant-capability' ? 404 : 500 }
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
      path: '/rpc/auth/api/agent/grant-capability'
    })
  })

  it('routes canonical Agent Mail ingest requests through the backend RPC app', async () => {
    expect.hasAssertions()
    backendPackageHandlersTestState.backendRpcHandle.mockImplementation(async (request: Request) =>
      Response.json({
        method: request.method,
        path: new URL(request.url).pathname
      })
    )
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    const response = await handleBackendPackageRequest(
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1', {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    await expect(response?.json()).resolves.toStrictEqual({
      method: 'POST',
      path: '/rpc/agent-mail/ingest/v1'
    })
    expect(backendPackageHandlersTestState.backendRpcHandle).toHaveBeenCalledTimes(1)
  })

  it('returns null for non-backend paths', async () => {
    expect.hasAssertions()
    const { handleBackendPackageRequest } = await import('./backend-package-handlers')

    await expect(
      handleBackendPackageRequest(new Request('https://mail.example.com/dashboard/'))
    ).resolves.toBeNull()
    expect(backendPackageHandlersTestState.backendRpcHandle).not.toHaveBeenCalled()
  })
})
