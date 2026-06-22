import { createFileRoute } from '@tanstack/react-router'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { ResetPasswordRouteScreen } from '../screens/reset-password-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { AuthRouteState } from '@main/backend/routes/webapp'

const defaultAuthRouteState: AuthRouteState = {
  flash: null,
  redirectTo: '/dashboard/',
  shouldRedirectToDashboard: false,
  user: null
}

export interface ResetPasswordSearch {
  token?: string
}

function validateResetPasswordSearch(search: Record<string, unknown>): ResetPasswordSearch {
  return {
    token: typeof search.token === 'string' && search.token.trim() ? search.token : undefined
  }
}

export const Route = createFileRoute('/reset-password')({
  validateSearch: validateResetPasswordSearch,
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
        title: formatSiteTitle('Reset password')
      },
      {
        name: 'description',
        content: `Choose a new password for your ${SITE_STRINGS.BRAND_NAME} account.`
      }
    ]
  }),
  component: ResetPasswordRouteScreen
})
