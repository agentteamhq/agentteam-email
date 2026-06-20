import { Outlet, createFileRoute } from '@tanstack/react-router'

import { loadAuthenticatedRouteState } from '../../lib/authenticated-app-route'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async (loaderInput) => {
    return {
      authenticatedRouteState: await loadAuthenticatedRouteState(loaderInput, loaderInput.location.href)
    }
  },
  component: AuthenticatedRouteLayout
})

function AuthenticatedRouteLayout() {
  return <Outlet />
}
