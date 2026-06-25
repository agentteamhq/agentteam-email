import { beforeEach, describe, expect, it, vi } from 'vitest'

import { agentMailAdminPermissionCatalog, publicIdFromUUIDv7 } from '@main/db'
import { buildAgentMailAbility } from './permission-policy'
import type { AgentMailPrincipal } from './permission-policy'
import type {
  AgentMailMailboxGrantDocument,
  AgentMailMailboxGrantId,
  AgentMailSystemGrantDocument,
  AgentMailSystemGrantId,
  OrganizationId,
  UserId
} from '@main/db'

const adminServiceTestState = vi.hoisted(() => ({
  abilityCan: vi.fn(),
  agentFind: vi.fn(),
  agentFindById: vi.fn(),
  agentHostFind: vi.fn(),
  agentHostFindById: vi.fn(),
  agentHostUpdateOne: vi.fn(),
  agentUpdateOne: vi.fn(),
  agentCapabilityGrantFind: vi.fn(),
  agentCapabilityGrantUpdateMany: vi.fn(),
  agentMailAgentEnrollmentGrantRequestCreate: vi.fn(),
  agentMailAgentEnrollmentGrantRequestFind: vi.fn(),
  agentMailAgentEnrollmentGrantRequestFindOne: vi.fn(),
  agentMailAgentEnrollmentGrantRequestUpdateOne: vi.fn(),
  agentMailDomainFind: vi.fn(),
  agentMailForwardingGroupFind: vi.fn(),
  agentMailForwardingGroupCreate: vi.fn(),
  agentMailForwardingGroupFindOne: vi.fn(),
  agentMailForwardingGroupUpdateOne: vi.fn(),
  agentMailDomainFindOne: vi.fn(),
  agentMailMailboxGrantCreate: vi.fn(),
  agentMailMailboxGrantFind: vi.fn(),
  agentMailMailboxGrantUpdateOne: vi.fn(),
  agentMailMailboxGrantUpdateMany: vi.fn(),
  agentMailSystemGrantFind: vi.fn(),
  agentMailSystemGrantUpdateOne: vi.fn(),
  agentMailSystemGrantUpdateMany: vi.fn(),
  apikeyFind: vi.fn(),
  apikeyFindById: vi.fn(),
  auditLogCreate: vi.fn(),
  cloudflareConnectionFind: vi.fn(),
  createHost: vi.fn(),
  createForwardedAddress: vi.fn(),
  createUser: vi.fn(),
  createWildDuckClient: vi.fn(),
  getUser: vi.fn(),
  getAgentMailAccountsForWeb: vi.fn(),
  globals: vi.fn(),
  oauthClientFind: vi.fn(),
  oauthClientFindOne: vi.fn(),
  requireAgentMailOrganizationContext: vi.fn(),
  requireAgentMailPaperclipOperation: vi.fn(),
  resolveAddress: vi.fn(),
  transaction: vi.fn(),
  updateUser: vi.fn(),
  updateForwardedAddress: vi.fn()
}))

const expectedAdminApiKeyProjection = {
  _id: 1,
  configId: 1,
  createdAt: 1,
  enabled: 1,
  expiresAt: 1,
  lastRequest: 1,
  name: 1,
  referenceId: 1,
  updatedAt: 1
} as const

const expectedAdminOAuthClientProjection = {
  clientId: 1,
  createdAt: 1,
  disabled: 1,
  name: 1,
  referenceId: 1,
  updatedAt: 1,
  userId: 1
} as const

vi.mock('../globals', () => ({
  globals: adminServiceTestState.globals
}))

vi.mock('./service', () => ({
  AgentMailAccessError: class AgentMailAccessError extends Error {
    constructor(
      message: string,
      public readonly status: 401 | 403
    ) {
      super(message)
      this.name = 'AgentMailAccessError'
    }
  },
  requireAgentMailOrganizationContext: adminServiceTestState.requireAgentMailOrganizationContext,
  requireAgentMailPaperclipOperation: adminServiceTestState.requireAgentMailPaperclipOperation
}))

vi.mock('./webmail-service', () => ({
  getAgentMailAccountsForWeb: adminServiceTestState.getAgentMailAccountsForWeb
}))

vi.mock('./wildduck-client', () => {
  class WildDuckAPIError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message)
      this.name = 'WildDuckAPIError'
    }
  }

  return {
    WildDuckAPIError,
    createWildDuckClient: adminServiceTestState.createWildDuckClient
  }
})

describe('Agent Mail admin service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    adminServiceTestState.abilityCan.mockReset()
    adminServiceTestState.agentFind.mockReset()
    adminServiceTestState.agentFindById.mockReset()
    adminServiceTestState.agentHostFind.mockReset()
    adminServiceTestState.agentHostFindById.mockReset()
    adminServiceTestState.agentHostUpdateOne.mockReset()
    adminServiceTestState.agentUpdateOne.mockReset()
    adminServiceTestState.agentCapabilityGrantFind.mockReset()
    adminServiceTestState.agentCapabilityGrantUpdateMany.mockReset()
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestCreate.mockReset()
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFind.mockReset()
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReset()
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestUpdateOne.mockReset()
    adminServiceTestState.agentMailDomainFind.mockReset()
    adminServiceTestState.agentMailForwardingGroupFind.mockReset()
    adminServiceTestState.agentMailForwardingGroupCreate.mockReset()
    adminServiceTestState.agentMailForwardingGroupFindOne.mockReset()
    adminServiceTestState.agentMailForwardingGroupUpdateOne.mockReset()
    adminServiceTestState.agentMailDomainFindOne.mockReset()
    adminServiceTestState.agentMailMailboxGrantCreate.mockReset()
    adminServiceTestState.agentMailMailboxGrantFind.mockReset()
    adminServiceTestState.agentMailMailboxGrantUpdateOne.mockReset()
    adminServiceTestState.agentMailMailboxGrantUpdateMany.mockReset()
    adminServiceTestState.agentMailSystemGrantFind.mockReset()
    adminServiceTestState.agentMailSystemGrantUpdateOne.mockReset()
    adminServiceTestState.agentMailSystemGrantUpdateMany.mockReset()
    adminServiceTestState.apikeyFind.mockReset()
    adminServiceTestState.apikeyFindById.mockReset()
    adminServiceTestState.auditLogCreate.mockReset()
    adminServiceTestState.cloudflareConnectionFind.mockReset()
    adminServiceTestState.createHost.mockReset()
    adminServiceTestState.createForwardedAddress.mockReset()
    adminServiceTestState.createUser.mockReset()
    adminServiceTestState.createWildDuckClient.mockReset()
    adminServiceTestState.getUser.mockReset()
    adminServiceTestState.getAgentMailAccountsForWeb.mockReset()
    adminServiceTestState.globals.mockReset()
    adminServiceTestState.oauthClientFind.mockReset()
    adminServiceTestState.oauthClientFindOne.mockReset()
    adminServiceTestState.requireAgentMailOrganizationContext.mockReset()
    adminServiceTestState.requireAgentMailPaperclipOperation.mockReset()
    adminServiceTestState.resolveAddress.mockReset()
    adminServiceTestState.transaction.mockReset()
    adminServiceTestState.updateUser.mockReset()
    adminServiceTestState.updateForwardedAddress.mockReset()

    adminServiceTestState.abilityCan.mockReturnValue(true)
    adminServiceTestState.requireAgentMailPaperclipOperation.mockReturnValue(undefined)
    adminServiceTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    adminServiceTestState.agentHostFind.mockReturnValue(chainedFindResolve([]))
    adminServiceTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(null) })
    adminServiceTestState.agentHostUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1 })
    })
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFind.mockReturnValue({
      exec: () => Promise.resolve([])
    })
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReturnValue({
      exec: () => Promise.resolve(null)
    })
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1 })
    })
    adminServiceTestState.transaction.mockImplementation((operation: unknown) => {
      const transactionOperation = operation as (session: typeof adminServiceTransactionSession) => unknown
      return transactionOperation(adminServiceTransactionSession)
    })
    const organizationId = 'org-1' as OrganizationId
    const userId = 'user-1' as UserId
    const principal: AgentMailPrincipal = {
      credentialId: 'session-1',
      organizationId,
      principalId: userId,
      principalType: 'user_session',
      userId
    }
    adminServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: {
        can: adminServiceTestState.abilityCan
      },
      capabilityGrants: [],
      mailboxGrants: [],
      organizationId,
      principal,
      systemGrants: [],
      userId
    })
    adminServiceTestState.createWildDuckClient.mockReturnValue({
      createForwardedAddress: adminServiceTestState.createForwardedAddress,
      createUser: adminServiceTestState.createUser,
      getUser: adminServiceTestState.getUser,
      resolveAddress: adminServiceTestState.resolveAddress,
      updateUser: adminServiceTestState.updateUser,
      updateForwardedAddress: adminServiceTestState.updateForwardedAddress
    })
    adminServiceTestState.agentMailDomainFind.mockReturnValue({
      exec: () => Promise.resolve([{ domain: 'example.test', status: 'active' }])
    })
    adminServiceTestState.cloudflareConnectionFind.mockReturnValue({
      exec: () => Promise.resolve([])
    })
    adminServiceTestState.globals.mockResolvedValue({
      auth: {
        api: {
          createHost: adminServiceTestState.createHost
        }
      },
      db: {
        connection: {
          transaction: adminServiceTestState.transaction
        },
        models: {
          agent: {
            find: adminServiceTestState.agentFind,
            findById: adminServiceTestState.agentFindById,
            updateOne: adminServiceTestState.agentUpdateOne
          },
          agentHost: {
            find: adminServiceTestState.agentHostFind,
            findById: adminServiceTestState.agentHostFindById,
            updateOne: adminServiceTestState.agentHostUpdateOne
          },
          agentCapabilityGrant: {
            find: adminServiceTestState.agentCapabilityGrantFind,
            updateMany: adminServiceTestState.agentCapabilityGrantUpdateMany
          },
          agentMailAgentEnrollmentGrantRequest: {
            create: adminServiceTestState.agentMailAgentEnrollmentGrantRequestCreate,
            find: adminServiceTestState.agentMailAgentEnrollmentGrantRequestFind,
            findOne: adminServiceTestState.agentMailAgentEnrollmentGrantRequestFindOne,
            updateOne: adminServiceTestState.agentMailAgentEnrollmentGrantRequestUpdateOne
          },
          agentMailDomain: {
            find: adminServiceTestState.agentMailDomainFind,
            findOne: adminServiceTestState.agentMailDomainFindOne
          },
          agentMailForwardingGroup: {
            create: adminServiceTestState.agentMailForwardingGroupCreate,
            find: adminServiceTestState.agentMailForwardingGroupFind,
            findOne: adminServiceTestState.agentMailForwardingGroupFindOne,
            updateOne: adminServiceTestState.agentMailForwardingGroupUpdateOne
          },
          agentMailMailboxGrant: {
            create: adminServiceTestState.agentMailMailboxGrantCreate,
            find: adminServiceTestState.agentMailMailboxGrantFind,
            updateOne: adminServiceTestState.agentMailMailboxGrantUpdateOne,
            updateMany: adminServiceTestState.agentMailMailboxGrantUpdateMany
          },
          agentMailSystemGrant: {
            find: adminServiceTestState.agentMailSystemGrantFind,
            updateOne: adminServiceTestState.agentMailSystemGrantUpdateOne,
            updateMany: adminServiceTestState.agentMailSystemGrantUpdateMany
          },
          apikey: {
            find: adminServiceTestState.apikeyFind,
            findById: adminServiceTestState.apikeyFindById
          },
          auditLog: {
            create: adminServiceTestState.auditLogCreate
          },
          cloudflareConnection: {
            find: adminServiceTestState.cloudflareConnectionFind
          },
          oauthClient: {
            find: adminServiceTestState.oauthClientFind,
            findOne: adminServiceTestState.oauthClientFindOne
          }
        }
      }
    })
    adminServiceTestState.getAgentMailAccountsForWeb.mockResolvedValue({
      accounts: [
        {
          address: 'support@example.test',
          id: 'support@example.test',
          name: 'Support',
          state: 'ready'
        }
      ]
    })
    adminServiceTestState.agentMailForwardingGroupFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    adminServiceTestState.agentMailMailboxGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    adminServiceTestState.agentMailSystemGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    adminServiceTestState.apikeyFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    adminServiceTestState.apikeyFindById.mockReturnValue({ exec: () => Promise.resolve(null) })
    adminServiceTestState.oauthClientFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    adminServiceTestState.oauthClientFindOne.mockReturnValue({ exec: () => Promise.resolve(null) })
  })

  it('builds the mailbox admin view from real account data and backend-owned grant records', async () => {
    expect.hasAssertions()

    const agentId = '01960000-0000-7000-8000-000000000001'
    const groupId = '01960000-0000-7000-8000-000000000002'
    const groupPublicId = publicIdFromUUIDv7(groupId)
    adminServiceTestState.agentMailForwardingGroupFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: groupId,
            address: 'support@example.test',
            description: 'Tier-one support queue',
            lastDeliveredAt: new Date('2026-06-22T10:05:00.000Z'),
            organizationId: 'org-1',
            recipients: ['triage@example.test', 'support@example.test'],
            status: 'active',
            updatedAt: new Date('2026-06-22T10:10:00.000Z')
          }
        ])
    })
    adminServiceTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          },
          {
            capability: 'sendAs',
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            organizationId: 'org-1',
            permission: 'manageForwardingGroups',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentFind.mockReturnValue({
      where: () => ({
        in: () => ({
          exec: () =>
            Promise.resolve([
              {
                _id: agentId,
                lastUsedAt: new Date('2026-06-22T12:00:00.000Z'),
                name: 'Support Agent',
                status: 'active',
                updatedAt: new Date('2026-06-21T12:00:00.000Z')
              }
            ])
        })
      })
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')
    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers(),
      section: 'agents'
    })

    expect(view).toMatchObject({
      accounts: [
        {
          accessCount: 2,
          address: 'support@example.test',
          domain: 'example.test',
          groups: ['support@example.test'],
          id: 'support@example.test',
          name: 'Support',
          status: 'active',
          type: 'mailbox'
        }
      ],
      agents: [
        {
          grants: [
            {
              accountAddress: 'support@example.test',
              accountId: 'support@example.test',
              capabilities: ['readMailbox', 'sendAs']
            }
          ],
          groups: ['support@example.test'],
          handle: 'agent:01960000',
          lastSeen: '2026-06-22',
          name: 'Support Agent',
          permissions: ['manageForwardingGroups'],
          primaryAccount: 'support@example.test',
          status: 'active'
        }
      ],
      domain: 'example.test',
      groups: [
        {
          address: 'support@example.test',
          description: 'Tier-one support queue',
          domain: 'example.test',
          id: groupPublicId,
          lastDelivered: '2026-06-22',
          lastUpdated: '2026-06-22',
          recipients: ['support@example.test', 'triage@example.test'],
          status: 'active'
        }
      ],
      section: 'agents',
      state: 'ready'
    })
    expect(view.agents[0]?.id).toBeTruthy()
  })

  it('returns public external-principal grant summaries from backend-owned grant records', async () => {
    expect.hasAssertions()

    const apiKeyId = '01960000-0000-7000-8000-000000000003'
    const apiKeyPublicId = publicIdFromUUIDv7(apiKeyId)
    adminServiceTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: apiKeyId,
            principalType: 'api_key',
            status: 'active'
          },
          {
            capability: 'sendAs',
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: apiKeyId,
            principalType: 'api_key',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            organizationId: 'org-1',
            permission: 'readAllMailboxes',
            principalId: 'paperclip-client',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.apikeyFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: apiKeyId,
            configId: 'organization',
            createdAt: new Date('2026-06-20T08:00:00.000Z'),
            enabled: true,
            expiresAt: null,
            key: 'raw-api-key-value',
            lastRequest: new Date('2026-06-22T09:10:00.000Z'),
            name: 'Worker key',
            referenceId: 'org-1'
          }
        ])
    })
    adminServiceTestState.oauthClientFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            clientId: 'paperclip-client',
            clientSecret: 'raw-oauth-secret',
            createdAt: new Date('2026-06-20T08:00:00.000Z'),
            disabled: false,
            metadata: JSON.stringify({
              agentteamEmail: {
                companyId: 'paperclip-company-1',
                integration: 'paperclip',
                pluginId: 'agentteam.paperclip-email-plugin'
              },
              secretDebugValue: 'raw-paperclip-metadata-secret'
            }),
            name: 'Paperclip Email (paperclip-company-1)',
            referenceId: 'org-1',
            softwareId: 'agentteam.paperclip-email-plugin',
            updatedAt: new Date('2026-06-21T08:00:00.000Z')
          }
        ])
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')
    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers(),
      section: 'agents'
    })

    expect(view.principals).toStrictEqual([
      {
        grants: [],
        id: 'paperclip-client',
        kind: 'oauth_client',
        lastUsed: '2026-06-21',
        name: 'Paperclip Email (paperclip-company-1)',
        permissions: ['readAllMailboxes'],
        scope: 'organization',
        status: 'active'
      },
      {
        grants: [
          {
            accountAddress: 'support@example.test',
            accountId: 'support@example.test',
            capabilities: ['readMailbox', 'sendAs']
          }
        ],
        id: apiKeyPublicId,
        kind: 'api_key',
        lastUsed: '2026-06-22',
        name: 'Worker key',
        permissions: [],
        scope: 'organization',
        status: 'active'
      }
    ])
    expect(JSON.stringify(view.principals)).not.toContain('raw-api-key-value')
    expect(JSON.stringify(view.principals)).not.toContain('raw-oauth-secret')
    expect(JSON.stringify(view.principals)).not.toContain('raw-paperclip-metadata-secret')
    expect(adminServiceTestState.apikeyFind).toHaveBeenCalledWith(
      {
        $or: [
          { configId: 'organization', referenceId: 'org-1' },
          { referenceId: 'user-1' },
          { _id: { $in: [apiKeyId] } }
        ]
      },
      expectedAdminApiKeyProjection
    )
    expect(adminServiceTestState.apikeyFind.mock.calls[0]?.[1]).not.toHaveProperty('key')
    expect(adminServiceTestState.oauthClientFind).toHaveBeenCalledWith(
      {
        $or: [
          { referenceId: 'org-1' },
          { referenceId: 'user-1' },
          { userId: 'user-1' },
          { clientId: { $in: ['paperclip-client'] } }
        ]
      },
      expectedAdminOAuthClientProjection
    )
    expect(adminServiceTestState.oauthClientFind.mock.calls[0]?.[1]).not.toHaveProperty('clientSecret')
  })

  it('filters and paginates connected clients with the agents admin section', async () => {
    expect.hasAssertions()

    const activeApiKeyId = '01960000-0000-7000-8000-000000000006'
    const disabledApiKeyId = '01960000-0000-7000-8000-000000000007'
    adminServiceTestState.apikeyFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: activeApiKeyId,
            configId: 'organization',
            createdAt: new Date('2026-06-20T08:00:00.000Z'),
            enabled: true,
            expiresAt: null,
            lastRequest: new Date('2026-06-22T09:10:00.000Z'),
            name: 'Active API key',
            referenceId: 'org-1'
          },
          {
            _id: disabledApiKeyId,
            configId: 'organization',
            createdAt: new Date('2026-06-20T08:00:00.000Z'),
            enabled: false,
            expiresAt: null,
            lastRequest: new Date('2026-06-22T09:10:00.000Z'),
            name: 'Disabled API key',
            referenceId: 'org-1'
          }
        ])
    })
    adminServiceTestState.oauthClientFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            clientId: 'paperclip-client',
            createdAt: new Date('2026-06-20T08:00:00.000Z'),
            disabled: false,
            name: 'Paperclip OAuth client',
            referenceId: 'org-1',
            updatedAt: new Date('2026-06-21T08:00:00.000Z')
          }
        ])
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')
    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers(),
      page: 2,
      pageSize: 1,
      section: 'agents',
      statusFilter: 'active'
    })

    expect(view.agents).toStrictEqual([])
    expect(view.principals).toStrictEqual([
      expect.objectContaining({
        id: 'paperclip-client',
        kind: 'oauth_client',
        name: 'Paperclip OAuth client',
        status: 'active'
      })
    ])
    expect(view.pagination).toStrictEqual({
      filteredRecords: 2,
      page: 2,
      pageSize: 1,
      totalRecords: 3
    })
    expect(view.state).toBe('ready')
  })

  it('lists agents that only have Agent Auth capability grants for the organization', async () => {
    expect.hasAssertions()

    const agentId = '01960000-0000-7000-8000-000000000004'
    adminServiceTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            agentId,
            capability: 'email.message.read',
            constraints: JSON.stringify({
              mailboxAddress: 'support@example.test',
              organizationId: 'org-1'
            }),
            expiresAt: null,
            status: 'active'
          },
          {
            agentId: '01960000-0000-7000-8000-000000000005',
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'support@other.test',
              organizationId: 'org-2'
            },
            expiresAt: null,
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentFind.mockReturnValue({
      where: () => ({
        in: () => ({
          exec: () =>
            Promise.resolve([
              {
                _id: agentId,
                lastUsedAt: new Date('2026-06-22T12:00:00.000Z'),
                name: 'Capability Agent',
                status: 'active',
                updatedAt: new Date('2026-06-21T12:00:00.000Z')
              }
            ])
        })
      })
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')
    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers(),
      section: 'agents'
    })

    expect(view.agents).toStrictEqual([
      {
        grants: [],
        groups: [],
        handle: 'agent:01960000',
        id: publicIdFromUUIDv7(agentId),
        lastSeen: '2026-06-22',
        name: 'Capability Agent',
        permissions: [],
        primaryAccount: undefined,
        status: 'active'
      }
    ])
    expect(view.pagination).toMatchObject({
      filteredRecords: 1,
      totalRecords: 1
    })
    expect(adminServiceTestState.agentCapabilityGrantFind).toHaveBeenCalledWith({
      status: { $in: ['active', 'pending'] }
    })
  })

  it('filters and paginates the active mailbox admin section at the service boundary', async () => {
    expect.hasAssertions()

    adminServiceTestState.getAgentMailAccountsForWeb.mockResolvedValue({
      accounts: [
        {
          address: 'alpha@example.test',
          id: 'alpha@example.test',
          name: 'Alpha',
          state: 'ready'
        },
        {
          address: 'beta@example.test',
          id: 'beta@example.test',
          name: 'Beta',
          state: 'disabled'
        },
        {
          address: 'carol@example.test',
          id: 'carol@example.test',
          name: 'Carol',
          state: 'ready'
        },
        {
          address: 'delta@example.test',
          id: 'delta@example.test',
          name: 'Delta',
          state: 'ready'
        }
      ]
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')
    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers(),
      page: 2,
      pageSize: 2,
      searchQuery: 'example.test',
      section: 'accounts',
      statusFilter: 'active'
    })

    expect(view.accounts).toStrictEqual([
      expect.objectContaining({
        address: 'delta@example.test',
        status: 'active'
      })
    ])
    expect(view.pagination).toStrictEqual({
      filteredRecords: 3,
      page: 2,
      pageSize: 2,
      totalRecords: 4
    })
    expect(view.searchQuery).toBe('example.test')
    expect(view.statusFilter).toBe('active')
    expect(adminServiceTestState.getAgentMailAccountsForWeb).toHaveBeenCalledWith(expect.any(Headers), {
      includeDisabled: true
    })
  })

  it('creates forwarding groups through WildDuck and persists the server-owned group record', async () => {
    expect.hasAssertions()

    const groupId = '01960000-0000-7000-8000-000000000003'
    const groupPublicId = publicIdFromUUIDv7(groupId)
    adminServiceTestState.createForwardedAddress.mockResolvedValue({
      id: 'wildduck-forwarded-1',
      success: true
    })
    adminServiceTestState.agentMailForwardingGroupCreate.mockResolvedValue({
      _id: groupId,
      address: 'support@example.test',
      createdAt: new Date('2026-06-22T10:00:00.000Z'),
      createdByUserId: 'user-1',
      description: 'Support queue',
      lastDeliveredAt: null,
      organizationId: 'org-1',
      recipients: ['triage@example.test'],
      status: 'active',
      updatedAt: new Date('2026-06-22T10:00:00.000Z'),
      wildDuckAddressId: 'wildduck-forwarded-1'
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { createAgentMailForwardingGroupForWeb } = await import('./admin-service')

    await expect(
      createAgentMailForwardingGroupForWeb({
        headers: new Headers(),
        input: {
          address: 'Support@Example.Test',
          description: 'Support queue',
          recipients: ['Triage@Example.Test']
        }
      })
    ).resolves.toStrictEqual({
      group: {
        address: 'support@example.test',
        description: 'Support queue',
        domain: 'example.test',
        id: groupPublicId,
        lastDelivered: 'Never',
        lastUpdated: '2026-06-22',
        recipients: ['triage@example.test'],
        status: 'active'
      },
      success: true
    })
    expect(adminServiceTestState.createForwardedAddress).toHaveBeenCalledWith({
      address: 'support@example.test',
      forwardedDisabled: false,
      name: 'Support queue',
      targets: ['triage@example.test']
    })
    expect(adminServiceTestState.agentMailForwardingGroupCreate).toHaveBeenCalledWith({
      address: 'support@example.test',
      createdByUserId: 'user-1',
      description: 'Support queue',
      lastDeliveredAt: null,
      organizationId: 'org-1',
      recipients: ['triage@example.test'],
      status: 'active',
      wildDuckAddressId: 'wildduck-forwarded-1'
    })
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.forwarding_group.created',
      metadata: {
        address: 'support@example.test',
        forwardingGroupId: groupId,
        organizationId: 'org-1',
        recipientCount: 1,
        wildDuckAddressId: 'wildduck-forwarded-1'
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
  })

  it('creates WildDuck mailbox accounts and initial agent mailbox grants through backend-owned contracts', async () => {
    expect.hasAssertions()

    const agentId = '01960000-0000-7000-8000-000000000001'
    const agentPublicId = publicIdFromUUIDv7(agentId)
    adminServiceTestState.abilityCan.mockImplementation((action: string, resource: unknown) => {
      const subject = resource as { __caslSubjectType__?: string }
      if (action === 'create' && subject.__caslSubjectType__ === 'Mailbox') {
        return true
      }
      if (action === 'manage' && subject.__caslSubjectType__ === 'Agent') {
        return true
      }
      if (action === 'manage' && subject.__caslSubjectType__ === 'AgentGrant') {
        return true
      }
      return false
    })
    const { WildDuckAPIError } = await import('./wildduck-client')
    adminServiceTestState.resolveAddress.mockRejectedValue(new WildDuckAPIError('not found', 404))
    adminServiceTestState.createUser.mockResolvedValue({
      id: 'wildduck-user-1',
      success: true
    })
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          name: 'Support Agent',
          status: 'active',
          userId: 'user-1'
        })
    })
    adminServiceTestState.agentMailMailboxGrantCreate.mockImplementation(
      async (input: Record<string, unknown> & { capability: string }) => ({
        ...input,
        _id: `grant-${input.capability}`,
        createdAt: new Date('2026-06-22T10:00:00.000Z'),
        updatedAt: new Date('2026-06-22T10:00:00.000Z')
      })
    )
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { createAgentMailAccountForWeb } = await import('./admin-service')
    const result = await createAgentMailAccountForWeb({
      headers: new Headers(),
      input: {
        address: 'Support@Example.Test',
        agentId: agentPublicId,
        grants: ['readMailbox', 'sendAs'],
        name: 'Support mailbox',
        type: 'mailbox'
      }
    })

    expect(result).toStrictEqual({
      account: {
        accessCount: 2,
        address: 'support@example.test',
        agentName: 'Agent 01960000',
        domain: 'example.test',
        groups: [],
        id: 'support@example.test',
        lastActivity: 'No recent activity',
        name: 'Support mailbox',
        status: 'active',
        type: 'mailbox'
      },
      success: true
    })
    expect(adminServiceTestState.createUser).toHaveBeenCalledWith({
      address: 'support@example.test',
      allowUnsafe: true,
      name: 'Support mailbox',
      password: expect.any(String),
      spamLevel: 25,
      username: 'support-at-example.test'
    })
    expect(adminServiceTestState.abilityCan).not.toHaveBeenCalledWith(
      'provision',
      expect.objectContaining({
        __caslSubjectType__: 'Mailbox'
      })
    )
    expect(adminServiceTestState.agentMailMailboxGrantCreate).toHaveBeenCalledTimes(2)
    expect(adminServiceTestState.agentMailMailboxGrantCreate).toHaveBeenCalledWith({
      capability: 'readMailbox',
      constraints: null,
      expiresAt: null,
      grantedByUserId: 'user-1',
      mailboxAddress: 'support@example.test',
      organizationId: 'org-1',
      principalId: agentId,
      principalType: 'agent',
      status: 'active'
    })
    expect(adminServiceTestState.agentMailMailboxGrantCreate).toHaveBeenCalledWith({
      capability: 'sendAs',
      constraints: null,
      expiresAt: null,
      grantedByUserId: 'user-1',
      mailboxAddress: 'support@example.test',
      organizationId: 'org-1',
      principalId: agentId,
      principalType: 'agent',
      status: 'active'
    })
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.account.created',
      metadata: {
        assignedAgentId: agentPublicId,
        capabilityCount: 2,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        wildDuckUserId: 'wildduck-user-1'
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
    expect(JSON.stringify(result)).not.toContain('password')
  })

  it('updates WildDuck mailbox account display names through the admin boundary', async () => {
    expect.hasAssertions()
    adminServiceTestState.resolveAddress.mockResolvedValue({ user: 'wildduck-user-1' })
    adminServiceTestState.updateUser.mockResolvedValue({ success: true })
    adminServiceTestState.getUser.mockResolvedValue({
      address: 'support@example.test',
      id: 'wildduck-user-1',
      name: 'Support Desk'
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { updateAgentMailAccountForWeb } = await import('./admin-service')
    const result = await updateAgentMailAccountForWeb({
      accountId: 'Support@Example.Test',
      headers: new Headers(),
      input: {
        address: 'support@example.test',
        name: 'Support Desk'
      }
    })

    expect(adminServiceTestState.abilityCan).toHaveBeenCalledWith(
      'update',
      expect.objectContaining({
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1'
      })
    )
    expect(adminServiceTestState.resolveAddress).toHaveBeenCalledWith('support@example.test')
    expect(adminServiceTestState.updateUser).toHaveBeenCalledWith('wildduck-user-1', {
      name: 'Support Desk'
    })
    expect(result).toStrictEqual({
      account: {
        accessCount: 0,
        address: 'support@example.test',
        agentName: undefined,
        domain: 'example.test',
        groups: [],
        id: 'support@example.test',
        lastActivity: 'No recent activity',
        name: 'Support Desk',
        status: 'active',
        type: 'mailbox'
      },
      success: true
    })
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.account.updated',
      metadata: {
        disabled: null,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1'
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
    expect(JSON.stringify(result)).not.toContain('password')
  })

  it('disables WildDuck mailbox accounts before they remain selectable in webmail', async () => {
    expect.hasAssertions()
    adminServiceTestState.resolveAddress.mockResolvedValue({ user: 'wildduck-user-1' })
    adminServiceTestState.updateUser.mockResolvedValue({ success: true })
    adminServiceTestState.getUser.mockResolvedValue({
      address: 'support@example.test',
      disabled: true,
      id: 'wildduck-user-1',
      name: 'Support Desk'
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { disableAgentMailAccountForWeb } = await import('./admin-service')
    const result = await disableAgentMailAccountForWeb({
      accountId: 'support@example.test',
      headers: new Headers()
    })

    expect(adminServiceTestState.updateUser).toHaveBeenCalledWith('wildduck-user-1', {
      disabled: true
    })
    expect(result.account).toMatchObject({
      address: 'support@example.test',
      name: 'Support Desk',
      status: 'disabled'
    })
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.account.updated',
      metadata: {
        disabled: true,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1'
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
  })

  it('rejects mailbox account management before WildDuck calls when the principal lacks account write authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockReturnValue(false)

    const { updateAgentMailAccountForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAccountForWeb({
        accountId: 'support@example.test',
        headers: new Headers(),
        input: {
          name: 'Support Desk'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account management is not authorized',
      status: 403
    })
    expect(adminServiceTestState.resolveAddress).not.toHaveBeenCalled()
    expect(adminServiceTestState.updateUser).not.toHaveBeenCalled()
  })

  it('does not treat mailbox account creation authority as mailbox account management authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockImplementation((action: string) => action === 'create')
    adminServiceTestState.resolveAddress.mockResolvedValue({ user: 'wildduck-user-1' })
    adminServiceTestState.updateUser.mockResolvedValue({ success: true })
    adminServiceTestState.getUser.mockResolvedValue({
      address: 'support@example.test',
      id: 'wildduck-user-1',
      name: 'Support Desk'
    })

    const { updateAgentMailAccountForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAccountForWeb({
        accountId: 'support@example.test',
        headers: new Headers(),
        input: {
          name: 'Support Desk'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account management is not authorized',
      status: 403
    })
    expect(adminServiceTestState.resolveAddress).not.toHaveBeenCalled()
    expect(adminServiceTestState.updateUser).not.toHaveBeenCalled()
  })

  it('does not treat message management authority as mailbox account management authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockImplementation((action: string) => action === 'manage')

    const { updateAgentMailAccountForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAccountForWeb({
        accountId: 'support@example.test',
        headers: new Headers(),
        input: {
          name: 'Support Desk'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account management is not authorized',
      status: 403
    })
    expect(adminServiceTestState.resolveAddress).not.toHaveBeenCalled()
    expect(adminServiceTestState.updateUser).not.toHaveBeenCalled()
  })

  it('rejects mailbox account creation before WildDuck calls when the principal lacks create authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockReturnValue(false)

    const { createAgentMailAccountForWeb } = await import('./admin-service')

    await expect(
      createAgentMailAccountForWeb({
        headers: new Headers(),
        input: {
          address: 'support@example.test',
          type: 'mailbox'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account creation is not authorized',
      status: 403
    })
    expect(adminServiceTestState.agentMailDomainFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(adminServiceTestState.createUser).not.toHaveBeenCalled()
  })

  it('runs the Paperclip provisioning operation guard before validating or provisioning accounts', async () => {
    expect.hasAssertions()
    adminServiceTestState.requireAgentMailPaperclipOperation.mockImplementationOnce(() => {
      throw Object.assign(new Error('Paperclip operation is not authorized'), { status: 403 })
    })

    const { createAgentMailAccountForWeb } = await import('./admin-service')

    await expect(
      createAgentMailAccountForWeb({
        headers: new Headers(),
        input: null
      })
    ).rejects.toMatchObject({
      message: 'Paperclip operation is not authorized',
      status: 403
    })
    expect(adminServiceTestState.requireAgentMailPaperclipOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1'
      }),
      'provision'
    )
    expect(adminServiceTestState.agentMailDomainFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(adminServiceTestState.createUser).not.toHaveBeenCalled()
  })

  it('does not treat account creation authority as Paperclip mailbox provisioning authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockImplementation((action: string) => action === 'create')
    adminServiceTestState.requireAgentMailOrganizationContext.mockResolvedValueOnce({
      ability: {
        can: adminServiceTestState.abilityCan
      },
      capabilityGrants: [],
      mailboxGrants: [],
      organizationId: 'org-1',
      paperclipContext: {
        agentId: 'paperclip-agent-1',
        companyId: 'paperclip-company-1',
        operation: 'provision',
        pluginId: 'agentteam.paperclip-email-plugin',
        projectId: 'paperclip-project-1',
        runId: 'paperclip-run-1'
      },
      principal: {
        credentialId: 'agent-1',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        userId: 'user-1'
      },
      systemGrants: [],
      userId: 'user-1'
    })

    const { createAgentMailAccountForWeb } = await import('./admin-service')

    await expect(
      createAgentMailAccountForWeb({
        headers: new Headers(),
        input: {
          address: 'support@example.test',
          type: 'mailbox'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox provisioning is not authorized',
      status: 403
    })
    expect(adminServiceTestState.agentMailDomainFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(adminServiceTestState.createUser).not.toHaveBeenCalled()
  })

  it('requires agent administration authority before assigning an agent to a created mailbox', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockImplementation((action: string) => action === 'create')

    const { createAgentMailAccountForWeb } = await import('./admin-service')

    await expect(
      createAgentMailAccountForWeb({
        headers: new Headers(),
        input: {
          address: 'support@example.test',
          agentId: 'agent-1',
          grants: ['readMailbox'],
          type: 'mailbox'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox administration access is not authorized',
      status: 403
    })
    expect(adminServiceTestState.agentMailDomainFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentFindById).not.toHaveBeenCalled()
    expect(adminServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(adminServiceTestState.createUser).not.toHaveBeenCalled()
  })

  it('provisions Paperclip mailboxes only with explicit mailbox provisioning authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockImplementation((action: string) => action === 'provision')
    adminServiceTestState.requireAgentMailOrganizationContext.mockResolvedValueOnce({
      ability: {
        can: adminServiceTestState.abilityCan
      },
      capabilityGrants: [],
      mailboxGrants: [],
      organizationId: 'org-1',
      paperclipContext: {
        agentId: 'paperclip-agent-1',
        companyId: 'paperclip-company-1',
        operation: 'provision',
        pluginId: 'agentteam.paperclip-email-plugin',
        projectId: 'paperclip-project-1',
        runId: 'paperclip-run-1'
      },
      principal: {
        credentialId: 'agent-1',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        userId: 'user-1'
      },
      systemGrants: [],
      userId: 'user-1'
    })
    const { WildDuckAPIError } = await import('./wildduck-client')
    adminServiceTestState.resolveAddress.mockRejectedValue(new WildDuckAPIError('not found', 404))
    adminServiceTestState.createUser.mockResolvedValue({
      id: 'wildduck-user-1',
      success: true
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { createAgentMailAccountForWeb } = await import('./admin-service')
    const result = await createAgentMailAccountForWeb({
      headers: new Headers(),
      input: {
        address: 'paperclip@example.test',
        name: 'Paperclip Mailbox',
        type: 'mailbox'
      }
    })

    expect(result.account).toMatchObject({
      accessCount: 0,
      address: 'paperclip@example.test',
      name: 'Paperclip Mailbox',
      status: 'active',
      type: 'mailbox'
    })
    expect(adminServiceTestState.createUser).toHaveBeenCalledWith({
      address: 'paperclip@example.test',
      allowUnsafe: true,
      name: 'Paperclip Mailbox',
      password: expect.any(String),
      spamLevel: 25,
      username: 'paperclip-at-example.test'
    })
    expect(JSON.stringify(result)).not.toContain('password')
  })

  it('rejects initial account agent grants before WildDuck mailbox creation when grant authority is missing', async () => {
    expect.hasAssertions()
    const agentId = '01960000-0000-7000-8000-000000000001'
    adminServiceTestState.abilityCan.mockImplementation((action: string, resource: unknown) => {
      const subject = resource as { __caslSubjectType__?: string }
      if (action === 'create' && subject.__caslSubjectType__ === 'Mailbox') {
        return true
      }
      if (action === 'manage' && subject.__caslSubjectType__ === 'Agent') {
        return true
      }
      return false
    })
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          name: 'Support Agent',
          status: 'active',
          userId: 'user-1'
        })
    })

    const { createAgentMailAccountForWeb } = await import('./admin-service')

    await expect(
      createAgentMailAccountForWeb({
        headers: new Headers(),
        input: {
          address: 'support@example.test',
          agentId: publicIdFromUUIDv7(agentId),
          grants: ['readMailbox'],
          type: 'mailbox'
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent grant management is not authorized',
      status: 403
    })
    expect(adminServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(adminServiceTestState.createUser).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantCreate).not.toHaveBeenCalled()
  })

  it('updates agent profile names through the CASL-gated admin boundary', async () => {
    expect.hasAssertions()
    const agentId = '01960000-0000-7000-8000-000000000001'
    const agentPublicId = publicIdFromUUIDv7(agentId)
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          lastUsedAt: null,
          name: 'Old Agent',
          status: 'active',
          updatedAt: new Date('2026-06-21T12:00:00.000Z'),
          userId: 'user-1'
        })
    })
    adminServiceTestState.agentUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 })
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { updateAgentMailAgentForWeb } = await import('./admin-service')
    const result = await updateAgentMailAgentForWeb({
      agentId: agentPublicId,
      headers: new Headers(),
      input: {
        name: 'Updated Agent'
      }
    })

    expect(adminServiceTestState.abilityCan).toHaveBeenCalledWith(
      'manage',
      expect.objectContaining({
        organizationId: 'org-1'
      })
    )
    expect(adminServiceTestState.agentUpdateOne).toHaveBeenCalledWith(
      { _id: agentId },
      {
        $set: {
          name: 'Updated Agent',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(result.agent).toMatchObject({
      handle: 'agent:01960000',
      id: agentPublicId,
      name: 'Updated Agent',
      status: 'active'
    })
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.agent.updated',
      metadata: {
        agentId,
        agentPublicId,
        organizationId: 'org-1'
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
  })

  it('does not update unrelated agent profiles without current organization evidence', async () => {
    expect.hasAssertions()
    const agentId = '01960000-0000-7000-8000-000000000001'
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          hostId: 'host-2',
          name: 'External Agent',
          status: 'active',
          userId: 'other-user'
        })
    })
    adminServiceTestState.agentHostFindById.mockReturnValue({
      exec: () => Promise.resolve({ _id: 'host-2', userId: 'other-user' })
    })

    const { updateAgentMailAgentForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAgentForWeb({
        agentId: publicIdFromUUIDv7(agentId),
        headers: new Headers(),
        input: {
          name: 'Updated Agent'
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent access was not found',
      status: 404
    })
    expect(adminServiceTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('creates pending Agent Auth host enrollment tokens through the CASL-gated admin boundary', async () => {
    expect.hasAssertions()
    const hostId = '01960000-0000-7000-8000-000000000010'
    adminServiceTestState.createHost.mockResolvedValue({
      default_capabilities: [],
      enrollmentToken: 'secret-enrollment-token',
      enrollmentTokenExpiresAt: new Date('2026-06-22T12:30:00.000Z'),
      hostId,
      status: 'pending_enrollment'
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})
    const headers = new Headers({ cookie: 'session=redacted' })
    const grantExpiresAt = '2099-01-01T00:00:00.000Z'

    const { createAgentMailAgentEnrollmentForWeb } = await import('./admin-service')
    const result = await createAgentMailAgentEnrollmentForWeb({
      headers,
      input: {
        grantExpiresAt,
        mailboxGrants: [
          {
            accountId: 'support@example.test',
            capabilities: ['readMailbox', 'sendAs']
          }
        ],
        name: ' Research Agent ',
        systemPermissions: ['manageForwardingGroups']
      }
    })

    expect(adminServiceTestState.abilityCan).toHaveBeenCalledWith(
      'manage',
      expect.objectContaining({
        organizationId: 'org-1'
      })
    )
    expect(adminServiceTestState.createHost).toHaveBeenCalledWith({
      body: {
        default_capabilities: [],
        name: 'Research Agent'
      },
      headers
    })
    expect(adminServiceTestState.agentMailAgentEnrollmentGrantRequestCreate).toHaveBeenCalledWith({
      grantExpiresAt: new Date(grantExpiresAt),
      hostId,
      mailboxGrants: [
        {
          capabilities: ['readMailbox', 'sendAs'],
          mailboxAddress: 'support@example.test'
        }
      ],
      name: 'Research Agent',
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      status: 'pending',
      systemPermissions: ['manageForwardingGroups']
    })
    expect(result).toStrictEqual({
      enrollment: {
        enrollmentToken: 'secret-enrollment-token',
        enrollmentTokenExpiresAt: '2026-06-22T12:30:00.000Z',
        grantExpiresAt,
        hostId,
        mailboxGrantCount: 2,
        name: 'Research Agent',
        status: 'pending_enrollment',
        systemPermissionCount: 1
      },
      success: true
    })
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.agent.enrollment.created',
      metadata: {
        defaultCapabilityCount: 0,
        enrollmentTokenExpiresAt: '2026-06-22T12:30:00.000Z',
        grantExpiresAt,
        hostId,
        mailboxGrantCount: 2,
        name: 'Research Agent',
        organizationId: 'org-1',
        status: 'pending_enrollment',
        systemPermissionCount: 1
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
    expect(JSON.stringify(adminServiceTestState.auditLogCreate.mock.calls)).not.toContain(
      'secret-enrollment-token'
    )
  })

  it('rejects agent enrollment before host creation when the principal lacks agent management authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockReturnValue(false)

    const { createAgentMailAgentEnrollmentForWeb } = await import('./admin-service')

    await expect(
      createAgentMailAgentEnrollmentForWeb({
        headers: new Headers(),
        input: {
          name: 'Research Agent'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox administration access is not authorized',
      status: 403
    })
    expect(adminServiceTestState.createHost).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('fails closed when Agent Auth host creation does not return an enrollment token', async () => {
    expect.hasAssertions()
    adminServiceTestState.createHost.mockResolvedValue({
      default_capabilities: [],
      hostId: 'host-1',
      status: 'active'
    })

    const { createAgentMailAgentEnrollmentForWeb } = await import('./admin-service')

    await expect(
      createAgentMailAgentEnrollmentForWeb({
        headers: new Headers(),
        input: {
          name: 'Research Agent'
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent enrollment token could not be created',
      status: 502
    })
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('revokes a pending Agent Auth host when enrollment grant request creation fails', async () => {
    expect.hasAssertions()
    const hostId = '01960000-0000-7000-8000-000000000020'
    adminServiceTestState.createHost.mockResolvedValue({
      default_capabilities: [],
      enrollmentToken: 'secret-enrollment-token',
      enrollmentTokenExpiresAt: new Date('2026-06-22T12:30:00.000Z'),
      hostId,
      status: 'pending_enrollment'
    })
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestCreate.mockRejectedValue(
      new Error('grant request write failed')
    )

    const { createAgentMailAgentEnrollmentForWeb } = await import('./admin-service')

    await expect(
      createAgentMailAgentEnrollmentForWeb({
        headers: new Headers(),
        input: {
          mailboxGrants: [
            {
              accountId: 'support@example.test',
              capabilities: ['readMailbox']
            }
          ],
          name: 'Research Agent'
        }
      })
    ).rejects.toThrow('grant request write failed')
    expect(adminServiceTestState.agentHostUpdateOne).toHaveBeenCalledWith(
      { _id: hostId, status: 'pending_enrollment' },
      {
        $set: {
          status: 'revoked',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
    expect(JSON.stringify(adminServiceTestState.agentHostUpdateOne.mock.calls)).not.toContain(
      'secret-enrollment-token'
    )
  })

  it('revokes pending persisted agent enrollments through the CASL-gated admin boundary', async () => {
    expect.hasAssertions()
    const requestId = '01960000-0000-7000-8000-000000000030'
    const hostId = '01960000-0000-7000-8000-000000000031'
    const enrollmentId = publicIdFromUUIDv7(requestId)
    const requestFindQuery = sessionQueryResolve({
      _id: requestId,
      grantExpiresAt: null,
      hostId,
      mailboxGrants: [
        {
          capabilities: ['readMailbox'],
          mailboxAddress: 'support@example.test'
        }
      ],
      name: 'Research Agent',
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      status: 'pending',
      systemPermissions: ['manageForwardingGroups']
    })
    const requestUpdateQuery = sessionQueryResolve({ matchedCount: 1 })
    const hostUpdateQuery = sessionQueryResolve({ matchedCount: 1 })
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReturnValue(requestFindQuery)
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestUpdateOne.mockReturnValue(requestUpdateQuery)
    adminServiceTestState.agentHostUpdateOne.mockReturnValue(hostUpdateQuery)

    const { revokeAgentMailAgentEnrollmentForWeb } = await import('./admin-service')
    const result = await revokeAgentMailAgentEnrollmentForWeb({
      enrollmentId,
      headers: new Headers()
    })

    expect(result).toStrictEqual({
      enrollmentId,
      hostId,
      status: 'revoked',
      success: true
    })
    expect(adminServiceTestState.transaction).toHaveBeenCalledTimes(1)
    expect(requestFindQuery.session).toHaveBeenCalledWith(adminServiceTransactionSession)
    expect(requestUpdateQuery.session).toHaveBeenCalledWith(adminServiceTransactionSession)
    expect(hostUpdateQuery.session).toHaveBeenCalledWith(adminServiceTransactionSession)
    expect(adminServiceTestState.agentMailAgentEnrollmentGrantRequestFindOne).toHaveBeenCalledWith({
      _id: requestId,
      organizationId: 'org-1',
      status: 'pending'
    })
    expect(adminServiceTestState.agentMailAgentEnrollmentGrantRequestUpdateOne).toHaveBeenCalledWith(
      { _id: requestId, status: 'pending' },
      {
        $set: {
          status: 'revoked',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(adminServiceTestState.agentHostUpdateOne).toHaveBeenCalledWith(
      { _id: hostId, status: 'pending_enrollment' },
      {
        $set: {
          status: 'revoked',
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith(
      [
        {
          action: 'agent_mail.agent.enrollment.revoked',
          metadata: {
            enrollmentId,
            hostId,
            organizationId: 'org-1'
          },
          severity: 'medium',
          status: 'success',
          userId: 'user-1'
        }
      ],
      { session: adminServiceTransactionSession }
    )
  })

  it('does not audit pending agent enrollment revocation when the host update fails', async () => {
    expect.hasAssertions()
    const requestId = '01960000-0000-7000-8000-000000000032'
    const hostId = '01960000-0000-7000-8000-000000000033'
    const enrollmentId = publicIdFromUUIDv7(requestId)
    const requestFindQuery = sessionQueryResolve({
      _id: requestId,
      grantExpiresAt: null,
      hostId,
      mailboxGrants: [
        {
          capabilities: ['readMailbox'],
          mailboxAddress: 'support@example.test'
        }
      ],
      name: 'Research Agent',
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      status: 'pending',
      systemPermissions: []
    })
    const requestUpdateQuery = sessionQueryResolve({ matchedCount: 1 })
    const hostUpdateQuery = sessionQueryReject(new Error('host revoke failed'))
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReturnValue(requestFindQuery)
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestUpdateOne.mockReturnValue(requestUpdateQuery)
    adminServiceTestState.agentHostUpdateOne.mockReturnValue(hostUpdateQuery)

    const { revokeAgentMailAgentEnrollmentForWeb } = await import('./admin-service')
    await expect(
      revokeAgentMailAgentEnrollmentForWeb({
        enrollmentId,
        headers: new Headers()
      })
    ).rejects.toThrow('host revoke failed')

    expect(adminServiceTestState.transaction).toHaveBeenCalledTimes(1)
    expect(requestFindQuery.session).toHaveBeenCalledWith(adminServiceTransactionSession)
    expect(requestUpdateQuery.session).toHaveBeenCalledWith(adminServiceTransactionSession)
    expect(hostUpdateQuery.session).toHaveBeenCalledWith(adminServiceTransactionSession)
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('does not audit pending agent enrollment revocation when the pending request claim fails', async () => {
    expect.hasAssertions()
    const requestId = '01960000-0000-7000-8000-000000000034'
    const hostId = '01960000-0000-7000-8000-000000000035'
    const enrollmentId = publicIdFromUUIDv7(requestId)
    const requestFindQuery = sessionQueryResolve({
      _id: requestId,
      grantExpiresAt: null,
      hostId,
      mailboxGrants: [],
      name: 'Research Agent',
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      status: 'pending',
      systemPermissions: ['manageForwardingGroups']
    })
    const requestUpdateQuery = sessionQueryResolve({ matchedCount: 0 })
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReturnValue(requestFindQuery)
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestUpdateOne.mockReturnValue(requestUpdateQuery)

    const { revokeAgentMailAgentEnrollmentForWeb } = await import('./admin-service')
    await expect(
      revokeAgentMailAgentEnrollmentForWeb({
        enrollmentId,
        headers: new Headers()
      })
    ).rejects.toThrow('Agent enrollment was not found')

    expect(adminServiceTestState.transaction).toHaveBeenCalledTimes(1)
    expect(requestFindQuery.session).toHaveBeenCalledWith(adminServiceTransactionSession)
    expect(requestUpdateQuery.session).toHaveBeenCalledWith(adminServiceTransactionSession)
    expect(adminServiceTestState.agentHostUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('rejects pending agent enrollment revocation without exact CASL grant authority before mutation', async () => {
    expect.hasAssertions()
    const requestId = '01960000-0000-7000-8000-000000000036'
    const hostId = '01960000-0000-7000-8000-000000000037'
    const enrollmentId = publicIdFromUUIDv7(requestId)
    const requestFindQuery = sessionQueryResolve({
      _id: requestId,
      grantExpiresAt: null,
      hostId,
      mailboxGrants: [
        {
          capabilities: ['sendAs'],
          mailboxAddress: 'support@example.test'
        }
      ],
      name: 'Research Agent',
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      status: 'pending',
      systemPermissions: []
    })
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReturnValue(requestFindQuery)
    adminServiceTestState.abilityCan
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValue(false)

    const { revokeAgentMailAgentEnrollmentForWeb } = await import('./admin-service')
    await expect(
      revokeAgentMailAgentEnrollmentForWeb({
        enrollmentId,
        headers: new Headers()
      })
    ).rejects.toMatchObject({
      message: 'Agent grant management is not authorized',
      status: 403
    })

    expect(requestFindQuery.session).toHaveBeenCalledWith(adminServiceTransactionSession)
    expect(adminServiceTestState.agentMailAgentEnrollmentGrantRequestUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentHostUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('rejects mailbox account addresses outside active organization mail domains before WildDuck calls', async () => {
    expect.hasAssertions()

    const { createAgentMailAccountForWeb } = await import('./admin-service')

    await expect(
      createAgentMailAccountForWeb({
        headers: new Headers(),
        input: {
          address: 'support@example.net',
          type: 'mailbox'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account address must belong to an active mail domain',
      status: 400
    })
    expect(adminServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(adminServiceTestState.createUser).not.toHaveBeenCalled()
  })

  it('rejects forwarding group recipients outside active organization mail domains before WildDuck calls', async () => {
    expect.hasAssertions()

    const { createAgentMailForwardingGroupForWeb } = await import('./admin-service')

    await expect(
      createAgentMailForwardingGroupForWeb({
        headers: new Headers(),
        input: {
          address: 'support@example.test',
          recipients: ['external@example.net']
        }
      })
    ).rejects.toMatchObject({
      message: 'Forwarding group recipient must belong to an active mail domain',
      status: 400
    })
    expect(adminServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailForwardingGroupCreate).not.toHaveBeenCalled()
  })

  it('rejects mailbox administration before querying grant data when the principal lacks section authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockReturnValue(false)

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')

    await expect(
      getAgentMailAdminViewForWeb({
        headers: new Headers(),
        section: 'accounts'
      })
    ).rejects.toMatchObject({
      message: 'Mailbox administration access is not authorized',
      status: 403
    })
    expect(adminServiceTestState.getAgentMailAccountsForWeb).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailForwardingGroupFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailSystemGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentFind).not.toHaveBeenCalled()
  })

  it('returns empty mailbox admin navigation without loading admin collections when no sections are allowed', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockReturnValue(false)

    const { getAgentMailAdminNavigationForWeb } = await import('./admin-service')

    await expect(
      getAgentMailAdminNavigationForWeb({
        headers: new Headers()
      })
    ).resolves.toStrictEqual({
      allowedSections: []
    })
    expect(adminServiceTestState.getAgentMailAccountsForWeb).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailForwardingGroupFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailSystemGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentFind).not.toHaveBeenCalled()
  })

  it('derives mailbox admin navigation from backend CASL section access', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockImplementation((action: string, resource: unknown) => {
      const subject = resource as { __caslSubjectType__?: string }
      return action === 'manage' && subject.__caslSubjectType__ === 'ForwardingGroup'
    })

    const { getAgentMailAdminNavigationForWeb } = await import('./admin-service')

    await expect(
      getAgentMailAdminNavigationForWeb({
        headers: new Headers()
      })
    ).resolves.toStrictEqual({
      allowedSections: ['groups']
    })
  })

  it('does not treat mailbox creation authority as account listing authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockImplementation((action: string) => action === 'create')
    adminServiceTestState.agentMailDomainFindOne.mockReturnValue({
      exec: () => Promise.resolve({ domain: 'example.test' })
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')

    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers(),
      section: 'accounts'
    })

    expect(view).toMatchObject({
      accounts: [],
      allowedActions: {
        createAccount: true,
        disableAccount: false,
        updateAccount: false
      },
      allowedSections: ['accounts'],
      domain: 'example.test',
      section: 'accounts',
      state: 'empty'
    })
    expect(adminServiceTestState.getAgentMailAccountsForWeb).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailForwardingGroupFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailSystemGrantFind).not.toHaveBeenCalled()
  })

  it('loads mailbox account summaries for broad agent grant management without mailbox read authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockImplementation((action: string, resource: unknown) => {
      const subject = resource as { __caslSubjectType__?: string }
      return (
        (action === 'manage' &&
          (subject.__caslSubjectType__ === 'Agent' || subject.__caslSubjectType__ === 'AgentGrant')) ||
        (action === 'provision' && subject.__caslSubjectType__ === 'Mailbox')
      )
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')

    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers()
    })

    expect(view).toMatchObject({
      accounts: [
        {
          address: 'support@example.test',
          id: 'support@example.test',
          name: 'Support'
        }
      ],
      allowedActions: {
        createAccount: false,
        createAgent: true,
        manageAgentMailboxGrants: true,
        manageAgentSystemPermissions: true,
        provisionAccount: true
      },
      allowedSections: ['agents'],
      section: 'agents'
    })
    expect(adminServiceTestState.getAgentMailAccountsForWeb).toHaveBeenCalledWith(expect.any(Headers), {
      includeDisabled: true
    })
    expect(adminServiceTestState.agentMailMailboxGrantFind).toHaveBeenCalledWith({ organizationId: 'org-1' })
  })

  it('derives scoped grant-management actions from concrete CASL AgentGrant subjects', async () => {
    expect.hasAssertions()
    const organizationId = 'org-1' as OrganizationId
    const userId = 'user-1' as UserId
    const principal: AgentMailPrincipal = {
      credentialId: 'session-1',
      organizationId,
      principalId: userId,
      principalType: 'user_session',
      userId
    }
    const grantedAt = new Date('2026-06-22T12:00:00.000Z')
    const mailboxGrant = {
      _id: '01960000-0000-7000-8000-000000000101' as AgentMailMailboxGrantId,
      capability: 'readMailbox',
      constraints: null,
      createdAt: grantedAt,
      expiresAt: null,
      mailboxAddress: 'support@example.test',
      organizationId,
      principalId: userId,
      principalType: 'user_session',
      status: 'active',
      updatedAt: grantedAt
    } as AgentMailMailboxGrantDocument
    const systemGrant = {
      _id: '01960000-0000-7000-8000-000000000102' as AgentMailSystemGrantId,
      constraints: null,
      createdAt: grantedAt,
      expiresAt: null,
      organizationId,
      permission: 'manageAgents',
      principalId: userId,
      principalType: 'user_session',
      status: 'active',
      updatedAt: grantedAt
    } as AgentMailSystemGrantDocument

    adminServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: buildAgentMailAbility({
        mailboxGrants: [mailboxGrant],
        principal,
        systemGrants: [systemGrant]
      }),
      capabilityGrants: [],
      mailboxGrants: [mailboxGrant],
      organizationId,
      principal,
      systemGrants: [systemGrant],
      userId
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')

    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers()
    })

    expect(view).toMatchObject({
      accounts: [
        {
          address: 'support@example.test',
          id: 'support@example.test',
          name: 'Support'
        }
      ],
      allowedActions: {
        createAgent: true,
        manageAgentMailboxGrants: true,
        manageAgentSystemPermissions: true,
        revokeAgent: true
      },
      allowedSections: ['agents'],
      section: 'agents'
    })
    expect(adminServiceTestState.getAgentMailAccountsForWeb).toHaveBeenCalledWith(expect.any(Headers), {
      includeDisabled: true
    })
  })

  it('lists pending agent enrollments from persisted grant requests without returning enrollment tokens', async () => {
    expect.hasAssertions()
    const requestId = '01960000-0000-7000-8000-000000000120'
    const hostId = '01960000-0000-7000-8000-000000000121'
    const requestPublicId = publicIdFromUUIDv7(requestId)
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: requestId,
            createdAt: new Date('2026-06-22T10:00:00.000Z'),
            grantExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
            hostId,
            mailboxGrants: [
              {
                capabilities: ['readMailbox', 'sendAs', 'readMailbox'],
                mailboxAddress: 'support@example.test'
              }
            ],
            name: 'Research Agent',
            organizationId: 'org-1',
            requestedByUserId: 'user-1',
            status: 'pending',
            systemPermissions: ['manageForwardingGroups'],
            updatedAt: new Date('2026-06-22T11:00:00.000Z')
          }
        ])
    })
    adminServiceTestState.agentHostFind.mockReturnValue(
      chainedFindResolve([
        {
          _id: hostId,
          enrollmentTokenExpiresAt: new Date('2026-06-22T12:30:00.000Z')
        }
      ])
    )

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')

    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers(),
      section: 'agents',
      statusFilter: 'pending'
    })

    expect(view.pendingEnrollments).toStrictEqual([
      {
        canRevoke: true,
        createdAt: '2026-06-22',
        grantExpiresAt: '2099-01-01T00:00:00.000Z',
        grants: [
          {
            accountAddress: 'support@example.test',
            accountId: 'support@example.test',
            capabilities: ['readMailbox', 'sendAs']
          }
        ],
        hostId,
        id: requestPublicId,
        lastUpdated: '2026-06-22',
        mailboxGrantCount: 2,
        name: 'Research Agent',
        permissions: ['manageForwardingGroups'],
        status: 'pending',
        systemPermissionCount: 1,
        tokenExpiresAt: '2026-06-22T12:30:00.000Z'
      }
    ])
    expect(view.pagination).toMatchObject({
      filteredRecords: 1,
      totalRecords: 1
    })
    expect(JSON.stringify(view)).not.toContain('secret-enrollment-token')
    expect(JSON.stringify(view)).not.toContain('enrollmentTokenHash')
  })

  it('marks pending enrollments non-revocable when requested grants exceed the principal ability', async () => {
    expect.hasAssertions()

    const hostId = '01960000-0000-7000-8000-000000000020'
    const requestId = '01960000-0000-7000-8000-000000000021'
    const requestPublicId = publicIdFromUUIDv7(requestId)
    adminServiceTestState.abilityCan.mockImplementation((action: string, resource: unknown) => {
      const subject = resource as { capability?: string; __caslSubjectType__?: string }
      if (action === 'manage' && subject.__caslSubjectType__ === 'Agent') {
        return true
      }
      return (
        action === 'manage' &&
        subject.__caslSubjectType__ === 'AgentGrant' &&
        subject.capability !== 'email.message.send'
      )
    })
    adminServiceTestState.agentMailAgentEnrollmentGrantRequestFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: requestId,
            createdAt: new Date('2026-06-22T10:00:00.000Z'),
            grantExpiresAt: null,
            hostId,
            mailboxGrants: [
              {
                capabilities: ['readMailbox', 'sendAs'],
                mailboxAddress: 'support@example.test'
              }
            ],
            name: 'Limited Agent',
            organizationId: 'org-1',
            requestedByUserId: 'user-1',
            status: 'pending',
            systemPermissions: [],
            updatedAt: new Date('2026-06-22T11:00:00.000Z')
          }
        ])
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')

    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers(),
      section: 'agents',
      statusFilter: 'pending'
    })

    expect(view.pendingEnrollments).toStrictEqual([
      expect.objectContaining({
        canRevoke: false,
        id: requestPublicId,
        name: 'Limited Agent'
      })
    ])
  })

  it('returns only admin sections authorized for the principal', async () => {
    expect.hasAssertions()
    const groupId = '01960000-0000-7000-8000-000000000003'
    const groupPublicId = publicIdFromUUIDv7(groupId)
    adminServiceTestState.abilityCan.mockImplementation((action: string, resource: unknown) => {
      const subject = resource as { __caslSubjectType__?: string }
      return action === 'manage' && subject.__caslSubjectType__ === 'ForwardingGroup'
    })
    adminServiceTestState.agentMailForwardingGroupFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: groupId,
            address: 'support@example.test',
            description: 'Support queue',
            lastDeliveredAt: null,
            organizationId: 'org-1',
            recipients: ['triage@example.test'],
            status: 'active',
            updatedAt: new Date('2026-06-22T10:10:00.000Z')
          }
        ])
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')
    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers(),
      section: 'groups'
    })

    expect(view).toStrictEqual({
      accounts: [],
      agents: [],
      allowedActions: {
        createAccount: false,
        createAgent: false,
        createGroup: true,
        disableAccount: false,
        disableGroup: true,
        manageAgentMailboxGrants: false,
        manageAgentSystemPermissions: false,
        provisionAccount: false,
        revokeAgent: false,
        updateAccount: false,
        updateAgent: false,
        updateGroup: true
      },
      allowedSections: ['groups'],
      domain: 'example.test',
      groups: [
        {
          address: 'support@example.test',
          description: 'Support queue',
          domain: 'example.test',
          id: groupPublicId,
          lastDelivered: 'Never',
          lastUpdated: '2026-06-22',
          recipients: ['triage@example.test'],
          status: 'active'
        }
      ],
      pagination: {
        filteredRecords: 1,
        page: 1,
        pageSize: 25,
        totalRecords: 1
      },
      permissionCatalog: agentMailAdminPermissionCatalog,
      pendingEnrollments: [],
      principals: [],
      searchQuery: '',
      section: 'groups',
      state: 'ready',
      statusFilter: 'all'
    })
    expect(adminServiceTestState.getAgentMailAccountsForWeb).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailSystemGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentFind).not.toHaveBeenCalled()
  })

  it('discovers the first authorized mailbox admin section when no section is requested', async () => {
    expect.hasAssertions()
    const groupId = '01960000-0000-7000-8000-000000000004'
    adminServiceTestState.abilityCan.mockImplementation((action: string, resource: unknown) => {
      const subject = resource as { __caslSubjectType__?: string }
      return action === 'manage' && subject.__caslSubjectType__ === 'ForwardingGroup'
    })
    adminServiceTestState.agentMailForwardingGroupFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: groupId,
            address: 'support@example.test',
            description: 'Support queue',
            lastDeliveredAt: null,
            organizationId: 'org-1',
            recipients: ['triage@example.test'],
            status: 'active',
            updatedAt: new Date('2026-06-22T10:10:00.000Z')
          }
        ])
    })

    const { getAgentMailAdminViewForWeb } = await import('./admin-service')
    const view = await getAgentMailAdminViewForWeb({
      headers: new Headers()
    })

    expect(view).toMatchObject({
      accounts: [],
      agents: [],
      allowedSections: ['groups'],
      groups: [
        {
          address: 'support@example.test',
          id: publicIdFromUUIDv7(groupId)
        }
      ],
      section: 'groups',
      state: 'ready'
    })
    expect(adminServiceTestState.getAgentMailAccountsForWeb).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailSystemGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentFind).not.toHaveBeenCalled()
  })

  it('updates agent system permissions by upserting desired grants and revoking stale grants', async () => {
    expect.hasAssertions()

    const agentId = '01960000-0000-7000-8000-000000000001'
    const agentPublicId = publicIdFromUUIDv7(agentId)
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          lastUsedAt: new Date('2026-06-22T12:00:00.000Z'),
          name: 'Support Agent',
          status: 'active',
          updatedAt: new Date('2026-06-21T12:00:00.000Z'),
          userId: 'user-1'
        })
    })
    adminServiceTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: 'system-grant-stale',
            organizationId: 'org-1',
            permission: 'readAllMailboxes',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          },
          {
            _id: 'system-grant-keep',
            organizationId: 'org-1',
            permission: 'manageForwardingGroups',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentMailSystemGrantUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1, upsertedCount: 0 })
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { updateAgentMailAgentSystemPermissionsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAgentSystemPermissionsForWeb({
        agentId: agentPublicId,
        headers: new Headers(),
        input: {
          permissions: ['manageAgents', 'manageForwardingGroups']
        }
      })
    ).resolves.toStrictEqual({
      agent: {
        grants: [],
        groups: [],
        handle: 'agent:01960000',
        id: agentPublicId,
        lastSeen: '2026-06-22',
        name: 'Support Agent',
        permissions: ['manageAgents', 'manageForwardingGroups'],
        primaryAccount: undefined,
        status: 'active'
      },
      success: true
    })
    expect(adminServiceTestState.agentMailSystemGrantUpdateOne).toHaveBeenCalledWith(
      { _id: 'system-grant-stale' },
      { $set: { status: 'revoked', updatedAt: expect.any(Date) } }
    )
    expect(adminServiceTestState.agentMailSystemGrantUpdateOne).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        permission: 'manageAgents',
        principalId: agentId,
        principalType: 'agent'
      },
      {
        $set: {
          constraints: null,
          expiresAt: null,
          grantedByUserId: 'user-1',
          status: 'active',
          updatedAt: expect.any(Date)
        },
        $setOnInsert: {
          createdAt: expect.any(Date),
          organizationId: 'org-1',
          permission: 'manageAgents',
          principalId: agentId,
          principalType: 'agent'
        }
      },
      { upsert: true }
    )
    expect(adminServiceTestState.agentMailSystemGrantUpdateOne).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        permission: 'manageForwardingGroups',
        principalId: agentId,
        principalType: 'agent'
      },
      expect.any(Object),
      { upsert: true }
    )
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.agent.system_permissions.updated',
      metadata: {
        agentId,
        agentPublicId,
        organizationId: 'org-1',
        permissionCount: 2,
        revokedPermissionCount: 1
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
  })

  it('rejects agent system permission updates before grant writes when the principal lacks agent management authority', async () => {
    expect.hasAssertions()
    adminServiceTestState.abilityCan.mockReturnValue(false)

    const { updateAgentMailAgentSystemPermissionsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAgentSystemPermissionsForWeb({
        agentId: publicIdFromUUIDv7('01960000-0000-7000-8000-000000000001'),
        headers: new Headers(),
        input: {
          permissions: ['manageAgents']
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox administration access is not authorized',
      status: 403
    })
    expect(adminServiceTestState.agentFindById).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailSystemGrantUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('rejects agent system permission updates before grant writes when the principal lacks grant authority', async () => {
    expect.hasAssertions()
    const agentId = '01960000-0000-7000-8000-000000000001'
    adminServiceTestState.abilityCan.mockImplementation((action: string, resource: unknown) => {
      const subject = resource as { __caslSubjectType__?: string }
      return action === 'manage' && subject.__caslSubjectType__ === 'Agent'
    })
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          name: 'Support Agent',
          status: 'active',
          userId: 'user-1'
        })
    })

    const { updateAgentMailAgentSystemPermissionsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAgentSystemPermissionsForWeb({
        agentId: publicIdFromUUIDv7(agentId),
        headers: new Headers(),
        input: {
          permissions: ['manageAgents']
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent grant management is not authorized',
      status: 403
    })
    expect(adminServiceTestState.agentMailSystemGrantUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('updates agent mailbox grants by upserting desired grants and revoking stale grants', async () => {
    expect.hasAssertions()

    const agentId = '01960000-0000-7000-8000-000000000001'
    const agentPublicId = publicIdFromUUIDv7(agentId)
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          lastUsedAt: new Date('2026-06-22T12:00:00.000Z'),
          name: 'Support Agent',
          status: 'active',
          updatedAt: new Date('2026-06-21T12:00:00.000Z'),
          userId: 'user-1'
        })
    })
    adminServiceTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: 'mailbox-grant-stale',
            capability: 'manageMessages',
            mailboxAddress: 'old@example.test',
            organizationId: 'org-1',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          },
          {
            _id: 'mailbox-grant-keep',
            capability: 'readMailbox',
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentMailMailboxGrantUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1, upsertedCount: 0 })
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { updateAgentMailAgentMailboxGrantsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAgentMailboxGrantsForWeb({
        agentId: agentPublicId,
        headers: new Headers(),
        input: {
          grants: [
            {
              accountId: 'support@example.test',
              capabilities: ['readMailbox', 'sendAs']
            }
          ]
        }
      })
    ).resolves.toMatchObject({
      agent: {
        grants: [
          {
            accountAddress: 'support@example.test',
            accountId: 'support@example.test',
            capabilities: ['readMailbox', 'sendAs']
          }
        ],
        handle: 'agent:01960000',
        id: agentPublicId,
        name: 'Support Agent',
        permissions: [],
        primaryAccount: 'support@example.test',
        status: 'active'
      },
      success: true
    })
    expect(adminServiceTestState.agentMailMailboxGrantUpdateOne).toHaveBeenCalledWith(
      { _id: 'mailbox-grant-stale' },
      { $set: { status: 'revoked', updatedAt: expect.any(Date) } }
    )
    expect(adminServiceTestState.agentMailMailboxGrantUpdateOne).toHaveBeenCalledWith(
      {
        capability: 'sendAs',
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: agentId,
        principalType: 'agent'
      },
      {
        $set: {
          constraints: null,
          expiresAt: null,
          grantedByUserId: 'user-1',
          status: 'active',
          updatedAt: expect.any(Date)
        },
        $setOnInsert: {
          capability: 'sendAs',
          createdAt: expect.any(Date),
          mailboxAddress: 'support@example.test',
          organizationId: 'org-1',
          principalId: agentId,
          principalType: 'agent'
        }
      },
      { upsert: true }
    )
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.agent.mailbox_grants.updated',
      metadata: {
        agentId,
        agentPublicId,
        grantCount: 2,
        mailboxCount: 1,
        organizationId: 'org-1',
        revokedGrantCount: 1
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
  })

  it('rejects agent mailbox grants outside active organization mail domains before grant writes', async () => {
    expect.hasAssertions()

    const agentId = '01960000-0000-7000-8000-000000000001'
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          name: 'Support Agent',
          status: 'active',
          userId: 'user-1'
        })
    })

    const { updateAgentMailAgentMailboxGrantsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAgentMailboxGrantsForWeb({
        agentId: publicIdFromUUIDv7(agentId),
        headers: new Headers(),
        input: {
          grants: [
            {
              accountId: 'support@example.net',
              capabilities: ['readMailbox']
            }
          ]
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account address must belong to an active mail domain',
      status: 400
    })
    expect(adminServiceTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('updates API key mailbox grants with exact CASL-gated principal grant writes', async () => {
    expect.hasAssertions()

    const apiKeyId = '01960000-0000-7000-8000-000000000004'
    const apiKeyPublicId = publicIdFromUUIDv7(apiKeyId)
    adminServiceTestState.apikeyFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: apiKeyId,
          configId: 'organization',
          enabled: true,
          expiresAt: null,
          referenceId: 'org-1'
        })
    })
    adminServiceTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: 'api-key-stale-grant',
            capability: 'manageMessages',
            mailboxAddress: 'old@example.test',
            organizationId: 'org-1',
            principalId: apiKeyId,
            principalType: 'api_key',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentMailMailboxGrantUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1, upsertedCount: 0 })
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { updateAgentMailPrincipalMailboxGrantsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailPrincipalMailboxGrantsForWeb({
        headers: new Headers(),
        input: {
          grants: [
            {
              accountId: 'support@example.test',
              capabilities: ['readMailbox', 'sendAs']
            }
          ]
        },
        principalId: apiKeyPublicId,
        principalType: 'api_key'
      })
    ).resolves.toStrictEqual({
      grants: [
        {
          accountAddress: 'support@example.test',
          accountId: 'support@example.test',
          capabilities: ['readMailbox', 'sendAs']
        }
      ],
      principalId: apiKeyPublicId,
      principalType: 'api_key',
      revokedGrantCount: 1,
      success: true
    })
    expect(adminServiceTestState.apikeyFindById).toHaveBeenCalledWith(apiKeyId, expectedAdminApiKeyProjection)
    expect(adminServiceTestState.apikeyFindById.mock.calls[0]?.[1]).not.toHaveProperty('key')
    expect(adminServiceTestState.agentMailMailboxGrantUpdateOne).toHaveBeenCalledWith(
      { _id: 'api-key-stale-grant' },
      { $set: { status: 'revoked', updatedAt: expect.any(Date) } }
    )
    expect(adminServiceTestState.agentMailMailboxGrantUpdateOne).toHaveBeenCalledWith(
      {
        capability: 'sendAs',
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: apiKeyId,
        principalType: 'api_key'
      },
      {
        $set: {
          constraints: null,
          expiresAt: null,
          grantedByUserId: 'user-1',
          status: 'active',
          updatedAt: expect.any(Date)
        },
        $setOnInsert: {
          capability: 'sendAs',
          createdAt: expect.any(Date),
          mailboxAddress: 'support@example.test',
          organizationId: 'org-1',
          principalId: apiKeyId,
          principalType: 'api_key'
        }
      },
      { upsert: true }
    )
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.principal.mailbox_grants.updated',
      metadata: {
        grantCount: 2,
        mailboxCount: 1,
        organizationId: 'org-1',
        principalId: apiKeyId,
        principalPublicId: apiKeyPublicId,
        principalType: 'api_key',
        revokedGrantCount: 1
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
  })

  it('updates OAuth client system permissions with exact CASL-gated principal grant writes', async () => {
    expect.hasAssertions()

    adminServiceTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'paperclip-client',
          disabled: false,
          referenceId: 'org-1'
        })
    })
    adminServiceTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: 'oauth-stale-permission',
            organizationId: 'org-1',
            permission: 'readAllMailboxes',
            principalId: 'paperclip-client',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentMailSystemGrantUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1, upsertedCount: 0 })
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { updateAgentMailPrincipalSystemPermissionsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailPrincipalSystemPermissionsForWeb({
        headers: new Headers(),
        input: {
          permissions: ['manageForwardingGroups']
        },
        principalId: 'paperclip-client',
        principalType: 'oauth_client'
      })
    ).resolves.toStrictEqual({
      permissions: ['manageForwardingGroups'],
      principalId: 'paperclip-client',
      principalType: 'oauth_client',
      revokedPermissionCount: 1,
      success: true
    })
    expect(adminServiceTestState.oauthClientFindOne).toHaveBeenCalledWith(
      { clientId: 'paperclip-client' },
      expectedAdminOAuthClientProjection
    )
    expect(adminServiceTestState.oauthClientFindOne.mock.calls[0]?.[1]).not.toHaveProperty('clientSecret')
    expect(adminServiceTestState.agentMailSystemGrantUpdateOne).toHaveBeenCalledWith(
      { _id: 'oauth-stale-permission' },
      { $set: { status: 'revoked', updatedAt: expect.any(Date) } }
    )
    expect(adminServiceTestState.agentMailSystemGrantUpdateOne).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        permission: 'manageForwardingGroups',
        principalId: 'paperclip-client',
        principalType: 'oauth_client'
      },
      {
        $set: {
          constraints: null,
          expiresAt: null,
          grantedByUserId: 'user-1',
          status: 'active',
          updatedAt: expect.any(Date)
        },
        $setOnInsert: {
          createdAt: expect.any(Date),
          organizationId: 'org-1',
          permission: 'manageForwardingGroups',
          principalId: 'paperclip-client',
          principalType: 'oauth_client'
        }
      },
      { upsert: true }
    )
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.principal.system_permissions.updated',
      metadata: {
        organizationId: 'org-1',
        permissionCount: 1,
        principalId: 'paperclip-client',
        principalPublicId: 'paperclip-client',
        principalType: 'oauth_client',
        revokedPermissionCount: 1
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
  })

  it('rejects OAuth client principal grants when the client is not bound to the active organization or user', async () => {
    expect.hasAssertions()

    adminServiceTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'global-oauth-client',
          disabled: false,
          referenceId: null,
          userId: null
        })
    })

    const { updateAgentMailPrincipalSystemPermissionsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailPrincipalSystemPermissionsForWeb({
        headers: new Headers(),
        input: {
          permissions: ['readAllMailboxes']
        },
        principalId: 'global-oauth-client',
        principalType: 'oauth_client'
      })
    ).rejects.toMatchObject({
      message: 'Grant principal was not found',
      status: 404
    })
    expect(adminServiceTestState.agentMailSystemGrantUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('rejects external principal grants before writes when exact grant authority is missing', async () => {
    expect.hasAssertions()

    const apiKeyId = '01960000-0000-7000-8000-000000000005'
    const apiKeyPublicId = publicIdFromUUIDv7(apiKeyId)
    adminServiceTestState.abilityCan.mockImplementation((action: string, resource: unknown) => {
      const subject = resource as { __caslSubjectType__?: string }
      return action === 'manage' && subject.__caslSubjectType__ === 'Agent'
    })
    adminServiceTestState.apikeyFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: apiKeyId,
          configId: 'organization',
          enabled: true,
          expiresAt: null,
          referenceId: 'org-1'
        })
    })

    const { updateAgentMailPrincipalMailboxGrantsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailPrincipalMailboxGrantsForWeb({
        headers: new Headers(),
        input: {
          grants: [
            {
              accountId: 'support@example.test',
              capabilities: ['sendAs']
            }
          ]
        },
        principalId: apiKeyPublicId,
        principalType: 'api_key'
      })
    ).rejects.toMatchObject({
      message: 'Agent grant management is not authorized',
      status: 403
    })
    expect(adminServiceTestState.agentMailMailboxGrantUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('rejects raw API key UUID principal ids before lookup or grant writes', async () => {
    expect.hasAssertions()

    const apiKeyId = '01960000-0000-7000-8000-000000000006'
    const { updateAgentMailPrincipalMailboxGrantsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailPrincipalMailboxGrantsForWeb({
        headers: new Headers(),
        input: {
          grants: [
            {
              accountId: 'support@example.test',
              capabilities: ['readMailbox']
            }
          ]
        },
        principalId: apiKeyId,
        principalType: 'api_key'
      })
    ).rejects.toMatchObject({
      message: 'API key id is invalid',
      status: 400
    })
    expect(adminServiceTestState.apikeyFindById).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('does not write mailbox grants for unrelated agents without current organization evidence', async () => {
    expect.hasAssertions()
    const agentId = '01960000-0000-7000-8000-000000000001'
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          hostId: 'host-2',
          name: 'External Agent',
          status: 'active',
          userId: 'other-user'
        })
    })
    adminServiceTestState.agentHostFindById.mockReturnValue({
      exec: () => Promise.resolve({ _id: 'host-2', userId: 'other-user' })
    })

    const { updateAgentMailAgentMailboxGrantsForWeb } = await import('./admin-service')

    await expect(
      updateAgentMailAgentMailboxGrantsForWeb({
        agentId: publicIdFromUUIDv7(agentId),
        headers: new Headers(),
        input: {
          grants: [
            {
              accountId: 'support@example.test',
              capabilities: ['readMailbox']
            }
          ]
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent access was not found',
      status: 404
    })
    expect(adminServiceTestState.agentMailDomainFind).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailMailboxGrantUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('revokes organization-scoped agent grants without disabling agents that still have other access', async () => {
    expect.hasAssertions()

    const agentId = '01960000-0000-7000-8000-000000000001'
    const agentPublicId = publicIdFromUUIDv7(agentId)
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          name: 'Support Agent',
          status: 'active'
        })
    })
    adminServiceTestState.agentMailMailboxGrantUpdateMany.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 2 })
    })
    adminServiceTestState.agentMailSystemGrantUpdateMany.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 })
    })
    adminServiceTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            organizationId: 'org-1',
            permission: 'manageAgents',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: 'capability-grant-1',
            agentId,
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'support@example.test',
              organizationId: 'org-1'
            },
            expiresAt: null,
            status: 'active'
          },
          {
            _id: 'capability-grant-pending',
            agentId,
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'support@example.test',
              organizationId: 'org-1'
            },
            expiresAt: null,
            status: 'pending'
          },
          {
            _id: 'capability-grant-2',
            agentId,
            capability: 'email.message.read',
            constraints: {
              mailboxAddress: 'support@other.test',
              organizationId: 'org-2'
            },
            expiresAt: null,
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentCapabilityGrantUpdateMany.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 2 })
    })
    adminServiceTestState.agentUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 })
    })
    adminServiceTestState.auditLogCreate.mockResolvedValue({})

    const { revokeAgentMailAgentForWeb } = await import('./admin-service')

    await expect(
      revokeAgentMailAgentForWeb({
        agentId: agentPublicId,
        headers: new Headers()
      })
    ).resolves.toStrictEqual({
      agentId: agentPublicId,
      revokedCapabilityGrantCount: 2,
      revokedMailboxGrantCount: 2,
      revokedSystemGrantCount: 1,
      status: 'revoked',
      success: true
    })
    expect(adminServiceTestState.agentMailMailboxGrantUpdateMany).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        principalId: agentId,
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      },
      { $set: { status: 'revoked', updatedAt: expect.any(Date) } }
    )
    expect(adminServiceTestState.agentMailSystemGrantUpdateMany).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        principalId: agentId,
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      },
      { $set: { status: 'revoked', updatedAt: expect.any(Date) } }
    )
    expect(adminServiceTestState.agentCapabilityGrantUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: ['capability-grant-1', 'capability-grant-pending'] } },
      { $set: { status: 'revoked', updatedAt: expect.any(Date) } }
    )
    expect(adminServiceTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.agent.revoked',
      metadata: {
        agentId,
        agentPublicId,
        agentStatusRevoked: false,
        organizationId: 'org-1',
        revokedCapabilityGrantCount: 2,
        revokedMailboxGrantCount: 2,
        revokedSystemGrantCount: 1
      },
      severity: 'medium',
      status: 'success',
      userId: 'user-1'
    })
  })

  it('does not revoke an unrelated agent without organization-scoped access', async () => {
    expect.hasAssertions()

    const agentId = '01960000-0000-7000-8000-000000000001'
    const agentPublicId = publicIdFromUUIDv7(agentId)
    adminServiceTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          name: 'Support Agent',
          status: 'active'
        })
    })
    adminServiceTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            organizationId: 'org-2',
            principalId: agentId,
            principalType: 'agent',
            status: 'active'
          }
        ])
    })
    adminServiceTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () => Promise.resolve([])
    })
    adminServiceTestState.agentCapabilityGrantFind.mockReturnValue({
      exec: () => Promise.resolve([])
    })

    const { revokeAgentMailAgentForWeb } = await import('./admin-service')

    await expect(
      revokeAgentMailAgentForWeb({
        agentId: agentPublicId,
        headers: new Headers()
      })
    ).rejects.toMatchObject({
      message: 'Agent access was not found',
      status: 404
    })
    expect(adminServiceTestState.agentMailMailboxGrantUpdateMany).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentMailSystemGrantUpdateMany).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentCapabilityGrantUpdateMany).not.toHaveBeenCalled()
    expect(adminServiceTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(adminServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })
})

const adminServiceTransactionSession = { id: 'admin-service-transaction-session' }

function chainedFindResolve<T>(value: T) {
  return {
    where: () => ({
      in: () => ({
        exec: () => Promise.resolve(value)
      })
    })
  }
}

function sessionQueryResolve<T>(value: T) {
  const query = {
    exec: vi.fn(() => Promise.resolve(value)),
    session: vi.fn()
  }
  query.session.mockReturnValue(query)
  return query
}

function sessionQueryReject(error: Error) {
  const query = {
    exec: vi.fn(() => Promise.reject(error)),
    session: vi.fn()
  }
  query.session.mockReturnValue(query)
  return query
}
