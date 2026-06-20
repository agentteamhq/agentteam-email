import { createFileRoute } from '@tanstack/react-router'
import type { AuthRouteState } from '@main/backend/routes/webapp'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { MagicLinkRouteScreen } from '../screens/magic-link-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export const Route = createFileRoute('/magic-link')({
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Magic link sign-in')
      },
      {
        name: 'description',
        content: `Sign in to ${SITE_STRINGS.BRAND_NAME} securely using a one-time magic link sent to your email.`
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
  component: MagicLinkRouteScreen
})
