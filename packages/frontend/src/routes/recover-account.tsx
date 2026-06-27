import { createFileRoute } from '@tanstack/react-router'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { RecoverAccountRouteScreen } from '../screens/recover-account-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { AuthRouteState } from '@main/backend/routes/webapp'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/',
  shouldRedirectToDashboard: false,
  shouldRedirectToSetup: false,
  user: null
}

export const Route = createFileRoute('/recover-account')({
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
        title: formatSiteTitle('Recover account')
      },
      {
        name: 'description',
        content: `Recover access to your ${SITE_STRINGS.BRAND_NAME} account if you are locked out or changed devices.`
      }
    ]
  }),
  component: RecoverAccountRouteScreen
})
