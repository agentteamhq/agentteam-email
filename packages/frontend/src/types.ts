import type { QueryClient } from '@tanstack/react-query'
import type { PUBLIC_VARS } from '@main/backend/vars.public'
import type {
  handleEmailVerifiedRedirect,
  handleStripeCheckoutRedirect,
  handleStripePortalRedirect,
  handleStripeRedirect,
  loadBillingRoute,
  loadDashboardRoute,
  loadHomeRoute,
  loadPublicAuthRoute,
  loadSettingsRoute,
  loadSignInRoute,
  loadSignOutRoute,
  loadSignUpRoute
} from '@main/backend/routes/webapp'

export type PublicEnv = typeof PUBLIC_VARS

export interface FrontendServerRouteHandlers {
  handleEmailVerifiedRedirect?: typeof handleEmailVerifiedRedirect
  handleStripeCheckoutRedirect?: typeof handleStripeCheckoutRedirect
  handleStripePortalRedirect?: typeof handleStripePortalRedirect
  handleStripeRedirect?: typeof handleStripeRedirect
  loadBillingRoute?: typeof loadBillingRoute
  loadDashboardRoute?: typeof loadDashboardRoute
  loadHomeRoute?: typeof loadHomeRoute
  loadPublicAuthRoute?: typeof loadPublicAuthRoute
  loadSettingsRoute?: typeof loadSettingsRoute
  loadSignInRoute?: typeof loadSignInRoute
  loadSignOutRoute?: typeof loadSignOutRoute
  loadSignUpRoute?: typeof loadSignUpRoute
}

export interface FrontendRouterContext {
  publicEnv: PublicEnv
  queryClient: QueryClient
}

export interface FrontendStartRequestContext {
  request?: Request
  serverRouteHandlers?: FrontendServerRouteHandlers
}

declare global {
  interface Window {
    __WEBAPP_PUBLIC_ENV__?: PublicEnv
  }
}

export {}
