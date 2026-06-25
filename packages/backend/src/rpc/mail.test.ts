import { beforeEach, describe, expect, it, vi } from 'vitest'

const mailRpcTestState = vi.hoisted(() => ({
  createAgentMailAccountForWeb: vi.fn(),
  createAgentMailAgentEnrollmentForWeb: vi.fn(),
  createAgentMailForwardingGroupForWeb: vi.fn(),
  disableAgentMailAccountForWeb: vi.fn(),
  getAgentMailAccountsForWeb: vi.fn(),
  getAgentMailOriginalSourceForWeb: vi.fn(),
  getAgentMailStatusForWeb: vi.fn(),
  getAgentMailAdminNavigationForWeb: vi.fn(),
  getAgentMailAdminViewForWeb: vi.fn(),
  getAgentMailWorkspaceForWeb: vi.fn(),
  renameAgentMailFolderForWeb: vi.fn(),
  revokeAgentMailAgentEnrollmentForWeb: vi.fn(),
  revokeAgentMailAgentForWeb: vi.fn(),
  updateAgentMailAccountForWeb: vi.fn(),
  updateAgentMailAgentForWeb: vi.fn(),
  updateAgentMailAgentMailboxGrantsForWeb: vi.fn(),
  updateAgentMailAgentSystemPermissionsForWeb: vi.fn(),
  updateAgentMailPrincipalMailboxGrantsForWeb: vi.fn(),
  updateAgentMailPrincipalSystemPermissionsForWeb: vi.fn(),
  updateAgentMailForwardingGroupForWeb: vi.fn(),
  disableAgentMailForwardingGroupForWeb: vi.fn()
}))

vi.mock('../agent-mail/service', () => ({
  getAgentMailStatusForWeb: mailRpcTestState.getAgentMailStatusForWeb,
  isAgentMailAccessError: (error: unknown) => error instanceof Error && error.name === 'AgentMailAccessError',
  submitAgentMailOutboundFromWeb: vi.fn()
}))

vi.mock('../agent-mail/admin-service', () => ({
  createAgentMailAccountForWeb: mailRpcTestState.createAgentMailAccountForWeb,
  createAgentMailAgentEnrollmentForWeb: mailRpcTestState.createAgentMailAgentEnrollmentForWeb,
  createAgentMailForwardingGroupForWeb: mailRpcTestState.createAgentMailForwardingGroupForWeb,
  disableAgentMailAccountForWeb: mailRpcTestState.disableAgentMailAccountForWeb,
  disableAgentMailForwardingGroupForWeb: mailRpcTestState.disableAgentMailForwardingGroupForWeb,
  getAgentMailAdminNavigationForWeb: mailRpcTestState.getAgentMailAdminNavigationForWeb,
  getAgentMailAdminViewForWeb: mailRpcTestState.getAgentMailAdminViewForWeb,
  isAgentMailAdminError: (error: unknown) => error instanceof Error && error.name === 'AgentMailAdminError',
  revokeAgentMailAgentEnrollmentForWeb: mailRpcTestState.revokeAgentMailAgentEnrollmentForWeb,
  revokeAgentMailAgentForWeb: mailRpcTestState.revokeAgentMailAgentForWeb,
  updateAgentMailAccountForWeb: mailRpcTestState.updateAgentMailAccountForWeb,
  updateAgentMailAgentForWeb: mailRpcTestState.updateAgentMailAgentForWeb,
  updateAgentMailAgentMailboxGrantsForWeb: mailRpcTestState.updateAgentMailAgentMailboxGrantsForWeb,
  updateAgentMailAgentSystemPermissionsForWeb: mailRpcTestState.updateAgentMailAgentSystemPermissionsForWeb,
  updateAgentMailPrincipalMailboxGrantsForWeb: mailRpcTestState.updateAgentMailPrincipalMailboxGrantsForWeb,
  updateAgentMailPrincipalSystemPermissionsForWeb:
    mailRpcTestState.updateAgentMailPrincipalSystemPermissionsForWeb,
  updateAgentMailForwardingGroupForWeb: mailRpcTestState.updateAgentMailForwardingGroupForWeb
}))

vi.mock('../agent-mail/webmail-service', () => ({
  agentMailWebErrorStatus: vi.fn(() => null),
  createAgentMailFolderForWeb: vi.fn(),
  deleteAgentMailFolderForWeb: vi.fn(),
  deleteAgentMailMessageForWeb: vi.fn(),
  getAgentMailAccountsForWeb: mailRpcTestState.getAgentMailAccountsForWeb,
  getAgentMailAttachmentForWeb: vi.fn(),
  getAgentMailOriginalSourceForWeb: mailRpcTestState.getAgentMailOriginalSourceForWeb,
  getAgentMailWorkspaceForWeb: mailRpcTestState.getAgentMailWorkspaceForWeb,
  isAgentMailWebmailError: (error: unknown) =>
    error instanceof Error && error.name === 'AgentMailWebmailError',
  moveAgentMailMessageForWeb: vi.fn(),
  renameAgentMailFolderForWeb: mailRpcTestState.renameAgentMailFolderForWeb,
  saveAgentMailDraftForWeb: vi.fn(),
  sendAgentMailDraftForWeb: vi.fn(),
  sendAgentMailMessageForWeb: vi.fn(),
  updateAgentMailMessageForWeb: vi.fn()
}))

describe('mail RPC routes', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    mailRpcTestState.createAgentMailAccountForWeb.mockReset()
    mailRpcTestState.createAgentMailAgentEnrollmentForWeb.mockReset()
    mailRpcTestState.createAgentMailForwardingGroupForWeb.mockReset()
    mailRpcTestState.disableAgentMailAccountForWeb.mockReset()
    mailRpcTestState.disableAgentMailForwardingGroupForWeb.mockReset()
    mailRpcTestState.getAgentMailAccountsForWeb.mockReset()
    mailRpcTestState.getAgentMailAdminNavigationForWeb.mockReset()
    mailRpcTestState.getAgentMailAdminViewForWeb.mockReset()
    mailRpcTestState.getAgentMailOriginalSourceForWeb.mockReset()
    mailRpcTestState.getAgentMailStatusForWeb.mockReset()
    mailRpcTestState.getAgentMailWorkspaceForWeb.mockReset()
    mailRpcTestState.renameAgentMailFolderForWeb.mockReset()
    mailRpcTestState.revokeAgentMailAgentEnrollmentForWeb.mockReset()
    mailRpcTestState.revokeAgentMailAgentForWeb.mockReset()
    mailRpcTestState.updateAgentMailAccountForWeb.mockReset()
    mailRpcTestState.updateAgentMailAgentForWeb.mockReset()
    mailRpcTestState.updateAgentMailAgentMailboxGrantsForWeb.mockReset()
    mailRpcTestState.updateAgentMailAgentSystemPermissionsForWeb.mockReset()
    mailRpcTestState.updateAgentMailPrincipalMailboxGrantsForWeb.mockReset()
    mailRpcTestState.updateAgentMailPrincipalSystemPermissionsForWeb.mockReset()
    mailRpcTestState.updateAgentMailForwardingGroupForWeb.mockReset()
  })

  it('returns a Bearer challenge for authenticated mail routes that fail with 401', async () => {
    expect.hasAssertions()
    const error = new Error('Authentication required') as Error & { status: 401 }
    error.name = 'AgentMailAccessError'
    error.status = 401
    mailRpcTestState.getAgentMailStatusForWeb.mockRejectedValue(error)

    const { default: mail } = await import('./mail')
    const response = await mail.handle(new Request('https://mail.example.com/mail/status'))

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-email"')
    await expect(response.json()).resolves.toStrictEqual({ error: 'Authentication required' })
  })

  it('passes mailbox admin pagination and filters through the RPC boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.getAgentMailAdminViewForWeb.mockResolvedValue({
      accounts: [],
      agents: [],
      allowedActions: {
        createAccount: false,
        createAgent: false,
        createGroup: false,
        disableAccount: false,
        disableGroup: false,
        manageAgentMailboxGrants: false,
        manageAgentSystemPermissions: false,
        provisionAccount: false,
        revokeAgent: false,
        updateAccount: false,
        updateAgent: false,
        updateGroup: false
      },
      allowedSections: ['agents'],
      domain: 'example.test',
      groups: [],
      pagination: {
        filteredRecords: 0,
        page: 2,
        pageSize: 10,
        totalRecords: 0
      },
      pendingEnrollments: [
        {
          canRevoke: false,
          createdAt: '2026-06-22',
          grantExpiresAt: null,
          grants: [],
          hostId: '01960000-0000-7000-8000-000000000010',
          id: 'pending-enrollment-1',
          lastUpdated: '2026-06-22',
          mailboxGrantCount: 0,
          name: 'Research Agent',
          permissions: ['manageForwardingGroups'],
          status: 'pending',
          systemPermissionCount: 1,
          tokenExpiresAt: null
        }
      ],
      permissionCatalog: {
        defaultMailboxGrants: [],
        mailboxGrantOptions: [],
        mailboxGrants: [],
        systemPermissionOptions: [],
        systemPermissions: []
      },
      principals: [
        {
          grants: [],
          id: 'api-key-1',
          kind: 'api_key',
          lastUsed: '2026-06-22',
          name: 'Worker key',
          permissions: ['readAllMailboxes'],
          scope: 'organization',
          status: 'active'
        }
      ],
      searchQuery: 'support',
      section: 'agents',
      state: 'empty',
      statusFilter: 'pending'
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request(
        'https://mail.example.com/mail/admin?section=agents&page=2&pageSize=10&searchQuery=support&statusFilter=pending'
      )
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      pagination: {
        page: 2,
        pageSize: 10
      },
      pendingEnrollments: [
        {
          id: 'pending-enrollment-1',
          name: 'Research Agent',
          permissions: ['manageForwardingGroups'],
          status: 'pending'
        }
      ],
      principals: [
        {
          id: 'api-key-1',
          kind: 'api_key',
          permissions: ['readAllMailboxes']
        }
      ],
      section: 'agents',
      statusFilter: 'pending'
    })
    expect(mailRpcTestState.getAgentMailAdminViewForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      page: 2,
      pageSize: 10,
      searchQuery: 'support',
      section: 'agents',
      statusFilter: 'pending'
    })
  })

  it('serves mailbox admin navigation without loading the full admin view', async () => {
    expect.hasAssertions()
    mailRpcTestState.getAgentMailAdminNavigationForWeb.mockResolvedValue({
      allowedSections: ['accounts', 'agents']
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(new Request('https://mail.example.com/mail/admin/navigation'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      allowedSections: ['accounts', 'agents']
    })
    expect(mailRpcTestState.getAgentMailAdminNavigationForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers)
    })
    expect(mailRpcTestState.getAgentMailAdminViewForWeb).not.toHaveBeenCalled()
  })

  it('returns a Bearer challenge for webmail workspace routes that fail authentication', async () => {
    expect.hasAssertions()
    const error = new Error('Authentication required') as Error & { status: 401 }
    error.name = 'AgentMailAccessError'
    error.status = 401
    mailRpcTestState.getAgentMailWorkspaceForWeb.mockRejectedValue(error)

    const { default: mail } = await import('./mail')
    const requestUrl =
      'https://mail.example.com/mail/workspace?accountId=support%40example.test&folderId=inbox&limit=50'
    const response = await mail.handle(
      new Request(requestUrl, {
        headers: {
          authorization: 'Bearer invalid-agent-jwt'
        }
      })
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-email"')
    await expect(response.json()).resolves.toStrictEqual({ error: 'Authentication required' })

    const call = mailRpcTestState.getAgentMailWorkspaceForWeb.mock.calls[0]?.[0] as
      | {
          headers: Headers
          input: {
            accountId?: string
            folderId?: string
            limit?: number
          }
        }
      | undefined
    expect(call).toBeDefined()
    if (!call) {
      throw new Error('Expected workspace service to be called.')
    }
    expect(call).toMatchObject({
      input: {
        accountId: 'support@example.test',
        folderId: 'inbox',
        limit: 50
      }
    })
    expect(call.headers.get('x-agentteam-request-method')).toBe('GET')
    expect(call.headers.get('x-agentteam-request-url')).toBe(requestUrl)
  })

  it('passes request-bound headers to the webmail account list route', async () => {
    expect.hasAssertions()
    mailRpcTestState.getAgentMailAccountsForWeb.mockResolvedValue({ accounts: [] })

    const { default: mail } = await import('./mail')
    const requestUrl = 'https://mail.example.com/mail/accounts'
    const response = await mail.handle(
      new Request(requestUrl, {
        headers: {
          authorization: 'Bearer agent-jwt'
        }
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({ accounts: [] })
    const [headers] = mailRpcTestState.getAgentMailAccountsForWeb.mock.calls[0] ?? []
    expect(headers).toBeInstanceOf(Headers)
    if (!(headers instanceof Headers)) {
      throw new TypeError('Expected account list route to pass request headers.')
    }
    expect(headers.get('authorization')).toBe('Bearer agent-jwt')
    expect(headers.get('x-agentteam-request-method')).toBe('GET')
    expect(headers.get('x-agentteam-request-url')).toBe(requestUrl)
  })

  it('preserves the raw original source response headers for downloads', async () => {
    expect.hasAssertions()
    mailRpcTestState.getAgentMailOriginalSourceForWeb.mockResolvedValue(
      new Response('Message-ID: <source@example.test>', {
        headers: {
          'cache-control': 'private, no-cache, no-store',
          'content-disposition': 'attachment',
          'content-security-policy': 'sandbox',
          'content-type': 'message/rfc822',
          'x-content-type-options': 'nosniff'
        }
      })
    )

    const { default: mail } = await import('./mail')
    const requestUrl =
      'https://mail.example.com/mail/accounts/support%40example.test/mailboxes/inbox/messages/message-1/source'
    const response = await mail.handle(new Request(requestUrl))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-cache, no-store')
    expect(response.headers.get('content-disposition')).toBe('attachment')
    expect(response.headers.get('content-security-policy')).toBe('sandbox')
    expect(response.headers.get('content-type')).toBe('message/rfc822')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    await expect(response.text()).resolves.toBe('Message-ID: <source@example.test>')
    expect(mailRpcTestState.getAgentMailOriginalSourceForWeb).toHaveBeenCalledWith({
      accountId: 'support@example.test',
      headers: expect.any(Headers),
      mailboxId: 'inbox',
      messageId: 'message-1'
    })
  })

  it('returns a typed original source preview for the web client', async () => {
    expect.hasAssertions()
    mailRpcTestState.getAgentMailOriginalSourceForWeb.mockResolvedValue(
      new Response('Message-ID: <preview@example.test>', {
        headers: {
          'content-type': 'message/rfc822'
        }
      })
    )

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request(
        'https://mail.example.com/mail/accounts/support%40example.test/mailboxes/inbox/messages/message-1/source-preview'
      )
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('Message-ID: <preview@example.test>')
  })

  it('returns webmail authorization failures without a Bearer challenge', async () => {
    expect.hasAssertions()
    const error = new Error('Missing exact mailbox grant') as Error & { status: 403 }
    error.name = 'AgentMailWebmailError'
    error.status = 403
    mailRpcTestState.getAgentMailWorkspaceForWeb.mockRejectedValue(error)

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/workspace?accountId=support%40example.test')
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toStrictEqual({ error: 'Missing exact mailbox grant' })
  })

  it('routes folder rename requests through the webserver mail boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.renameAgentMailFolderForWeb.mockResolvedValue({
      folder: {
        id: 'projects-id',
        name: 'Client Work',
        path: 'Client Work',
        protected: false
      },
      success: true
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/accounts/support%40example.test/mailboxes/projects-id', {
        body: JSON.stringify({ name: 'Client Work' }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'PATCH'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      folder: {
        id: 'projects-id',
        name: 'Client Work',
        path: 'Client Work',
        protected: false
      },
      success: true
    })
    expect(mailRpcTestState.renameAgentMailFolderForWeb).toHaveBeenCalledWith({
      accountId: 'support@example.test',
      headers: expect.any(Headers),
      mailboxId: 'projects-id',
      name: 'Client Work'
    })
  })

  it('routes agent revoke requests through the webserver admin boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.revokeAgentMailAgentForWeb.mockResolvedValue({
      agentId: 'agent_public_1',
      revokedCapabilityGrantCount: 1,
      revokedMailboxGrantCount: 2,
      revokedSystemGrantCount: 1,
      status: 'revoked',
      success: true
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/admin/agents/agent_public_1/revoke', { method: 'POST' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      agentId: 'agent_public_1',
      revokedCapabilityGrantCount: 1,
      revokedMailboxGrantCount: 2,
      revokedSystemGrantCount: 1,
      status: 'revoked',
      success: true
    })
    expect(mailRpcTestState.revokeAgentMailAgentForWeb).toHaveBeenCalledWith({
      agentId: 'agent_public_1',
      headers: expect.any(Headers)
    })
  })

  it('routes forwarding group creates through the webserver admin boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.createAgentMailForwardingGroupForWeb.mockResolvedValue({
      group: {
        address: 'support@example.test',
        description: 'Support queue',
        domain: 'example.test',
        id: 'group_public_1',
        lastDelivered: 'Never',
        lastUpdated: '2026-06-22',
        recipients: ['triage@example.test'],
        status: 'active'
      },
      success: true
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/admin/groups', {
        body: JSON.stringify({
          address: 'support@example.test',
          description: 'Support queue',
          recipients: ['triage@example.test']
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      group: {
        address: 'support@example.test',
        id: 'group_public_1'
      },
      success: true
    })
    expect(mailRpcTestState.createAgentMailForwardingGroupForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        address: 'support@example.test',
        description: 'Support queue',
        recipients: ['triage@example.test']
      }
    })
  })

  it('routes account updates through the webserver admin boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.updateAgentMailAccountForWeb.mockResolvedValue({
      account: {
        accessCount: 0,
        address: 'support@example.test',
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

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/admin/accounts/support%40example.test', {
        body: JSON.stringify({
          address: 'support@example.test',
          name: 'Support Desk'
        }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      account: {
        address: 'support@example.test',
        name: 'Support Desk'
      },
      success: true
    })
    expect(mailRpcTestState.updateAgentMailAccountForWeb).toHaveBeenCalledWith({
      accountId: 'support@example.test',
      headers: expect.any(Headers),
      input: {
        address: 'support@example.test',
        name: 'Support Desk'
      }
    })
  })

  it('routes account disables through the webserver admin boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.disableAgentMailAccountForWeb.mockResolvedValue({
      account: {
        accessCount: 0,
        address: 'support@example.test',
        domain: 'example.test',
        groups: [],
        id: 'support@example.test',
        lastActivity: 'No recent activity',
        name: 'Support Desk',
        status: 'disabled',
        type: 'mailbox'
      },
      success: true
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/admin/accounts/support%40example.test/disable', {
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      account: {
        address: 'support@example.test',
        status: 'disabled'
      },
      success: true
    })
    expect(mailRpcTestState.disableAgentMailAccountForWeb).toHaveBeenCalledWith({
      accountId: 'support@example.test',
      headers: expect.any(Headers)
    })
  })

  it('routes agent profile updates through the webserver admin boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.updateAgentMailAgentForWeb.mockResolvedValue({
      agent: {
        grants: [],
        groups: [],
        handle: 'agent:01960000',
        id: 'agent_public_1',
        lastSeen: 'Never',
        name: 'Updated Agent',
        permissions: [],
        status: 'active'
      },
      success: true
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/admin/agents/agent_public_1', {
        body: JSON.stringify({
          name: 'Updated Agent'
        }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      agent: {
        id: 'agent_public_1',
        name: 'Updated Agent'
      },
      success: true
    })
    expect(mailRpcTestState.updateAgentMailAgentForWeb).toHaveBeenCalledWith({
      agentId: 'agent_public_1',
      headers: expect.any(Headers),
      input: {
        name: 'Updated Agent'
      }
    })
  })

  it('routes agent enrollment creates through the webserver admin boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.createAgentMailAgentEnrollmentForWeb.mockResolvedValue({
      enrollment: {
        enrollmentToken: 'secret-enrollment-token',
        enrollmentTokenExpiresAt: '2026-06-22T12:30:00.000Z',
        grantExpiresAt: '2099-01-01T00:00:00.000Z',
        hostId: 'host-1',
        mailboxGrantCount: 2,
        name: 'Research Agent',
        status: 'pending_enrollment',
        systemPermissionCount: 1
      },
      success: true
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/admin/agents', {
        body: JSON.stringify({
          grantExpiresAt: '2099-01-01T00:00:00.000Z',
          mailboxGrants: [
            {
              accountId: 'support@example.test',
              capabilities: ['readMailbox', 'sendAs']
            }
          ],
          name: 'Research Agent',
          systemPermissions: ['manageForwardingGroups']
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toStrictEqual({
      enrollment: {
        enrollmentToken: 'secret-enrollment-token',
        enrollmentTokenExpiresAt: '2026-06-22T12:30:00.000Z',
        grantExpiresAt: '2099-01-01T00:00:00.000Z',
        hostId: 'host-1',
        mailboxGrantCount: 2,
        name: 'Research Agent',
        status: 'pending_enrollment',
        systemPermissionCount: 1
      },
      success: true
    })
    expect(mailRpcTestState.createAgentMailAgentEnrollmentForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        grantExpiresAt: '2099-01-01T00:00:00.000Z',
        mailboxGrants: [
          {
            accountId: 'support@example.test',
            capabilities: ['readMailbox', 'sendAs']
          }
        ],
        name: 'Research Agent',
        systemPermissions: ['manageForwardingGroups']
      }
    })
  })

  it('routes pending agent enrollment cancellation through the webserver admin boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.revokeAgentMailAgentEnrollmentForWeb.mockResolvedValue({
      enrollmentId: 'pending-enrollment-1',
      hostId: '01960000-0000-7000-8000-000000000010',
      status: 'revoked',
      success: true
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/admin/agent-enrollments/pending-enrollment-1/revoke', {
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      enrollmentId: 'pending-enrollment-1',
      hostId: '01960000-0000-7000-8000-000000000010',
      status: 'revoked',
      success: true
    })
    expect(mailRpcTestState.revokeAgentMailAgentEnrollmentForWeb).toHaveBeenCalledWith({
      enrollmentId: 'pending-enrollment-1',
      headers: expect.any(Headers)
    })
  })

  it('accepts agent enrollment grant requests through the parent RPC mount', async () => {
    expect.hasAssertions()
    mailRpcTestState.createAgentMailAgentEnrollmentForWeb.mockResolvedValue({
      enrollment: {
        enrollmentToken: 'secret-enrollment-token',
        enrollmentTokenExpiresAt: '2026-06-22T12:30:00.000Z',
        grantExpiresAt: null,
        hostId: 'host-1',
        mailboxGrantCount: 2,
        name: 'Research Agent',
        status: 'pending_enrollment',
        systemPermissionCount: 0
      },
      success: true
    })

    const { backendRpcApp } = await import('./index')
    const response = await backendRpcApp.handle(
      new Request('https://mail.example.com/rpc/mail/admin/agents', {
        body: JSON.stringify({
          grantExpiresAt: null,
          mailboxGrants: [
            {
              accountId: 'support@example.test',
              capabilities: ['readMailbox', 'sendAs']
            }
          ],
          name: 'Research Agent',
          systemPermissions: []
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      enrollment: {
        hostId: 'host-1',
        mailboxGrantCount: 2,
        systemPermissionCount: 0
      },
      success: true
    })
    expect(mailRpcTestState.createAgentMailAgentEnrollmentForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        grantExpiresAt: null,
        mailboxGrants: [
          {
            accountId: 'support@example.test',
            capabilities: ['readMailbox', 'sendAs']
          }
        ],
        name: 'Research Agent',
        systemPermissions: []
      }
    })
  })

  it('routes API key mailbox grant writes through the webserver admin boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.updateAgentMailPrincipalMailboxGrantsForWeb.mockResolvedValue({
      grants: [
        {
          accountAddress: 'support@example.test',
          accountId: 'support@example.test',
          capabilities: ['readMailbox', 'sendAs']
        }
      ],
      principalId: 'api-key-public-1',
      principalType: 'api_key',
      revokedGrantCount: 0,
      success: true
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/admin/principals/api_key/api-key-public-1/mailbox-grants', {
        body: JSON.stringify({
          grants: [
            {
              accountId: 'support@example.test',
              capabilities: ['readMailbox', 'sendAs']
            }
          ]
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      grants: [
        {
          accountAddress: 'support@example.test',
          accountId: 'support@example.test',
          capabilities: ['readMailbox', 'sendAs']
        }
      ],
      principalId: 'api-key-public-1',
      principalType: 'api_key',
      revokedGrantCount: 0,
      success: true
    })
    expect(mailRpcTestState.updateAgentMailPrincipalMailboxGrantsForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        grants: [
          {
            accountId: 'support@example.test',
            capabilities: ['readMailbox', 'sendAs']
          }
        ]
      },
      principalId: 'api-key-public-1',
      principalType: 'api_key'
    })
  })

  it('routes OAuth client system permission writes through the webserver admin boundary', async () => {
    expect.hasAssertions()
    mailRpcTestState.updateAgentMailPrincipalSystemPermissionsForWeb.mockResolvedValue({
      permissions: ['readAllMailboxes'],
      principalId: 'oauth-client-public-1',
      principalType: 'oauth_client',
      revokedPermissionCount: 0,
      success: true
    })

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request(
        'https://mail.example.com/mail/admin/principals/oauth_client/oauth-client-public-1/permissions',
        {
          body: JSON.stringify({
            permissions: ['readAllMailboxes']
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST'
        }
      )
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      permissions: ['readAllMailboxes'],
      principalId: 'oauth-client-public-1',
      principalType: 'oauth_client',
      revokedPermissionCount: 0,
      success: true
    })
    expect(mailRpcTestState.updateAgentMailPrincipalSystemPermissionsForWeb).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        permissions: ['readAllMailboxes']
      },
      principalId: 'oauth-client-public-1',
      principalType: 'oauth_client'
    })
  })

  it('returns authorization failures from principal grant writes without a Bearer challenge', async () => {
    expect.hasAssertions()
    const error = new Error('Missing exact AgentGrant authority') as Error & { status: 403 }
    error.name = 'AgentMailAdminError'
    error.status = 403
    mailRpcTestState.updateAgentMailPrincipalMailboxGrantsForWeb.mockRejectedValue(error)

    const { default: mail } = await import('./mail')
    const response = await mail.handle(
      new Request('https://mail.example.com/mail/admin/principals/api_key/api-key-public-1/mailbox-grants', {
        body: JSON.stringify({
          grants: [
            {
              accountId: 'support@example.test',
              capabilities: ['readMailbox']
            }
          ]
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toStrictEqual({
      error: 'Missing exact AgentGrant authority'
    })
  })
})
