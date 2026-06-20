import { createFileRoute } from '@tanstack/react-router'

import { authReactClient } from '../lib/auth-react-client'
import { throwRouteRedirect } from '../lib/route-redirect'
import { resolveFrontendServerRouteContext } from '../server-route-context'
import { IndexRedirectRouteScreen } from '../screens/index-redirect-route-screen'

export const Route = createFileRoute('/')({
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadHomeRoute) {
      const routeState = await serverRouteContext.serverRouteHandlers.loadHomeRoute(
        serverRouteContext.request
      )
      throwRouteRedirect(routeState.redirectTo)
    }

    const auth = await authReactClient.getSession()
    throwRouteRedirect(auth.data?.session ? '/dashboard/' : '/signin/')
  },
  component: IndexRedirectRouteScreen
})
