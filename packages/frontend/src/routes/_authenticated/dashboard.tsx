import { createFileRoute, useRouter } from '@tanstack/react-router'

import { readAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { DashboardScreen } from '../../screens/dashboard-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'

export interface DashboardSearch {
  cloudflareIntentId?: string
  cloudflareOAuthError?: string
  settings?: 'connectedAccounts' | 'domains'
}

function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  return {
    cloudflareIntentId:
      typeof search.cloudflareIntentId === 'string' && search.cloudflareIntentId.trim()
        ? search.cloudflareIntentId
        : undefined,
    cloudflareOAuthError:
      typeof search.cloudflareOAuthError === 'string' && search.cloudflareOAuthError.trim()
        ? search.cloudflareOAuthError
        : undefined,
    settings:
      search.settings === 'domains' || search.settings === 'connectedAccounts'
        ? search.settings
        : undefined
  }
}

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
    <DashboardScreen
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      routeSearch={search}
    />
  )
}
