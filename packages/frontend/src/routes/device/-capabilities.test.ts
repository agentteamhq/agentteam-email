import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  decideAgentAccessApprovalWithWebAuthn,
  formatApprovalConstraints,
  loadAgentCapabilityApproval
} from './capabilities'

const capabilitiesRouteTestState = vi.hoisted(() => {
  class TestAgentAccessRPCError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string,
      public readonly webauthnOptions?: Record<string, unknown>
    ) {
      super(message)
      this.name = 'AgentAccessRPCError'
    }
  }

  return {
    AgentAccessRPCError: TestAgentAccessRPCError,
    createWebAuthnAssertionResponse: vi.fn(),
    decideAgentAccessApproval: vi.fn(),
    fetchAgentAccessApprovalPreview: vi.fn(),
    fetchAgentAccessView: vi.fn()
  }
})

vi.mock('../../lib/agent-access-rpc', () => ({
  AgentAccessRPCError: capabilitiesRouteTestState.AgentAccessRPCError,
  decideAgentAccessApproval: capabilitiesRouteTestState.decideAgentAccessApproval,
  fetchAgentAccessApprovalPreview: capabilitiesRouteTestState.fetchAgentAccessApprovalPreview,
  fetchAgentAccessView: capabilitiesRouteTestState.fetchAgentAccessView
}))

vi.mock('../../lib/webauthn-assertion', () => ({
  createWebAuthnAssertionResponse: capabilitiesRouteTestState.createWebAuthnAssertionResponse
}))

describe('agent capability approval route data', () => {
  beforeEach(() => {
    capabilitiesRouteTestState.createWebAuthnAssertionResponse.mockReset()
    capabilitiesRouteTestState.decideAgentAccessApproval.mockReset()
    capabilitiesRouteTestState.fetchAgentAccessApprovalPreview.mockReset()
    capabilitiesRouteTestState.fetchAgentAccessView.mockReset()
  })

  it('loads user-code approvals through the minimal approval preview RPC', async () => {
    expect.hasAssertions()
    const approval = {
      agentId: 'agent-1',
      capabilityRequests: [],
      id: 'approval-1',
      status: 'pending'
    }
    const capabilityCatalog = {
      capabilities: ['email.message.read'],
      capabilityOptions: [
        {
          description: 'Read messages.',
          label: 'Read messages',
          value: 'email.message.read'
        }
      ]
    }
    capabilitiesRouteTestState.fetchAgentAccessApprovalPreview.mockResolvedValue({
      approval,
      capabilityCatalog
    })

    await expect(
      loadAgentCapabilityApproval({
        agentId: 'agent-1',
        approvalId: 'approval-1',
        userCode: 'ABCD-EFGH'
      })
    ).resolves.toStrictEqual({
      approval,
      capabilityCatalog
    })
    expect(capabilitiesRouteTestState.fetchAgentAccessApprovalPreview).toHaveBeenCalledWith({
      agentId: 'agent-1',
      approvalId: 'approval-1',
      userCode: 'ABCD-EFGH'
    })
    expect(capabilitiesRouteTestState.fetchAgentAccessView).not.toHaveBeenCalled()
  })

  it('loads id-scoped approvals from the authenticated Agent Access view', async () => {
    expect.hasAssertions()
    const requestedApproval = {
      agentId: 'agent-2',
      capabilityRequests: [],
      id: 'approval-2',
      status: 'pending'
    }
    const capabilityCatalog = {
      capabilities: ['email.message.send'],
      capabilityOptions: [
        {
          description: 'Send messages.',
          label: 'Send messages',
          value: 'email.message.send'
        }
      ]
    }
    capabilitiesRouteTestState.fetchAgentAccessView.mockResolvedValue({
      approvals: [
        {
          agentId: 'agent-1',
          capabilityRequests: [],
          id: 'approval-1',
          status: 'pending'
        },
        requestedApproval
      ],
      capabilityCatalog
    })

    await expect(
      loadAgentCapabilityApproval({
        agentId: undefined,
        approvalId: 'approval-2',
        userCode: null
      })
    ).resolves.toStrictEqual({
      approval: requestedApproval,
      capabilityCatalog
    })
    expect(capabilitiesRouteTestState.fetchAgentAccessView).toHaveBeenCalledOnce()
    expect(capabilitiesRouteTestState.fetchAgentAccessApprovalPreview).not.toHaveBeenCalled()
  })

  it('retries approval with a WebAuthn assertion only when the backend requires it', async () => {
    expect.hasAssertions()
    capabilitiesRouteTestState.decideAgentAccessApproval
      .mockRejectedValueOnce(
        new capabilitiesRouteTestState.AgentAccessRPCError('Passkey required', 403, 'webauthn_required', {
          challenge: 'challenge-1'
        })
      )
      .mockResolvedValueOnce({ status: 'approved', success: true })
    capabilitiesRouteTestState.createWebAuthnAssertionResponse.mockResolvedValue({
      id: 'credential-1'
    })

    await expect(
      decideAgentAccessApprovalWithWebAuthn({
        action: 'approve',
        approvalId: 'approval-1'
      })
    ).resolves.toStrictEqual({ status: 'approved', success: true })
    expect(capabilitiesRouteTestState.createWebAuthnAssertionResponse).toHaveBeenCalledWith({
      challenge: 'challenge-1'
    })
    expect(capabilitiesRouteTestState.decideAgentAccessApproval).toHaveBeenNthCalledWith(1, {
      action: 'approve',
      approvalId: 'approval-1'
    })
    expect(capabilitiesRouteTestState.decideAgentAccessApproval).toHaveBeenNthCalledWith(2, {
      action: 'approve',
      approvalId: 'approval-1',
      webauthnResponse: { id: 'credential-1' }
    })
  })
})

describe('agent capability approval constraints', () => {
  it('summarizes public constraint fields instead of hiding them as custom constraints', () => {
    expect.hasAssertions()

    expect(
      formatApprovalConstraints({
        folder: 'Drafts',
        mailboxAddress: 'research@agentteam.example',
        maxDailyMessages: 25,
        organizationId: 'org-story'
      })
    ).toBe('research@agentteam.example · org-story · folder: Drafts · maxDailyMessages: 25')
    expect(
      formatApprovalConstraints({
        allowedRecipientDomains: ['example.net', 'agentteam.example'],
        maxDailyMessages: 25
      })
    ).toBe('allowedRecipientDomains: example.net, agentteam.example · maxDailyMessages: 25')
  })
})
