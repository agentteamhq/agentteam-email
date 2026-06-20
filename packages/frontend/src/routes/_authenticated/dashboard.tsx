import { createFileRoute, useRouter } from '@tanstack/react-router'

import { readAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { DashboardScreen } from '../../screens/dashboard-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'

export const Route = createFileRoute('/_authenticated/dashboard')({
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Dashboard')
      },
      {
        name: 'description',
        content: `Operate the ${SITE_STRINGS.BRAND_NAME} dashboard and account settings shell.`
      }
    ]
  }),
  loader: ({ context }) => readAuthenticatedRouteState(context),
  component: DashboardRouteScreen
})

function DashboardRouteScreen() {
  const routeState = Route.useLoaderData()
  const router = useRouter()

  return (
    <DashboardScreen
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
    />
  )
}
