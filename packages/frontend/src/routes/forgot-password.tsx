import { createFileRoute } from '@tanstack/react-router'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { ForgotPasswordRouteScreen } from '../screens/forgot-password-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { AuthRouteState } from '@main/backend/routes/webapp'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export const Route = createFileRoute('/forgot-password')({
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
        title: formatSiteTitle('Forgot password')
      },
      {
        name: 'description',
        content: `Reset your ${SITE_STRINGS.BRAND_NAME} password to regain workspace access.`
      }
    ]
  }),
  component: ForgotPasswordRouteScreen
})
