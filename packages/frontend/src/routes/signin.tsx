import { createFileRoute } from '@tanstack/react-router'
import type { AuthRouteState } from '@main/backend/routes/webapp'

import { throwRouteRedirect } from '../lib/route-redirect'
import { resolveFrontendServerRouteContext } from '../server-route-context'
import { SignInRouteScreen } from '../screens/signin-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'

const defaultSignInRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export const Route = createFileRoute('/signin')({
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
  component: SignInRouteScreen
})
