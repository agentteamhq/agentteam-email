/* eslint-disable react-refresh/only-export-components */
import { parseUUIDv7 } from '@main/common'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'

import { authReactClient } from '../../lib/auth-react-client'
import { throwRouteRedirect } from '../../lib/route-redirect'
import { resolveFrontendServerRouteContext } from '../../server-route-context'
import type { AdminRouteState } from '@main/backend/routes/webapp'

const ADMIN_SETUP_PATHS = new Set(['/admin/setup', '/admin/setup/'])

export const Route = createFileRoute('/admin')({
  beforeLoad: async (loaderInput) => {
    if (ADMIN_SETUP_PATHS.has(loaderInput.location.pathname)) {
      return
    }

    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadAdminRoute) {
      const routeState = await serverRouteContext.serverRouteHandlers.loadAdminRoute(
        serverRouteContext.request
      )

      if (routeState.setupRequired) {
        throwRouteRedirect(routeState.redirectTo)
      }

      if (routeState.shouldNotFound) {
        throwAdminNotFound()
      }

      return {
        adminRouteState: routeState
      }
    }

    const auth = await authReactClient.getSession()
    const user = auth.data?.user
    if (user?.role !== 'admin') {
      throwAdminNotFound()
    }

    return {
      adminRouteState: {
        redirectTo: '/admin/setup/',
        setupRequired: false,
        shouldNotFound: false,
        user: {
          ...user,
          id: parseUUIDv7(user.id) as NonNullable<AdminRouteState['user']>['id']
        }
      } satisfies AdminRouteState
    }
  },
  component: AdminRouteLayout
})

function AdminRouteLayout() {
  return <Outlet />
}

function throwAdminNotFound(): never {
  notFound({ throw: true })
  throw new Error('TanStack Router did not throw not-found for /admin.')
}
