import { beforeEach, describe, expect, it, vi } from 'vitest'

const mailAdminRpcTestState = vi.hoisted(() => {
  const accountsRoute = vi.fn()
  const agentEnrollmentsRoute = vi.fn()
  const agentsRoute = vi.fn()
  const groupsRoute = vi.fn()
  const principalRoute = vi.fn()
  const principalsRoute = vi.fn()

  return {
    accountDisablePost: vi.fn(),
    accountPatch: vi.fn(),
    accountsPost: vi.fn(),
    accountsRoute,
    adminGet: vi.fn(),
    adminNavigationGet: vi.fn(),
    agentMailboxGrantsPost: vi.fn(),
    agentEnrollmentRevokePost: vi.fn(),
    agentEnrollmentsRoute,
    agentPatch: vi.fn(),
    agentPermissionsPost: vi.fn(),
    agentRevokePost: vi.fn(),
    agentsPost: vi.fn(),
    agentsRoute,
    groupDisablePost: vi.fn(),
    groupPatch: vi.fn(),
    groupsPost: vi.fn(),
    groupsRoute,
    principalMailboxGrantsPost: vi.fn(),
    principalPermissionsPost: vi.fn(),
    principalRoute,
    principalsRoute
  }
})

vi.mock('./rpc-api-client', () => ({
  rpc: {
    mail: {
      admin: {
        accounts: Object.assign(mailAdminRpcTestState.accountsRoute, {
          post: mailAdminRpcTestState.accountsPost
        }),
        agents: Object.assign(mailAdminRpcTestState.agentsRoute, {
          post: mailAdminRpcTestState.agentsPost
        }),
        'agent-enrollments': mailAdminRpcTestState.agentEnrollmentsRoute,
        get: mailAdminRpcTestState.adminGet,
        groups: Object.assign(mailAdminRpcTestState.groupsRoute, {
          post: mailAdminRpcTestState.groupsPost
        }),
        navigation: {
          get: mailAdminRpcTestState.adminNavigationGet
        },
        principals: mailAdminRpcTestState.principalsRoute
      }
    }
  }
}))

describe('mail admin RPC adapter', () => {
  beforeEach(() => {
    mailAdminRpcTestState.accountDisablePost.mockReset()
    mailAdminRpcTestState.accountPatch.mockReset()
    mailAdminRpcTestState.accountsPost.mockReset()
    mailAdminRpcTestState.accountsRoute.mockReset()
    mailAdminRpcTestState.adminGet.mockReset()
    mailAdminRpcTestState.adminNavigationGet.mockReset()
    mailAdminRpcTestState.agentMailboxGrantsPost.mockReset()
    mailAdminRpcTestState.agentEnrollmentRevokePost.mockReset()
    mailAdminRpcTestState.agentEnrollmentsRoute.mockReset()
    mailAdminRpcTestState.agentPatch.mockReset()
    mailAdminRpcTestState.agentPermissionsPost.mockReset()
    mailAdminRpcTestState.agentRevokePost.mockReset()
    mailAdminRpcTestState.agentsPost.mockReset()
    mailAdminRpcTestState.agentsRoute.mockReset()
    mailAdminRpcTestState.groupDisablePost.mockReset()
    mailAdminRpcTestState.groupPatch.mockReset()
    mailAdminRpcTestState.groupsPost.mockReset()
    mailAdminRpcTestState.groupsRoute.mockReset()
    mailAdminRpcTestState.principalMailboxGrantsPost.mockReset()
    mailAdminRpcTestState.principalPermissionsPost.mockReset()
    mailAdminRpcTestState.principalRoute.mockReset()
    mailAdminRpcTestState.principalsRoute.mockReset()

    mailAdminRpcTestState.accountsRoute.mockReturnValue({
      disable: { post: mailAdminRpcTestState.accountDisablePost },
      patch: mailAdminRpcTestState.accountPatch
    })
    mailAdminRpcTestState.agentsRoute.mockReturnValue({
      'mailbox-grants': { post: mailAdminRpcTestState.agentMailboxGrantsPost },
      patch: mailAdminRpcTestState.agentPatch,
      permissions: { post: mailAdminRpcTestState.agentPermissionsPost },
      revoke: { post: mailAdminRpcTestState.agentRevokePost }
    })
    mailAdminRpcTestState.agentEnrollmentsRoute.mockReturnValue({
      revoke: { post: mailAdminRpcTestState.agentEnrollmentRevokePost }
    })
    mailAdminRpcTestState.groupsRoute.mockReturnValue({
      disable: { post: mailAdminRpcTestState.groupDisablePost },
      patch: mailAdminRpcTestState.groupPatch
    })
    mailAdminRpcTestState.principalsRoute.mockReturnValue(mailAdminRpcTestState.principalRoute)
    mailAdminRpcTestState.principalRoute.mockReturnValue({
      'mailbox-grants': { post: mailAdminRpcTestState.principalMailboxGrantsPost },
      permissions: { post: mailAdminRpcTestState.principalPermissionsPost }
    })
  })

  it('passes mailbox admin view filters through the RPC query object', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.adminGet.mockResolvedValue({
      data: { section: 'agents' },
      error: null,
      status: 200
    })
    const { fetchMailboxAdminView } = await import('./mail-admin-rpc')

    await expect(
      fetchMailboxAdminView({
        page: 3,
        pageSize: 25,
        searchQuery: 'paperclip',
        section: 'agents',
        statusFilter: 'active'
      })
    ).resolves.toStrictEqual({ section: 'agents' })
    expect(mailAdminRpcTestState.adminGet).toHaveBeenCalledWith({
      query: {
        page: 3,
        pageSize: 25,
        searchQuery: 'paperclip',
        section: 'agents',
        statusFilter: 'active'
      }
    })
  })

  it('loads mailbox admin navigation through the lightweight navigation RPC', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.adminNavigationGet.mockResolvedValue({
      data: { allowedSections: ['accounts', 'agents'] },
      error: null,
      status: 200
    })
    const { fetchMailboxAdminNavigation } = await import('./mail-admin-rpc')

    await expect(fetchMailboxAdminNavigation()).resolves.toStrictEqual({
      allowedSections: ['accounts', 'agents']
    })
    expect(mailAdminRpcTestState.adminNavigationGet).toHaveBeenCalledWith()
    expect(mailAdminRpcTestState.adminGet).not.toHaveBeenCalled()
  })

  it('sends create-only account fields to the account creation RPC', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.accountsPost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { createMailboxAdminAccount } = await import('./mail-admin-rpc')

    await createMailboxAdminAccount({
      address: 'support@example.test',
      agentId: 'agent-1',
      grants: ['readMailbox', 'sendAs'],
      name: 'Support',
      status: 'disabled',
      type: 'mailbox'
    })

    expect(mailAdminRpcTestState.accountsPost).toHaveBeenCalledWith({
      address: 'support@example.test',
      agentId: 'agent-1',
      grants: ['readMailbox', 'sendAs'],
      name: 'Support',
      type: 'mailbox'
    })
  })

  it('sends update-only account fields to the account update RPC', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.accountPatch.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { updateMailboxAdminAccount } = await import('./mail-admin-rpc')

    await updateMailboxAdminAccount({
      accountId: 'support@example.test',
      input: {
        address: 'support@example.test',
        agentId: 'agent-1',
        grants: ['readMailbox'],
        name: 'Support',
        status: 'disabled',
        type: 'mailbox'
      }
    })

    expect(mailAdminRpcTestState.accountsRoute).toHaveBeenCalledWith({
      accountId: 'support@example.test'
    })
    expect(mailAdminRpcTestState.accountPatch).toHaveBeenCalledWith({
      address: 'support@example.test',
      name: 'Support',
      status: 'disabled'
    })
  })

  it('routes account disable through the selected account RPC path', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.accountDisablePost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { disableMailboxAdminAccount } = await import('./mail-admin-rpc')

    await expect(disableMailboxAdminAccount('support@example.test')).resolves.toStrictEqual({
      success: true
    })
    expect(mailAdminRpcTestState.accountsRoute).toHaveBeenCalledWith({
      accountId: 'support@example.test'
    })
    expect(mailAdminRpcTestState.accountDisablePost).toHaveBeenCalledWith()
  })

  it('sends agent creation fields to the agent enrollment RPC', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.agentsPost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { createMailboxAdminAgentEnrollment } = await import('./mail-admin-rpc')

    await createMailboxAdminAgentEnrollment({
      grantExpiresAt: '2026-07-22T12:30:00.000Z',
      mailboxGrants: [
        {
          accountId: 'support@example.test',
          capabilities: ['readMailbox', 'sendAs']
        }
      ],
      name: 'Support Agent',
      systemPermissions: ['manageAgents']
    })

    expect(mailAdminRpcTestState.agentsPost).toHaveBeenCalledWith({
      grantExpiresAt: '2026-07-22T12:30:00.000Z',
      mailboxGrants: [
        {
          accountId: 'support@example.test',
          capabilities: ['readMailbox', 'sendAs']
        }
      ],
      name: 'Support Agent',
      systemPermissions: ['manageAgents']
    })
  })

  it('routes agent profile, grant, permission, and revoke mutations by agent id', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.agentPatch.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    mailAdminRpcTestState.agentMailboxGrantsPost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    mailAdminRpcTestState.agentPermissionsPost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    mailAdminRpcTestState.agentRevokePost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const {
      revokeMailboxAdminAgent,
      updateMailboxAdminAgent,
      updateMailboxAdminAgentMailboxGrants,
      updateMailboxAdminAgentSystemPermissions
    } = await import('./mail-admin-rpc')

    await updateMailboxAdminAgent({
      agentId: 'agent-support',
      input: {
        grantExpiresAt: undefined,
        mailboxGrants: undefined,
        name: 'Support Agent',
        systemPermissions: undefined
      }
    })
    await updateMailboxAdminAgentMailboxGrants({
      agentId: 'agent-support',
      input: {
        grants: [
          {
            accountId: 'support@example.test',
            capabilities: ['readMailbox', 'createDrafts']
          }
        ]
      }
    })
    await updateMailboxAdminAgentSystemPermissions({
      agentId: 'agent-support',
      input: {
        permissions: ['manageForwardingGroups']
      }
    })
    await revokeMailboxAdminAgent('agent-support')

    expect(mailAdminRpcTestState.agentsRoute).toHaveBeenCalledWith({
      agentId: 'agent-support'
    })
    expect(mailAdminRpcTestState.agentPatch).toHaveBeenCalledWith({
      grantExpiresAt: undefined,
      mailboxGrants: undefined,
      name: 'Support Agent',
      systemPermissions: undefined
    })
    expect(mailAdminRpcTestState.agentMailboxGrantsPost).toHaveBeenCalledWith({
      grants: [
        {
          accountId: 'support@example.test',
          capabilities: ['readMailbox', 'createDrafts']
        }
      ]
    })
    expect(mailAdminRpcTestState.agentPermissionsPost).toHaveBeenCalledWith({
      permissions: ['manageForwardingGroups']
    })
    expect(mailAdminRpcTestState.agentRevokePost).toHaveBeenCalledWith()
  })

  it('routes pending agent enrollment revoke by enrollment id', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.agentEnrollmentRevokePost.mockResolvedValue({
      data: {
        enrollmentId: 'pending-enrollment-1',
        hostId: '01960000-0000-7000-8000-000000000010',
        status: 'revoked',
        success: true
      },
      error: null,
      status: 200
    })
    const { revokeMailboxAdminAgentEnrollment } = await import('./mail-admin-rpc')

    await expect(revokeMailboxAdminAgentEnrollment('pending-enrollment-1')).resolves.toStrictEqual({
      enrollmentId: 'pending-enrollment-1',
      hostId: '01960000-0000-7000-8000-000000000010',
      status: 'revoked',
      success: true
    })
    expect(mailAdminRpcTestState.agentEnrollmentsRoute).toHaveBeenCalledWith({
      enrollmentId: 'pending-enrollment-1'
    })
    expect(mailAdminRpcTestState.agentEnrollmentRevokePost).toHaveBeenCalledWith()
  })

  it('posts principal mailbox grants to the typed principal grant route', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.principalMailboxGrantsPost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { updateMailboxAdminPrincipalMailboxGrants } = await import('./mail-admin-rpc')

    await updateMailboxAdminPrincipalMailboxGrants({
      input: {
        grants: [
          {
            accountId: 'support@example.test',
            capabilities: ['readMailbox', 'createDrafts']
          }
        ]
      },
      principal: {
        principalId: 'paperclip-client',
        principalType: 'oauth_client'
      }
    })

    expect(mailAdminRpcTestState.principalsRoute).toHaveBeenCalledWith({
      principalType: 'oauth_client'
    })
    expect(mailAdminRpcTestState.principalRoute).toHaveBeenCalledWith({
      principalId: 'paperclip-client'
    })
    expect(mailAdminRpcTestState.principalMailboxGrantsPost).toHaveBeenCalledWith({
      grants: [
        {
          accountId: 'support@example.test',
          capabilities: ['readMailbox', 'createDrafts']
        }
      ]
    })
  })

  it('posts principal system permissions to the typed principal permission route', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.principalPermissionsPost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { updateMailboxAdminPrincipalSystemPermissions } = await import('./mail-admin-rpc')

    await updateMailboxAdminPrincipalSystemPermissions({
      input: {
        permissions: ['readAllMailboxes']
      },
      principal: {
        principalId: 'paperclip-client',
        principalType: 'oauth_client'
      }
    })

    expect(mailAdminRpcTestState.principalsRoute).toHaveBeenCalledWith({
      principalType: 'oauth_client'
    })
    expect(mailAdminRpcTestState.principalRoute).toHaveBeenCalledWith({
      principalId: 'paperclip-client'
    })
    expect(mailAdminRpcTestState.principalPermissionsPost).toHaveBeenCalledWith({
      permissions: ['readAllMailboxes']
    })
  })

  it('routes forwarding group create, update, and disable mutations', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.groupsPost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    mailAdminRpcTestState.groupPatch.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    mailAdminRpcTestState.groupDisablePost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { createMailboxAdminGroup, disableMailboxAdminGroup, updateMailboxAdminGroup } =
      await import('./mail-admin-rpc')

    await createMailboxAdminGroup({
      address: 'support@example.test',
      description: 'Support routing',
      recipients: ['ops@example.test'],
      status: 'active'
    })
    await updateMailboxAdminGroup({
      groupId: 'group-support',
      input: {
        address: 'support@example.test',
        description: 'Updated support routing',
        recipients: ['ops@example.test', 'triage@example.test'],
        status: 'pending'
      }
    })
    await disableMailboxAdminGroup('group-support')

    expect(mailAdminRpcTestState.groupsPost).toHaveBeenCalledWith({
      address: 'support@example.test',
      description: 'Support routing',
      recipients: ['ops@example.test'],
      status: 'active'
    })
    expect(mailAdminRpcTestState.groupsRoute).toHaveBeenCalledWith({
      groupId: 'group-support'
    })
    expect(mailAdminRpcTestState.groupPatch).toHaveBeenCalledWith({
      address: 'support@example.test',
      description: 'Updated support routing',
      recipients: ['ops@example.test', 'triage@example.test'],
      status: 'pending'
    })
    expect(mailAdminRpcTestState.groupDisablePost).toHaveBeenCalledWith()
  })

  it('throws typed RPC errors with server-provided messages', async () => {
    expect.hasAssertions()
    mailAdminRpcTestState.adminGet.mockResolvedValue({
      data: null,
      error: { value: { error: 'Mailbox administration access is not authorized' } },
      status: 403
    })
    const { MailAdminRPCError, fetchMailboxAdminView } = await import('./mail-admin-rpc')

    await expect(fetchMailboxAdminView({ section: 'agents' })).rejects.toBeInstanceOf(MailAdminRPCError)
    await expect(fetchMailboxAdminView({ section: 'agents' })).rejects.toMatchObject({
      message: 'Mailbox administration access is not authorized',
      status: 403
    })
  })
})
