import { agentMailAdminPermissionCatalog } from '@main/db/agent-mail-permission-schema'

import { defaultAuthenticatedSidebarView } from '../partials/authenticated/authenticated-shell-models'
import type { AuthenticatedSidebarView } from '../partials/authenticated/authenticated-shell-models'
import type {
  MailboxAdminAccount,
  MailboxAdminAgent,
  MailboxAdminGroup,
  MailboxAdminPendingAgentEnrollment,
  MailboxAdminSectionId,
  MailboxAdminStatusFilter,
  MailboxAdminView
} from '../partials/authenticated/mailbox-admin-models'

function ignoreMailboxAdminAction() {}

export const mailboxAdminDomain = 'agentteam.example'
const mailboxAdminOperationsApiKeyPublicId = '2zXdRMpXKicecXjRnFg1b'

export const mailboxAdminPermissionCatalog = {
  ...agentMailAdminPermissionCatalog
} satisfies MailboxAdminView['permissionCatalog']

export const mailboxAdminAllowedActions = {
  createAccount: true,
  createAgent: true,
  createGroup: true,
  disableAccount: true,
  disableGroup: true,
  manageAgentMailboxGrants: true,
  manageAgentSystemPermissions: true,
  provisionAccount: true,
  revokeAgent: true,
  updateAccount: true,
  updateAgent: true,
  updateGroup: true
} satisfies MailboxAdminView['allowedActions']

const mailboxAdminNoAllowedActions = {
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
    id: 'research@agentteam.example',
    lastActivity: 'Today, 9:12 AM',
    name: 'Research',
    status: 'active',
    type: 'mailbox'
  },
  {
    accessCount: 3,
    address: 'ops@agentteam.example',
    agentName: 'Operations Agent',
    domain: mailboxAdminDomain,
    groups: ['support@agentteam.example', 'alerts@agentteam.example'],
    id: 'ops@agentteam.example',
    lastActivity: 'Yesterday, 4:40 PM',
    name: 'Operations',
    status: 'active',
    type: 'mailbox'
  },
  {
    accessCount: 1,
    address: 'media@agentteam.example',
    domain: mailboxAdminDomain,
    groups: ['press@agentteam.example'],
    id: 'media@agentteam.example',
    lastActivity: 'Jun 20, 2026',
    name: 'Media',
    status: 'active',
    type: 'mailbox'
  },
  {
    accessCount: 0,
    address: 'triage@agentteam.example',
    domain: mailboxAdminDomain,
    groups: ['support@agentteam.example'],
    id: 'triage@agentteam.example',
    lastActivity: 'Provisioning',
    name: 'Triage',
    status: 'pending',
    type: 'mailbox'
  },
  {
    accessCount: 0,
    address: 'handoff@agentteam.example',
    domain: mailboxAdminDomain,
    groups: ['support@agentteam.example'],
    id: 'handoff@agentteam.example',
    lastActivity: 'Jun 14, 2026',
    name: 'Handoff',
    status: 'disabled',
    type: 'mailbox'
  }
] satisfies ReadonlyArray<MailboxAdminAccount>

export const mailboxAdminDenseAccounts = Array.from({ length: 42 }, (_item, index) => {
  const number = index + 1
  const padded = number.toString().padStart(2, '0')
  const status = number % 11 === 0 ? 'disabled' : number % 7 === 0 ? 'pending' : 'active'

  return {
    accessCount: number % 3,
    address: `team-${padded}@agentteam.example`,
    agentName: number % 2 === 0 ? 'Operations Agent' : 'Research Agent',
    domain: mailboxAdminDomain,
    groups: number % 3 === 0 ? ['support@agentteam.example'] : ['press@agentteam.example'],
    id: `team-${padded}@agentteam.example`,
    lastActivity: number % 5 === 0 ? 'Yesterday, 4:40 PM' : 'Today, 9:12 AM',
    name: `Team ${padded}`,
    status,
    type: 'mailbox'
  } satisfies MailboxAdminAccount
}) satisfies ReadonlyArray<MailboxAdminAccount>

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
        accountId: 'research@agentteam.example',
        capabilities: ['readMailbox', 'sendAs', 'createDrafts']
      },
      {
        accountAddress: 'media@agentteam.example',
        accountId: 'media@agentteam.example',
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
        accountId: 'ops@agentteam.example',
        capabilities: ['readMailbox', 'sendAs', 'createDrafts', 'manageMessages']
      }
    ],
    groups: ['support@agentteam.example', 'alerts@agentteam.example'],
    handle: 'ops-bot',
    id: 'agent-ops',
    lastSeen: '18 minutes ago',
    name: 'Operations Agent',
    permissions: ['createAccounts', 'manageAgents', 'manageForwardingGroups'],
    primaryAccount: 'ops@agentteam.example',
    status: 'active'
  },
  {
    grants: [],
    groups: [],
    handle: 'audit-reader',
    id: 'agent-audit',
    lastSeen: 'Awaiting activation',
    name: 'Audit Reader',
    permissions: [],
    status: 'pending'
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

export const mailboxAdminExternalPrincipals = [
  {
    grants: [
      {
        accountAddress: 'ops@agentteam.example',
        accountId: 'ops@agentteam.example',
        capabilities: ['readMailbox', 'sendAs']
      }
    ],
    id: mailboxAdminOperationsApiKeyPublicId,
    kind: 'api_key',
    lastUsed: 'Today, 8:42 AM',
    name: 'Operations API key',
    permissions: [],
    scope: 'organization',
    status: 'active'
  },
  {
    grants: [],
    id: 'paperclip-client',
    kind: 'oauth_client',
    lastUsed: 'Yesterday, 6:15 PM',
    name: 'Paperclip OAuth client',
    permissions: ['readAllMailboxes'],
    scope: 'organization',
    status: 'active'
  }
] satisfies MailboxAdminView['principals']

export const mailboxAdminPendingEnrollments = [
  {
    canRevoke: true,
    createdAt: '2026-06-22',
    grantExpiresAt: '2026-07-22T12:30:00.000Z',
    grants: [
      {
        accountAddress: 'support@agentteam.example',
        accountId: 'support@agentteam.example',
        capabilities: ['readMailbox', 'createDrafts', 'sendAs']
      }
    ],
    hostId: '01960000-0000-7000-8000-000000000120',
    id: '2zPendingAgentEnrollment',
    lastUpdated: '2026-06-22',
    mailboxGrantCount: 3,
    name: 'Research Agent',
    permissions: ['manageForwardingGroups'],
    status: 'pending',
    systemPermissionCount: 1,
    tokenExpiresAt: '2026-06-22T12:30:00.000Z'
  }
] satisfies ReadonlyArray<MailboxAdminPendingAgentEnrollment>

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
  allowedActions: mailboxAdminAllowedActions,
  allowedSections: ['accounts', 'groups', 'agents'],
  domain: mailboxAdminDomain,
  groups: mailboxAdminGroups,
  pendingEnrollments: [],
  permissionCatalog: mailboxAdminPermissionCatalog,
  principals: mailboxAdminExternalPrincipals,
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

export const mailboxAdminPendingAccountsView = mailboxAdminFilteredView('accounts', 'pending')

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

export const mailboxAdminErrorView = {
  ...mailboxAdminReadyView,
  errorDescription: 'The mailbox administration RPC returned HTTP 502 while loading accounts.',
  errorTitle: 'Mailbox administration unavailable',
  onRetry: ignoreMailboxAdminAction,
  retryLabel: 'Retry',
  state: 'error'
} satisfies MailboxAdminView

export const mailboxAdminForbiddenView = {
  ...mailboxAdminReadyView,
  allowedActions: mailboxAdminNoAllowedActions,
  allowedSections: [],
  errorDescription: 'Your active organization role cannot administer mailbox accounts.',
  errorTitle: 'Mailbox administration forbidden',
  state: 'error'
} satisfies MailboxAdminView

export const mailboxAdminReadOnlyAccountsView = {
  ...mailboxAdminReadyView,
  allowedActions: mailboxAdminNoAllowedActions
} satisfies MailboxAdminView

export const mailboxAdminPaginatedAccountsView = {
  ...mailboxAdminReadyView,
  accounts: mailboxAdminDenseAccounts,
  onPageChange: ignoreMailboxAdminAction,
  pagination: {
    page: 2,
    pageSize: 10
  }
} satisfies MailboxAdminView

export const mailboxAdminGroupsOnlyView = {
  ...mailboxAdminReadyView,
  accounts: [],
  allowedActions: {
    ...mailboxAdminNoAllowedActions,
    createGroup: true,
    disableGroup: true,
    updateGroup: true
  },
  allowedSections: ['groups'],
  agents: [],
  onDialogChange: ignoreMailboxAdminAction,
  onDisableGroup: ignoreMailboxAdminAction,
  onSaveGroup: ignoreMailboxAdminAction,
  principals: [],
  section: 'groups'
} satisfies MailboxAdminView

export const mailboxAdminAgentsNoGrantManagementView = {
  ...mailboxAdminReadyView,
  allowedActions: {
    ...mailboxAdminAllowedActions,
    manageAgentMailboxGrants: false,
    manageAgentSystemPermissions: false,
    revokeAgent: false
  },
  onCreateAgent: ignoreMailboxAdminAction,
  onDialogChange: ignoreMailboxAdminAction,
  onSaveAgent: ignoreMailboxAdminAction,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminExternalPrincipalsOnlyView = {
  ...mailboxAdminReadyView,
  agents: [],
  pagination: {
    filteredRecords: mailboxAdminExternalPrincipals.length,
    page: 1,
    pageSize: 25,
    totalRecords: mailboxAdminExternalPrincipals.length
  },
  principals: mailboxAdminExternalPrincipals,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminPendingAgentEnrollmentsView = {
  ...mailboxAdminReadyView,
  pendingEnrollments: mailboxAdminPendingEnrollments,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminPendingAgentEnrollmentRevokingView = {
  ...mailboxAdminPendingAgentEnrollmentsView,
  onRevokeAgentEnrollment: ignoreMailboxAdminAction,
  pendingAgentEnrollmentRevokeId: mailboxAdminPendingEnrollments[0].id
} satisfies MailboxAdminView

export const mailboxAdminPendingAgentEnrollmentCannotRevokeView = {
  ...mailboxAdminPendingAgentEnrollmentsView,
  onRevokeAgentEnrollment: ignoreMailboxAdminAction,
  pendingEnrollments: mailboxAdminPendingEnrollments.map((enrollment) => ({
    ...enrollment,
    canRevoke: false
  }))
} satisfies MailboxAdminView

export const mailboxAdminCreateAccountView = {
  ...mailboxAdminReadyView,
  activeDialog: { type: 'accountEditor' },
  onDialogChange: ignoreMailboxAdminAction,
  onSaveAccount: ignoreMailboxAdminAction
} satisfies MailboxAdminView

export const mailboxAdminEditAccountView = {
  ...mailboxAdminReadyView,
  activeDialog: { accountId: 'research@agentteam.example', type: 'accountEditor' },
  onDialogChange: ignoreMailboxAdminAction,
  onSaveAccount: ignoreMailboxAdminAction
} satisfies MailboxAdminView

export const mailboxAdminDisableAccountSavingView = {
  ...mailboxAdminReadyView,
  onDisableAccount: ignoreMailboxAdminAction,
  pendingAccountDisableId: 'research@agentteam.example'
} satisfies MailboxAdminView

export const mailboxAdminProvisionAccountView = {
  ...mailboxAdminReadyView,
  activeDialog: { agentId: 'agent-ops', type: 'accountEditor' },
  onDialogChange: ignoreMailboxAdminAction,
  onSaveAccount: ignoreMailboxAdminAction,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminProvisionAccountSavingView = {
  ...mailboxAdminProvisionAccountView,
  pendingAccountSave: true
} satisfies MailboxAdminView

export const mailboxAdminEditGroupView = {
  ...mailboxAdminReadyView,
  activeDialog: { groupId: 'group-support', type: 'groupEditor' },
  section: 'groups'
} satisfies MailboxAdminView

export const mailboxAdminGroupRecipientsView = {
  ...mailboxAdminReadyView,
  activeDialog: { groupId: 'group-support', type: 'groupRecipients' },
  onDialogChange: ignoreMailboxAdminAction,
  onSaveGroup: ignoreMailboxAdminAction,
  section: 'groups'
} satisfies MailboxAdminView

export const mailboxAdminGroupRecipientsSavingView = {
  ...mailboxAdminGroupRecipientsView,
  pendingGroupSave: true
} satisfies MailboxAdminView

export const mailboxAdminCreateAgentView = {
  ...mailboxAdminReadyView,
  activeDialog: { type: 'agentEditor' },
  onCreateAgent: ignoreMailboxAdminAction,
  onDialogChange: ignoreMailboxAdminAction,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminCreateAgentSavingView = {
  ...mailboxAdminCreateAgentView,
  pendingAgentCreate: true
} satisfies MailboxAdminView

export const mailboxAdminCreateAgentEnrollmentView = {
  ...mailboxAdminCreateAgentView,
  createdAgentEnrollment: {
    enrollmentToken: 'enroll_9sV8P2uL4dTq7mZc',
    enrollmentTokenExpiresAt: '2026-06-22T12:30:00.000Z',
    grantExpiresAt: '2026-07-22T12:30:00.000Z',
    hostId: 'host_01JZMAILAGENT',
    mailboxGrantCount: 4,
    name: 'Research Agent',
    status: 'pending_enrollment',
    systemPermissionCount: 1
  }
} satisfies MailboxAdminView

export const mailboxAdminEditAgentView = {
  ...mailboxAdminReadyView,
  activeDialog: { agentId: 'agent-research', type: 'agentEditor' },
  onDialogChange: ignoreMailboxAdminAction,
  onSaveAgent: ignoreMailboxAdminAction,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminEditAgentSavingView = {
  ...mailboxAdminEditAgentView,
  pendingAgentSaveId: 'agent-research'
} satisfies MailboxAdminView

export const mailboxAdminAgentPermissionsView = {
  ...mailboxAdminReadyView,
  activeDialog: { agentId: 'agent-research', type: 'agentPermissions' },
  onDialogChange: ignoreMailboxAdminAction,
  onSaveAgentSystemPermissions: ignoreMailboxAdminAction,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminAgentPermissionsSavingView = {
  ...mailboxAdminAgentPermissionsView,
  pendingAgentSystemPermissionsSaveId: 'agent-research'
} satisfies MailboxAdminView

export const mailboxAdminAgentAccountsView = {
  ...mailboxAdminReadyView,
  activeDialog: { agentId: 'agent-research', type: 'agentAccounts' },
  onDialogChange: ignoreMailboxAdminAction,
  onSaveAgentMailboxGrants: ignoreMailboxAdminAction,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminAgentAccountsSavingView = {
  ...mailboxAdminAgentAccountsView,
  pendingAgentMailboxGrantsSaveId: 'agent-research'
} satisfies MailboxAdminView

export const mailboxAdminPrincipalAccountsView = {
  ...mailboxAdminReadyView,
  activeDialog: {
    principalId: mailboxAdminOperationsApiKeyPublicId,
    principalType: 'api_key',
    type: 'principalAccounts'
  },
  onDialogChange: ignoreMailboxAdminAction,
  onSavePrincipalMailboxGrants: ignoreMailboxAdminAction,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminPrincipalAccountsSavingView = {
  ...mailboxAdminPrincipalAccountsView,
  pendingPrincipalMailboxGrantsSaveId: `api_key:${mailboxAdminOperationsApiKeyPublicId}`
} satisfies MailboxAdminView

export const mailboxAdminPrincipalPermissionsView = {
  ...mailboxAdminReadyView,
  activeDialog: {
    principalId: 'paperclip-client',
    principalType: 'oauth_client',
    type: 'principalPermissions'
  },
  onDialogChange: ignoreMailboxAdminAction,
  onSavePrincipalSystemPermissions: ignoreMailboxAdminAction,
  section: 'agents'
} satisfies MailboxAdminView

export const mailboxAdminPrincipalPermissionsSavingView = {
  ...mailboxAdminPrincipalPermissionsView,
  pendingPrincipalSystemPermissionsSaveId: 'oauth_client:paperclip-client'
} satisfies MailboxAdminView
