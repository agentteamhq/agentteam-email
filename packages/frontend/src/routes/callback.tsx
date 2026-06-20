import { createFileRoute } from '@tanstack/react-router'
import type { AuthRouteState } from '@main/backend/routes/webapp'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { CallbackRouteScreen } from '../screens/callback-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export const Route = createFileRoute('/callback')({
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
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadPublicAuthRoute) {
      return serverRouteContext.serverRouteHandlers.loadPublicAuthRoute(serverRouteContext.request)
    }

    return defaultAuthRouteState
  },
  component: CallbackRouteScreen
})
