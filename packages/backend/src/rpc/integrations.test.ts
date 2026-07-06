import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  IntegrationsError,
  IntegrationsView,
  getIntegrationsViewForWeb,
  isIntegrationsError,
  revokePaperclipIntegrationForWeb
} from '../integrations/service'

type GetIntegrationsViewForWebMock = (input: { headers: Headers }) => Promise<IntegrationsView>
type RevokePaperclipIntegrationForWebMock = (input: { headers: Headers; input: unknown }) => Promise<unknown>
type IsIntegrationsErrorMock = (error: unknown) => error is IntegrationsError

const integrationsRpcTestState = vi.hoisted(() => ({
  debugFactory: Object.assign(vi.fn(), {
    disable: vi.fn(),
    enable: vi.fn(),
    enabled: vi.fn()
  }),
  debugLog: vi.fn(),
  getIntegrationsViewForWeb: vi.fn<GetIntegrationsViewForWebMock>(),
  isIntegrationsError: vi.fn<IsIntegrationsErrorMock>(),
  revokePaperclipIntegrationForWeb: vi.fn<RevokePaperclipIntegrationForWebMock>()
}))

const emptyIntegrationsView = {
  allowedActions: {
    revokePaperclip: false
  },
  organizationId: 'org-1',
  paperclip: {
    available: true,
    connections: []
  },
  state: 'empty'
} satisfies IntegrationsView

vi.mock('debug', () => ({
  default: integrationsRpcTestState.debugFactory
}))

vi.mock(import('../integrations/service'), () => ({
  getIntegrationsViewForWeb:
    integrationsRpcTestState.getIntegrationsViewForWeb as unknown as typeof getIntegrationsViewForWeb,
  isIntegrationsError: integrationsRpcTestState.isIntegrationsError as unknown as typeof isIntegrationsError,
  revokePaperclipIntegrationForWeb:
    integrationsRpcTestState.revokePaperclipIntegrationForWeb as unknown as typeof revokePaperclipIntegrationForWeb
}))

describe('integrations RPC routes', () => {
  beforeEach(() => {
    vi.resetModules()
    integrationsRpcTestState.debugFactory.mockClear()
    integrationsRpcTestState.debugFactory.mockImplementation(() => integrationsRpcTestState.debugLog)
    integrationsRpcTestState.debugLog.mockReset()
    integrationsRpcTestState.getIntegrationsViewForWeb.mockReset()
    integrationsRpcTestState.isIntegrationsError.mockReset()
    integrationsRpcTestState.revokePaperclipIntegrationForWeb.mockReset()
    integrationsRpcTestState.isIntegrationsError.mockImplementation(
      (error: unknown): error is IntegrationsError =>
        error instanceof Error && error.name === 'IntegrationsError'
    )
  })

  it('routes integrations view requests through the webserver boundary', async () => {
    expect.hasAssertions()
    integrationsRpcTestState.getIntegrationsViewForWeb.mockResolvedValue(emptyIntegrationsView)

    const { default: integrations } = await import('./integrations')
    const response = await integrations.handle(
      new Request('https://mail.example.com/integrations/', {
        headers: {
          cookie: 'session=abc'
        }
      })
    )

    await expect(response.json()).resolves.toStrictEqual(emptyIntegrationsView)
    expect(response.status).toBe(200)
    expect(integrationsRpcTestState.getIntegrationsViewForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers)
    })
    expect(integrationsRpcTestState.getIntegrationsViewForWeb.mock.calls[0][0].headers.get('cookie')).toBe(
      'session=abc'
    )
  })

  it('routes Paperclip revoke requests through the webserver boundary', async () => {
    expect.hasAssertions()
    integrationsRpcTestState.revokePaperclipIntegrationForWeb.mockResolvedValue({
      status: 'revoked',
      success: true,
      view: emptyIntegrationsView
    })

    const { default: integrations } = await import('./integrations')
    const response = await integrations.handle(
      new Request('https://mail.example.com/integrations/paperclip/revoke', {
        body: JSON.stringify({ clientId: 'paperclip-client-1' }),
        headers: {
          'content-type': 'application/json',
          cookie: 'session=abc'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    expect(integrationsRpcTestState.revokePaperclipIntegrationForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        clientId: 'paperclip-client-1'
      }
    })
  })

  it('maps integrations authorization failures to generic public copy with the Session challenge', async () => {
    expect.hasAssertions()

    const error = new Error(
      'Paperclip OAuth access token raw_secret_integration_token failed for user@example.test'
    ) as Error & {
      code: string
      status: 401
    }
    error.name = 'IntegrationsError'
    error.code = 'PAPERCLIP_TOKEN_REJECTED'
    error.status = 401
    error.stack = 'stack with raw_secret_integration_token and user@example.test'
    integrationsRpcTestState.getIntegrationsViewForWeb.mockRejectedValue(error)

    const { default: integrations } = await import('./integrations')
    const response = await integrations.handle(
      new Request('https://mail.example.com/integrations/', {
        headers: {
          'x-request-id': 'integrations_view_req-1'
        }
      })
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Session realm="AgentTeam Email integrations"')
    const body = await response.json()
    expect(body).toStrictEqual({
      code: 'UNAUTHORIZED',
      error: 'Authentication is required.',
      supportReference: 'request-id:integrations_view_req-1'
    })
    expect(integrationsRpcTestState.debugLog).toHaveBeenCalledWith('integrations_rpc_error %o', {
      error: {
        code: 'PAPERCLIP_TOKEN_REJECTED',
        message: 'Paperclip OAuth access token secret_redacted failed for  email_redacted',
        name: 'IntegrationsError',
        status: '401',
        statusCode: 401,
        type: 'object'
      },
      method: 'GET',
      operation: 'integrations_view',
      path: '/integrations/',
      publicError: {
        code: 'UNAUTHORIZED',
        status: 401,
        supportReference: 'request-id:integrations_view_req-1'
      },
      requestId: 'integrations_view_req-1',
      status: 401
    })
    const serializedBody = JSON.stringify(body)
    const serializedLogCalls = JSON.stringify(integrationsRpcTestState.debugLog.mock.calls)
    expect(serializedBody).not.toContain('raw_secret_integration_token')
    expect(serializedBody).not.toContain('user@example.test')
    expect(serializedBody).not.toContain('Paperclip OAuth access token')
    expect(serializedLogCalls).not.toContain('raw_secret_integration_token')
    expect(serializedLogCalls).not.toContain('user@example.test')
    expect(serializedLogCalls).toContain('Paperclip OAuth access token')
    expect(serializedLogCalls).toContain('PAPERCLIP_TOKEN_REJECTED')
    expect(serializedLogCalls).not.toContain('stack with')
  })

  it('maps unexpected integrations failures to generic public errors', async () => {
    expect.hasAssertions()

    const error = new Error('Mongo connection failed with password=integration-db-secret')
    error.name = 'MongoServerError'
    error.stack = 'mongo stack with integration-db-secret'
    integrationsRpcTestState.revokePaperclipIntegrationForWeb.mockRejectedValue(error)

    const { default: integrations } = await import('./integrations')
    const response = await integrations.handle(
      new Request('https://mail.example.com/integrations/paperclip/revoke', {
        body: JSON.stringify({ clientId: 'paperclip-client-1' }),
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'integrations_revoke_req-1'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toStrictEqual({
      code: 'INTERNAL_SERVER_ERROR',
      error: 'Internal server error.',
      supportReference: 'request-id:integrations_revoke_req-1'
    })
    expect(integrationsRpcTestState.debugLog).toHaveBeenCalledWith('integrations_rpc_error %o', {
      error: {
        message: 'Mongo connection failed with password=secret_redacted',
        name: 'MongoServerError',
        type: 'object'
      },
      method: 'POST',
      operation: 'integrations_paperclip_revoke',
      path: '/integrations/paperclip/revoke',
      publicError: {
        code: 'INTERNAL_SERVER_ERROR',
        status: 500,
        supportReference: 'request-id:integrations_revoke_req-1'
      },
      requestId: 'integrations_revoke_req-1',
      status: 500
    })
    const serializedBody = JSON.stringify(body)
    const serializedLogCalls = JSON.stringify(integrationsRpcTestState.debugLog.mock.calls)
    expect(serializedBody).not.toContain('integration-db-secret')
    expect(serializedBody).not.toContain('Mongo connection failed')
    expect(serializedLogCalls).not.toContain('integration-db-secret')
    expect(serializedLogCalls).toContain('Mongo connection failed')
    expect(serializedLogCalls).not.toContain('mongo stack')
  })
})
