import { createFileRoute } from '@tanstack/react-router'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { AcceptInviteRouteScreen } from '../screens/accept-invite-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { AuthRouteState } from '@main/backend/routes/webapp'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export const Route = createFileRoute('/accept-invite')({
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
        title: formatSiteTitle('Accept invitation')
      },
      {
        name: 'description',
        content: `Join your team on ${SITE_STRINGS.BRAND_NAME}.`
      }
    ]
  }),
  component: AcceptInviteRouteScreen
})
