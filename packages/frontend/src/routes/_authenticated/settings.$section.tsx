import { createFileRoute, useRouter } from '@tanstack/react-router'

import { readAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import {
  getSettingsSectionFromSegment,
  getSettingsSectionHref
} from '../../partials/authenticated/settings-dialog-sections'
import { DashboardScreen } from '../../screens/dashboard-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { SettingsSectionId } from '../../partials/authenticated/settings-dialog-sections'

export const Route = createFileRoute('/_authenticated/settings/$section')({
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
  component: SettingsSectionRouteScreen
})

function SettingsSectionRouteScreen() {
  const routeState = Route.useLoaderData()
  const { section } = Route.useParams()
  const router = useRouter()
  const settingsSection = getSettingsSectionFromSegment(section)

  return (
    <DashboardScreen
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
      settingsOpen
      settingsSection={settingsSection}
    />
  )
}
