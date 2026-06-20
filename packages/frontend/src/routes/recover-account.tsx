import { createFileRoute } from '@tanstack/react-router'
import type { AuthRouteState } from '@main/backend/routes/webapp'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { RecoverAccountRouteScreen } from '../screens/recover-account-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export const Route = createFileRoute('/recover-account')({
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Recover account')
      },
      {
        name: 'description',
        content: `Recover access to your ${SITE_STRINGS.BRAND_NAME} account if you are locked out or changed devices.`
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
  component: RecoverAccountRouteScreen
})
