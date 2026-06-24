import type {
  MailboxAdminAccount,
  MailboxAdminAgent,
  MailboxAdminExternalPrincipal,
  MailboxAdminMailboxCapability,
  MailboxAdminPendingAgentEnrollment,
  MailboxAdminStatus,
  MailboxAdminStatusFilter,
  MailboxAdminSystemPermission,
  MailboxAdminView
} from './mailbox-admin-models'

export interface MailboxAdminVisibleRecords {
  accounts: ReadonlyArray<MailboxAdminAccount>
  agents: ReadonlyArray<MailboxAdminAgent>
  groups: MailboxAdminView['groups']
  pendingEnrollments: ReadonlyArray<MailboxAdminPendingAgentEnrollment>
  principals: ReadonlyArray<MailboxAdminExternalPrincipal>
}

export function getMailboxAdminVisibleRecordsForView(
  view: MailboxAdminView
): MailboxAdminVisibleRecords {
  if (isServerPaginatedMailboxAdminView(view)) {
    return {
      accounts: view.accounts,
      agents: view.agents,
      groups: view.groups,
      pendingEnrollments: view.pendingEnrollments,
      principals: view.principals
    }
  }

  const statusFilter = getStatusFilter(view)
  const query = normalizeSearchQuery(view.searchQuery)

  return {
    accounts: view.accounts.filter(
      (account) =>
        matchesStatusFilter(account.status, statusFilter) &&
        matchesSearchQuery(query, [
          account.address,
          account.agentName,
          account.domain,
          account.name,
          account.status,
          account.type,
          ...account.groups
        ])
    ),
    agents: view.agents.filter(
      (agent) =>
        matchesStatusFilter(agent.status, statusFilter) &&
        matchesSearchQuery(query, [
          agent.name,
          agent.handle,
          agent.primaryAccount,
          agent.status,
          ...agent.groups,
          ...agent.permissions.map((permission) =>
            formatSystemPermission(view.permissionCatalog, permission)
          ),
          ...agent.grants.map((grant) => grant.accountAddress)
        ])
    ),
    groups: view.groups.filter(
      (group) =>
        matchesStatusFilter(group.status, statusFilter) &&
        matchesSearchQuery(query, [
          group.address,
          group.description,
          group.domain,
          group.status,
          ...group.recipients
        ])
    ),
    pendingEnrollments: view.pendingEnrollments.filter(
      (enrollment) =>
        matchesStatusFilter(enrollment.status, statusFilter) &&
        matchesSearchQuery(query, [
          enrollment.createdAt,
          enrollment.grantExpiresAt ?? undefined,
          enrollment.hostId,
          enrollment.id,
          enrollment.lastUpdated,
          enrollment.name,
          ...enrollment.permissions.map((permission) =>
            formatSystemPermission(view.permissionCatalog, permission)
          ),
          enrollment.status,
          enrollment.tokenExpiresAt ?? undefined,
          ...enrollment.grants.flatMap((grant) => [
            grant.accountAddress,
            ...grant.capabilities.map((capability) =>
              formatMailboxCapability(view.permissionCatalog, capability)
            )
          ])
        ])
    ),
    principals: view.principals.filter(
      (principal) =>
        matchesStatusFilter(principal.status, statusFilter) &&
        matchesSearchQuery(query, [
          principal.id,
          principal.kind,
          principal.lastUsed,
          principal.name,
          ...principal.permissions.map((permission) =>
            formatSystemPermission(view.permissionCatalog, permission)
          ),
          principal.scope,
          principal.status,
          ...principal.grants.flatMap((grant) => [
            grant.accountAddress,
            ...grant.capabilities.map((capability) =>
              formatMailboxCapability(view.permissionCatalog, capability)
            )
          ])
        ])
    )
  }
}

export function isServerPaginatedMailboxAdminView(view: MailboxAdminView) {
  return view.pagination?.filteredRecords !== undefined || view.pagination?.totalRecords !== undefined
}

export function getStatusFilter(view: MailboxAdminView): MailboxAdminStatusFilter {
  return view.statusFilter ?? 'all'
}

export function matchesStatusFilter(
  status: MailboxAdminStatus,
  statusFilter: MailboxAdminStatusFilter
) {
  return statusFilter === 'all' || status === statusFilter
}

export function normalizeSearchQuery(query: string | undefined) {
  return query?.trim().toLocaleLowerCase() ?? ''
}

export function matchesSearchQuery(query: string, values: ReadonlyArray<string | undefined>) {
  if (!query) {
    return true
  }

  return values.some((value) => value?.toLocaleLowerCase().includes(query))
}

export function formatSystemPermission(
  catalog: MailboxAdminView['permissionCatalog'],
  permission: MailboxAdminSystemPermission
) {
  return (
    catalog.systemPermissionOptions.find((option) => option.value === permission)?.label ??
    formatPermissionFallback(permission)
  )
}

export function formatMailboxCapability(
  catalog: MailboxAdminView['permissionCatalog'],
  capability: MailboxAdminMailboxCapability
) {
  return (
    catalog.mailboxGrantOptions.find((option) => option.value === capability)?.label ??
    `Unknown capability (${capability})`
  )
}

function formatPermissionFallback(value: MailboxAdminMailboxCapability | MailboxAdminSystemPermission) {
  return value
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .split(/\s+/u)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}
