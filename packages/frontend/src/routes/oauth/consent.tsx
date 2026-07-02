/* eslint-disable react-refresh/only-export-components */
import { parseUUIDv7 } from '@main/common'
import { createFileRoute } from '@tanstack/react-router'

import { authReactClient } from '../../lib/auth-react-client'
import { createSignInRedirectHref, throwRouteRedirect } from '../../lib/route-redirect'
import { routeSetCookieHeaders } from '../../lib/route-headers'
import { resolveFrontendServerRouteContext } from '../../server-route-context'
import { OAuthConsentRouteScreen } from '../../screens/oauth-consent-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { OAuthConsentSearch } from '../../screens/oauth-consent-route-screen'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

function validateOAuthConsentRouteSearch(search: Record<string, unknown>): OAuthConsentSearch {
  return {
    client_id: readSearchString(search.client_id),
    code: readSearchString(search.code),
    scope: readSearchString(search.scope)
  }
}

export const Route = createFileRoute('/oauth/consent')({
  validateSearch: validateOAuthConsentRouteSearch,
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadSettingsRoute) {
      const routeState = await serverRouteContext.serverRouteHandlers.loadSettingsRoute(
        serverRouteContext.request
      )

      if (routeState.shouldRedirectToSetup) {
        throwRouteRedirect(routeState.redirectTo)
      }

      if (routeState.shouldRedirectToSignIn) {
        throwRouteRedirect(createSignInRedirectHref(loaderInput.location.href))
      }

      return routeState
    }

    const auth = await authReactClient.getSession()
    const redirectTo = loaderInput.location.href

    if (!auth.data?.user) {
      throwRouteRedirect(createSignInRedirectHref(redirectTo))
    }

    return {
      flash: null,
      redirectTo,
      setCookieHeaders: [],
      shouldRedirectToSignIn: false,
      shouldRedirectToSetup: false,
      user: {
        ...auth.data.user,
        id: parseUUIDv7(auth.data.user.id) as NonNullable<SettingsRouteState['user']>['id']
      }
    } satisfies SettingsRouteState
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Approve OAuth connection')
      },
      {
        name: 'description',
        content: `Approve an OAuth application connection for ${SITE_STRINGS.BRAND_NAME}.`
      }
    ]
  }),
  headers: ({ loaderData }) => routeSetCookieHeaders(loaderData?.setCookieHeaders),
  component: OAuthConsentRouteComponent
})

function OAuthConsentRouteComponent() {
  return (
    <OAuthConsentRouteScreen
      routeState={Route.useLoaderData()}
      search={Route.useSearch()}
    />
  )
}

function readSearchString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}
