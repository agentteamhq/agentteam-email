import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'

import {
  readAuthenticatedRouteState,
  type AuthenticatedRouteContext
} from '../../lib/authenticated-app-route'
import { validateDashboardSearch } from '../../lib/dashboard-search'
import {
  getOrganizationSettingsSectionFromSegment,
  getSettingsSectionHref
} from '../../partials/authenticated/settings-dialog-sections'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { SettingsSectionId } from '../../partials/authenticated/settings-dialog-sections'

export interface OrganizationSettingsRouteLoaderInput {
  context: AuthenticatedRouteContext
  params: {
    section?: string
  }
}

export const Route = createFileRoute('/_authenticated/organization/$section')({
  validateSearch: validateDashboardSearch,
  loader: loadOrganizationSettingsRouteState,
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Organization')
      },
      {
        name: 'description',
        content: `Manage ${SITE_STRINGS.BRAND_NAME} organization settings, members, invitations, and organization API keys.`
      }
    ]
  }),
  component: OrganizationSettingsRouteScreen
})

export function loadOrganizationSettingsRouteState({
  context,
  params
}: OrganizationSettingsRouteLoaderInput) {
  requireOrganizationSettingsSection(params.section)

  return readAuthenticatedRouteState(context)
}

function OrganizationSettingsRouteScreen() {
  const routeState = Route.useLoaderData()
  const { section } = Route.useParams()
  const search = Route.useSearch()
  const router = useRouter()
  const settingsSection = requireOrganizationSettingsSection(section)

  return (
    <DashboardMailController
      onSettingsOpenChange={(open) => {
        if (!open) {
          void router.navigate({ href: '/dashboard/' })
        }
      }}
      onSettingsSectionChange={(nextSection: SettingsSectionId) => {
        void router.navigate({ href: getSettingsSectionHref(nextSection) })
      }}
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      routeSearch={search}
      settingsOpen
      settingsSection={settingsSection}
    />
  )
}

function requireOrganizationSettingsSection(section: string | undefined) {
  const settingsSection = getOrganizationSettingsSectionFromSegment(section)
  if (!settingsSection) {
    throwOrganizationSettingsNotFound()
  }

  return settingsSection
}

function throwOrganizationSettingsNotFound(): never {
  notFound({ throw: true })
  throw new Error('TanStack Router did not throw not-found for /organization/$section.')
}
