import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  IntegrationsError,
  IntegrationsView,
  getIntegrationsViewForWeb,
  isIntegrationsError,
  revokePaperclipIntegrationForWeb
} from '../integrations/service'

type GetIntegrationsViewForWebMock = (input: { headers: Headers }) => Promise<IntegrationsView>
type RevokePaperclipIntegrationForWebMock = (input: {
  headers: Headers
  input: unknown
}) => Promise<unknown>
type IsIntegrationsErrorMock = (error: unknown) => error is IntegrationsError

const integrationsRpcTestState = vi.hoisted(() => ({
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
})
