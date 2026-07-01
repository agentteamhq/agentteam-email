import { createFileRoute } from '@tanstack/react-router'

import { verifyEmailGateCopy } from '../lib/auth/better-auth-ui-localization'
import { resolveFrontendServerRouteContext } from '../server-route-context'
import { VerifyEmailRouteScreen } from '../screens/verify-email-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { AuthRouteState } from '@main/backend/routes/webapp'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/',
  shouldRedirectToDashboard: false,
  shouldRedirectToSetup: false,
  user: null
}

export const Route = createFileRoute('/verify-email')({
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
        title: formatSiteTitle('Verify email')
      },
      {
        name: 'description',
        content: `${verifyEmailGateCopy.description} Finish setting up your ${SITE_STRINGS.BRAND_NAME} account.`
      }
    ]
  }),
  component: VerifyEmailRouteScreen
})
