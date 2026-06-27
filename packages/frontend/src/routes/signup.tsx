import { createFileRoute } from '@tanstack/react-router'

import { throwRouteRedirect } from '../lib/route-redirect'
import { resolveFrontendServerRouteContext } from '../server-route-context'
import { SignUpRouteScreen } from '../screens/signup-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { AuthRouteState } from '@main/backend/routes/webapp'

const defaultSignUpRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/',
  shouldRedirectToDashboard: false,
  shouldRedirectToSetup: false,
  user: null
}

export const Route = createFileRoute('/signup')({
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadSignUpRoute) {
      const routeState = await serverRouteContext.serverRouteHandlers.loadSignUpRoute(
        serverRouteContext.request
      )

      if (routeState.shouldRedirectToDashboard) {
        throwRouteRedirect(routeState.redirectTo)
      }

      return routeState
    }

    return defaultSignUpRouteState
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Create account')
      },
      {
        name: 'description',
        content: `Create a ${SITE_STRINGS.BRAND_NAME} account to manage outbound and reply workflows.`
      }
    ]
  }),
  component: SignUpRouteScreen
})
