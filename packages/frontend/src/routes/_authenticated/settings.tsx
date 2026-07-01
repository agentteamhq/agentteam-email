import { createFileRoute, useRouter } from '@tanstack/react-router'

import { readAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { validateSettingsSearch } from '../../lib/dashboard-search'
import { getSettingsSectionHref } from '../../partials/authenticated/settings-dialog-sections'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { SettingsSectionId } from '../../partials/authenticated/settings-dialog-sections'

export const Route = createFileRoute('/_authenticated/settings')({
  validateSearch: validateSettingsSearch,
  loader: ({ context }) => readAuthenticatedRouteState(context),
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Settings')
      },
      {
        name: 'description',
        content: `Manage ${SITE_STRINGS.BRAND_NAME} account, security, connected account, organization, and domain settings.`
      }
    ]
  }),
  component: SettingsRouteScreen
})

function SettingsRouteScreen() {
  const routeState = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()

  return (
    <DashboardMailController
      onSettingsOpenChange={(open) => {
        if (!open) {
          void router.navigate({ href: '/dashboard/' })
        }
      }}
      onSettingsSectionChange={(section: SettingsSectionId) => {
        void router.navigate({ href: getSettingsSectionHref(section) })
      }}
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      routeSearch={search}
      settingsOpen
      settingsSection='account'
    />
  )
}
