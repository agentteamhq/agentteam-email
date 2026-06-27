/* eslint-disable react-refresh/only-export-components */
import { parseUUIDv7 } from '@main/common'
import { createFileRoute } from '@tanstack/react-router'

import { approveDeviceUserCode, denyDeviceUserCode, normalizeDeviceUserCode } from '../../lib/device-auth-api'
import { authReactClient } from '../../lib/auth-react-client'
import { createSignInRedirectHref, throwRouteRedirect } from '../../lib/route-redirect'
import { resolveFrontendServerRouteContext } from '../../server-route-context'
import { DeviceCodeApprovalScreen } from '../../screens/device-authorization-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { DeviceRouteState } from '@main/backend/routes/webapp'

export interface DeviceApproveSearch {
  user_code?: string
}

function validateDeviceApproveSearch(search: Record<string, unknown>): DeviceApproveSearch {
  return {
    user_code:
      typeof search.user_code === 'string' && search.user_code.trim() !== ''
        ? normalizeDeviceUserCode(search.user_code)
        : undefined
  }
}

export const Route = createFileRoute('/device/approve')({
  validateSearch: validateDeviceApproveSearch,
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
      userCode: validateDeviceApproveSearch(loaderInput.location.search).user_code ?? null
    } satisfies DeviceRouteState
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Approve CLI')
      },
      {
        name: 'description',
        content: `Approve the at-email CLI for your ${SITE_STRINGS.BRAND_NAME} account.`
      }
    ]
  }),
  component: DeviceApproveRouteScreen
})

function DeviceApproveRouteScreen() {
  const routeState = Route.useLoaderData()
  const search = Route.useSearch()
  const user = routeState.user
  const userCode = routeState.userCode ?? search.user_code ?? null

  return (
    <DeviceCodeApprovalScreen
      userCode={userCode}
      userEmail={user?.email}
      userName={user?.name}
      onApprove={async (code) => {
        await approveDeviceUserCode(code)
      }}
      onDeny={async (code) => {
        await denyDeviceUserCode(code)
      }}
    />
  )
}
