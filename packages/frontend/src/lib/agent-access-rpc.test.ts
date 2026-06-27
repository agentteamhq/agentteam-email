import { beforeEach, describe, expect, it, vi } from 'vitest'

const agentAccessRpcTestState = vi.hoisted(() => {
  const agentRoute = vi.fn()
  const claimRoute = vi.fn()

  return {
    agentRoute,
    approvalDecisionPost: vi.fn(),
    approvalLookupPost: vi.fn(),
    capabilityRevokePost: vi.fn(),
    claimDecisionPost: vi.fn(),
    claimGet: vi.fn(),
    claimRoute,
    paperclipConnectPost: vi.fn(),
    revokeAgentPost: vi.fn(),
    viewGet: vi.fn()
  }
})

vi.mock('./rpc-api-client', () => ({
  rpc: {
    'agent-access': {
      agents: agentAccessRpcTestState.agentRoute,
      approvals: {
        decision: { post: agentAccessRpcTestState.approvalDecisionPost },
        lookup: { post: agentAccessRpcTestState.approvalLookupPost }
      },
      get: agentAccessRpcTestState.viewGet,
      paperclip: {
        connect: { post: agentAccessRpcTestState.paperclipConnectPost }
      },
      trials: {
        claim: agentAccessRpcTestState.claimRoute
      }
    }
  }
}))

describe('agent access RPC adapter', () => {
  beforeEach(() => {
    agentAccessRpcTestState.agentRoute.mockReset()
    agentAccessRpcTestState.approvalDecisionPost.mockReset()
    agentAccessRpcTestState.approvalLookupPost.mockReset()
    agentAccessRpcTestState.capabilityRevokePost.mockReset()
    agentAccessRpcTestState.claimDecisionPost.mockReset()
    agentAccessRpcTestState.claimGet.mockReset()
    agentAccessRpcTestState.claimRoute.mockReset()
    agentAccessRpcTestState.paperclipConnectPost.mockReset()
    agentAccessRpcTestState.revokeAgentPost.mockReset()
    agentAccessRpcTestState.viewGet.mockReset()

    agentAccessRpcTestState.agentRoute.mockReturnValue({
      capabilities: {
        revoke: { post: agentAccessRpcTestState.capabilityRevokePost }
      },
      revoke: { post: agentAccessRpcTestState.revokeAgentPost }
    })
    agentAccessRpcTestState.claimRoute.mockReturnValue({
      decision: { post: agentAccessRpcTestState.claimDecisionPost },
      get: agentAccessRpcTestState.claimGet
    })
  })

  it('loads the agent access view through the typed RPC client', async () => {
    expect.hasAssertions()
    const view = {
      allowedActions: {
        connectPaperclip: true,
        denyApproval: false,
        reviewApproval: false,
        revokeAgent: true,
        revokeCapabilityGrant: false
      },
      state: 'ready'
    }
    agentAccessRpcTestState.viewGet.mockResolvedValue({
      data: view,
      error: null,
      status: 200
    })
    const { fetchAgentAccessView } = await import('./agent-access-rpc')

    await expect(fetchAgentAccessView()).resolves.toBe(view)
    expect(agentAccessRpcTestState.viewGet).toHaveBeenCalledWith()
  })

  it('posts Paperclip connection context without client-side permission inference', async () => {
    expect.hasAssertions()
    agentAccessRpcTestState.paperclipConnectPost.mockResolvedValue({
      data: { status: 'created', success: true },
      error: null,
      status: 200
    })
    const { connectPaperclipAgentAccess } = await import('./agent-access-rpc')

    await expect(
      connectPaperclipAgentAccess({
        companyId: 'paperclip-company-1',
        pluginId: 'agentteam.paperclip-email-plugin'
      })
    ).resolves.toStrictEqual({ status: 'created', success: true })
    expect(agentAccessRpcTestState.paperclipConnectPost).toHaveBeenCalledWith({
      companyId: 'paperclip-company-1',
      pluginId: 'agentteam.paperclip-email-plugin'
    })
  })

  it('surfaces structured WebAuthn authorization errors', async () => {
    expect.hasAssertions()
    agentAccessRpcTestState.approvalDecisionPost.mockResolvedValue({
      data: null,
      error: {
        value: {
          code: 'webauthn_required',
          error: 'WebAuthn approval is required',
          webauthnOptions: { challenge: 'challenge-1' }
        }
      },
      status: 403
    })
    const { decideAgentAccessApproval } = await import('./agent-access-rpc')

    await expect(
      decideAgentAccessApproval({
        action: 'approve',
        approvalId: 'approval-1'
      })
    ).rejects.toMatchObject({
      code: 'webauthn_required',
      message: 'WebAuthn approval is required',
      status: 403,
      webauthnOptions: { challenge: 'challenge-1' }
    })
  })

  it('passes approval lookup and decisions through the typed approval routes', async () => {
    expect.hasAssertions()
    agentAccessRpcTestState.approvalLookupPost.mockResolvedValue({
      data: { approvalId: 'approval-1', capabilities: [], state: 'pending' },
      error: null,
      status: 200
    })
    agentAccessRpcTestState.approvalDecisionPost.mockResolvedValue({
      data: { status: 'approved', success: true },
      error: null,
      status: 200
    })
    const { decideAgentAccessApproval, fetchAgentAccessApprovalPreview } = await import('./agent-access-rpc')
    const webauthnResponse = {
      clientExtensionResults: {},
      id: 'credential-1',
      rawId: 'raw-credential-1',
      response: {
        authenticatorData: 'authenticator-data',
        clientDataJSON: 'client-data-json',
        signature: 'signature'
      },
      type: 'public-key'
    } as const

    await expect(
      fetchAgentAccessApprovalPreview({
        agentId: 'agent-1',
        approvalId: 'approval-1',
        userCode: 'ABCD-EFGH'
      })
    ).resolves.toStrictEqual({ approvalId: 'approval-1', capabilities: [], state: 'pending' })
    await expect(
      decideAgentAccessApproval({
        action: 'approve',
        agentId: 'agent-1',
        approvalId: 'approval-1',
        userCode: 'ABCD-EFGH',
        webauthnResponse
      })
    ).resolves.toStrictEqual({ status: 'approved', success: true })
    expect(agentAccessRpcTestState.approvalLookupPost).toHaveBeenCalledWith({
      agentId: 'agent-1',
      approvalId: 'approval-1',
      userCode: 'ABCD-EFGH'
    })
    expect(agentAccessRpcTestState.approvalDecisionPost).toHaveBeenCalledWith({
      action: 'approve',
      agentId: 'agent-1',
      approvalId: 'approval-1',
      userCode: 'ABCD-EFGH',
      webauthnResponse
    })
  })

  it('routes full agent revocation through the agent-specific RPC route', async () => {
    expect.hasAssertions()
    agentAccessRpcTestState.revokeAgentPost.mockResolvedValue({
      data: { status: 'revoked', success: true },
      error: null,
      status: 200
    })
    const { revokeAgentAccessAgent } = await import('./agent-access-rpc')

    await expect(revokeAgentAccessAgent('agent-1')).resolves.toStrictEqual({
      status: 'revoked',
      success: true
    })
    expect(agentAccessRpcTestState.agentRoute).toHaveBeenCalledWith({ agentId: 'agent-1' })
    expect(agentAccessRpcTestState.revokeAgentPost).toHaveBeenCalledWith()
  })

  it('passes capability revocation to the agent-specific RPC route', async () => {
    expect.hasAssertions()
    agentAccessRpcTestState.capabilityRevokePost.mockResolvedValue({
      data: { status: 'revoked', success: true },
      error: null,
      status: 200
    })
    const { revokeAgentAccessCapability } = await import('./agent-access-rpc')

    await expect(
      revokeAgentAccessCapability({
        agentId: 'agent-1',
        capability: 'email.message.read',
        grantId: 'grant-1'
      })
    ).resolves.toStrictEqual({ status: 'revoked', success: true })
    expect(agentAccessRpcTestState.agentRoute).toHaveBeenCalledWith({ agentId: 'agent-1' })
    expect(agentAccessRpcTestState.capabilityRevokePost).toHaveBeenCalledWith({
      capabilities: ['email.message.read'],
      grantId: 'grant-1'
    })
  })

  it('routes trial claim lookup and decisions through the token-scoped RPC path', async () => {
    expect.hasAssertions()
    agentAccessRpcTestState.claimGet.mockResolvedValue({
      data: { agentName: 'Trial Agent', state: 'pending' },
      error: null,
      status: 200
    })
    agentAccessRpcTestState.claimDecisionPost.mockResolvedValue({
      data: { status: 'approved', success: true },
      error: null,
      status: 200
    })
    const { decideAgentMailTrialClaim, fetchAgentMailTrialClaim } = await import('./agent-access-rpc')

    await expect(fetchAgentMailTrialClaim('claim-token-1')).resolves.toStrictEqual({
      agentName: 'Trial Agent',
      state: 'pending'
    })
    await expect(
      decideAgentMailTrialClaim({
        action: 'approve',
        targetOrganizationId: 'org-1',
        token: 'claim-token-1'
      })
    ).resolves.toStrictEqual({ status: 'approved', success: true })
    expect(agentAccessRpcTestState.claimRoute).toHaveBeenCalledWith({ token: 'claim-token-1' })
    expect(agentAccessRpcTestState.claimGet).toHaveBeenCalledWith()
    expect(agentAccessRpcTestState.claimDecisionPost).toHaveBeenCalledWith({
      action: 'approve',
      target_organization_id: 'org-1'
    })
  })
})
