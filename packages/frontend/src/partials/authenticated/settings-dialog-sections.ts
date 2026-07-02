export type SettingsSectionId =
  | 'account'
  | 'security'
  | 'agentAccess'
  | 'connected-accounts'
  | 'integrations'
  | 'organizations'
  | 'organizationSettings'
  | 'organizationPeople'
  | 'domains'

type SettingsRouteSectionId = Extract<
  SettingsSectionId,
  'account' | 'security' | 'agentAccess' | 'connected-accounts' | 'integrations' | 'organizations' | 'domains'
>

type OrganizationRouteSectionId = Extract<
  SettingsSectionId,
  'organizationSettings' | 'organizationPeople'
>

type SettingsRouteSegmentResolution =
  | {
      section: SettingsRouteSectionId
      type: 'section'
    }
  | {
      type: 'notFound'
    }

type OrganizationRouteSegmentResolution =
  | {
      section: OrganizationRouteSectionId
      type: 'section'
    }
  | {
      type: 'notFound'
    }

export const settingsRouteSegments = {
  account: 'account',
  security: 'security',
  agentAccess: 'agent-access',
  'connected-accounts': 'connected-accounts',
  integrations: 'integrations',
  organizations: 'organizations',
  domains: 'domains'
} satisfies Record<SettingsRouteSectionId, string>

const organizationRouteSegments = {
  organizationSettings: 'settings',
  organizationPeople: 'people'
} satisfies Record<OrganizationRouteSectionId, string>

const settingsSectionHrefs = {
  account: '/settings/account/',
  security: '/settings/security/',
  agentAccess: '/settings/agent-access/',
  'connected-accounts': '/settings/connected-accounts/',
  integrations: '/settings/integrations/',
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

const organizationRouteSectionsBySegment = new Map<string, OrganizationRouteSectionId>(
  Object.entries(organizationRouteSegments).map(([section, segment]) => [
    segment,
    section as OrganizationRouteSectionId
  ])
)

const settingsSectionIds = new Set<SettingsSectionId>([
  'account',
  'security',
  'agentAccess',
  'connected-accounts',
  'integrations',
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

  return { type: 'notFound' }
}

export function resolveOrganizationRouteSegment(
  segment: string | undefined
): OrganizationRouteSegmentResolution {
  if (!segment) {
    return { type: 'notFound' }
  }

  const section = organizationRouteSectionsBySegment.get(segment)
  if (section) {
    return { section, type: 'section' }
  }

  return { type: 'notFound' }
}

export function getSettingsSectionFromSegment(segment: string | undefined): SettingsSectionId | null {
  const resolution = resolveSettingsRouteSegment(segment)

  return resolution.type === 'section' ? resolution.section : null
}

export function getOrganizationSettingsSectionFromSegment(
  segment: string | undefined
): OrganizationRouteSectionId | null {
  const resolution = resolveOrganizationRouteSegment(segment)

  return resolution.type === 'section' ? resolution.section : null
}
