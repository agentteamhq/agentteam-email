export type MailboxAdminSectionId = 'accounts' | 'agents' | 'groups'
export type MailboxAdminViewState = 'ready' | 'loading' | 'empty'
export type MailboxAdminStatus = 'active' | 'disabled' | 'limited' | 'pending'
export type MailboxAdminStatusFilter = 'all' | MailboxAdminStatus
export type MailboxAdminMailboxCapability = 'createDrafts' | 'manageMessages' | 'readMailbox' | 'sendAs'
export type MailboxAdminSystemPermission = 'createAccounts' | 'manageForwardingGroups' | 'readAllMailboxes'

export interface MailboxAdminMailboxGrant {
  accountAddress: string
  accountId: string
  capabilities: ReadonlyArray<MailboxAdminMailboxCapability>
}

export interface MailboxAdminAccount {
  accessCount: number
  address: string
  agentName?: string
  domain: string
  groups: ReadonlyArray<string>
  id: string
  lastActivity: string
  status: MailboxAdminStatus
  type: 'alias' | 'mailbox'
}

export interface MailboxAdminGroup {
  address: string
  description: string
  domain: string
  id: string
  lastDelivered: string
  lastUpdated: string
  recipients: ReadonlyArray<string>
  status: MailboxAdminStatus
}

export interface MailboxAdminAgent {
  grants: ReadonlyArray<MailboxAdminMailboxGrant>
  groups: ReadonlyArray<string>
  handle: string
  id: string
  lastSeen: string
  name: string
  permissions: ReadonlyArray<MailboxAdminSystemPermission>
  primaryAccount?: string
  status: MailboxAdminStatus
}

export type MailboxAdminDialogState =
  | { accountId?: string; agentId?: string; type: 'accountEditor' }
  | { groupId?: string; type: 'groupEditor' }
  | { groupId: string; type: 'groupRecipients' }
  | { agentId?: string; type: 'agentEditor' }
  | { agentId: string; type: 'agentAccounts' }
  | { agentId: string; type: 'agentPermissions' }

export interface MailboxAdminView {
  accounts: ReadonlyArray<MailboxAdminAccount>
  activeDialog?: MailboxAdminDialogState | null
  agents: ReadonlyArray<MailboxAdminAgent>
  domain: string
  groups: ReadonlyArray<MailboxAdminGroup>
  onSearchQueryChange?: (query: string) => void
  onStatusFilterChange?: (statusFilter: MailboxAdminStatusFilter) => void
  searchQuery?: string
  section: MailboxAdminSectionId
  state: MailboxAdminViewState
  statusFilter?: MailboxAdminStatusFilter
}

const mailboxAdminSectionTitles = {
  accounts: 'Accounts',
  agents: 'Agents',
  groups: 'Forwarding groups'
} satisfies Record<MailboxAdminSectionId, string>

export function isMailboxAdminSectionId(value: string): value is MailboxAdminSectionId {
  return value === 'accounts' || value === 'agents' || value === 'groups'
}

export function getMailboxAdminSectionTitle(section: MailboxAdminSectionId) {
  return mailboxAdminSectionTitles[section]
}
