import { createFileRoute, useRouter } from '@tanstack/react-router'

import { readAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { validateSettingsSearch } from '../../lib/dashboard-search'
import { throwRouteRedirect } from '../../lib/route-redirect'
import {
  getSettingsSectionFromSegment,
  getSettingsSectionHref
} from '../../partials/authenticated/settings-dialog-sections'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { SettingsSectionId } from '../../partials/authenticated/settings-dialog-sections'

export const Route = createFileRoute('/_authenticated/settings/$section')({
  validateSearch: validateSettingsSearch,
  loader: ({ context, params }) => {
    if (
      params.section === 'cli-access' ||
      params.section === 'cliAccess' ||
      params.section === 'developer'
    ) {
      throwRouteRedirect(getSettingsSectionHref('security'))
    }
    return readAuthenticatedRouteState(context)
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Settings')
      },
      {
        name: 'description',
        content: `Manage ${SITE_STRINGS.BRAND_NAME} account, security, organization, and domain settings.`
      }
    ]
  }),
  component: SettingsSectionRouteScreen
})

function SettingsSectionRouteScreen() {
  const routeState = Route.useLoaderData()
  const { section } = Route.useParams()
  const search = Route.useSearch()
  const router = useRouter()
  const settingsSection = getSettingsSectionFromSegment(section)

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
