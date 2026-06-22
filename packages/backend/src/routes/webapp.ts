import { deleteAllCookies, readFlashCookie, routeSetCookieHeaders } from '@main/common'

import { getUser } from '../auth/get-user'
import { getCustomerStripeStatus } from '../payments/get-customer-status'
import { isDelayedData } from '../payments/is-delayed-data'

export { handleEmailVerifiedRedirect } from './webapp/email-verified'
export { handleStripeCheckoutRedirect } from './webapp/stripe-checkout'
export { handleStripePortalRedirect } from './webapp/stripe-portal'
export { handleStripeRedirect } from './webapp/stripe'

export type WebappRouteUser = Awaited<ReturnType<typeof getUser>>

export interface HomeRouteState {
  redirectTo: '/dashboard/' | '/signin/'
  user: WebappRouteUser
}

export interface AuthRouteState {
  flash: string | null
  redirectTo: string
  shouldRedirectToDashboard: boolean
  user: WebappRouteUser
}

export interface SettingsRouteState {
  flash: string | null
  redirectTo: string
  setCookieHeaders: Array<string>
  shouldRedirectToSignIn: boolean
  user: WebappRouteUser
}

export interface DeviceRouteState extends SettingsRouteState {
  userCode: string | null
}

export interface BillingRouteState extends SettingsRouteState {
  customerStatus: Awaited<ReturnType<typeof getCustomerStripeStatus>>
  shouldRedirectToSignIn: boolean
}

export interface DeveloperSettingsRouteState extends SettingsRouteState {
  isFreeTier: boolean
}

export interface SignOutRouteState {
  redirectTo: string
  setCookieHeaders: Array<string>
}

export async function loadHomeRoute(request: Request): Promise<HomeRouteState> {
  const user = await getUser(request.headers)

  return {
    redirectTo: user ? '/dashboard/' : '/signin/',
    user
  }
}

export async function loadDashboardRoute(request: Request): Promise<SettingsRouteState> {
  return loadSettingsRoute(request)
}

export async function loadSignInRoute(request: Request): Promise<AuthRouteState> {
  const url = new URL(request.url)
  const redirectTo = readInternalRedirect(url.searchParams.get('redirect'), '/dashboard/')
  const resetSuccess = url.searchParams.get('reset_success') === '1'
  const user = await getUser(request.headers)

  return {
    flash: resetSuccess ? 'Your password has been reset. Please sign in with your new password.' : null,
    redirectTo,
    shouldRedirectToDashboard: Boolean(user),
    user
  }
}

export async function loadSignUpRoute(request: Request): Promise<AuthRouteState> {
  const user = await getUser(request.headers)

  return {
    flash: null,
    redirectTo: '/dashboard/',
    shouldRedirectToDashboard: Boolean(user),
    user
  }
}

export async function loadPublicAuthRoute(_request: Request): Promise<AuthRouteState> {
  return {
    flash: null,
    redirectTo: '/dashboard/',
    shouldRedirectToDashboard: false,
    user: null
  }
}

export async function loadSignOutRoute(_request: Request): Promise<SignOutRouteState> {
  return {
    redirectTo: '/signin/',
    setCookieHeaders: deleteAllCookies()
  }
}

export async function loadSettingsRoute(request: Request): Promise<SettingsRouteState> {
  const url = new URL(request.url)
  const redirectTo = readInternalRedirect(url.searchParams.get('redirect'), '/signin/')
  const user = await getUser(request.headers)

  if (!user) {
    return {
      flash: null,
      redirectTo,
      setCookieHeaders: [],
      shouldRedirectToSignIn: true,
      user
    }
  }

  const flashCookie = readFlashCookie(request.headers)

  return {
    flash: flashCookie.flash,
    redirectTo,
    setCookieHeaders: flashCookie.setCookieHeaders,
    shouldRedirectToSignIn: false,
    user
  }
}

export async function loadDeviceRoute(request: Request): Promise<DeviceRouteState> {
  const url = new URL(request.url)
  const redirectTo = `${url.pathname}${url.search}${url.hash}`
  const userCode = normalizeDeviceUserCode(url.searchParams.get('user_code'))
  const user = await getUser(request.headers)

  if (!user) {
    return {
      flash: null,
      redirectTo,
      setCookieHeaders: [],
      shouldRedirectToSignIn: true,
      user,
      userCode
    }
  }

  const flashCookie = readFlashCookie(request.headers)

  return {
    flash: flashCookie.flash,
    redirectTo,
    setCookieHeaders: flashCookie.setCookieHeaders,
    shouldRedirectToSignIn: false,
    user,
    userCode
  }
}

export async function loadBillingRoute(request: Request): Promise<BillingRouteState> {
  const settingsState = await loadSettingsRoute(request)

  if (settingsState.shouldRedirectToSignIn) {
    return {
      ...settingsState,
      customerStatus: null,
      shouldRedirectToSignIn: true
    }
  }

  const customerStatus = await getCustomerStripeStatus(request.headers)

  return {
    ...settingsState,
    customerStatus,
    shouldRedirectToSignIn: customerStatus === null
  }
}

export async function loadDeveloperSettingsRoute(request: Request): Promise<DeveloperSettingsRouteState> {
  const settingsState = await loadSettingsRoute(request)

  if (settingsState.shouldRedirectToSignIn || !settingsState.user) {
    return {
      ...settingsState,
      isFreeTier: true
    }
  }

  return {
    ...settingsState,
    isFreeTier: await isDelayedData(settingsState.user)
  }
}

export function routeCookieHeaders(
  setCookieHeaders: ReadonlyArray<string> | undefined
): Record<string, string> | undefined {
  return routeSetCookieHeaders(setCookieHeaders)
}

function readInternalRedirect(value: string | null, fallback: string): string {
  if (!value) {
    return fallback
  }

  try {
    const parsed = new URL(value, 'https://agentteam.email')
    if (parsed.origin !== 'https://agentteam.email') {
      return fallback
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

function normalizeDeviceUserCode(value: string | null): string | null {
  const normalized = value?.replaceAll('-', '').trim().toUpperCase() ?? ''
  return normalized === '' ? null : normalized
}
