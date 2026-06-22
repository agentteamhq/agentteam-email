import { createFileRoute } from '@tanstack/react-router'

import { throwRouteRedirect } from '../lib/route-redirect'
import { resolveFrontendServerRouteContext } from '../server-route-context'
import { SignInRouteScreen } from '../screens/signin-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { AuthRouteState } from '@main/backend/routes/webapp'

const defaultSignInRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export const Route = createFileRoute('/signin')({
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadSignInRoute) {
      const routeState = await serverRouteContext.serverRouteHandlers.loadSignInRoute(
        serverRouteContext.request
      )

      if (routeState.shouldRedirectToDashboard) {
        throwRouteRedirect('/dashboard/')
      }

      return routeState
    }

    return defaultSignInRouteState
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Sign in')
      },
      {
        name: 'description',
        content: `Access your ${SITE_STRINGS.BRAND_NAME} workspace.`
      }
    ]
  }),
  component: SignInRouteScreen
})
