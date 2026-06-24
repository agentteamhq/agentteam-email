export type SettingsSectionId =
  | 'account'
  | 'security'
  | 'agentAccess'
  | 'organizations'
  | 'organizationSettings'
  | 'organizationPeople'
  | 'domains'

const settingsRouteSegments = {
  account: 'account',
  security: 'security',
  agentAccess: 'agent-access',
  organizations: 'organizations',
  domains: 'domains'
} as const

const settingsSectionHrefs = {
  account: '/settings/account/',
  security: '/settings/security/',
  agentAccess: '/settings/agent-access/',
  organizations: '/settings/organizations/',
  organizationSettings: '/organization/settings/',
  organizationPeople: '/organization/people/',
  domains: '/settings/domains/'
} satisfies Record<SettingsSectionId, string>

const settingsSectionIds = new Set<SettingsSectionId>([
  'account',
  'security',
  'agentAccess',
  'organizations',
  'organizationSettings',
  'organizationPeople',
  'domains'
])

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return settingsSectionIds.has(value as SettingsSectionId)
}

export function getSettingsSectionHref(section: SettingsSectionId) {
  return settingsSectionHrefs[section]
}

export function getSettingsSectionFromSegment(segment: string | undefined): SettingsSectionId {
  if (!segment) {
    return 'account'
  }

  if (
    segment === settingsRouteSegments.domains ||
    segment === 'connected-accounts' ||
    segment === 'connectedAccounts'
  ) {
    return 'domains'
  }

  if (segment === 'developer' || segment === 'cli-access' || segment === 'cliAccess') {
    return 'security'
  }

  if (segment === settingsRouteSegments.agentAccess || segment === 'agentAccess') {
    return 'agentAccess'
  }

  return isSettingsSectionId(segment) ? segment : 'account'
}
