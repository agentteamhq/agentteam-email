import { createFileRoute, useRouter } from '@tanstack/react-router'

import { readAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { validateDashboardSearch } from '../../lib/dashboard-search'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'

export const Route = createFileRoute('/_authenticated/dashboard')({
  validateSearch: validateDashboardSearch,
  loader: ({ context }) => readAuthenticatedRouteState(context),
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
  component: DashboardRouteScreen
})

function DashboardRouteScreen() {
  const routeState = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()

  return (
    <DashboardMailController
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      routeSearch={search}
    />
  )
}
