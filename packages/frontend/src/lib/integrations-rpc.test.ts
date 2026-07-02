import { beforeEach, describe, expect, it, vi } from 'vitest'

const integrationsRpcTestState = vi.hoisted(() => ({
  paperclipRevokePost: vi.fn(),
  viewGet: vi.fn()
}))

vi.mock('./rpc-api-client', () => ({
  rpc: {
    integrations: {
      get: integrationsRpcTestState.viewGet,
      paperclip: {
        revoke: {
          post: integrationsRpcTestState.paperclipRevokePost
        }
      }
    }
  }
}))

describe('integrations RPC adapter', () => {
  beforeEach(() => {
    integrationsRpcTestState.paperclipRevokePost.mockReset()
    integrationsRpcTestState.viewGet.mockReset()
  })

  it('loads the integrations view through the typed RPC client', async () => {
    expect.hasAssertions()
    const view = {
      allowedActions: {
        revokePaperclip: false
      },
      organizationId: 'org-1',
      paperclip: {
        available: true,
        connections: []
      },
      state: 'empty'
    }
    integrationsRpcTestState.viewGet.mockResolvedValue({
      data: view,
      error: null,
      status: 200
    })
    const { fetchIntegrationsView } = await import('./integrations-rpc')

    await expect(fetchIntegrationsView()).resolves.toBe(view)
    expect(integrationsRpcTestState.viewGet).toHaveBeenCalledWith()
  })

  it('revokes Paperclip through the typed RPC client', async () => {
    expect.hasAssertions()
    const result = {
      status: 'revoked',
      success: true,
      view: {
        allowedActions: {
          revokePaperclip: false
        },
        organizationId: 'org-1',
        paperclip: {
          available: true,
          connections: []
        },
        state: 'empty'
      }
    }
    integrationsRpcTestState.paperclipRevokePost.mockResolvedValue({
      data: result,
      error: null,
      status: 200
    })
    const { revokePaperclipIntegration } = await import('./integrations-rpc')

    await expect(revokePaperclipIntegration('paperclip-client-1')).resolves.toBe(result)
    expect(integrationsRpcTestState.paperclipRevokePost).toHaveBeenCalledWith({
      clientId: 'paperclip-client-1'
    })
  })
})
