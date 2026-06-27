import { beforeEach, describe, expect, it, vi } from 'vitest'

import { agentMailCapabilityCatalog } from '@main/db'
import type {
  AgentAccessApprovalPreview,
  AgentAccessError,
  AgentAccessPaperclipConnectResult,
  AgentAccessView,
  connectPaperclipAgentAccessForWeb,
  decideAgentAccessApprovalForWeb,
  getAgentAccessApprovalForWeb,
  getAgentAccessViewForWeb,
  isAgentAccessError,
  revokeAgentAccessAgentForWeb,
  revokeAgentAccessCapabilitiesForWeb
} from '../agent-access/service'
import type {
  AgentMailTrialError,
  decideAgentMailTrialClaimForWeb,
  getAgentMailTrialClaimForWeb,
  isAgentMailTrialError,
  startAgentMailTrial
} from '../agent-access/trial-service'

type AgentAccessMutationMock = (input: { headers: Headers; input: unknown }) => Promise<unknown>
type AgentAccessPaperclipConnectMock = (input: {
  headers: Headers
  input: unknown
}) => Promise<AgentAccessPaperclipConnectResult>
type GetAgentAccessApprovalForWebMock = (input: {
  headers: Headers
  input: unknown
}) => Promise<AgentAccessApprovalPreview>
type GetAgentAccessViewForWebMock = (input: { headers: Headers }) => Promise<AgentAccessView>
type IsAgentAccessErrorMock = (error: unknown) => error is AgentAccessError
type IsAgentMailTrialErrorMock = (error: unknown) => error is AgentMailTrialError
type StartAgentMailTrialMock = (input: unknown) => Promise<unknown>
type GetAgentMailTrialClaimForWebMock = (input: { headers: Headers; token: string }) => Promise<unknown>
type DecideAgentMailTrialClaimForWebMock = (input: {
  headers: Headers
  input: unknown
  token: string
}) => Promise<unknown>

const agentAccessRpcTestState = vi.hoisted(() => ({
  connectPaperclipAgentAccessForWeb: vi.fn<AgentAccessPaperclipConnectMock>(),
  decideAgentMailTrialClaimForWeb: vi.fn<DecideAgentMailTrialClaimForWebMock>(),
  decideAgentAccessApprovalForWeb: vi.fn<AgentAccessMutationMock>(),
  getAgentMailTrialClaimForWeb: vi.fn<GetAgentMailTrialClaimForWebMock>(),
  getAgentAccessApprovalForWeb: vi.fn<GetAgentAccessApprovalForWebMock>(),
  getAgentAccessViewForWeb: vi.fn<GetAgentAccessViewForWebMock>(),
  isAgentAccessError: vi.fn<IsAgentAccessErrorMock>(),
  isAgentMailTrialError: vi.fn<IsAgentMailTrialErrorMock>(),
  revokeAgentAccessAgentForWeb: vi.fn<AgentAccessMutationMock>(),
  revokeAgentAccessCapabilitiesForWeb: vi.fn<AgentAccessMutationMock>(),
  startAgentMailTrial: vi.fn<StartAgentMailTrialMock>()
}))

const noAgentAccessAllowedActions = {
  connectPaperclip: false,
  denyApproval: false,
  reviewApproval: false,
  revokeAgent: false,
  revokeCapabilityGrant: false
} satisfies AgentAccessView['allowedActions']

const emptyAgentAccessView = {
  agents: [],
  allowedActions: noAgentAccessAllowedActions,
  approvals: [],
  capabilityCatalog: agentMailCapabilityCatalog,
  grants: [],
  hosts: [],
  organizationId: 'org-1',
  paperclipConnections: [],
  state: 'empty'
} satisfies AgentAccessView

vi.mock(import('../agent-access/service'), () => ({
  connectPaperclipAgentAccessForWeb:
    agentAccessRpcTestState.connectPaperclipAgentAccessForWeb as unknown as typeof connectPaperclipAgentAccessForWeb,
  decideAgentAccessApprovalForWeb:
    agentAccessRpcTestState.decideAgentAccessApprovalForWeb as unknown as typeof decideAgentAccessApprovalForWeb,
  getAgentAccessApprovalForWeb:
    agentAccessRpcTestState.getAgentAccessApprovalForWeb as unknown as typeof getAgentAccessApprovalForWeb,
  getAgentAccessViewForWeb:
    agentAccessRpcTestState.getAgentAccessViewForWeb as unknown as typeof getAgentAccessViewForWeb,
  isAgentAccessError: agentAccessRpcTestState.isAgentAccessError as unknown as typeof isAgentAccessError,
  revokeAgentAccessAgentForWeb:
    agentAccessRpcTestState.revokeAgentAccessAgentForWeb as unknown as typeof revokeAgentAccessAgentForWeb,
  revokeAgentAccessCapabilitiesForWeb:
    agentAccessRpcTestState.revokeAgentAccessCapabilitiesForWeb as unknown as typeof revokeAgentAccessCapabilitiesForWeb
}))

vi.mock(import('../agent-access/trial-service'), () => ({
  AgentMailTrialError: class AgentMailTrialError extends Error {
    constructor(
      message: string,
      public readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 429 | 502 | 503
    ) {
      super(message)
      this.name = 'AgentMailTrialError'
    }
  },
  decideAgentMailTrialClaimForWeb:
    agentAccessRpcTestState.decideAgentMailTrialClaimForWeb as unknown as typeof decideAgentMailTrialClaimForWeb,
  getAgentMailTrialClaimForWeb:
    agentAccessRpcTestState.getAgentMailTrialClaimForWeb as unknown as typeof getAgentMailTrialClaimForWeb,
  isAgentMailTrialError:
    agentAccessRpcTestState.isAgentMailTrialError as unknown as typeof isAgentMailTrialError,
  startAgentMailTrial: agentAccessRpcTestState.startAgentMailTrial as unknown as typeof startAgentMailTrial
}))

describe('agent Access RPC routes', () => {
  beforeEach(() => {
    vi.resetModules()
    agentAccessRpcTestState.connectPaperclipAgentAccessForWeb.mockReset()
    agentAccessRpcTestState.decideAgentMailTrialClaimForWeb.mockReset()
    agentAccessRpcTestState.decideAgentAccessApprovalForWeb.mockReset()
    agentAccessRpcTestState.getAgentMailTrialClaimForWeb.mockReset()
    agentAccessRpcTestState.getAgentAccessApprovalForWeb.mockReset()
    agentAccessRpcTestState.getAgentAccessViewForWeb.mockReset()
    agentAccessRpcTestState.isAgentAccessError.mockReset()
    agentAccessRpcTestState.isAgentMailTrialError.mockReset()
    agentAccessRpcTestState.revokeAgentAccessAgentForWeb.mockReset()
    agentAccessRpcTestState.revokeAgentAccessCapabilitiesForWeb.mockReset()
    agentAccessRpcTestState.startAgentMailTrial.mockReset()
    agentAccessRpcTestState.isAgentAccessError.mockImplementation(
      (error: unknown): error is AgentAccessError =>
        error instanceof Error && error.name === 'AgentAccessError'
    )
    agentAccessRpcTestState.isAgentMailTrialError.mockImplementation(
      (error: unknown): error is AgentMailTrialError =>
        error instanceof Error && error.name === 'AgentMailTrialError'
    )
  })

  it('returns the signed-in user Agent Access view through the webserver boundary', async () => {
    expect.hasAssertions()

    agentAccessRpcTestState.getAgentAccessViewForWeb.mockResolvedValue({
      ...emptyAgentAccessView
    })

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(new Request('https://mail.example.com/agent-access/'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      ...emptyAgentAccessView
    })
    expect(agentAccessRpcTestState.getAgentAccessViewForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers)
    })
  })

  it('returns a Bearer challenge when Agent Access requires authentication', async () => {
    expect.hasAssertions()

    const error = new Error('Authentication required') as Error & { status: 401 }
    error.name = 'AgentAccessError'
    error.status = 401
    agentAccessRpcTestState.getAgentAccessViewForWeb.mockRejectedValue(error)

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(new Request('https://mail.example.com/agent-access/'))

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-agent-access"')
    await expect(response.json()).resolves.toStrictEqual({ error: 'Authentication required' })
  })

  it('routes user-code approval previews through the webserver Agent Access boundary', async () => {
    expect.hasAssertions()

    agentAccessRpcTestState.getAgentAccessApprovalForWeb.mockResolvedValue({
      approval: {
        agentId: 'agent-public-1',
        bindingMessage: 'Approve send access',
        canDeny: true,
        canReview: true,
        capabilities: ['email.message.send'],
        capabilityRequests: [
          {
            approvalStrength: 'webauthn',
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId: 'org-1'
            },
            reason: 'Needs approval'
          }
        ],
        createdAt: '2026-06-22T10:13:00.000Z',
        expiresAt: '2999-06-22T10:18:00.000Z',
        hostId: 'host-public-1',
        id: 'approval-public-1',
        method: 'device_authorization',
        status: 'pending'
      },
      capabilityCatalog: agentMailCapabilityCatalog,
      organizationId: 'org-1'
    })

    const body = {
      agentId: 'agent-public-1',
      userCode: 'WXYZ9876'
    }
    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/approvals/lookup', {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      approval: {
        agentId: 'agent-public-1',
        capabilityRequests: [
          {
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId: 'org-1'
            }
          }
        ],
        status: 'pending'
      },
      organizationId: 'org-1'
    })
    expect(agentAccessRpcTestState.getAgentAccessApprovalForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: body
    })
  })

  it('returns a Bearer challenge when an approval preview requires authentication', async () => {
    expect.hasAssertions()

    const error = new Error('Authentication required') as Error & { status: 401 }
    error.name = 'AgentAccessError'
    error.status = 401
    agentAccessRpcTestState.getAgentAccessApprovalForWeb.mockRejectedValue(error)

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/approvals/lookup', {
        body: JSON.stringify({ userCode: 'WXYZ9876' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-agent-access"')
    await expect(response.json()).resolves.toStrictEqual({ error: 'Authentication required' })
  })

  it('routes approval decisions through the webserver Agent Access boundary', async () => {
    expect.hasAssertions()

    agentAccessRpcTestState.decideAgentAccessApprovalForWeb.mockResolvedValue({
      status: 'approved',
      success: true,
      view: emptyAgentAccessView
    })

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/approvals/decision', {
        body: JSON.stringify({
          action: 'approve',
          approvalId: 'approval_public_1',
          userCode: 'WXYZ9876'
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: 'approved',
      success: true
    })
    expect(agentAccessRpcTestState.decideAgentAccessApprovalForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        action: 'approve',
        approvalId: 'approval_public_1',
        userCode: 'WXYZ9876'
      }
    })
  })

  it('returns a Bearer challenge when an approval mutation requires authentication', async () => {
    expect.hasAssertions()

    const error = new Error('Authentication required') as Error & { status: 401 }
    error.name = 'AgentAccessError'
    error.status = 401
    agentAccessRpcTestState.decideAgentAccessApprovalForWeb.mockRejectedValue(error)

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/approvals/decision', {
        body: JSON.stringify({ action: 'approve', approvalId: 'approval_public_1' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-agent-access"')
    await expect(response.json()).resolves.toStrictEqual({ error: 'Authentication required' })
  })

  it('returns authorization failures from approval mutations without a Bearer challenge', async () => {
    expect.hasAssertions()

    const error = new Error('Agent access management is not authorized') as Error & { status: 403 }
    error.name = 'AgentAccessError'
    error.status = 403
    agentAccessRpcTestState.decideAgentAccessApprovalForWeb.mockRejectedValue(error)

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/approvals/decision', {
        body: JSON.stringify({ action: 'approve', approvalId: 'approval_public_1' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toStrictEqual({
      error: 'Agent access management is not authorized'
    })
  })

  it('returns public WebAuthn challenge details from approval mutations', async () => {
    expect.hasAssertions()

    const error = new Error('This approval requires passkey verification') as Error & {
      details: {
        code: 'webauthn_required'
        webauthnOptions: Record<string, unknown>
      }
      status: 403
    }
    error.name = 'AgentAccessError'
    error.status = 403
    error.details = {
      code: 'webauthn_required',
      webauthnOptions: {
        challenge: 'challenge-1',
        rpId: 'mail.example.com',
        userVerification: 'required'
      }
    }
    agentAccessRpcTestState.decideAgentAccessApprovalForWeb.mockRejectedValue(error)

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/approvals/decision', {
        body: JSON.stringify({ action: 'approve', approvalId: 'approval_public_1' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toStrictEqual({
      code: 'webauthn_required',
      error: 'This approval requires passkey verification',
      webauthnOptions: {
        challenge: 'challenge-1',
        rpId: 'mail.example.com',
        userVerification: 'required'
      }
    })
  })

  it('routes agent revoke requests through the webserver Agent Access boundary', async () => {
    expect.hasAssertions()

    agentAccessRpcTestState.revokeAgentAccessAgentForWeb.mockResolvedValue({
      status: 'revoked',
      success: true,
      view: emptyAgentAccessView
    })

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/agents/agent_public_1/revoke', { method: 'POST' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: 'revoked',
      success: true
    })
    expect(agentAccessRpcTestState.revokeAgentAccessAgentForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: { agentId: 'agent_public_1' }
    })
  })

  it('routes capability revoke requests through the webserver Agent Access boundary', async () => {
    expect.hasAssertions()

    agentAccessRpcTestState.revokeAgentAccessCapabilitiesForWeb.mockResolvedValue({
      status: 'revoked',
      success: true,
      view: emptyAgentAccessView
    })

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/agents/agent_public_1/capabilities/revoke', {
        body: JSON.stringify({ capabilities: ['email.message.read'], grantId: 'grant_public_1' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: 'revoked',
      success: true
    })
    expect(agentAccessRpcTestState.revokeAgentAccessCapabilitiesForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        agentId: 'agent_public_1',
        capabilities: ['email.message.read'],
        grantId: 'grant_public_1'
      }
    })
  })

  it('returns authorization failures from capability revoke mutations', async () => {
    expect.hasAssertions()

    const error = new Error('Agent access includes grants outside the active organization') as Error & {
      status: 403
    }
    error.name = 'AgentAccessError'
    error.status = 403
    agentAccessRpcTestState.revokeAgentAccessCapabilitiesForWeb.mockRejectedValue(error)

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/agents/agent_public_1/capabilities/revoke', {
        body: JSON.stringify({ capabilities: ['email.message.read'] }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toStrictEqual({
      error: 'Agent access includes grants outside the active organization'
    })
  })

  it('connects a Paperclip OAuth principal through the webserver Agent Access boundary', async () => {
    expect.hasAssertions()

    agentAccessRpcTestState.connectPaperclipAgentAccessForWeb.mockResolvedValue({
      connection: {
        clientId: 'paperclip-client-1',
        companyId: 'paperclip-company-1',
        name: 'Paperclip Email (paperclip-company-1)',
        pluginId: 'agentteam.paperclip-email-plugin',
        scope: 'organization',
        status: 'active'
      },
      status: 'created',
      success: true,
      view: emptyAgentAccessView
    })

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/paperclip/connect', {
        body: JSON.stringify({
          companyId: 'paperclip-company-1',
          pluginId: 'agentteam.paperclip-email-plugin'
        }),
        headers: {
          'content-type': 'application/json',
          cookie: 'session=abc'
        },
        method: 'POST'
      })
    )

    await expect(response.json()).resolves.toStrictEqual({
      connection: {
        clientId: 'paperclip-client-1',
        companyId: 'paperclip-company-1',
        name: 'Paperclip Email (paperclip-company-1)',
        pluginId: 'agentteam.paperclip-email-plugin',
        scope: 'organization',
        status: 'active'
      },
      status: 'created',
      success: true,
      view: emptyAgentAccessView
    })
    expect(response.status).toBe(200)
    expect(agentAccessRpcTestState.connectPaperclipAgentAccessForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        companyId: 'paperclip-company-1',
        pluginId: 'agentteam.paperclip-email-plugin'
      }
    })
    expect(
      agentAccessRpcTestState.connectPaperclipAgentAccessForWeb.mock.calls[0][0].headers.get('cookie')
    ).toBe('session=abc')
  })

  it('rejects Paperclip connect requests with unknown plugin ids before the service boundary', async () => {
    expect.hasAssertions()

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/paperclip/connect', {
        body: JSON.stringify({
          companyId: 'paperclip-company-1',
          pluginId: 'other-plugin'
        }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(422)
    expect(agentAccessRpcTestState.connectPaperclipAgentAccessForWeb).not.toHaveBeenCalled()
  })

  it('rejects Paperclip connect requests with unknown fields before the service boundary', async () => {
    expect.hasAssertions()

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/paperclip/connect', {
        body: JSON.stringify({
          companyId: 'paperclip-company-1',
          pluginId: 'agentteam.paperclip-email-plugin',
          rawClientSecret: 'must-not-cross-rpc-boundary'
        }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(422)
    expect(agentAccessRpcTestState.connectPaperclipAgentAccessForWeb).not.toHaveBeenCalled()
  })

  it('routes autonomous trial requests through the webserver Agent Access boundary', async () => {
    expect.hasAssertions()

    agentAccessRpcTestState.startAgentMailTrial.mockResolvedValue({
      agent_capability_grants: [
        {
          capability: 'email.status',
          constraints: { organizationId: 'org-1' },
          expiresAt: '2026-06-29T00:00:00.000Z',
          status: 'active'
        }
      ],
      agent_id: 'agent-1',
      capabilities: ['email.status'],
      claim: {
        expires_at: '2026-06-23T00:00:00.000Z',
        url: 'https://mail.example.com/agent/claim/claim-token'
      },
      expires_at: '2026-06-29T00:00:00.000Z',
      host_id: 'host-1',
      mailbox: {
        address: 'trial-1@example.test'
      },
      mode: 'autonomous',
      name: 'Trial agent',
      post_claim_capabilities: [],
      status: 'active',
      trial_id: 'trial-public-1'
    })

    const body = {
      agent_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'agent-key' },
      host_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'host-key' },
      name: 'Trial agent'
    }
    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/trials', {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      agent_id: 'agent-1',
      mailbox: {
        address: 'trial-1@example.test'
      },
      mode: 'autonomous'
    })
    expect(agentAccessRpcTestState.startAgentMailTrial).toHaveBeenCalledWith(body)
  })

  it('rate limits autonomous trial starts before the trial service in production', async () => {
    expect.hasAssertions()
    vi.stubEnv('NODE_ENV', 'production')

    agentAccessRpcTestState.startAgentMailTrial.mockResolvedValue({
      agent_capability_grants: [
        {
          capability: 'email.status',
          constraints: { organizationId: 'org-1' },
          expiresAt: '2026-06-29T00:00:00.000Z',
          status: 'active'
        }
      ],
      agent_id: 'agent-1',
      capabilities: ['email.status'],
      claim: {
        expires_at: '2026-06-23T00:00:00.000Z',
        url: 'https://mail.example.com/agent/claim/claim-token'
      },
      expires_at: '2026-06-29T00:00:00.000Z',
      host_id: 'host-1',
      mailbox: {
        address: 'trial-1@example.test'
      },
      mode: 'autonomous',
      name: 'Trial agent',
      post_claim_capabilities: [],
      status: 'active',
      trial_id: 'trial-public-1'
    })

    const body = {
      agent_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'agent-key' },
      host_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'host-key' },
      name: 'Trial agent'
    }
    const { default: agentAccess } = await import('./agent-access')
    const responses: Response[] = []
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await agentAccess.handle(
          new Request('https://mail.example.com/agent-access/trials', {
            body: JSON.stringify(body),
            headers: {
              'content-type': 'application/json',
              'x-forwarded-for': '203.0.113.10'
            },
            method: 'POST'
          })
        )
      )
    }

    expect(responses.slice(0, 5).map((response) => response.status)).toStrictEqual([200, 200, 200, 200, 200])
    const rateLimitedResponse = responses[5]
    if (!rateLimitedResponse) {
      throw new Error('Expected trial start to return a rate-limited response.')
    }
    expect(rateLimitedResponse.status).toBe(429)
    await expect(rateLimitedResponse.json()).resolves.toStrictEqual({
      error: 'Too many requests. Please try again later.'
    })
    expect(agentAccessRpcTestState.startAgentMailTrial).toHaveBeenCalledTimes(5)
  })

  it('rate limits autonomous trial starts with malformed forwarded IP headers by a stable fallback key', async () => {
    expect.hasAssertions()
    vi.stubEnv('NODE_ENV', 'production')

    agentAccessRpcTestState.startAgentMailTrial.mockResolvedValue({
      agent_capability_grants: [],
      agent_id: 'agent-1',
      capabilities: ['email.status'],
      claim: {
        expires_at: '2026-06-23T00:00:00.000Z',
        url: 'https://mail.example.com/agent/claim/claim-token'
      },
      expires_at: '2026-06-29T00:00:00.000Z',
      host_id: 'host-1',
      mailbox: {
        address: 'trial-1@example.test'
      },
      mode: 'autonomous',
      name: 'Trial agent',
      post_claim_capabilities: [],
      status: 'active',
      trial_id: 'trial-public-1'
    })

    const body = {
      agent_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'agent-key' },
      host_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'host-key' },
      name: 'Trial agent'
    }
    const { default: agentAccess } = await import('./agent-access')
    const responses: Response[] = []
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await agentAccess.handle(
          new Request('https://mail.example.com/agent-access/trials', {
            body: JSON.stringify(body),
            headers: {
              'content-type': 'application/json',
              host: 'mail.example.com',
              'x-forwarded-for': `not-an-ip-${index}`
            },
            method: 'POST'
          })
        )
      )
    }

    expect(responses.slice(0, 5).map((response) => response.status)).toStrictEqual([200, 200, 200, 200, 200])
    expect(responses[5]?.status).toBe(429)
    expect(agentAccessRpcTestState.startAgentMailTrial).toHaveBeenCalledTimes(5)
  })

  it('routes autonomous trial claim previews through the signed-in webserver boundary', async () => {
    expect.hasAssertions()

    agentAccessRpcTestState.getAgentMailTrialClaimForWeb.mockResolvedValue({
      agent: {
        id: 'agent-public-1',
        name: 'Trial agent',
        status: 'active'
      },
      capabilities: ['email.status', 'email.message.read'],
      claim: {
        expires_at: '2026-06-23T00:00:00.000Z',
        status: 'pending'
      },
      mailbox: {
        address: 'trial-1@example.test'
      },
      organization_id: 'org-1',
      post_claim_capabilities: ['email.status'],
      target_organizations: [{ id: 'org-1', name: 'Example Org', slug: 'example' }],
      trial_id: 'trial-public-1'
    })

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/trials/claim/claim-token')
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      agent: { id: 'agent-public-1' },
      claim: { status: 'pending' },
      mailbox: { address: 'trial-1@example.test' }
    })
    expect(agentAccessRpcTestState.getAgentMailTrialClaimForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      token: 'claim-token'
    })
  })

  it('returns a Bearer challenge when trial claim preview requires authentication', async () => {
    expect.hasAssertions()

    const error = new Error('Authentication required') as Error & { status: 401 }
    error.name = 'AgentMailTrialError'
    error.status = 401
    agentAccessRpcTestState.getAgentMailTrialClaimForWeb.mockRejectedValue(error)

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/trials/claim/claim-token')
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-agent-access"')
    await expect(response.json()).resolves.toStrictEqual({ error: 'Authentication required' })
  })

  it('routes autonomous trial claim decisions through the signed-in webserver boundary', async () => {
    expect.hasAssertions()

    agentAccessRpcTestState.decideAgentMailTrialClaimForWeb.mockResolvedValue({
      action: 'approve',
      claim: { status: 'approved' },
      success: true,
      view: {
        agent: {
          id: 'agent-public-1',
          name: 'Trial agent',
          status: 'active'
        },
        capabilities: ['email.status', 'email.message.read'],
        claim: {
          expires_at: '2026-06-23T00:00:00.000Z',
          status: 'approved'
        },
        mailbox: {
          address: 'trial-1@example.test'
        },
        organization_id: 'org-1',
        post_claim_capabilities: ['email.status'],
        target_organizations: [{ id: 'org-1', name: 'Example Org', slug: 'example' }],
        trial_id: 'trial-public-1'
      }
    })

    const body = {
      action: 'approve',
      target_organization_id: 'org-1'
    }
    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/trials/claim/claim-token/decision', {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      action: 'approve',
      claim: { status: 'approved' },
      success: true
    })
    expect(agentAccessRpcTestState.decideAgentMailTrialClaimForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: body,
      token: 'claim-token'
    })
  })

  it('returns trial claim authorization failures without a Bearer challenge', async () => {
    expect.hasAssertions()

    const error = new Error('Trial agent claim is not authorized') as Error & { status: 403 }
    error.name = 'AgentMailTrialError'
    error.status = 403
    agentAccessRpcTestState.decideAgentMailTrialClaimForWeb.mockRejectedValue(error)

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/trials/claim/claim-token/decision', {
        body: JSON.stringify({ action: 'approve' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toStrictEqual({
      error: 'Trial agent claim is not authorized'
    })
  })

  it('returns trial service failures without a Bearer challenge', async () => {
    expect.hasAssertions()

    const error = new Error('Agent Mail trials are not enabled') as Error & { status: 503 }
    error.name = 'AgentMailTrialError'
    error.status = 503
    agentAccessRpcTestState.startAgentMailTrial.mockRejectedValue(error)

    const { default: agentAccess } = await import('./agent-access')
    const response = await agentAccess.handle(
      new Request('https://mail.example.com/agent-access/trials', {
        body: JSON.stringify({
          agent_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'agent-key' },
          host_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'host-key' }
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toStrictEqual({
      error: 'Agent Mail trials are not enabled'
    })
  })
})
