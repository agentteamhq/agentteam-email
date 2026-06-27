/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, notFound } from '@tanstack/react-router'

import { throwRouteRedirect } from '../../lib/route-redirect'
import { resolveFrontendServerRouteContext } from '../../server-route-context'
import { AdminSetupRouteScreen } from '../../screens/admin-setup/admin-setup-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { AdminSetupRouteState } from '@main/backend/routes/webapp'
import type { FrontendLoaderInput } from '../../server-route-context'

export type AdminSetupLoaderInput = FrontendLoaderInput

export const Route = createFileRoute('/admin/setup')({
  loader: loadAdminSetupRouteState,
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Admin setup')
      },
      {
        name: 'description',
        content: `Set up the first administrator account for ${SITE_STRINGS.BRAND_NAME}.`
      }
    ]
  }),
  component: AdminSetupRouteScreen
})

export async function loadAdminSetupRouteState(
  loaderInput: AdminSetupLoaderInput
): Promise<AdminSetupRouteState> {
  const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

  if (!serverRouteContext?.serverRouteHandlers.loadAdminSetupRoute) {
    throwAdminSetupNotFound()
  }

  const routeState = await serverRouteContext.serverRouteHandlers.loadAdminSetupRoute(
    serverRouteContext.request
  )

  if (routeState.shouldRedirectToAdmin) {
    throwRouteRedirect(routeState.redirectTo)
  }

  if (routeState.shouldNotFound) {
    throwAdminSetupNotFound()
  }

  return routeState
}

function throwAdminSetupNotFound(): never {
  notFound({ throw: true })
  throw new Error('TanStack Router did not throw not-found for /admin/setup.')
}
