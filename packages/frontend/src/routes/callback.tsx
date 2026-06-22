import { createFileRoute } from '@tanstack/react-router'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { CallbackRouteScreen } from '../screens/callback-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { AuthRouteState } from '@main/backend/routes/webapp'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export const Route = createFileRoute('/callback')({
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadPublicAuthRoute) {
      return serverRouteContext.serverRouteHandlers.loadPublicAuthRoute(serverRouteContext.request)
    }

    return defaultAuthRouteState
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Sign in')
      },
      {
        name: 'description',
        content: `Complete sign-in to your ${SITE_STRINGS.BRAND_NAME} workspace.`
      }
    ]
  }),
  component: CallbackRouteScreen
})
