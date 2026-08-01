import { deleteAllCookies, readFlashCookie, routeSetCookieHeaders } from '@main/common'
import debug from 'debug'

// Mail credential-header scope: see the approval note in agent-mail/browser-mail-request-headers.ts.
import { browserSessionMailRequestHeaders } from '../agent-mail/browser-mail-request-headers'
import { isAgentMailAccessError } from '../agent-mail/service'
import { validateAgentMailWorkspaceInput } from '../agent-mail/webmail-request-schemas'
import { agentMailWebErrorStatus, getAgentMailWorkspaceForWeb } from '../agent-mail/webmail-service'
import { createSafeErrorLogDetails } from '../auth/log-redaction'
import { getUser } from '../auth/get-user'
import { globals } from '../globals'
import { getCustomerStripeStatus } from '../payments/get-customer-status'
import { isDelayedData } from '../payments/is-delayed-data'
import type { AgentMailWebWorkspace, AgentMailWorkspaceInput } from '../agent-mail/webmail-service'

const log = debug('app:webapp:route')

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

export interface MailWorkspaceRouteState {
  workspace: AgentMailWebWorkspace | null
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

/**
 * Server-render read model for the authenticated mail workspace screen.
 *
 * This is the same read the browser performs through `GET /rpc/mail/workspace`, resolved
 * during the server render of the same authenticated browser request so the delivered
 * HTML carries the screen's data instead of skeleton-only markup.
 *
 * Credential boundary: the request's Better Auth browser session is the only accepted
 * credential. `browserSessionMailRequestHeaders` strips every non-browser credential
 * class from the inbound headers and pins the Agent Mail authorization surface to
 * `browser-rpc`, so `getAgentMailWorkspaceForWeb` derives the user, organization, and
 * CASL permissions from the session exactly as the browser RPC route does. No credential
 * is copied into another subsystem and the returned DTO is the same public workspace
 * contract the browser already receives.
 *
 * Fails closed: any authentication, authorization, or upstream failure returns
 * `{ workspace: null }` so the screen falls back to the browser query instead of
 * server-rendering another organization's data or a partially authorized view.
 */
export async function loadMailWorkspaceRoute(
  request: Request,
  input: AgentMailWorkspaceInput
): Promise<MailWorkspaceRouteState> {
  const validation = validateAgentMailWorkspaceInput(input)

  if (!validation.valid) {
    log('mail_workspace_route_invalid_input %o', {
      operation: 'mail_workspace_route_load',
      requestUrl: request.url,
      schemaErrors: validation.errors
    })

    return { workspace: null }
  }

  try {
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: browserSessionMailRequestHeaders(request),
      input: validation.input
    })

    log('mail_workspace_route_loaded %o', {
      accountCount: workspace.accounts.length,
      activeAccountId: workspace.activeAccountId,
      activeFolderId: workspace.activeFolderId,
      operation: 'mail_workspace_route_load',
      requestUrl: request.url
    })

    return { workspace }
  } catch (error) {
    logMailWorkspaceRouteFailure(error, validation.input, request)

    return { workspace: null }
  }
}

/**
 * Classifies a failed server-render workspace read so an expected authorization or upstream
 * failure stays distinguishable from a handler bug. Every classification still fails closed:
 * the server render omits the seed and the browser query surfaces the real error.
 */
function logMailWorkspaceRouteFailure(error: unknown, input: AgentMailWorkspaceInput, request: Request) {
  const errorLogDetails = createSafeErrorLogDetails(error)
  const upstreamStatus = agentMailWebErrorStatus(error)
  const details = {
    error: errorLogDetails,
    input,
    operation: 'mail_workspace_route_load',
    requestUrl: request.url
  }

  if (isAgentMailAccessError(error)) {
    log('mail_workspace_route_denied %o', {
      ...details,
      classification: 'authorization',
      status: error.status
    })
    return
  }

  if (upstreamStatus !== null) {
    log('mail_workspace_route_upstream_error %o', {
      ...details,
      classification: 'upstream',
      status: upstreamStatus
    })
    return
  }

  log('mail_workspace_route_unhandled_error %o', {
    ...details,
    classification: 'unexpected'
  })
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
