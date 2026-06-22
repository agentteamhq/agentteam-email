import { defaultAuthenticatedSidebarView } from '../partials/authenticated/authenticated-shell-models'
import type { AuthenticatedSidebarView } from '../partials/authenticated/authenticated-shell-models'
import type {
  MailboxAdminAccount,
  MailboxAdminAgent,
  MailboxAdminGroup,
  MailboxAdminSectionId,
  MailboxAdminStatusFilter,
  MailboxAdminView
} from '../partials/authenticated/mailbox-admin-models'

export const mailboxAdminDomain = 'agentteam.example'

export const mailboxAdminManagementNav = [
  {
    id: 'accounts',
    title: 'Accounts',
    url: '#',
    iconKey: 'accounts'
  },
  {
    id: 'groups',
    title: 'Groups',
    url: '#',
    iconKey: 'groups'
  },
  {
    id: 'agents',
    title: 'Agents',
    url: '#',
    iconKey: 'agents'
  }
] satisfies AuthenticatedSidebarView['managementNav']

export function mailboxAdminSidebarView(section: MailboxAdminSectionId): AuthenticatedSidebarView {
  return {
    ...defaultAuthenticatedSidebarView,
    activeItemId: section,
    managementNav: mailboxAdminManagementNav,
    mails: [],
    selectedMailId: undefined
  }
}

export const mailboxAdminAccounts = [
  {
    accessCount: 2,
    address: 'research@agentteam.example',
    agentName: 'Research Agent',
    domain: mailboxAdminDomain,
    groups: ['press@agentteam.example'],
    id: 'account-research',
    lastActivity: 'Today, 9:12 AM',
    status: 'active',
    type: 'mailbox'
  },
  {
    accessCount: 3,
    address: 'ops@agentteam.example',
    agentName: 'Operations Agent',
    domain: mailboxAdminDomain,
    groups: ['support@agentteam.example', 'alerts@agentteam.example'],
    id: 'account-ops',
    lastActivity: 'Yesterday, 4:40 PM',
    status: 'active',
    type: 'mailbox'
  },
  {
    accessCount: 1,
    address: 'media@agentteam.example',
    domain: mailboxAdminDomain,
    groups: ['press@agentteam.example'],
    id: 'account-media',
    lastActivity: 'Jun 20, 2026',
    status: 'limited',
    type: 'alias'
  },
  {
    accessCount: 0,
    address: 'triage@agentteam.example',
    domain: mailboxAdminDomain,
    groups: ['support@agentteam.example'],
    id: 'account-triage',
    lastActivity: 'Provisioning',
    status: 'pending',
    type: 'mailbox'
  },
  {
    accessCount: 0,
    address: 'handoff@agentteam.example',
    domain: mailboxAdminDomain,
    groups: ['support@agentteam.example'],
    id: 'account-handoff',
    lastActivity: 'Jun 14, 2026',
    status: 'disabled',
    type: 'mailbox'
  }
] satisfies ReadonlyArray<MailboxAdminAccount>

export const mailboxAdminGroups = [
  {
    address: 'support@agentteam.example',
    description: 'Routes inbound support requests to the assigned mailbox operators.',
    domain: mailboxAdminDomain,
    id: 'group-support',
    lastDelivered: 'Today, 10:05 AM',
    lastUpdated: 'Today, 8:45 AM',
    recipients: [
      'ops@agentteam.example',
      'research@agentteam.example',
      'triage@agentteam.example',
      'handoff@agentteam.example'
    ],
    status: 'active'
  },
  {
    address: 'press@agentteam.example',
    description: 'Routes press and media requests to accounts that can draft responses.',
    domain: mailboxAdminDomain,
    id: 'group-press',
    lastDelivered: 'Yesterday, 2:18 PM',
    lastUpdated: 'Jun 20, 2026',
    recipients: ['media@agentteam.example', 'research@agentteam.example'],
    status: 'active'
  },
  {
    address: 'alerts@agentteam.example',
    description: 'Routes platform and deliverability alerts to the operations account.',
    domain: mailboxAdminDomain,
    id: 'group-alerts',
    lastDelivered: 'Jun 18, 2026',
    lastUpdated: 'Jun 18, 2026',
    recipients: ['ops@agentteam.example'],
    status: 'pending'
  }
] satisfies ReadonlyArray<MailboxAdminGroup>

export const mailboxAdminAgents = [
  {
    grants: [
      {
        accountAddress: 'research@agentteam.example',
        accountId: 'account-research',
        capabilities: ['readMailbox', 'sendAs', 'createDrafts']
      },
      {
        accountAddress: 'media@agentteam.example',
        accountId: 'account-media',
        capabilities: ['readMailbox', 'createDrafts']
      }
    ],
    groups: ['press@agentteam.example'],
    handle: 'researcher',
    id: 'agent-research',
    lastSeen: '2 minutes ago',
    name: 'Research Agent',
    permissions: [],
    primaryAccount: 'research@agentteam.example',
    status: 'active'
  },
  {
    grants: [
      {
        accountAddress: 'ops@agentteam.example',
        accountId: 'account-ops',
        capabilities: ['readMailbox', 'sendAs', 'createDrafts', 'manageMessages']
      }
    ],
    groups: ['support@agentteam.example', 'alerts@agentteam.example'],
    handle: 'ops-bot',
    id: 'agent-ops',
    lastSeen: '18 minutes ago',
    name: 'Operations Agent',
    permissions: ['createAccounts', 'manageForwardingGroups'],
    primaryAccount: 'ops@agentteam.example',
    status: 'active'
  },
  {
    grants: [],
    groups: [],
    handle: 'audit-reader',
    id: 'agent-audit',
    lastSeen: 'Jun 19, 2026',
    name: 'Audit Reader',
    permissions: [],
    status: 'limited'
  },
  {
    grants: [],
    groups: [],
    handle: 'legacy-writer',
    id: 'agent-legacy',
    lastSeen: 'Jun 12, 2026',
    name: 'Legacy Writer',
    permissions: [],
    primaryAccount: 'handoff@agentteam.example',
    status: 'disabled'
  }
] satisfies ReadonlyArray<MailboxAdminAgent>

function mailboxAdminFilteredView(
  section: MailboxAdminSectionId,
  statusFilter: MailboxAdminStatusFilter
): MailboxAdminView {
  return {
    ...mailboxAdminReadyView,
    section,
    statusFilter
  }
}

export const mailboxAdminReadyView = {
  accounts: mailboxAdminAccounts,
  agents: mailboxAdminAgents,
  domain: mailboxAdminDomain,
  groups: mailboxAdminGroups,
  section: 'accounts',
  state: 'ready'
} satisfies MailboxAdminView

export const mailboxAdminLoadingView = {
  ...mailboxAdminReadyView,
  state: 'loading'
} satisfies MailboxAdminView

export const mailboxAdminGroupsLoadingView = {
  ...mailboxAdminReadyView,
  section: 'groups',
  state: 'loading'
} satisfies MailboxAdminView

export const mailboxAdminGroupsEmptyView = {
  ...mailboxAdminReadyView,
  groups: [],
  section: 'groups',
  state: 'empty'
} satisfies MailboxAdminView

export const mailboxAdminLimitedAccountsView = mailboxAdminFilteredView('accounts', 'limited')

export const mailboxAdminPendingGroupsView = mailboxAdminFilteredView('groups', 'pending')

export const mailboxAdminDisabledAgentsView = mailboxAdminFilteredView('agents', 'disabled')

export const mailboxAdminNoStatusResultsView = mailboxAdminFilteredView('groups', 'disabled')

export const mailboxAdminSearchNoResultsView = {
  ...mailboxAdminReadyView,
  searchQuery: 'not-found'
} satisfies MailboxAdminView

export const mailboxAdminEmptyView = {
  ...mailboxAdminReadyView,
  accounts: [],
  agents: [],
  groups: [],
  state: 'empty'
} satisfies MailboxAdminView

export const mailboxAdminCreateAccountView = {
  ...mailboxAdminReadyView,
  activeDialog: { type: 'accountEditor' }
} satisfies MailboxAdminView

export const mailboxAdminProvisionAccountView = {
  ...mailboxAdminReadyView,
  activeDialog: { agentId: 'agent-ops', type: 'accountEditor' },
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminEditGroupView = {
  ...mailboxAdminReadyView,
  activeDialog: { groupId: 'group-support', type: 'groupEditor' },
  section: 'groups'
} satisfies MailboxAdminView

export const mailboxAdminGroupRecipientsView = {
  ...mailboxAdminReadyView,
  activeDialog: { groupId: 'group-support', type: 'groupRecipients' },
  section: 'groups'
} satisfies MailboxAdminView

export const mailboxAdminCreateAgentView = {
  ...mailboxAdminReadyView,
  activeDialog: { type: 'agentEditor' },
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminAgentPermissionsView = {
  ...mailboxAdminReadyView,
  activeDialog: { agentId: 'agent-research', type: 'agentPermissions' },
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminAgentAccountsView = {
  ...mailboxAdminReadyView,
  activeDialog: { agentId: 'agent-research', type: 'agentAccounts' },
  section: 'agents'
} satisfies MailboxAdminView
