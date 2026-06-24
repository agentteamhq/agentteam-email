import type {
  AgentMailAdminAccount,
  AgentMailAdminAccountInput,
  AgentMailAdminAgent,
  AgentMailAdminAgentEnrollment,
  AgentMailAdminAgentInput,
  AgentMailAdminAgentMailboxGrantsInput,
  AgentMailAdminAgentSystemPermissionsInput,
  AgentMailAdminExternalPrincipal,
  AgentMailAdminForwardingGroupInput,
  AgentMailAdminGroup,
  AgentMailAdminMailboxGrant,
  AgentMailAdminPendingAgentEnrollment,
  AgentMailAdminSectionId,
  AgentMailAdminStatus,
  AgentMailAdminStatusFilter,
  AgentMailAdminUpdateAccountInput,
  AgentMailAdminUpdateForwardingGroupInput,
  AgentMailAdminView,
  AgentMailAdminViewState
} from '@main/backend'
import type { AgentMailMailboxGrant, AgentMailSystemPermission } from '@main/db/agent-mail-permission-schema'

export type MailboxAdminSectionId = AgentMailAdminSectionId
export type MailboxAdminViewState = AgentMailAdminViewState | 'error'
export type MailboxAdminStatus = AgentMailAdminStatus
export type MailboxAdminStatusFilter = AgentMailAdminStatusFilter
export type MailboxAdminMailboxCapability = AgentMailMailboxGrant
export type MailboxAdminSystemPermission = AgentMailSystemPermission

export type MailboxAdminMailboxGrant = AgentMailAdminMailboxGrant

export type MailboxAdminAccount = AgentMailAdminAccount

export type MailboxAdminGroup = AgentMailAdminGroup

export type MailboxAdminAgent = AgentMailAdminAgent

export type MailboxAdminExternalPrincipal = AgentMailAdminExternalPrincipal

export type MailboxAdminAgentEnrollment = AgentMailAdminAgentEnrollment

export type MailboxAdminPendingAgentEnrollment = AgentMailAdminPendingAgentEnrollment

export interface MailboxAdminPagination {
  filteredRecords?: number
  page: number
  pageSize: number
  totalRecords?: number
}

export type MailboxAdminDialogState =
  | { accountId?: string; agentId?: string; type: 'accountEditor' }
  | { groupId?: string; type: 'groupEditor' }
  | { groupId: string; type: 'groupRecipients' }
  | { agentId?: string; type: 'agentEditor' }
  | { agentId: string; type: 'agentAccounts' }
  | { agentId: string; type: 'agentPermissions' }
  | { principalId: string; principalType: MailboxAdminExternalPrincipal['kind']; type: 'principalAccounts' }
  | { principalId: string; principalType: MailboxAdminExternalPrincipal['kind']; type: 'principalPermissions' }

export type MailboxAdminAccountInput = AgentMailAdminAccountInput & AgentMailAdminUpdateAccountInput

export type MailboxAdminAgentSystemPermissionsInput = AgentMailAdminAgentSystemPermissionsInput

export type MailboxAdminAgentInput = AgentMailAdminAgentInput

export type MailboxAdminAgentMailboxGrantsInput = AgentMailAdminAgentMailboxGrantsInput

export type MailboxAdminGroupInput = AgentMailAdminForwardingGroupInput &
  AgentMailAdminUpdateForwardingGroupInput

export interface MailboxAdminView extends Omit<AgentMailAdminView, 'pagination' | 'state'> {
  activeDialog?: MailboxAdminDialogState | null
  errorDescription?: string
  errorTitle?: string
  onRetry?: () => void
  onDialogChange?: (dialog: MailboxAdminDialogState | null) => void
  onOpenMailbox?: (accountId: string) => void
  onCopyAgentEnrollmentCommand?: (command: string) => void
  onPageChange?: (page: number) => void
  onDisableAccount?: (accountId: string) => void
  onDisableGroup?: (groupId: string) => void
  onRevokeAgent?: (agentId: string) => void
  onRevokeAgentEnrollment?: (enrollmentId: string) => void
  onCreateAgent?: (input: MailboxAdminAgentInput) => void
  onSaveAccount?: (accountId: string | undefined, input: MailboxAdminAccountInput) => void
  onSaveAgent?: (agentId: string, input: MailboxAdminAgentInput) => void
  onSaveAgentMailboxGrants?: (agentId: string, input: MailboxAdminAgentMailboxGrantsInput) => void
  onSaveAgentSystemPermissions?: (agentId: string, input: MailboxAdminAgentSystemPermissionsInput) => void
  onSavePrincipalMailboxGrants?: (
    principal: Pick<MailboxAdminExternalPrincipal, 'id' | 'kind'>,
    input: MailboxAdminAgentMailboxGrantsInput
  ) => void
  onSavePrincipalSystemPermissions?: (
    principal: Pick<MailboxAdminExternalPrincipal, 'id' | 'kind'>,
    input: MailboxAdminAgentSystemPermissionsInput
  ) => void
  onSaveGroup?: (groupId: string | undefined, input: MailboxAdminGroupInput) => void
  onSearchQueryChange?: (query: string) => void
  onStatusFilterChange?: (statusFilter: MailboxAdminStatusFilter) => void
  createdAgentEnrollment?: MailboxAdminAgentEnrollment | null
  pendingAgentRevokeId?: string | null
  pendingAgentEnrollmentRevokeId?: string | null
  pendingAccountDisableId?: string | null
  pendingAccountSave?: boolean
  pendingAgentCreate?: boolean
  pendingAgentSaveId?: string | null
  pendingAgentMailboxGrantsSaveId?: string | null
  pendingAgentSystemPermissionsSaveId?: string | null
  pendingPrincipalMailboxGrantsSaveId?: string | null
  pendingPrincipalSystemPermissionsSaveId?: string | null
  pendingGroupDisableId?: string | null
  pendingGroupSave?: boolean
  pagination?: MailboxAdminPagination
  retryLabel?: string
  searchQuery?: string
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
