import { createFileRoute } from '@tanstack/react-router'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { MagicLinkRouteScreen } from '../screens/magic-link-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { AuthRouteState } from '@main/backend/routes/webapp'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/',
  shouldRedirectToDashboard: false,
  shouldRedirectToSetup: false,
  user: null
}

export const Route = createFileRoute('/magic-link')({
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
        title: formatSiteTitle('Magic link sign-in')
      },
      {
        name: 'description',
        content: `Sign in to ${SITE_STRINGS.BRAND_NAME} securely using a one-time magic link sent to your email.`
      }
    ]
  }),
  component: MagicLinkRouteScreen
})
