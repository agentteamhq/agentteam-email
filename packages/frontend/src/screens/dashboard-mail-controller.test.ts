import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import { invalidateMailboxAdminQueries } from './dashboard-mailbox-admin-query-cache'
import { toDashboardView } from './dashboard-mail-dashboard-view'
import { mailboxAdminViewQueryForSection } from './dashboard-mailbox-admin-query'
import { actionsForMessage, toSidebarView } from './dashboard-mail-sidebar-view'
import { toMailboxAdminView } from './dashboard-mailbox-admin-view'
import type { AgentMailWebWorkspace } from '@main/backend'
import type { MailboxAdminView } from '../partials/authenticated/mailbox-admin-models'
import type { DomainSettingsState, DomainSettingsStatus } from '../partials/authenticated/settings-dialog'

const noAllowedActions = {
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
} satisfies MailboxAdminView['allowedActions']

const emptyPermissionCatalog = {
  defaultMailboxGrants: [],
  mailboxGrantOptions: [],
  mailboxGrants: [],
  systemPermissionOptions: [],
  systemPermissions: []
} satisfies MailboxAdminView['permissionCatalog']

function mailboxAdminView(overrides: Partial<MailboxAdminView> = {}): MailboxAdminView {
  return {
    accounts: [],
    agents: [],
    allowedActions: noAllowedActions,
    allowedSections: ['accounts', 'groups', 'agents'],
    domain: 'agentteam.example',
    groups: [],
    pendingEnrollments: [],
    permissionCatalog: emptyPermissionCatalog,
    principals: [],
    section: 'accounts',
    state: 'ready',
    ...overrides
  }
}

function mailboxAdminActions() {
  return {
    createdAgentEnrollment: null,
    onCopyAgentEnrollmentCommand: vi.fn(),
    onCreateAgent: vi.fn(),
    onDialogChange: vi.fn(),
    onDisableAccount: vi.fn(),
    onDisableGroup: vi.fn(),
    onOpenMailbox: vi.fn(),
    onRevokeAgent: vi.fn(),
    onRevokeAgentEnrollment: vi.fn(),
    onSaveAccount: vi.fn(),
    onSaveAgent: vi.fn(),
    onSaveAgentMailboxGrants: vi.fn(),
    onSaveAgentSystemPermissions: vi.fn(),
    onSaveGroup: vi.fn(),
    onSavePrincipalMailboxGrants: vi.fn(),
    onSavePrincipalSystemPermissions: vi.fn()
  } satisfies NonNullable<Parameters<typeof toMailboxAdminView>[5]>
}

describe('mailbox admin controller view mapping', () => {
  it('invalidates every mailbox admin page and navigation query after admin mutations', async () => {
    expect.hasAssertions()
    const queryClient = new QueryClient()
    const mailboxAdminNavigationKey = ['mail', 'admin', 'navigation', 'loader'] as const
    const mailboxAdminAccountsKey = [
      'mail',
      'admin',
      { page: 1, pageSize: 25, searchQuery: '', section: 'accounts', statusFilter: 'all' },
      'loader'
    ] as const
    const mailboxAdminFilteredAgentsKey = [
      'mail',
      'admin',
      { page: 3, pageSize: 25, searchQuery: 'paperclip', section: 'agents', statusFilter: 'active' },
      'loader'
    ] as const
    const mailWorkspaceKey = ['mail', 'workspace', { accountId: 'support@example.test' }, 'loader'] as const

    queryClient.setQueryData(mailboxAdminNavigationKey, { allowedSections: ['accounts'] })
    queryClient.setQueryData(mailboxAdminAccountsKey, { section: 'accounts' })
    queryClient.setQueryData(mailboxAdminFilteredAgentsKey, { section: 'agents' })
    queryClient.setQueryData(mailWorkspaceKey, { activeAccountId: 'support@example.test' })

    await invalidateMailboxAdminQueries(queryClient)

    expect(queryClient.getQueryState(mailboxAdminNavigationKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(mailboxAdminAccountsKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(mailboxAdminFilteredAgentsKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(mailWorkspaceKey)?.isInvalidated).toBe(false)
  })

  it('does not build the full mailbox admin view query outside mailbox admin mode', () => {
    expect.hasAssertions()

    expect(
      mailboxAdminViewQueryForSection({
        page: 1,
        pageSize: 25,
        searchQuery: '',
        section: undefined,
        statusFilter: 'all'
      })
    ).toBeUndefined()
    expect(
      mailboxAdminViewQueryForSection({
        page: 2,
        pageSize: 25,
        searchQuery: 'paperclip',
        section: 'agents',
        statusFilter: 'active'
      })
    ).toStrictEqual({
      page: 2,
      pageSize: 25,
      searchQuery: 'paperclip',
      section: 'agents',
      statusFilter: 'active'
    })
  })

  it('renders loading and error states without mutation callbacks', () => {
    expect.hasAssertions()
    const retry = vi.fn()
    const loadingView = toMailboxAdminView('agents', 'pending', null, undefined, retry)
    const errorView = toMailboxAdminView('groups', 'error', new Error('RPC failed'), undefined, retry)

    expect(loadingView).toMatchObject({
      accounts: [],
      agents: [],
      groups: [],
      section: 'agents',
      state: 'loading'
    })
    expect(loadingView.onSaveAccount).toBeUndefined()
    expect(errorView).toMatchObject({
      errorDescription: 'RPC failed',
      errorTitle: 'Mailbox administration unavailable',
      retryLabel: 'Retry',
      section: 'groups',
      state: 'error'
    })
    expect(errorView.onRetry).toBe(retry)
  })

  it('does not expose mutation callbacks denied by backend allowedActions', () => {
    expect.hasAssertions()
    const actions = mailboxAdminActions()
    const view = toMailboxAdminView('accounts', 'success', null, mailboxAdminView(), vi.fn(), actions)

    expect(view.onDialogChange).toBe(actions.onDialogChange)
    expect(view.onCopyAgentEnrollmentCommand).toBe(actions.onCopyAgentEnrollmentCommand)
    expect(view.onOpenMailbox).toBe(actions.onOpenMailbox)
    expect(view.onCreateAgent).toBeUndefined()
    expect(view.onDisableAccount).toBeUndefined()
    expect(view.onDisableGroup).toBeUndefined()
    expect(view.onRevokeAgent).toBeUndefined()
    expect(view.onRevokeAgentEnrollment).toBe(actions.onRevokeAgentEnrollment)
    expect(view.onSaveAccount).toBeUndefined()
    expect(view.onSaveAgent).toBeUndefined()
    expect(view.onSaveAgentMailboxGrants).toBeUndefined()
    expect(view.onSaveAgentSystemPermissions).toBeUndefined()
    expect(view.onSaveGroup).toBeUndefined()
    expect(view.onSavePrincipalMailboxGrants).toBeUndefined()
    expect(view.onSavePrincipalSystemPermissions).toBeUndefined()
  })

  it('exposes only the mutation callbacks explicitly allowed by backend state', () => {
    expect.hasAssertions()
    const actions = mailboxAdminActions()
    const view = toMailboxAdminView(
      'agents',
      'success',
      null,
      mailboxAdminView({
        allowedActions: {
          ...noAllowedActions,
          createAccount: true,
          manageAgentMailboxGrants: true,
          updateGroup: true
        }
      }),
      vi.fn(),
      actions
    )

    expect(view.onSaveAccount).toBe(actions.onSaveAccount)
    expect(view.onSaveAgentMailboxGrants).toBe(actions.onSaveAgentMailboxGrants)
    expect(view.onSavePrincipalMailboxGrants).toBe(actions.onSavePrincipalMailboxGrants)
    expect(view.onSaveGroup).toBe(actions.onSaveGroup)
    expect(view.onCreateAgent).toBeUndefined()
    expect(view.onSaveAgent).toBeUndefined()
    expect(view.onSaveAgentSystemPermissions).toBeUndefined()
    expect(view.onSavePrincipalSystemPermissions).toBeUndefined()
  })

  it('keeps account save wiring for provision-only mailbox creation flows', () => {
    expect.hasAssertions()
    const actions = mailboxAdminActions()
    const view = toMailboxAdminView(
      'agents',
      'success',
      null,
      mailboxAdminView({
        allowedActions: {
          ...noAllowedActions,
          manageAgentMailboxGrants: true,
          provisionAccount: true
        }
      }),
      vi.fn(),
      actions
    )

    expect(view.onSaveAccount).toBe(actions.onSaveAccount)
    expect(view.onSaveAgentMailboxGrants).toBe(actions.onSaveAgentMailboxGrants)
    expect(view.onSavePrincipalMailboxGrants).toBe(actions.onSavePrincipalMailboxGrants)
    expect(view.onCreateAgent).toBeUndefined()
    expect(view.onSaveAgent).toBeUndefined()
    expect(view.onSaveAgentSystemPermissions).toBeUndefined()
    expect(view.onSavePrincipalSystemPermissions).toBeUndefined()
  })
})

describe('mail client controller view mapping', () => {
  it('starts first-use dashboard onboarding with Cloudflare authorization when no grant exists', () => {
    expect.hasAssertions()
    const view = toDashboardView(
      'success',
      null,
      undefined,
      mailWorkspace({
        accounts: [],
        folders: [],
        messages: []
      }),
      domainSettings()
    )

    expect(view.state).toBe('empty')
    expect(view.onboardingPrompt).toMatchObject({
      actionLabel: 'Continue with Cloudflare',
      state: 'ready',
      title: 'Connect your domain'
    })
    expect(view.onboardingPrompt?.mode).toBeUndefined()
  })

  it('advances first-use dashboard onboarding to domain selection after Cloudflare is connected', () => {
    expect.hasAssertions()
    const view = toDashboardView(
      'success',
      null,
      undefined,
      mailWorkspace({
        accounts: [],
        folders: [],
        messages: []
      }),
      domainSettings({
        accounts: [cloudflareAccount()],
        draftDomain: 'agentteam.example',
        selectedAccountId: 'cloudflare-account-id',
        selectedZoneId: 'cloudflare-zone-id',
        status: {
          connections: [],
          grants: [cloudflareGrant()]
        },
        zones: [cloudflareZone()]
      })
    )

    expect(view.state).toBe('empty')
    expect(view.onboardingPrompt).toMatchObject({
      actionLabel: 'Continue setup',
      mode: 'configureDomain',
      state: 'ready',
      title: 'Choose your domain'
    })
  })

  it('keeps first-use dashboard onboarding on domain setup while a connected domain needs provisioning', () => {
    expect.hasAssertions()
    const view = toDashboardView(
      'success',
      null,
      undefined,
      mailWorkspace({
        accounts: [],
        folders: [],
        messages: []
      }),
      domainSettings({
        mode: 'domain',
        selectedDomainPublicId: cloudflareConnection().publicId,
        status: {
          connections: [cloudflareConnection()],
          grants: [cloudflareGrant()]
        }
      })
    )

    expect(view.state).toBe('empty')
    expect(view.onboardingPrompt).toMatchObject({
      mode: 'configureDomain',
      state: 'ready'
    })
  })

  it('prompts Cloudflare onboarding when the workspace has no accounts', () => {
    expect.hasAssertions()
    const view = toSidebarView(
      mailWorkspace({
        accounts: [],
        folders: [],
        messages: []
      }),
      'success',
      null,
      { name: '', state: 'closed' },
      { state: 'closed' },
      { name: '', state: 'closed' },
      undefined,
      undefined
    )

    expect(view.state).toBe('empty')
    expect(view.emptyTitle).toBe('No mailbox yet')
    expect(view.emptyDescription).toBe('Connect Cloudflare to add the first mailbox.')
  })

  it('keeps Cloudflare onboarding copy when a no-account workspace has stale filters', () => {
    expect.hasAssertions()
    const view = toSidebarView(
      mailWorkspace({
        accounts: [],
        folders: [],
        messages: []
      }),
      'success',
      null,
      { name: '', state: 'closed' },
      { state: 'closed' },
      { name: '', state: 'closed' },
      { mailQuery: 'paperclip', unreadOnly: true },
      undefined
    )

    expect(view.state).toBe('empty')
    expect(view.emptyTitle).toBe('No mailbox yet')
    expect(view.emptyDescription).toBe('Connect Cloudflare to add the first mailbox.')
  })

  it('uses filter-specific empty copy for server-side empty search results', () => {
    expect.hasAssertions()
    const view = toSidebarView(
      mailWorkspace({
        accounts: [mailAccount()],
        folders: [inboxFolder()],
        messages: []
      }),
      'success',
      null,
      { name: '', state: 'closed' },
      { state: 'closed' },
      { name: '', state: 'closed' },
      { mailQuery: 'paperclip', unreadOnly: true },
      undefined
    )

    expect(view.state).toBe('empty')
    expect(view.emptyTitle).toBe('No matching messages')
    expect(view.emptyDescription).toBe('Try another search or turn off the unread filter.')
  })

  it('uses onboarding copy for an empty inbox with a configured account', () => {
    expect.hasAssertions()
    const view = toSidebarView(
      mailWorkspace({
        accounts: [mailAccount()],
        folders: [inboxFolder()],
        messages: []
      }),
      'success',
      null,
      { name: '', state: 'closed' },
      { state: 'closed' },
      { name: '', state: 'closed' },
      undefined,
      undefined
    )

    expect(view.state).toBe('empty')
    expect(view.emptyTitle).toBe('Inbox is empty')
    expect(view.emptyDescription).toBe(
      'New messages delivered to this mailbox will appear here. Use Compose to send the first email from this account.'
    )
  })

  it('maps cursor pagination without inventing an offset range', () => {
    expect.hasAssertions()
    const view = toSidebarView(
      mailWorkspace({
        accounts: [mailAccount()],
        folders: [inboxFolder()],
        messages: [
          mailMessage({ id: '12', subject: 'First page item' }),
          mailMessage({ id: '13', subject: 'Second page item' })
        ],
        pagination: {
          limit: 2,
          nextCursor: 'next-page',
          previousCursor: 'previous-page',
          total: 57
        }
      }),
      'success',
      null,
      { name: '', state: 'closed' },
      { state: 'closed' },
      { name: '', state: 'closed' },
      { cursor: 'middle-page', direction: 'next' },
      undefined
    )

    expect(view.pagination).toMatchObject({
      canGoNext: true,
      canGoPrevious: true,
      nextCursor: 'next-page',
      previousCursor: 'previous-page',
      rangeLabel: '2 shown',
      totalLabel: '57 messages'
    })
  })

  it('derives selected message actions from the active folder context', () => {
    expect.hasAssertions()
    const actions = actionsForMessage(
      {
        isDraft: false,
        isStarred: false,
        mailboxId: 'junk-id',
        unread: false
      },
      [
        {
          id: 'inbox-id',
          name: 'Inbox',
          path: 'INBOX',
          protected: true,
          specialUse: '\\Inbox'
        },
        {
          id: 'junk-id',
          name: 'Junk',
          path: 'Junk',
          protected: true,
          specialUse: '\\Junk'
        }
      ]
    )

    expect(actions.some((action) => action.action === 'mark-not-spam')).toBe(true)
    expect(actions.find((action) => action.action === 'mark-spam')).toBeUndefined()
  })
})

function mailWorkspace(overrides: Partial<AgentMailWebWorkspace> = {}): AgentMailWebWorkspace {
  return {
    accounts: [],
    activeAccountId: 'support@example.test',
    activeFolderId: 'inbox-id',
    folders: [],
    messages: [],
    pagination: {
      limit: 25,
      nextCursor: null,
      previousCursor: null,
      total: 0
    },
    selectedMessage: null,
    ...overrides
  }
}

function mailMessage(
  overrides: Partial<AgentMailWebWorkspace['messages'][number]> = {}
): AgentMailWebWorkspace['messages'][number] {
  return {
    attachmentCount: 0,
    from: 'Sender <sender@example.test>',
    id: '12',
    isDraft: false,
    isStarred: false,
    mailboxId: 'inbox-id',
    receivedAt: '2026-06-22T12:00:00.000Z',
    subject: 'Message fixture',
    teaser: 'Message preview',
    unread: false,
    ...overrides
  }
}

function mailAccount(): AgentMailWebWorkspace['accounts'][number] {
  return {
    address: 'support@example.test',
    id: 'support@example.test',
    name: 'Support',
    state: 'ready'
  }
}

function inboxFolder(): AgentMailWebWorkspace['folders'][number] {
  return {
    id: 'inbox-id',
    name: 'Inbox',
    path: 'INBOX',
    protected: true,
    specialUse: '\\Inbox'
  }
}

function domainSettings(overrides: Partial<DomainSettingsState> = {}): DomainSettingsState {
  return {
    mode: 'addDomain',
    status: {
      connections: [],
      grants: []
    },
    ...overrides
  }
}

function cloudflareGrant(): DomainSettingsStatus['grants'][number] {
  return {
    cloudflareEmail: 'admin@example.com',
    cloudflareUserId: 'cloudflare-user-id',
    grantedScopes: ['account:read', 'zone:read'],
    lastErrorMessage: null,
    lastTokenCheckAt: new Date('2026-06-21T16:12:00.000Z'),
    publicId: 'grant-public-id' as DomainSettingsStatus['grants'][number]['publicId'],
    requiredScopes: ['account:read', 'zone:read'],
    status: 'active'
  }
}

function cloudflareConnection(): DomainSettingsStatus['connections'][number] {
  return {
    cloudflareAccountId: 'cloudflare-account-id',
    cloudflareAccountName: 'AgentTeam Production',
    cloudflareZoneId: 'cloudflare-zone-id',
    cloudflareZoneName: 'agentteam.example',
    domain: 'agentteam.example',
    lastErrorMessage: null,
    lastProvisionedAt: null,
    provisioningStatus: 'not_started',
    publicId: 'connection-public-id' as DomainSettingsStatus['connections'][number]['publicId'],
    status: 'connected',
    updatedAt: new Date('2026-06-21T16:16:00.000Z'),
    workerScriptName: null
  }
}

function cloudflareAccount(): NonNullable<DomainSettingsState['accounts']>[number] {
  return {
    id: 'cloudflare-account-id',
    name: 'AgentTeam Production',
    type: 'standard'
  }
}

function cloudflareZone(): NonNullable<DomainSettingsState['zones']>[number] {
  return {
    accountId: 'cloudflare-account-id',
    accountName: 'AgentTeam Production',
    id: 'cloudflare-zone-id',
    name: 'agentteam.example',
    status: 'active'
  }
}
