export type SettingsSectionId =
  | 'account'
  | 'security'
  | 'agentAccess'
  | 'connected-accounts'
  | 'organizations'
  | 'organizationSettings'
  | 'organizationPeople'
  | 'domains'

type SettingsRouteSectionId = Extract<
  SettingsSectionId,
  'account' | 'security' | 'agentAccess' | 'connected-accounts' | 'organizations' | 'domains'
>

type SettingsRouteSegmentResolution =
  | {
      section: SettingsRouteSectionId
      type: 'section'
    }
  | {
      href: string
      type: 'redirect'
    }
  | {
      type: 'notFound'
    }

export const settingsRouteSegments = {
  account: 'account',
  security: 'security',
  agentAccess: 'agent-access',
  'connected-accounts': 'connected-accounts',
  organizations: 'organizations',
  domains: 'domains'
} satisfies Record<SettingsRouteSectionId, string>

const settingsSectionHrefs = {
  account: '/settings/account/',
  security: '/settings/security/',
  agentAccess: '/settings/agent-access/',
  'connected-accounts': '/settings/connected-accounts/',
  organizations: '/settings/organizations/',
  organizationSettings: '/organization/settings/',
  organizationPeople: '/organization/people/',
  domains: '/settings/domains/'
} satisfies Record<SettingsSectionId, string>

const settingsRouteSectionsBySegment = new Map<string, SettingsRouteSectionId>(
  Object.entries(settingsRouteSegments).map(([section, segment]) => [
    segment,
    section as SettingsRouteSectionId
  ])
)

const settingsRedirectHrefsBySegment = new Map<string, string>([
  ['cli-access', settingsSectionHrefs.security],
  ['developer', settingsSectionHrefs.security]
])

const settingsSectionIds = new Set<SettingsSectionId>([
  'account',
  'security',
  'agentAccess',
  'connected-accounts',
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

export function resolveSettingsRouteSegment(
  segment: string | undefined
): SettingsRouteSegmentResolution {
  if (!segment) {
    return { section: 'account', type: 'section' }
  }

  const section = settingsRouteSectionsBySegment.get(segment)
  if (section) {
    return { section, type: 'section' }
  }

  const href = settingsRedirectHrefsBySegment.get(segment)
  if (href) {
    return { href, type: 'redirect' }
  }

  return { type: 'notFound' }
}

export function getSettingsSectionFromSegment(segment: string | undefined): SettingsSectionId | null {
  const resolution = resolveSettingsRouteSegment(segment)

  return resolution.type === 'section' ? resolution.section : null
}
