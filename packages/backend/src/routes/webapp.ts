import { deleteAllCookies, readFlashCookie, routeSetCookieHeaders } from '@main/common'

import { getUser } from '../auth/get-user'
import { globals } from '../globals'
import { getCustomerStripeStatus } from '../payments/get-customer-status'
import { isDelayedData } from '../payments/is-delayed-data'

export { handleEmailVerifiedRedirect } from './webapp/email-verified'
export { handleStripeCheckoutRedirect } from './webapp/stripe-checkout'
export { handleStripePortalRedirect } from './webapp/stripe-portal'
export { handleStripeRedirect } from './webapp/stripe'

export type WebappRouteUser = Awaited<ReturnType<typeof getUser>>

const ADMIN_ROUTE_PATH = '/admin/' as const
const ADMIN_SETUP_ROUTE_PATH = '/admin/setup/' as const
const DASHBOARD_ROUTE_PATH = '/dashboard/' as const
const SIGNIN_ROUTE_PATH = '/signin/' as const

export interface AppRouteGateState {
  redirectTo: typeof ADMIN_SETUP_ROUTE_PATH
  setupRequired: boolean
}

export interface HomeRouteState {
  redirectTo:
    | typeof ADMIN_ROUTE_PATH
    | typeof ADMIN_SETUP_ROUTE_PATH
    | typeof DASHBOARD_ROUTE_PATH
    | typeof SIGNIN_ROUTE_PATH
  setupRequired: boolean
  user: WebappRouteUser
}

export interface AuthRouteState {
  flash: string | null
  redirectTo: string
  shouldRedirectToDashboard: boolean
  shouldRedirectToSetup: boolean
  user: WebappRouteUser
}

export interface SettingsRouteState {
  flash: string | null
  redirectTo: string
  setCookieHeaders: Array<string>
  shouldRedirectToSignIn: boolean
  shouldRedirectToSetup: boolean
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

export interface AdminRouteState {
  redirectTo: typeof ADMIN_SETUP_ROUTE_PATH
  setupRequired: boolean
  shouldNotFound: boolean
  user: WebappRouteUser
}

export interface AdminSetupRouteState {
  redirectTo: typeof ADMIN_ROUTE_PATH
  setupRequired: boolean
  shouldNotFound: boolean
  shouldRedirectToAdmin: boolean
  user: WebappRouteUser
}

export async function loadAppRouteGate(_request: Request): Promise<AppRouteGateState> {
  return {
    redirectTo: ADMIN_SETUP_ROUTE_PATH,
    setupRequired: await isAdminSetupRequired()
  }
}

export async function loadHomeRoute(request: Request): Promise<HomeRouteState> {
  if (await isAdminSetupRequired()) {
    return {
      redirectTo: ADMIN_SETUP_ROUTE_PATH,
      setupRequired: true,
      user: null
    }
  }

  const user = await getUser(request.headers)

  return {
    redirectTo: user ? (isAdminUser(user) ? ADMIN_ROUTE_PATH : DASHBOARD_ROUTE_PATH) : SIGNIN_ROUTE_PATH,
    setupRequired: false,
    user
  }
}

export async function loadDashboardRoute(request: Request): Promise<SettingsRouteState> {
  return loadSettingsRoute(request)
}

export async function loadSignInRoute(request: Request): Promise<AuthRouteState> {
  const url = new URL(request.url)
  const redirectTo = readInternalRedirect(url.searchParams.get('redirect'), '/')
  const resetSuccess = url.searchParams.get('reset_success') === '1'
  const setupRequired = await isAdminSetupRequired()

  if (setupRequired) {
    return {
      flash: null,
      redirectTo: ADMIN_SETUP_ROUTE_PATH,
      shouldRedirectToDashboard: true,
      shouldRedirectToSetup: true,
      user: null
    }
  }

  const user = await getUser(request.headers)

  return {
    flash: resetSuccess ? 'Your password has been reset. Please sign in with your new password.' : null,
    redirectTo,
    shouldRedirectToDashboard: Boolean(user),
    shouldRedirectToSetup: false,
    user
  }
}

export async function loadSignUpRoute(request: Request): Promise<AuthRouteState> {
  if (await isAdminSetupRequired()) {
    return {
      flash: null,
      redirectTo: ADMIN_SETUP_ROUTE_PATH,
      shouldRedirectToDashboard: true,
      shouldRedirectToSetup: true,
      user: null
    }
  }

  const user = await getUser(request.headers)

  return {
    flash: null,
    redirectTo: '/',
    shouldRedirectToDashboard: Boolean(user),
    shouldRedirectToSetup: false,
    user
  }
}

export async function loadPublicAuthRoute(request: Request): Promise<AuthRouteState> {
  if (await isAdminSetupRequired()) {
    return {
      flash: null,
      redirectTo: ADMIN_SETUP_ROUTE_PATH,
      shouldRedirectToDashboard: true,
      shouldRedirectToSetup: true,
      user: null
    }
  }

  const user = await getUser(request.headers)

  return {
    flash: null,
    redirectTo: '/',
    shouldRedirectToDashboard: Boolean(user),
    shouldRedirectToSetup: false,
    user
  }
}

export async function loadSignOutRoute(_request: Request): Promise<SignOutRouteState> {
  return {
    redirectTo: SIGNIN_ROUTE_PATH,
    setCookieHeaders: deleteAllCookies()
  }
}

export async function loadSettingsRoute(request: Request): Promise<SettingsRouteState> {
  if (await isAdminSetupRequired()) {
    return {
      flash: null,
      redirectTo: ADMIN_SETUP_ROUTE_PATH,
      setCookieHeaders: [],
      shouldRedirectToSignIn: false,
      shouldRedirectToSetup: true,
      user: null
    }
  }

  const url = new URL(request.url)
  const redirectTo = readInternalRedirect(url.searchParams.get('redirect'), SIGNIN_ROUTE_PATH)
  const user = await getUser(request.headers)

  if (!user) {
    return {
      flash: null,
      redirectTo,
      setCookieHeaders: [],
      shouldRedirectToSignIn: true,
      shouldRedirectToSetup: false,
      user
    }
  }

  const flashCookie = readFlashCookie(request.headers)

  return {
    flash: flashCookie.flash,
    redirectTo,
    setCookieHeaders: flashCookie.setCookieHeaders,
    shouldRedirectToSignIn: false,
    shouldRedirectToSetup: false,
    user
  }
}

export async function loadDeviceRoute(request: Request): Promise<DeviceRouteState> {
  if (await isAdminSetupRequired()) {
    return {
      flash: null,
      redirectTo: ADMIN_SETUP_ROUTE_PATH,
      setCookieHeaders: [],
      shouldRedirectToSignIn: false,
      shouldRedirectToSetup: true,
      user: null,
      userCode: null
    }
  }

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
      shouldRedirectToSetup: false,
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
    shouldRedirectToSetup: false,
    user,
    userCode
  }
}

export async function loadAdminRoute(request: Request): Promise<AdminRouteState> {
  if (await isAdminSetupRequired()) {
    return {
      redirectTo: ADMIN_SETUP_ROUTE_PATH,
      setupRequired: true,
      shouldNotFound: false,
      user: null
    }
  }

  const user = await getUser(request.headers)

  return {
    redirectTo: ADMIN_SETUP_ROUTE_PATH,
    setupRequired: false,
    shouldNotFound: !isAdminUser(user),
    user
  }
}

export async function loadAdminSetupRoute(request: Request): Promise<AdminSetupRouteState> {
  if (await isAdminSetupRequired()) {
    return {
      redirectTo: ADMIN_ROUTE_PATH,
      setupRequired: true,
      shouldNotFound: false,
      shouldRedirectToAdmin: false,
      user: null
    }
  }

  const user = await getUser(request.headers)
  const isAdmin = isAdminUser(user)

  return {
    redirectTo: ADMIN_ROUTE_PATH,
    setupRequired: false,
    shouldNotFound: !isAdmin,
    shouldRedirectToAdmin: isAdmin,
    user
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

async function isAdminSetupRequired(): Promise<boolean> {
  const { db } = await globals()
  const adminUserCount = await db.models.user.countDocuments({ role: 'admin' }).exec()
  return adminUserCount === 0
}

function isAdminUser(user: WebappRouteUser): boolean {
  return user?.role === 'admin'
}

function normalizeDeviceUserCode(value: string | null): string | null {
  const normalized = value?.replaceAll('-', '').trim().toUpperCase() ?? ''
  return normalized === '' ? null : normalized
}
