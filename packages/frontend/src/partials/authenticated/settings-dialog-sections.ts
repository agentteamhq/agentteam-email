export type SettingsSectionId =
  | 'account'
  | 'security'
  | 'organizations'
  | 'organizationSettings'
  | 'organizationPeople'
  | 'connectedAccounts'

const settingsRouteSegments = {
  account: 'account',
  security: 'security',
  organizations: 'organizations',
  connectedAccounts: 'connected-accounts'
} as const

const settingsSectionHrefs = {
  account: '/settings/account/',
  security: '/settings/security/',
  organizations: '/settings/organizations/',
  organizationSettings: '/organization/settings/',
  organizationPeople: '/organization/people/',
  connectedAccounts: '/settings/connected-accounts/'
} satisfies Record<SettingsSectionId, string>

const settingsSectionIds = new Set<SettingsSectionId>([
  'account',
  'security',
  'organizations',
  'organizationSettings',
  'organizationPeople',
  'connectedAccounts'
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

  if (segment === settingsRouteSegments.connectedAccounts || segment === 'connectedAccounts') {
    return 'connectedAccounts'
  }

  if (segment === 'developer') {
    return 'security'
  }

  return isSettingsSectionId(segment) ? segment : 'account'
}
