import { createFileRoute } from '@tanstack/react-router'

import { routeSetCookieHeaders } from '../lib/route-headers'
import { resolveFrontendServerRouteContext } from '../server-route-context'
import { SignOutRouteScreen } from '../screens/signout-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'

export const Route = createFileRoute('/signout')({
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Sign out')
      },
      {
        name: 'description',
        content: `Sign out of your ${SITE_STRINGS.BRAND_NAME} account.`
      }
    ]
  }),
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadSignOutRoute) {
      return serverRouteContext.serverRouteHandlers.loadSignOutRoute(serverRouteContext.request)
    }

    return {
      redirectTo: '/signin/',
      setCookieHeaders: []
    }
  },
  headers: ({ loaderData }) => routeSetCookieHeaders(loaderData?.setCookieHeaders),
  component: SignOutRouteScreen
})
