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

export type SettingsSectionRouteTarget =
  | {
      route: 'organization'
      segment: (typeof organizationRouteSegments)[OrganizationRouteSectionId]
    }
  | {
      route: 'settings'
      segment: (typeof settingsRouteSegments)[SettingsRouteSectionId]
    }

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

const SETTINGS_ROUTE_PATH_SEGMENT = 'settings'
const ORGANIZATION_ROUTE_PATH_SEGMENT = 'organization'

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

/**
 * Owning definition for "which route template and `$section` param does this settings
 * surface navigate to".
 *
 * `settingsSectionHrefs` stays the owner of the public path shape for callers that only
 * need an href. Callers that navigate through the router need the route template and the
 * decoded param instead, because a pre-built href replaces the destination search params
 * with the ones parsed out of that href, which drops the shell's search contract.
 * Both surfaces are derived from the same segment maps.
 */
export function getSettingsSectionRouteTarget(section: SettingsSectionId): SettingsSectionRouteTarget {
  switch (section) {
    case 'organizationPeople':
    case 'organizationSettings':
      return { route: 'organization', segment: organizationRouteSegments[section] }
    default:
      return { route: 'settings', segment: settingsRouteSegments[section] }
  }
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

/**
 * Owning definition for "which settings surface does this route show", expressed in route
 * segments so it works from decoded route params.
 *
 * `/settings/`, `/settings/<section>/`, and `/organization/<section>/` are the canonical
 * settings routes; every other route renders the product shell with settings closed.
 */
export function getSettingsSectionForRouteSegments(
  routeSegment: string | undefined,
  sectionSegment: string | undefined
): SettingsSectionId | null {
  if (routeSegment === SETTINGS_ROUTE_PATH_SEGMENT) {
    return getSettingsSectionFromSegment(sectionSegment)
  }

  if (routeSegment === ORGANIZATION_ROUTE_PATH_SEGMENT) {
    return getOrganizationSettingsSectionFromSegment(sectionSegment)
  }

  return null
}

/**
 * Pathname-facing entry point for callers that only know the route as a URL, such as
 * Storybook frames that render a story path instead of a matched route. Production route
 * components derive from matched route params instead, so they are immune to router
 * basepaths; this helper decodes segments so both agree on percent-encoded paths.
 */
export function getSettingsSectionForRoutePathname(pathname: string): SettingsSectionId | null {
  const [pathWithoutSearch = ''] = pathname.split(/[?#]/u, 1)
  const [routeSegment, sectionSegment, ...extraSegments] = pathWithoutSearch
    .split('/')
    .filter(Boolean)
    .map(decodeRouteSegment)

  if (extraSegments.length > 0) {
    return null
  }

  return getSettingsSectionForRouteSegments(routeSegment, sectionSegment)
}

function decodeRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function getOrganizationSettingsSectionFromSegment(
  segment: string | undefined
): OrganizationRouteSectionId | null {
  const resolution = resolveOrganizationRouteSegment(segment)

  return resolution.type === 'section' ? resolution.section : null
}
