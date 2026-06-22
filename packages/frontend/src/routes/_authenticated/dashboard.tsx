import { createFileRoute, useRouter } from '@tanstack/react-router'

import { readAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { DashboardMailController } from '../../screens/dashboard-mail-controller'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'

export interface DashboardSearch {
  accountId?: string
  cloudflareIntentId?: string
  cloudflareOAuthError?: string
  cursor?: string
  direction?: 'next' | 'previous'
  folderId?: string
  mailQuery?: string
  messageId?: string
  settings?: 'connectedAccounts' | 'domains' | 'cliAccess'
  unreadOnly?: boolean
}

function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  return {
    accountId: typeof search.accountId === 'string' && search.accountId.trim() ? search.accountId : undefined,
    cloudflareIntentId:
      typeof search.cloudflareIntentId === 'string' && search.cloudflareIntentId.trim()
        ? search.cloudflareIntentId
        : undefined,
    cloudflareOAuthError:
      typeof search.cloudflareOAuthError === 'string' && search.cloudflareOAuthError.trim()
        ? search.cloudflareOAuthError
        : undefined,
    cursor: typeof search.cursor === 'string' && search.cursor.trim() ? search.cursor : undefined,
    direction: search.direction === 'next' || search.direction === 'previous' ? search.direction : undefined,
    folderId: typeof search.folderId === 'string' && search.folderId.trim() ? search.folderId : undefined,
    mailQuery: typeof search.mailQuery === 'string' ? search.mailQuery : undefined,
    messageId: typeof search.messageId === 'string' && search.messageId.trim() ? search.messageId : undefined,
    settings:
      search.settings === 'domains' ||
      search.settings === 'connectedAccounts' ||
      search.settings === 'cliAccess'
        ? search.settings
        : undefined,
    unreadOnly: search.unreadOnly === true || search.unreadOnly === 'true' ? true : undefined
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
    <DashboardMailController
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      routeSearch={search}
    />
  )
}
