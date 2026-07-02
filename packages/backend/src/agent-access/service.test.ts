import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { agentMailCapabilityCatalog, publicIdFromUUIDv7 } from '@main/db'
import type { globals as globalsFunction } from '../globals'

type ExecResult<T> = { exec: () => Promise<T>; session?: (session: object) => ExecResult<T> }
type FindMock<T> = (query?: unknown) => ExecResult<T>
type UpdateOneMock = (query?: unknown, update?: unknown) => ExecResult<unknown>
type UpdateManyMock = (query?: unknown, update?: unknown) => ExecResult<unknown>
type GetSessionMock = (input: { headers: Headers }) => Promise<unknown>
type TestGlobals = {
  auth: {
    api: {
      approveCapability: (input: unknown) => Promise<unknown>
      adminCreateOAuthClient: (input: unknown) => Promise<unknown>
      getSession: GetSessionMock
      revokeAgent: (input: unknown) => Promise<unknown>
      revokeCapability: (input: unknown) => Promise<unknown>
    }
  }
  db: {
    connection: {
      transaction: (operation: (session: object) => unknown) => unknown
    }
    models: {
      agent: { find: FindMock<unknown[]>; findById: FindMock<unknown>; updateOne: UpdateOneMock }
      agentCapabilityGrant: { find: FindMock<unknown[]>; updateOne: UpdateOneMock }
      agentHost: { find: FindMock<unknown[]>; findById: FindMock<unknown>; updateOne: UpdateOneMock }
      agentMailMailboxGrant: { find: FindMock<unknown[]>; updateMany: UpdateManyMock }
      agentMailSystemGrant: { find: FindMock<unknown[]>; updateMany: UpdateManyMock }
      approvalRequest: { find: FindMock<unknown[]>; findById: FindMock<unknown> }
      auditLog: { create: (input: unknown) => Promise<unknown> }
      member: { findOne: FindMock<unknown> }
      oauthClient: { find: FindMock<unknown[]>; findOne: FindMock<unknown> }
    }
  }
}
type GlobalsMock = () => Promise<TestGlobals>

const agentAccessTestState = vi.hoisted(() => ({
  agentCapabilityGrantFind: vi.fn<FindMock<unknown[]>>(),
  agentCapabilityGrantUpdateOne: vi.fn<UpdateOneMock>(),
  agentFind: vi.fn<FindMock<unknown[]>>(),
  agentFindById: vi.fn<FindMock<unknown>>(),
  agentUpdateOne: vi.fn<UpdateOneMock>(),
  agentHostFind: vi.fn<FindMock<unknown[]>>(),
  agentHostFindById: vi.fn<FindMock<unknown>>(),
  agentHostUpdateOne: vi.fn<UpdateOneMock>(),
  agentMailMailboxGrantFind: vi.fn<FindMock<unknown[]>>(),
  agentMailMailboxGrantUpdateMany: vi.fn<UpdateManyMock>(),
  agentMailSystemGrantFind: vi.fn<FindMock<unknown[]>>(),
  agentMailSystemGrantUpdateMany: vi.fn<UpdateManyMock>(),
  adminCreateOAuthClient: vi.fn<(input: unknown) => Promise<unknown>>(),
  approvalRequestFindById: vi.fn<FindMock<unknown>>(),
  approvalRequestFind: vi.fn<FindMock<unknown[]>>(),
  auditLogCreate: vi.fn<(input: unknown) => Promise<unknown>>(),
  approveCapability: vi.fn<(input: unknown) => Promise<unknown>>(),
  getSession: vi.fn<GetSessionMock>(),
  globals: vi.fn<GlobalsMock>(),
  memberFindOne: vi.fn<FindMock<unknown>>(),
  oauthClientFind: vi.fn<FindMock<unknown[]>>(),
  oauthClientFindOne: vi.fn<FindMock<unknown>>(),
  revokeAgent: vi.fn<(input: unknown) => Promise<unknown>>(),
  revokeCapability: vi.fn<(input: unknown) => Promise<unknown>>(),
  transaction: vi.fn<(operation: (session: object) => unknown) => unknown>()
}))

vi.mock(import('../globals'), () => ({
  globals: agentAccessTestState.globals as unknown as typeof globalsFunction
}))

describe('agent Access service', () => {
  beforeEach(() => {
    vi.resetModules()
    agentAccessTestState.agentCapabilityGrantFind.mockReset()
    agentAccessTestState.agentCapabilityGrantUpdateOne.mockReset()
    agentAccessTestState.agentFind.mockReset()
    agentAccessTestState.agentFindById.mockReset()
    agentAccessTestState.agentUpdateOne.mockReset()
    agentAccessTestState.agentHostFind.mockReset()
    agentAccessTestState.agentHostFindById.mockReset()
    agentAccessTestState.agentHostUpdateOne.mockReset()
    agentAccessTestState.agentMailMailboxGrantFind.mockReset()
    agentAccessTestState.agentMailMailboxGrantUpdateMany.mockReset()
    agentAccessTestState.agentMailSystemGrantFind.mockReset()
    agentAccessTestState.agentMailSystemGrantUpdateMany.mockReset()
    agentAccessTestState.adminCreateOAuthClient.mockReset()
    agentAccessTestState.approvalRequestFindById.mockReset()
    agentAccessTestState.approvalRequestFind.mockReset()
    agentAccessTestState.auditLogCreate.mockReset()
    agentAccessTestState.approveCapability.mockReset()
    agentAccessTestState.getSession.mockReset()
    agentAccessTestState.globals.mockReset()
    agentAccessTestState.memberFindOne.mockReset()
    agentAccessTestState.oauthClientFind.mockReset()
    agentAccessTestState.oauthClientFindOne.mockReset()
    agentAccessTestState.revokeAgent.mockReset()
    agentAccessTestState.revokeCapability.mockReset()
    agentAccessTestState.transaction.mockReset()

    agentAccessTestState.getSession.mockResolvedValue({
      session: {
        activeOrganizationId: '01960000-0000-7000-8000-0000000000aa',
        id: 'session-1'
      },
      user: {
        id: '01960000-0000-7000-8000-0000000000bb'
      }
    })
    agentAccessTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ role: 'admin' })
    })
    agentAccessTestState.agentCapabilityGrantUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    agentAccessTestState.agentUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    agentAccessTestState.agentHostUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    agentAccessTestState.globals.mockResolvedValue({
      auth: {
        api: {
          adminCreateOAuthClient: agentAccessTestState.adminCreateOAuthClient,
          approveCapability: agentAccessTestState.approveCapability,
          getSession: agentAccessTestState.getSession,
          revokeAgent: agentAccessTestState.revokeAgent,
          revokeCapability: agentAccessTestState.revokeCapability
        }
      },
      db: {
        connection: {
          transaction: agentAccessTestState.transaction
        },
        models: {
          agent: {
            find: agentAccessTestState.agentFind,
            findById: agentAccessTestState.agentFindById,
            updateOne: agentAccessTestState.agentUpdateOne
          },
          agentCapabilityGrant: {
            find: agentAccessTestState.agentCapabilityGrantFind,
            updateOne: agentAccessTestState.agentCapabilityGrantUpdateOne
          },
          agentHost: {
            find: agentAccessTestState.agentHostFind,
            findById: agentAccessTestState.agentHostFindById,
            updateOne: agentAccessTestState.agentHostUpdateOne
          },
          agentMailMailboxGrant: {
            find: agentAccessTestState.agentMailMailboxGrantFind,
            updateMany: agentAccessTestState.agentMailMailboxGrantUpdateMany
          },
          agentMailSystemGrant: {
            find: agentAccessTestState.agentMailSystemGrantFind,
            updateMany: agentAccessTestState.agentMailSystemGrantUpdateMany
          },
          approvalRequest: {
            find: agentAccessTestState.approvalRequestFind,
            findById: agentAccessTestState.approvalRequestFindById
          },
          auditLog: {
            create: agentAccessTestState.auditLogCreate
          },
          member: {
            findOne: agentAccessTestState.memberFindOne
          },
          oauthClient: {
            find: agentAccessTestState.oauthClientFind,
            findOne: agentAccessTestState.oauthClientFindOne
          }
        }
      }
    })
    agentAccessTestState.agentHostFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(null) })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(null) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    agentAccessTestState.agentCapabilityGrantUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    agentAccessTestState.agentMailMailboxGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    agentAccessTestState.agentMailMailboxGrantUpdateMany.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
    })
    agentAccessTestState.agentMailSystemGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    agentAccessTestState.agentMailSystemGrantUpdateMany.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
    })
    agentAccessTestState.approvalRequestFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    agentAccessTestState.approvalRequestFindById.mockReturnValue({ exec: () => Promise.resolve(null) })
    agentAccessTestState.adminCreateOAuthClient.mockResolvedValue({
      client_id: 'paperclip-client-1',
      client_secret: '_secret_oauth_client_raw-secret'
    })
    agentAccessTestState.approveCapability.mockResolvedValue({ status: 'approved' })
    agentAccessTestState.auditLogCreate.mockResolvedValue({})
    agentAccessTestState.transaction.mockImplementation((operation: (session: object) => unknown) =>
      operation({ id: 'transaction-session' })
    )
    agentAccessTestState.oauthClientFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    agentAccessTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'paperclip-client-1',
          disabled: false,
          name: 'Paperclip Email (paperclip-company-1)',
          referenceId: '01960000-0000-7000-8000-0000000000aa'
        })
    })
    agentAccessTestState.revokeAgent.mockResolvedValue({ status: 'revoked' })
    agentAccessTestState.revokeCapability.mockResolvedValue({ status: 'revoked' })
  })

  it('requires a signed-in user session', async () => {
    expect.hasAssertions()

    agentAccessTestState.getSession.mockResolvedValue(null)

    const { getAgentAccessViewForWeb } = await import('./service')

    await expect(getAgentAccessViewForWeb({ headers: new Headers() })).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(agentAccessTestState.agentHostFind).not.toHaveBeenCalled()
  })

  it('builds an active-organization scoped Agent Access view without secret-bearing fields', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const otherOrganizationId = '01960000-0000-7000-8000-0000000000cc'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const otherAgentId = '01960000-0000-7000-8000-000000000003'
    const grantId = '01960000-0000-7000-8000-000000000004'
    const pendingGrantId = '01960000-0000-7000-8000-000000000005'
    const otherGrantId = '01960000-0000-7000-8000-000000000006'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const expiredApprovalId = '01960000-0000-7000-8000-000000000008'
    const unsupportedGrantId = '01960000-0000-7000-8000-000000000009'

    agentAccessTestState.agentHostFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: hostId,
            activatedAt: new Date('2026-06-22T10:00:00.000Z'),
            createdAt: new Date('2026-06-22T09:00:00.000Z'),
            defaultCapabilities: '["email.status","email.unsupported"]',
            enrollmentTokenHash: 'secret-token-hash',
            expiresAt: null,
            jwksUrl: null,
            kid: 'host-kid',
            lastUsedAt: new Date('2026-06-22T11:00:00.000Z'),
            name: 'Workstation',
            publicKey: 'secret-public-key-json',
            status: 'active',
            userId
          }
        ])
    })
    agentAccessTestState.agentFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: agentId,
            activatedAt: new Date('2026-06-22T10:05:00.000Z'),
            createdAt: new Date('2026-06-22T09:05:00.000Z'),
            expiresAt: null,
            hostId,
            kid: 'agent-kid',
            lastUsedAt: new Date('2026-06-22T11:05:00.000Z'),
            mode: 'delegated',
            name: 'Research Agent',
            publicKey: 'secret-agent-public-key-json',
            status: 'active',
            userId
          },
          {
            _id: otherAgentId,
            createdAt: new Date('2026-06-22T09:10:00.000Z'),
            hostId,
            mode: 'delegated',
            name: 'Other Org Agent',
            publicKey: 'secret-other-agent-public-key-json',
            status: 'active',
            userId
          }
        ])
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: grantId,
            agentId,
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            createdAt: new Date('2026-06-22T10:10:00.000Z'),
            expiresAt: new Date('2026-06-23T10:10:00.000Z'),
            grantedBy: userId,
            reason: null,
            status: 'active'
          },
          {
            _id: pendingGrantId,
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            createdAt: new Date('2026-06-22T10:11:00.000Z'),
            expiresAt: null,
            reason: 'Needs approval',
            status: 'pending'
          },
          {
            _id: otherGrantId,
            agentId: otherAgentId,
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'other@example.test',
              organizationId: otherOrganizationId
            },
            createdAt: new Date('2026-06-22T10:12:00.000Z'),
            expiresAt: null,
            reason: null,
            status: 'active'
          },
          {
            _id: unsupportedGrantId,
            agentId,
            capability: 'email.unsupported',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            createdAt: new Date('2026-06-22T10:12:30.000Z'),
            expiresAt: null,
            reason: null,
            status: 'active'
          }
        ])
    })
    agentAccessTestState.approvalRequestFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: approvalId,
            agentId,
            bindingMessage: 'Approve send access',
            capabilities: 'email.message.send email.unsupported',
            clientNotificationToken: 'secret-notification-token',
            createdAt: new Date('2026-06-22T10:13:00.000Z'),
            expiresAt: new Date('2999-06-22T10:18:00.000Z'),
            hostId,
            method: 'device_authorization',
            status: 'pending',
            userCodeHash: 'secret-code-hash',
            userId
          },
          {
            _id: expiredApprovalId,
            agentId,
            bindingMessage: 'Expired request',
            capabilities: 'email.message.send',
            createdAt: new Date('2026-06-22T10:00:00.000Z'),
            expiresAt: new Date('2000-06-22T10:00:00.000Z'),
            hostId,
            method: 'device_authorization',
            status: 'pending',
            userId
          }
        ])
    })

    const { getAgentAccessViewForWeb } = await import('./service')
    const view = await getAgentAccessViewForWeb({ headers: new Headers() })

    expect(view).toStrictEqual({
      agents: [
        {
          activatedAt: '2026-06-22T10:05:00.000Z',
          activeCapabilityCount: 1,
          canRevoke: true,
          createdAt: '2026-06-22T09:05:00.000Z',
          expiresAt: null,
          hostId: publicIdFromUUIDv7(hostId),
          id: publicIdFromUUIDv7(agentId),
          lastUsedAt: '2026-06-22T11:05:00.000Z',
          mode: 'delegated',
          name: 'Research Agent',
          organizationId,
          pendingCapabilityCount: 1,
          status: 'active'
        }
      ],
      allowedActions: {
        denyApproval: true,
        reviewApproval: true,
        revokeAgent: true,
        revokeCapabilityGrant: true
      },
      approvals: [
        {
          agentId: publicIdFromUUIDv7(agentId),
          bindingMessage: 'Expired request',
          canDeny: false,
          canReview: false,
          capabilityRequests: [
            {
              approvalStrength: 'webauthn',
              capability: 'email.message.send',
              constraints: {
                mailboxAddress: 'research@example.test'
              },
              reason: 'Needs approval'
            }
          ],
          capabilities: ['email.message.send'],
          createdAt: '2026-06-22T10:00:00.000Z',
          expiresAt: '2000-06-22T10:00:00.000Z',
          hostId: publicIdFromUUIDv7(hostId),
          id: publicIdFromUUIDv7(expiredApprovalId),
          method: 'device_authorization',
          status: 'expired'
        },
        {
          agentId: publicIdFromUUIDv7(agentId),
          bindingMessage: 'Approve send access',
          canDeny: true,
          canReview: true,
          capabilityRequests: [
            {
              approvalStrength: 'webauthn',
              capability: 'email.message.send',
              constraints: {
                mailboxAddress: 'research@example.test'
              },
              reason: 'Needs approval'
            }
          ],
          capabilities: ['email.message.send'],
          createdAt: '2026-06-22T10:13:00.000Z',
          expiresAt: '2999-06-22T10:18:00.000Z',
          hostId: publicIdFromUUIDv7(hostId),
          id: publicIdFromUUIDv7(approvalId),
          method: 'device_authorization',
          status: 'pending'
        }
      ],
      capabilityCatalog: agentMailCapabilityCatalog,
      grants: [
        {
          agentId: publicIdFromUUIDv7(agentId),
          canRevoke: true,
          capability: 'email.message.read',
          constraints: {
            mailboxAddress: 'research@example.test'
          },
          createdAt: '2026-06-22T10:10:00.000Z',
          deniedBy: null,
          deniedByUser: false,
          expiresAt: '2026-06-23T10:10:00.000Z',
          grantedBy: {
            id: publicIdFromUUIDv7(userId),
            type: 'user'
          },
          grantedByUser: true,
          id: publicIdFromUUIDv7(grantId),
          organizationId: publicIdFromUUIDv7(organizationId),
          reason: null,
          status: 'active'
        },
        {
          agentId: publicIdFromUUIDv7(agentId),
          canRevoke: true,
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'research@example.test'
          },
          createdAt: '2026-06-22T10:11:00.000Z',
          deniedBy: null,
          deniedByUser: false,
          expiresAt: null,
          grantedBy: null,
          grantedByUser: false,
          id: publicIdFromUUIDv7(pendingGrantId),
          organizationId: publicIdFromUUIDv7(organizationId),
          reason: 'Needs approval',
          status: 'pending'
        }
      ],
      hosts: [
        {
          activatedAt: '2026-06-22T10:00:00.000Z',
          agentCount: 1,
          createdAt: '2026-06-22T09:00:00.000Z',
          defaultCapabilities: ['email.status'],
          expiresAt: null,
          id: publicIdFromUUIDv7(hostId),
          lastUsedAt: '2026-06-22T11:00:00.000Z',
          name: 'Workstation',
          organizationId,
          status: 'active'
        }
      ],
      organizationId,
      state: 'ready'
    })
    expect(JSON.stringify(view)).not.toContain('secret')
    expect(JSON.stringify(view)).not.toContain('email.unsupported')
  })

  it('shows organization-scoped agents owned by another user to CASL-authorized org admins', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const otherUserId = '01960000-0000-7000-8000-0000000000dd'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const grantId = '01960000-0000-7000-8000-000000000004'
    const agent = {
      _id: agentId,
      createdAt: new Date('2026-06-22T09:05:00.000Z'),
      hostId,
      mode: 'delegated',
      name: 'Team Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'active',
      userId: otherUserId
    }
    const host = {
      _id: hostId,
      createdAt: new Date('2026-06-22T09:00:00.000Z'),
      name: 'Teammate Workstation',
      publicKey: 'secret-host-public-key-json',
      status: 'active',
      userId: otherUserId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.read',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      createdAt: new Date('2026-06-22T10:10:00.000Z'),
      expiresAt: null,
      reason: null,
      status: 'active'
    }

    agentAccessTestState.agentHostFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () => Promise.resolve([grant])
    })

    const { getAgentAccessViewForWeb } = await import('./service')
    const view = await getAgentAccessViewForWeb({ headers: new Headers() })

    expect(view.agents).toStrictEqual([
      expect.objectContaining({
        id: publicIdFromUUIDv7(agentId),
        name: 'Team Agent',
        organizationId
      })
    ])
    expect(view.hosts).toStrictEqual([
      expect.objectContaining({
        id: publicIdFromUUIDv7(hostId),
        name: 'Teammate Workstation',
        organizationId
      })
    ])
    expect(view.grants).toStrictEqual([
      expect.objectContaining({
        agentId: publicIdFromUUIDv7(agentId),
        capability: 'email.message.read',
        id: publicIdFromUUIDv7(grantId),
        organizationId: publicIdFromUUIDv7(organizationId)
      })
    ])
    expect(JSON.stringify(view)).not.toContain('secret')
    expect(agentAccessTestState.agentFindById).toHaveBeenCalledWith(agentId)
    expect(agentAccessTestState.agentHostFindById).toHaveBeenCalledWith(hostId)
  })

  it('marks only grant-level CASL-authorized capability grants as revocable', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const readGrantId = '01960000-0000-7000-8000-000000000004'
    const sendGrantId = '01960000-0000-7000-8000-000000000005'

    agentAccessTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ role: 'member' })
    })
    agentAccessTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            constraints: null,
            organizationId,
            permission: 'manageAgents',
            principalId: userId,
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })
    agentAccessTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            constraints: null,
            mailboxAddress: 'research@example.test',
            organizationId,
            principalId: userId,
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })
    agentAccessTestState.agentHostFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: hostId,
            createdAt: new Date('2026-06-22T09:00:00.000Z'),
            name: 'Workstation',
            publicKey: 'secret-host-public-key-json',
            status: 'active',
            userId
          }
        ])
    })
    agentAccessTestState.agentFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: agentId,
            createdAt: new Date('2026-06-22T09:05:00.000Z'),
            hostId,
            mode: 'delegated',
            name: 'Research Agent',
            publicKey: 'secret-agent-public-key-json',
            status: 'active',
            userId
          }
        ])
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: sendGrantId,
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'ops@example.test',
              organizationId
            },
            createdAt: new Date('2026-06-22T10:11:00.000Z'),
            expiresAt: null,
            reason: 'Send access requires a mailbox owner.',
            status: 'pending'
          },
          {
            _id: readGrantId,
            agentId,
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            createdAt: new Date('2026-06-22T10:10:00.000Z'),
            expiresAt: null,
            reason: null,
            status: 'active'
          }
        ])
    })

    const { getAgentAccessViewForWeb } = await import('./service')
    const view = await getAgentAccessViewForWeb({ headers: new Headers() })

    expect(view.allowedActions.revokeCapabilityGrant).toBe(true)
    expect(view.allowedActions.revokeAgent).toBe(false)
    expect(view.agents).toStrictEqual([
      expect.objectContaining({
        canRevoke: false,
        id: publicIdFromUUIDv7(agentId)
      })
    ])
    expect(view.grants).toStrictEqual([
      expect.objectContaining({
        canRevoke: true,
        capability: 'email.message.read',
        id: publicIdFromUUIDv7(readGrantId)
      }),
      expect.objectContaining({
        canRevoke: false,
        capability: 'email.message.send',
        id: publicIdFromUUIDv7(sendGrantId)
      })
    ])
    expect(JSON.stringify(view)).not.toContain('secret')
  })

  it('approves an organization-scoped capability approval through the Better Auth boundary', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const headers = new Headers()
    const agent = {
      _id: agentId,
      createdAt: new Date('2026-06-22T09:05:00.000Z'),
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId
    }
    const host = {
      _id: hostId,
      createdAt: new Date('2026-06-22T09:00:00.000Z'),
      name: 'Workstation',
      publicKey: 'secret-host-public-key-json',
      status: 'active',
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      createdAt: new Date('2026-06-22T10:11:00.000Z'),
      expiresAt: null,
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })
    agentAccessTestState.agentHostFind.mockReturnValue({ exec: () => Promise.resolve([host]) })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([agent]) })
    agentAccessTestState.approveCapability.mockResolvedValue({
      agent_id: agentId,
      grant_ids: [grantId],
      status: 'approved'
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')
    const result = await decideAgentAccessApprovalForWeb({
      headers,
      input: {
        action: 'approve',
        approvalId
      }
    })

    expect(result).toMatchObject({
      status: 'approved',
      success: true,
      view: {
        organizationId,
        state: 'ready'
      }
    })
    expect(agentAccessTestState.approveCapability).toHaveBeenCalledWith({
      body: {
        action: 'approve',
        approval_id: approvalId
      },
      headers
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain(agentId)
    expect(JSON.stringify(result)).not.toContain('grant_ids')
  })

  it('rejects approved capability races when a pending grant update no longer matches', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const headers = new Headers()
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId
    }
    const host = {
      _id: hostId,
      name: 'Workstation',
      publicKey: 'secret-host-public-key-json',
      status: 'active',
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })
    agentAccessTestState.agentCapabilityGrantUpdateOne.mockReturnValueOnce({
      exec: () => Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
    })
    agentAccessTestState.approveCapability.mockResolvedValue({
      agent_id: agentId,
      grant_ids: [grantId],
      status: 'approved'
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers,
        input: {
          action: 'approve',
          approvalId
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent capability grant is no longer pending',
      status: 409
    })
    expect(agentAccessTestState.approveCapability).toHaveBeenCalledWith({
      body: {
        action: 'approve',
        approval_id: approvalId
      },
      headers
    })
    expect(agentAccessTestState.transaction).toHaveBeenCalledOnce()
    expect(agentAccessTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(agentAccessTestState.agentHostUpdateOne).not.toHaveBeenCalled()
  })

  it('does not expose Better Auth Agent Access error response bodies', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const headers = new Headers()
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      status: 'pending',
      userId
    }
    const host = {
      _id: hostId,
      name: 'Workstation',
      status: 'active',
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })
    agentAccessTestState.approveCapability.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'provider token auth_secret_123 failed',
          message: 'approval failed for internal agent id 01960000-0000-7000-8000-000000000099'
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 403
        }
      )
    )

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers,
        input: {
          action: 'approve',
          approvalId
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent approval request could not be updated',
      status: 403
    })
  })

  it('preserves public WebAuthn challenge errors from the Better Auth approval boundary', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const headers = new Headers()

    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          hostId,
          mode: 'delegated',
          name: 'Research Agent',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentHostFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: hostId,
          name: 'Workstation',
          status: 'active',
          userId
        })
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: grantId,
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            reason: 'Needs approval',
            status: 'pending'
          }
        ])
    })
    agentAccessTestState.approveCapability.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'webauthn_required',
          message: 'This approval requires proof of physical presence.',
          webauthn_options: {
            allowCredentials: [{ id: 'credential-1', type: 'public-key' }],
            challenge: 'challenge-1',
            rpId: 'mail.example.com',
            userVerification: 'required'
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 403
        }
      )
    )

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers,
        input: {
          action: 'approve',
          approvalId
        }
      })
    ).rejects.toMatchObject({
      details: {
        code: 'webauthn_required',
        webauthnOptions: {
          challenge: 'challenge-1',
          userVerification: 'required'
        }
      },
      message: 'This approval requires proof of physical presence.',
      status: 403
    })
  })

  it('requires exact AgentGrant authority before approving mailbox capability grants', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const grantId = '01960000-0000-7000-8000-000000000009'

    agentAccessTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ role: 'member' })
    })
    agentAccessTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            organizationId,
            permission: 'manageAgents',
            principalId: userId,
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })
    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          hostId,
          mode: 'delegated',
          name: 'Research Agent',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: grantId,
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            status: 'pending'
          }
        ])
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          action: 'approve',
          approvalId: publicIdFromUUIDv7(approvalId)
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent capability grant management is not authorized',
      status: 403
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
  })

  it('approves an organization-scoped capability approval with only the device user code', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const approvalDatabaseId = { toString: () => approvalId }
    const grantId = '01960000-0000-7000-8000-000000000009'
    const formattedUserCode = 'WXYZ-9876'
    const approval = {
      _id: approvalDatabaseId,
      agentId,
      capabilities: 'email.message.send',
      expiresAt: new Date('2999-06-22T10:18:00.000Z'),
      hostId,
      method: 'device_authorization',
      status: 'pending',
      userCodeHash: createHash('sha256').update(formattedUserCode).digest('base64url'),
      userId
    }
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId
    }
    const host = {
      _id: hostId,
      defaultCapabilities: '[]',
      name: 'Workstation',
      status: 'active',
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      expiresAt: null,
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFind.mockImplementation((query?: unknown) => ({
      exec: () =>
        Promise.resolve(
          query &&
            typeof query === 'object' &&
            'userCodeHash' in query &&
            query.userCodeHash === approval.userCodeHash
            ? [approval]
            : [approval]
        )
    }))
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })
    agentAccessTestState.agentHostFind.mockReturnValue({ exec: () => Promise.resolve([host]) })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([agent]) })

    const { decideAgentAccessApprovalForWeb } = await import('./service')
    const result = await decideAgentAccessApprovalForWeb({
      headers: new Headers(),
      input: {
        action: 'approve',
        userCode: 'WXYZ9876'
      }
    })

    expect(result).toMatchObject({
      status: 'approved',
      success: true,
      view: {
        organizationId,
        state: 'ready'
      }
    })
    expect(agentAccessTestState.approveCapability).toHaveBeenCalledWith({
      body: {
        action: 'approve',
        approval_id: approvalId,
        user_code: formattedUserCode
      },
      headers: expect.any(Headers)
    })
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).toHaveBeenCalledWith(
      {
        _id: grantId,
        status: 'pending'
      },
      {
        $set: expect.objectContaining({
          grantedBy: userId,
          status: 'active'
        })
      }
    )
    expect(agentAccessTestState.agentUpdateOne).toHaveBeenCalledWith(
      {
        _id: agentId,
        status: 'pending'
      },
      {
        $set: expect.objectContaining({
          expiresAt: null,
          status: 'active',
          userId
        })
      }
    )
    expect(agentAccessTestState.agentHostUpdateOne).toHaveBeenCalledWith(
      {
        _id: hostId,
        status: { $in: ['active', 'pending'] }
      },
      {
        $set: expect.objectContaining({
          expiresAt: null,
          status: 'active',
          userId
        })
      }
    )
    expect(agentAccessTestState.transaction).toHaveBeenCalledOnce()
  })

  it('binds unscoped delegated registration grants to the approving active organization', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const approvalDatabaseId = { toString: () => approvalId }
    const grantId = '01960000-0000-7000-8000-000000000009'
    const formattedUserCode = 'BIND-1234'
    const approval = {
      _id: approvalDatabaseId,
      agentId,
      capabilities: 'email.message.read',
      expiresAt: new Date('2999-06-22T10:18:00.000Z'),
      hostId,
      method: 'device_authorization',
      status: 'pending',
      userCodeHash: createHash('sha256').update(formattedUserCode).digest('base64url'),
      userId: null
    }
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Unbound Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId: null
    }
    const host = {
      _id: hostId,
      defaultCapabilities: '[]',
      name: 'Unbound Workstation',
      status: 'pending',
      userId: null
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.read',
      constraints: {
        mailboxAddress: 'research@example.test'
      },
      expiresAt: null,
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFind.mockReturnValue({ exec: () => Promise.resolve([approval]) })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })
    agentAccessTestState.agentHostFind.mockReturnValue({ exec: () => Promise.resolve([host]) })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([agent]) })

    const { decideAgentAccessApprovalForWeb } = await import('./service')
    const result = await decideAgentAccessApprovalForWeb({
      headers: new Headers(),
      input: {
        action: 'approve',
        userCode: 'BIND1234'
      }
    })

    expect(result).toMatchObject({
      status: 'approved',
      success: true,
      view: {
        organizationId,
        state: 'ready'
      }
    })
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).toHaveBeenNthCalledWith(
      1,
      {
        _id: grantId,
        status: 'pending'
      },
      {
        $set: {
          constraints: {
            mailboxAddress: 'research@example.test',
            organizationId
          },
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(agentAccessTestState.approveCapability).toHaveBeenCalledWith({
      body: {
        action: 'approve',
        approval_id: approvalId,
        user_code: formattedUserCode
      },
      headers: expect.any(Headers)
    })
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).toHaveBeenNthCalledWith(
      2,
      {
        _id: grantId,
        status: 'pending'
      },
      {
        $set: expect.objectContaining({
          grantedBy: userId,
          status: 'active'
        })
      }
    )
  })

  it('does not bind unscoped delegated grants before Better Auth approval succeeds', async () => {
    expect.hasAssertions()

    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const approvalDatabaseId = { toString: () => approvalId }
    const grantId = '01960000-0000-7000-8000-000000000009'
    const formattedUserCode = 'BIND-4321'
    const approval = {
      _id: approvalDatabaseId,
      agentId,
      capabilities: 'email.message.read',
      expiresAt: new Date('2999-06-22T10:18:00.000Z'),
      hostId,
      method: 'device_authorization',
      status: 'pending',
      userCodeHash: createHash('sha256').update(formattedUserCode).digest('base64url'),
      userId: null
    }
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Unbound Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId: null
    }
    const host = {
      _id: hostId,
      defaultCapabilities: '[]',
      name: 'Unbound Workstation',
      status: 'pending',
      userId: null
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.read',
      constraints: {
        mailboxAddress: 'research@example.test'
      },
      expiresAt: null,
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFind.mockReturnValue({ exec: () => Promise.resolve([approval]) })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })
    agentAccessTestState.approveCapability.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'webauthn_required',
          message: 'This approval requires proof of physical presence.',
          webauthn_options: {
            challenge: 'challenge-2',
            userVerification: 'required'
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 403
        }
      )
    )

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          action: 'approve',
          userCode: 'BIND4321'
        }
      })
    ).rejects.toMatchObject({
      details: {
        code: 'webauthn_required',
        webauthnOptions: {
          challenge: 'challenge-2',
          userVerification: 'required'
        }
      },
      message: 'This approval requires proof of physical presence.',
      status: 403
    })
    expect(agentAccessTestState.approveCapability).toHaveBeenCalledWith({
      body: {
        action: 'approve',
        approval_id: approvalId,
        user_code: formattedUserCode
      },
      headers: expect.any(Headers)
    })
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).not.toHaveBeenCalled()
    expect(agentAccessTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(agentAccessTestState.agentHostUpdateOne).not.toHaveBeenCalled()
  })

  it('previews an unlinked delegated capability approval only through the matching device user code', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const approvalDatabaseId = { toString: () => approvalId }
    const grantId = '01960000-0000-7000-8000-000000000009'
    const formattedUserCode = 'WXYZ-9876'
    const approval = {
      _id: approvalDatabaseId,
      agentId,
      bindingMessage: 'Approve send access',
      capabilities: 'email.message.send',
      clientNotificationToken: 'secret-notification-token',
      expiresAt: new Date('2999-06-22T10:18:00.000Z'),
      hostId,
      method: 'device_authorization',
      status: 'pending',
      userCodeHash: createHash('sha256').update(formattedUserCode).digest('base64url'),
      userId: null
    }
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId: null
    }
    const host = {
      _id: hostId,
      name: 'Workstation',
      publicKey: 'secret-host-public-key-json',
      status: 'active',
      userId: null
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      expiresAt: null,
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFind.mockImplementation((query?: unknown) => ({
      exec: () =>
        Promise.resolve(
          query &&
            typeof query === 'object' &&
            'userCodeHash' in query &&
            query.userCodeHash === approval.userCodeHash
            ? [approval]
            : []
        )
    }))
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })

    const { getAgentAccessApprovalForWeb } = await import('./service')
    const result = await getAgentAccessApprovalForWeb({
      headers: new Headers(),
      input: {
        userCode: 'WXYZ9876'
      }
    })

    expect(result).toMatchObject({
      approval: {
        agentId: publicIdFromUUIDv7(agentId),
        bindingMessage: 'Approve send access',
        canDeny: true,
        canReview: true,
        capabilities: ['email.message.send'],
        hostId: publicIdFromUUIDv7(hostId),
        id: publicIdFromUUIDv7(approvalId),
        method: 'device_authorization',
        status: 'pending'
      },
      organizationId
    })
    expect(agentAccessTestState.agentHostFindById).toHaveBeenCalledWith(hostId)
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain(formattedUserCode)
  })

  it('approves an unlinked delegated capability approval only through the matching device user code', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const formattedUserCode = 'WXYZ-9876'
    const approval = {
      _id: approvalId,
      agentId,
      capabilities: 'email.message.send',
      expiresAt: new Date('2999-06-22T10:18:00.000Z'),
      hostId,
      method: 'device_authorization',
      status: 'pending',
      userCodeHash: createHash('sha256').update(formattedUserCode).digest('base64url'),
      userId: null
    }
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId: null
    }
    const host = {
      _id: hostId,
      defaultCapabilities: '[]',
      name: 'Workstation',
      status: 'active',
      userId: null
    }
    const linkedAgent = {
      ...agent,
      userId
    }
    const linkedHost = {
      ...host,
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      expiresAt: null,
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFind.mockImplementation((query?: unknown) => ({
      exec: () =>
        Promise.resolve(
          query &&
            typeof query === 'object' &&
            'userCodeHash' in query &&
            query.userCodeHash === approval.userCodeHash
            ? [approval]
            : []
        )
    }))
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })
    agentAccessTestState.agentHostFind.mockReturnValue({ exec: () => Promise.resolve([linkedHost]) })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([linkedAgent]) })
    agentAccessTestState.approveCapability.mockResolvedValue({
      json: () =>
        Promise.resolve({
          agentId
        }),
      ok: true,
      status: 200
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')
    const result = await decideAgentAccessApprovalForWeb({
      headers: new Headers(),
      input: {
        action: 'approve',
        userCode: 'WXYZ9876'
      }
    })

    expect(result).toMatchObject({
      status: 'approved',
      success: true,
      view: {
        organizationId,
        state: 'ready'
      }
    })
    expect(agentAccessTestState.approveCapability).toHaveBeenCalledWith({
      body: {
        action: 'approve',
        approval_id: approvalId,
        user_code: formattedUserCode
      },
      headers: expect.any(Headers)
    })
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).toHaveBeenCalledWith(
      {
        _id: grantId,
        status: 'pending'
      },
      {
        $set: expect.objectContaining({
          grantedBy: userId,
          status: 'active'
        })
      }
    )
    expect(agentAccessTestState.agentUpdateOne).toHaveBeenCalledWith(
      {
        _id: agentId,
        status: 'pending'
      },
      {
        $set: expect.objectContaining({
          expiresAt: null,
          status: 'active',
          userId
        })
      }
    )
    expect(agentAccessTestState.agentHostUpdateOne).toHaveBeenCalledWith(
      {
        _id: hostId,
        status: { $in: ['active', 'pending'] }
      },
      {
        $set: expect.objectContaining({
          expiresAt: null,
          status: 'active',
          userId
        })
      }
    )
    expect(agentAccessTestState.transaction).toHaveBeenCalledOnce()
  })

  it('rejects an unlinked delegated approval decision when only the approval identifier is supplied', async () => {
    expect.hasAssertions()

    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const approval = {
      _id: approvalId,
      agentId,
      capabilities: 'email.message.send',
      expiresAt: new Date('2999-06-22T10:18:00.000Z'),
      hostId,
      method: 'device_authorization',
      status: 'pending',
      userCodeHash: createHash('sha256').update('WXYZ-9876').digest('base64url'),
      userId: null
    }
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      status: 'pending',
      userId: null
    }
    const host = {
      _id: hostId,
      name: 'Workstation',
      status: 'active',
      userId: null
    }

    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () => Promise.resolve(approval)
    })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          action: 'approve',
          approvalId: publicIdFromUUIDv7(approvalId)
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent access is forbidden',
      status: 403
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
    expect(agentAccessTestState.agentCapabilityGrantFind).toHaveBeenCalledWith({
      agentId,
      status: { $in: ['active', 'pending'] }
    })
  })

  it('previews an organization-scoped capability approval with only the device user code', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const formattedUserCode = 'WXYZ-9876'
    const approval = {
      _id: approvalId,
      agentId,
      bindingMessage: 'Approve send access',
      capabilities: 'email.message.send',
      clientNotificationToken: 'secret-notification-token',
      expiresAt: new Date('2999-06-22T10:18:00.000Z'),
      hostId,
      method: 'device_authorization',
      status: 'pending',
      userCodeHash: createHash('sha256').update(formattedUserCode).digest('base64url'),
      userId
    }
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      expiresAt: null,
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFind.mockImplementation((query?: unknown) => ({
      exec: () =>
        Promise.resolve(
          query &&
            typeof query === 'object' &&
            'userCodeHash' in query &&
            query.userCodeHash === approval.userCodeHash
            ? [approval]
            : []
        )
    }))
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })

    const { getAgentAccessApprovalForWeb } = await import('./service')
    const result = await getAgentAccessApprovalForWeb({
      headers: new Headers(),
      input: {
        userCode: 'WXYZ9876'
      }
    })

    expect(result).toStrictEqual({
      approval: {
        agentId: publicIdFromUUIDv7(agentId),
        bindingMessage: 'Approve send access',
        canDeny: true,
        canReview: true,
        capabilities: ['email.message.send'],
        capabilityRequests: [
          {
            approvalStrength: 'webauthn',
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test'
            },
            reason: 'Needs approval'
          }
        ],
        createdAt: null,
        expiresAt: '2999-06-22T10:18:00.000Z',
        hostId: publicIdFromUUIDv7(hostId),
        id: publicIdFromUUIDv7(approvalId),
        method: 'device_authorization',
        status: 'pending'
      },
      capabilityCatalog: agentMailCapabilityCatalog,
      organizationId
    })
    expect(agentAccessTestState.approvalRequestFind).toHaveBeenCalledWith({
      method: 'device_authorization',
      status: 'pending',
      userCodeHash: approval.userCodeHash
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain(formattedUserCode)
  })

  it('requires exact AgentGrant authority before previewing mailbox capability approvals', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const formattedUserCode = 'WXYZ-9876'

    agentAccessTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ role: 'member' })
    })
    agentAccessTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            organizationId,
            permission: 'manageAgents',
            principalId: userId,
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })
    agentAccessTestState.approvalRequestFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: approvalId,
            agentId,
            capabilities: 'email.message.send',
            expiresAt: new Date('2999-06-22T10:18:00.000Z'),
            hostId,
            method: 'device_authorization',
            status: 'pending',
            userCodeHash: createHash('sha256').update(formattedUserCode).digest('base64url'),
            userId
          }
        ])
    })
    agentAccessTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          hostId,
          mode: 'delegated',
          name: 'Research Agent',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: grantId,
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            status: 'pending'
          }
        ])
    })

    const { getAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      getAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          userCode: 'WXYZ9876'
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent capability grant management is not authorized',
      status: 403
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
  })

  it('denies an organization-scoped capability approval through the Better Auth boundary', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const headers = new Headers()
    const agent = {
      _id: agentId,
      createdAt: new Date('2026-06-22T09:05:00.000Z'),
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId
    }
    const host = {
      _id: hostId,
      createdAt: new Date('2026-06-22T09:00:00.000Z'),
      name: 'Workstation',
      publicKey: 'secret-host-public-key-json',
      status: 'active',
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      createdAt: new Date('2026-06-22T10:11:00.000Z'),
      expiresAt: null,
      reason: 'Needs approval',
      status: 'pending'
    }

    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentHostFind.mockReturnValue({ exec: () => Promise.resolve([host]) })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([agent]) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })
    agentAccessTestState.approveCapability.mockResolvedValue({
      agent_id: agentId,
      grant_ids: [grantId],
      status: 'denied'
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')
    const result = await decideAgentAccessApprovalForWeb({
      headers,
      input: {
        action: 'deny',
        approvalId: publicIdFromUUIDv7(approvalId),
        reason: 'Denied from settings'
      }
    })

    expect(result).toMatchObject({
      status: 'denied',
      success: true,
      view: {
        organizationId,
        state: 'ready'
      }
    })
    expect(agentAccessTestState.approveCapability).toHaveBeenCalledWith({
      body: {
        action: 'deny',
        approval_id: approvalId,
        reason: 'Denied from settings'
      },
      headers
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain(agentId)
    expect(JSON.stringify(result)).not.toContain('grant_ids')
  })

  it('rejects malformed public identifiers before mutating Agent Access', async () => {
    expect.hasAssertions()

    const { decideAgentAccessApprovalForWeb, revokeAgentAccessAgentForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          action: 'approve',
          approvalId: 'not-a-public-id'
        }
      })
    ).rejects.toMatchObject({
      message: 'Approval request identifier is invalid',
      status: 400
    })
    await expect(
      revokeAgentAccessAgentForWeb({
        headers: new Headers(),
        input: {
          agentId: 'not-a-public-id'
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent identifier is invalid',
      status: 400
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
    expect(agentAccessTestState.revokeAgent).not.toHaveBeenCalled()
  })

  it('fails closed before approving when no pending grant is scoped to the active organization', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    agentAccessTestState.getSession.mockResolvedValue({
      session: {
        activeOrganizationId: organizationId,
        id: 'session-1'
      },
      user: {
        id: userId
      }
    })
    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          createdAt: new Date('2026-06-22T09:05:00.000Z'),
          hostId,
          mode: 'delegated',
          name: 'Research Agent',
          publicKey: 'secret-agent-public-key-json',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () => Promise.resolve([])
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          action: 'approve',
          approvalId: publicIdFromUUIDv7(approvalId)
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent approval has no pending grants in the active organization',
      status: 403
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
  })

  it('fails closed before approving caller-selected capabilities outside the approval request', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'

    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          hostId,
          mode: 'delegated',
          name: 'Research Agent',
          publicKey: 'secret-agent-public-key-json',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: '01960000-0000-7000-8000-000000000009',
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            status: 'pending'
          },
          {
            _id: '01960000-0000-7000-8000-000000000010',
            agentId,
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            status: 'pending'
          }
        ])
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          action: 'approve',
          approvalId: publicIdFromUUIDv7(approvalId),
          capabilities: ['email.message.read']
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent approval includes capabilities outside the approval request',
      status: 403
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
  })

  it('fails closed before approving grants outside the active organization', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const otherOrganizationId = '01960000-0000-7000-8000-0000000000cc'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId
    }

    agentAccessTestState.getSession.mockResolvedValue({
      session: {
        activeOrganizationId: organizationId,
        id: 'session-1'
      },
      user: {
        id: userId
      }
    })
    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: '01960000-0000-7000-8000-000000000009',
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'other@example.test',
              organizationId: otherOrganizationId
            },
            status: 'pending'
          }
        ])
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          action: 'approve',
          approvalId: publicIdFromUUIDv7(approvalId)
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent access includes grants outside the active organization',
      status: 403
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
  })

  it('fails closed before partially approving an agent with unselected grants outside the active organization', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const otherOrganizationId = '01960000-0000-7000-8000-0000000000cc'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'

    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send email.message.read',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          hostId,
          mode: 'delegated',
          name: 'Research Agent',
          publicKey: 'secret-agent-public-key-json',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: '01960000-0000-7000-8000-000000000009',
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            status: 'pending'
          },
          {
            _id: '01960000-0000-7000-8000-000000000010',
            agentId,
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'other@example.test',
              organizationId: otherOrganizationId
            },
            status: 'pending'
          }
        ])
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          action: 'approve',
          approvalId: publicIdFromUUIDv7(approvalId),
          capabilities: ['email.message.send']
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent access includes grants outside the active organization',
      status: 403
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
  })

  it('revokes an organization-scoped agent without exposing raw Better Auth identifiers', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const headers = new Headers()
    const agent = {
      _id: agentId,
      createdAt: new Date('2026-06-22T09:05:00.000Z'),
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'active',
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.read',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      createdAt: new Date('2026-06-22T10:11:00.000Z'),
      expiresAt: null,
      reason: null,
      status: 'active'
    }
    const mailboxGrant = {
      _id: 'mailbox-grant-1',
      capability: 'readMailbox',
      mailboxAddress: 'research@example.test',
      organizationId,
      principalId: agentId,
      principalType: 'agent',
      status: 'active'
    }

    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([grant]) })
    agentAccessTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () => Promise.resolve([mailboxGrant])
    })
    agentAccessTestState.agentMailMailboxGrantUpdateMany.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([agent]) })
    agentAccessTestState.revokeAgent.mockResolvedValue({
      agent_id: agentId,
      grant_ids: [grantId],
      status: 'revoked'
    })

    const { revokeAgentAccessAgentForWeb } = await import('./service')
    const result = await revokeAgentAccessAgentForWeb({
      headers,
      input: {
        agentId: publicIdFromUUIDv7(agentId)
      }
    })

    expect(result).toMatchObject({
      status: 'revoked',
      success: true,
      view: {
        organizationId,
        state: 'ready'
      }
    })
    expect(agentAccessTestState.revokeAgent).toHaveBeenCalledWith({
      body: { agent_id: agentId },
      headers
    })
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).toHaveBeenCalledWith(
      {
        _id: grantId,
        agentId,
        status: { $in: ['active', 'pending'] }
      },
      {
        $set: {
          status: 'revoked',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(agentAccessTestState.agentMailMailboxGrantUpdateMany).toHaveBeenCalledWith(
      {
        organizationId,
        principalId: agentId,
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      },
      {
        $set: {
          status: 'revoked',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(agentAccessTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_access.agent_mail_grants.revoked',
      metadata: {
        agentId,
        grantIds: ['mailbox-grant-1'],
        organizationId,
        revokedMailboxGrantCount: 1,
        revokedSystemGrantCount: 0
      },
      severity: 'medium',
      status: 'success',
      userId
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain(agentId)
    expect(JSON.stringify(result)).not.toContain('grant_ids')
  })

  it('revokes only active-organization grants when agent access exists in another organization', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const otherOrganizationId = '01960000-0000-7000-8000-0000000000cc'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'active',
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.read',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      status: 'active'
    }
    const otherGrant = {
      _id: '01960000-0000-7000-8000-000000000010',
      agentId,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'ops@example.test',
        organizationId: otherOrganizationId
      },
      status: 'active'
    }

    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () => Promise.resolve([grant, otherGrant])
    })
    agentAccessTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: 'mailbox-grant-1',
            capability: 'readMailbox',
            mailboxAddress: 'research@example.test',
            organizationId,
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          },
          {
            _id: 'mailbox-grant-2',
            capability: 'readMailbox',
            mailboxAddress: 'ops@example.test',
            organizationId: otherOrganizationId,
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          }
        ])
    })
    agentAccessTestState.agentMailMailboxGrantUpdateMany.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([agent]) })

    const { revokeAgentAccessAgentForWeb } = await import('./service')

    const result = await revokeAgentAccessAgentForWeb({
      headers: new Headers(),
      input: {
        agentId: publicIdFromUUIDv7(agentId)
      }
    })

    expect(result).toMatchObject({
      status: 'revoked',
      success: true
    })
    expect(agentAccessTestState.revokeAgent).not.toHaveBeenCalled()
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).toHaveBeenCalledTimes(1)
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).toHaveBeenCalledWith(
      {
        _id: grantId,
        agentId,
        status: { $in: ['active', 'pending'] }
      },
      {
        $set: {
          status: 'revoked',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(agentAccessTestState.agentMailMailboxGrantUpdateMany).toHaveBeenCalledWith(
      {
        organizationId,
        principalId: agentId,
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      },
      {
        $set: {
          status: 'revoked',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(agentAccessTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_access.capability_grants.revoked',
      metadata: {
        agentId,
        capabilities: ['email.message.read'],
        grantIds: [grantId],
        organizationId,
        revokedMailboxGrantCount: 1,
        revokedSystemGrantCount: 0
      },
      severity: 'medium',
      status: 'success',
      userId
    })
  })

  it('revokes an exact organization-scoped capability grant without revoking same-capability grants', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const grantId = '01960000-0000-7000-8000-000000000009'
    const otherGrantId = '01960000-0000-7000-8000-000000000010'
    const headers = new Headers()
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'active',
      userId
    }
    const grant = {
      _id: grantId,
      agentId,
      capability: 'email.message.read',
      constraints: {
        mailboxAddress: 'research@example.test',
        organizationId
      },
      status: 'active'
    }
    const otherGrant = {
      _id: otherGrantId,
      agentId,
      capability: 'email.message.read',
      constraints: {
        mailboxAddress: 'ops@example.test',
        organizationId
      },
      status: 'active'
    }
    const mailboxGrant = {
      _id: 'mailbox-grant-1',
      capability: 'readMailbox',
      mailboxAddress: 'research@example.test',
      organizationId,
      principalId: agentId,
      principalType: 'agent',
      status: 'active'
    }

    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () => Promise.resolve([grant, otherGrant])
    })
    agentAccessTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () => Promise.resolve([mailboxGrant])
    })
    agentAccessTestState.agentMailMailboxGrantUpdateMany.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    agentAccessTestState.agentFind.mockReturnValue({ exec: () => Promise.resolve([agent]) })

    const { revokeAgentAccessCapabilitiesForWeb } = await import('./service')
    const result = await revokeAgentAccessCapabilitiesForWeb({
      headers,
      input: {
        agentId: publicIdFromUUIDv7(agentId),
        capabilities: ['email.message.read'],
        grantId: publicIdFromUUIDv7(grantId)
      }
    })

    expect(result).toMatchObject({
      status: 'revoked',
      success: true,
      view: {
        organizationId,
        state: 'ready'
      }
    })
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).toHaveBeenCalledWith(
      {
        _id: grantId,
        agentId,
        status: { $in: ['active', 'pending'] }
      },
      {
        $set: {
          status: 'revoked',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(agentAccessTestState.agentMailMailboxGrantUpdateMany).toHaveBeenCalledWith(
      {
        _id: { $in: ['mailbox-grant-1'] },
        status: { $in: ['active', 'pending'] }
      },
      {
        $set: {
          status: 'revoked',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(agentAccessTestState.revokeCapability).not.toHaveBeenCalled()
    expect(agentAccessTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_access.capability_grants.revoked',
      metadata: {
        agentId,
        capabilities: ['email.message.read'],
        grantIds: [grantId],
        organizationId,
        revokedMailboxGrantCount: 1,
        revokedSystemGrantCount: 0
      },
      severity: 'medium',
      status: 'success',
      userId
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain(agentId)
    expect(JSON.stringify(result)).not.toContain('grant_ids')
  })

  it('requires exact AgentGrant authority before revoking mailbox capability grants', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const grantId = '01960000-0000-7000-8000-000000000009'

    agentAccessTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ role: 'member' })
    })
    agentAccessTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            organizationId,
            permission: 'manageAgents',
            principalId: userId,
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })
    agentAccessTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          hostId,
          mode: 'delegated',
          name: 'Research Agent',
          status: 'active',
          userId
        })
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: grantId,
            agentId,
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            status: 'active'
          }
        ])
    })

    const { revokeAgentAccessCapabilitiesForWeb } = await import('./service')

    await expect(
      revokeAgentAccessCapabilitiesForWeb({
        headers: new Headers(),
        input: {
          agentId: publicIdFromUUIDv7(agentId),
          capabilities: ['email.message.read'],
          grantId: publicIdFromUUIDv7(grantId)
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent capability grant management is not authorized',
      status: 403
    })
    expect(agentAccessTestState.agentCapabilityGrantUpdateOne).not.toHaveBeenCalled()
    expect(agentAccessTestState.auditLogCreate).not.toHaveBeenCalled()
    expect(agentAccessTestState.revokeCapability).not.toHaveBeenCalled()
  })

  it('fails closed before revoking capabilities outside the active organization', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const otherOrganizationId = '01960000-0000-7000-8000-0000000000cc'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'

    agentAccessTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          hostId,
          mode: 'delegated',
          name: 'Research Agent',
          publicKey: 'secret-agent-public-key-json',
          status: 'active',
          userId
        })
    })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: '01960000-0000-7000-8000-000000000009',
            agentId,
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'other@example.test',
              organizationId: otherOrganizationId
            },
            status: 'active'
          }
        ])
    })

    const { revokeAgentAccessCapabilitiesForWeb } = await import('./service')

    await expect(
      revokeAgentAccessCapabilitiesForWeb({
        headers: new Headers(),
        input: {
          agentId: publicIdFromUUIDv7(agentId),
          capabilities: ['email.message.read']
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent access includes grants outside the active organization',
      status: 403
    })
    expect(agentAccessTestState.revokeCapability).not.toHaveBeenCalled()
  })

  it('requires CASL agent management ability before mutating Agent Access', async () => {
    expect.hasAssertions()

    const organizationId = '01960000-0000-7000-8000-0000000000aa'
    const userId = '01960000-0000-7000-8000-0000000000bb'
    const hostId = '01960000-0000-7000-8000-000000000001'
    const agentId = '01960000-0000-7000-8000-000000000002'
    const approvalId = '01960000-0000-7000-8000-000000000007'
    const agent = {
      _id: agentId,
      hostId,
      mode: 'delegated',
      name: 'Research Agent',
      publicKey: 'secret-agent-public-key-json',
      status: 'pending',
      userId
    }

    agentAccessTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ role: 'member' })
    })
    agentAccessTestState.approvalRequestFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: approvalId,
          agentId,
          capabilities: 'email.message.send',
          expiresAt: new Date('2999-06-22T10:18:00.000Z'),
          hostId,
          method: 'device_authorization',
          status: 'pending',
          userId
        })
    })
    agentAccessTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
    agentAccessTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: '01960000-0000-7000-8000-000000000009',
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@example.test',
              organizationId
            },
            status: 'pending'
          }
        ])
    })

    const { decideAgentAccessApprovalForWeb } = await import('./service')

    await expect(
      decideAgentAccessApprovalForWeb({
        headers: new Headers(),
        input: {
          action: 'approve',
          approvalId: publicIdFromUUIDv7(approvalId)
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent access management is not authorized',
      status: 403
    })
    expect(agentAccessTestState.approveCapability).not.toHaveBeenCalled()
  })
})
