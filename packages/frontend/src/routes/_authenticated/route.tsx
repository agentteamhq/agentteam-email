import { Outlet, createFileRoute } from '@tanstack/react-router'

import { loadAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { routeSetCookieHeaders } from '../../lib/route-headers'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async (loaderInput) => {
    return {
      authenticatedRouteState: await loadAuthenticatedRouteState(loaderInput, loaderInput.location.href)
    }
  },
  headers: ({ match }) =>
    routeSetCookieHeaders(match.context.authenticatedRouteState?.setCookieHeaders),
  component: AuthenticatedRouteLayout
})

function AuthenticatedRouteLayout() {
  return <Outlet />
}
