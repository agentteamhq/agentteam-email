import { createFileRoute, useRouter } from '@tanstack/react-router'

import { readAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { getSettingsSectionHref } from '../../partials/authenticated/settings-dialog-sections'
import { DashboardScreen } from '../../screens/dashboard-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { SettingsSectionId } from '../../partials/authenticated/settings-dialog-sections'

export const Route = createFileRoute('/_authenticated/settings')({
  loader: ({ context }) => readAuthenticatedRouteState(context),
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
  component: SettingsRouteScreen
})

function SettingsRouteScreen() {
  const routeState = Route.useLoaderData()
  const router = useRouter()

  return (
    <DashboardScreen
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
      settingsOpen
      settingsSection='account'
    />
  )
}
