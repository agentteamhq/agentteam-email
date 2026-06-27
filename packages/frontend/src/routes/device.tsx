/* eslint-disable react-refresh/only-export-components */
import { parseUUIDv7 } from '@main/common'
import { createFileRoute, useRouter } from '@tanstack/react-router'

import { normalizeDeviceUserCode, verifyDeviceUserCode } from '../lib/device-auth-api'
import { authReactClient } from '../lib/auth-react-client'
import { createSignInRedirectHref, throwRouteRedirect } from '../lib/route-redirect'
import { resolveFrontendServerRouteContext } from '../server-route-context'
import { DeviceCodeVerificationScreen } from '../screens/device-authorization-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'
import type { DeviceRouteState } from '@main/backend/routes/webapp'

export interface DeviceSearch {
  user_code?: string
}

function validateDeviceSearch(search: Record<string, unknown>): DeviceSearch {
  return {
    user_code:
      typeof search.user_code === 'string' && search.user_code.trim() !== ''
        ? normalizeDeviceUserCode(search.user_code)
        : undefined
  }
}

export const Route = createFileRoute('/device')({
  validateSearch: validateDeviceSearch,
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadDeviceRoute) {
      const routeState = await serverRouteContext.serverRouteHandlers.loadDeviceRoute(
        serverRouteContext.request
      )

      if (routeState.shouldRedirectToSetup) {
        throwRouteRedirect(routeState.redirectTo)
      }

      if (routeState.shouldRedirectToSignIn) {
        throwRouteRedirect(createSignInRedirectHref(routeState.redirectTo))
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
        id: parseUUIDv7(auth.data.user.id) as NonNullable<DeviceRouteState['user']>['id']
      },
      userCode: validateDeviceSearch(loaderInput.location.search).user_code ?? null
    } satisfies DeviceRouteState
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Authorize CLI')
      },
      {
        name: 'description',
        content: `Authorize the at-email CLI for your ${SITE_STRINGS.BRAND_NAME} account.`
      }
    ]
  }),
  component: DeviceRouteScreen
})

function DeviceRouteScreen() {
  const routeState = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()

  return (
    <DeviceCodeVerificationScreen
      initialUserCode={routeState.userCode ?? search.user_code ?? null}
      onVerify={async (userCode) => {
        const result = await verifyDeviceUserCode(userCode)
        if (result.status !== 'pending') {
          throw new Error('This device code has already been processed.')
        }

        await router.navigate({
          href: `/device/approve/?user_code=${encodeURIComponent(userCode)}`
        })
      }}
    />
  )
}
