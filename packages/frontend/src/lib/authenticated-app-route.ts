import { parseUUIDv7 } from '@main/common'

import { resolveFrontendServerRouteContext } from '../server-route-context'
import { authReactClient } from './auth-react-client'
import { throwAuthRequiredRedirect, throwRouteRedirect } from './route-redirect'
import type { FrontendLoaderInput } from '../server-route-context'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

export interface AuthenticatedRouteContext {
  authenticatedRouteState?: SettingsRouteState
}

export async function loadAuthenticatedRouteState(
  loaderInput: FrontendLoaderInput,
  redirectPath: string
): Promise<SettingsRouteState> {
  const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

  if (serverRouteContext?.serverRouteHandlers.loadDashboardRoute) {
    const routeState = await serverRouteContext.serverRouteHandlers.loadDashboardRoute(
      serverRouteContext.request
    )

    if (routeState.shouldRedirectToSetup) {
      throwRouteRedirect(routeState.redirectTo)
    }

    if (routeState.shouldRedirectToSignIn) {
      throwAuthRequiredRedirect(redirectPath)
    }

    return routeState
  }

  const auth = await authReactClient.getSession()

  if (!auth.data?.user) {
    throwAuthRequiredRedirect(redirectPath)
  }

  return {
    flash: null,
    redirectTo: '/signin/',
    setCookieHeaders: [],
    shouldRedirectToSignIn: false,
    shouldRedirectToSetup: false,
    user: {
      ...auth.data.user,
      id: parseUUIDv7(auth.data.user.id) as NonNullable<SettingsRouteState['user']>['id']
    }
  }
}

export function readAuthenticatedRouteState(context: AuthenticatedRouteContext): SettingsRouteState {
  const routeState = context.authenticatedRouteState

  if (!routeState) {
    throw new Error('Authenticated child route loaded without authenticated parent route state.')
  }

  return routeState
}
