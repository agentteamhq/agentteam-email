import { createFileRoute } from '@tanstack/react-router'
import type { AuthRouteState } from '@main/backend/routes/webapp'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { AcceptInviteRouteScreen } from '../screens/accept-invite-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export const Route = createFileRoute('/accept-invite')({
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
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadPublicAuthRoute) {
      return serverRouteContext.serverRouteHandlers.loadPublicAuthRoute(serverRouteContext.request)
    }

    return defaultAuthRouteState
  },
  component: AcceptInviteRouteScreen
})
