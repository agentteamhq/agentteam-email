import { SITE_STRINGS } from '../strings'
import type { CloudflareOAuthReturnTarget } from '@main/backend'

export const REDIRECT_ERROR_ROUTE_PATH = '/redirect/error'

const MAX_ERROR_CODE_LENGTH = 80
const MAX_MESSAGE_LENGTH = 320
const MAX_PARAM_VALUE_LENGTH = 180
const MAX_URI_LENGTH = 800
const REDACTED_VALUE = '[redacted]'

const SENSITIVE_PARAM_NAMES = new Set([
  'admissiontoken',
  'apikey',
  'accesstoken',
  'assertion',
  'authorization',
  'authorizationcode',
  'bearer',
  'clientsecret',
  'code',
  'codeverifier',
  'cookie',
  'credential',
  'idtoken',
  'jwt',
  'oauthcode',
  'oauthtoken',
  'password',
  'pkceverifier',
  'refreshtoken',
  'secret',
  'sessionstate',
  'sessiontoken',
  'state',
  'token',
  'verifier'
])
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(accessToken|access_token|admissionToken|admission_token|apiKey|api_key|assertion|authorization|authorizationCode|authorization_code|bearer|clientSecret|client_secret|code|codeVerifier|code_verifier|cookie|credential|idToken|id_token|jwt|oauthCode|oauth_code|oauthToken|oauth_token|password|pkceVerifier|pkce_verifier|refreshToken|refresh_token|secret|sessionState|session_state|sessionToken|session_token|state|token|verifier)\b\s*[:=]\s*(?:Bearer\s+)?[^\s&]+/giu
const BEARER_VALUE_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu
const JWT_LIKE_VALUE_PATTERN = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu
const ABSOLUTE_URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/giu
const DIAGNOSTIC_RELATIVE_URL_BASE = 'https://agentteam-email.local'

const CLOUDFLARE_RETRY_HREF_BY_RETURN_TARGET = {
  'dashboard-onboarding': '/dashboard/',
  'settings-connected-accounts': '/settings/connected-accounts/',
  'settings-domains': '/settings/domains/'
} satisfies Record<CloudflareOAuthReturnTarget, string>

export interface RedirectErrorViewState {
  callbackUri: string
  description: string
  discordHref: string
  errorCode: string
  flowLabel: string
  pageUri: string
  providerLabel: string
  providerMessage: string | null
  redactedQueryKeys: string[]
  retryHref: string
  supportEmailHref: string
  supportReference: string
  title: string
}

export interface RedirectErrorDiagnosticLogDetails {
  callbackQueryParameterNames?: string[]
  callbackUri?: string
  callbackPath?: string
  callbackURL?: string
  callbackURLPath?: string
  callbackURLQueryParameterNames?: string[]
  cloudflareIntentId?: string
  description?: string
  errorCode: string
  error_description?: string
  flow?: string
  message?: string
  pagePath: string
  pageQueryParameterNames: string[]
  pageUri: string
  provider?: string
  providerId?: string
  providerMessage?: string
  redirect_uri?: string
  redirectUriPath?: string
  redirectUriQueryParameterNames?: string[]
  redactedQuery: string
  redactedQueryKeys: string[]
  returnTarget?: string
  supportReference: string
}

export interface CreateRedirectErrorViewStateOptions {
  occurredAt?: Date
  publicHostname: string
  url: URL | string
}

export function createRedirectErrorViewState({
  occurredAt = new Date(),
  publicHostname,
  url
}: CreateRedirectErrorViewStateOptions): RedirectErrorViewState {
  const pageUrl = new URL(url, publicHostname)
  const provider = readSearchToken(pageUrl.searchParams.get('provider'))
  const flow = readSearchToken(pageUrl.searchParams.get('flow'))
  const isCloudflare = provider === 'cloudflare'
  const isConnectedAccount = flow === 'connected-account'
  const errorCode = readErrorCode(pageUrl.searchParams.get('error'))
  const providerMessage = readProviderMessage(pageUrl)
  const redactedPageUri = createRedactedPageUri(pageUrl)
  const providerLabel = isCloudflare ? 'Cloudflare' : 'Unknown provider'
  const flowLabel = isConnectedAccount ? 'Connected account' : 'Authentication'
  const supportReference = createRedirectErrorSupportReference({
    errorCode,
    flow,
    occurredAt,
    provider
  })

  return {
    callbackUri:
      readPublicCallbackUri(pageUrl.searchParams.get('callbackUri'), publicHostname) ??
      (isCloudflare
        ? new URL('/rpc/auth/api/oauth2/callback/cloudflare', publicHostname).toString()
        : 'Not provided'),
    description: isCloudflare
      ? 'Cloudflare returned an error before the account could be connected.'
      : 'The sign-in or account connection redirect returned an error before it could finish.',
    discordHref: SITE_STRINGS.SOCIAL_URLS.DISCORD,
    errorCode,
    flowLabel,
    pageUri: redactedPageUri.uri,
    providerLabel,
    providerMessage,
    redactedQueryKeys: redactedPageUri.redactedQueryKeys,
    retryHref: readRetryHref(pageUrl, { isCloudflare, isConnectedAccount }),
    supportEmailHref: createSupportEmailHref(supportReference),
    supportReference,
    title: isCloudflare ? 'Cloudflare connection failed' : 'Connection redirect failed'
  }
}

export function createRedirectErrorDiagnosticLogDetails({
  occurredAt = new Date(),
  publicHostname,
  url
}: CreateRedirectErrorViewStateOptions): RedirectErrorDiagnosticLogDetails {
  const pageUrl = new URL(url, publicHostname)
  const provider = readSearchToken(pageUrl.searchParams.get('provider'))
  const flow = readSearchToken(pageUrl.searchParams.get('flow'))
  const diagnosticProvider = readDiagnosticText(pageUrl.searchParams.get('provider'))
  const diagnosticFlow = readDiagnosticText(pageUrl.searchParams.get('flow'))
  const isCloudflare = provider === 'cloudflare'
  const errorCode = readErrorCode(pageUrl.searchParams.get('error'))
  const redactedPageUri = createRedactedDiagnosticUri(pageUrl)
  const returnTarget = readDiagnosticText(pageUrl.searchParams.get('returnTarget'))
  const callbackUri = readDiagnosticUrlValue(pageUrl.searchParams.get('callbackUri'))
  const callbackURL = readDiagnosticUrlValue(pageUrl.searchParams.get('callbackURL'))
  const redirectUri = readDiagnosticUrlValue(pageUrl.searchParams.get('redirect_uri'))
  const effectiveCallbackUri =
    callbackUri?.uri ??
    (isCloudflare ? new URL('/rpc/auth/api/oauth2/callback/cloudflare', publicHostname).toString() : null)
  const callbackPath =
    callbackUri?.path ?? (effectiveCallbackUri ? readCallbackPath(effectiveCallbackUri) : null)
  const cloudflareIntentId = readDiagnosticText(pageUrl.searchParams.get('cloudflareIntentId'))
  const errorDescription = readDiagnosticText(pageUrl.searchParams.get('error_description'))
  const message = readDiagnosticText(pageUrl.searchParams.get('message'))
  const description = readDiagnosticText(pageUrl.searchParams.get('description'))
  const providerMessage = errorDescription ?? message ?? description

  return {
    ...(callbackUri?.queryParameterNames.length
      ? { callbackQueryParameterNames: callbackUri.queryParameterNames }
      : {}),
    ...(effectiveCallbackUri ? { callbackUri: effectiveCallbackUri } : {}),
    ...(callbackPath ? { callbackPath } : {}),
    ...(callbackURL ? { callbackURL: callbackURL.uri } : {}),
    ...(callbackURL?.path ? { callbackURLPath: callbackURL.path } : {}),
    ...(callbackURL?.queryParameterNames.length
      ? { callbackURLQueryParameterNames: callbackURL.queryParameterNames }
      : {}),
    ...(cloudflareIntentId ? { cloudflareIntentId } : {}),
    ...(description ? { description } : {}),
    errorCode,
    ...(errorDescription ? { error_description: errorDescription } : {}),
    ...(diagnosticFlow ? { flow: diagnosticFlow } : {}),
    ...(message ? { message } : {}),
    pagePath: redactedPageUri.path,
    pageQueryParameterNames: redactedPageUri.queryParameterNames,
    pageUri: redactedPageUri.uri,
    ...(diagnosticProvider ? { provider: diagnosticProvider } : {}),
    ...(isCloudflare ? { providerId: 'cloudflare' } : {}),
    ...(providerMessage ? { providerMessage } : {}),
    ...(redirectUri ? { redirect_uri: redirectUri.uri } : {}),
    ...(redirectUri?.path ? { redirectUriPath: redirectUri.path } : {}),
    ...(redirectUri?.queryParameterNames.length
      ? { redirectUriQueryParameterNames: redirectUri.queryParameterNames }
      : {}),
    redactedQuery: redactedPageUri.query,
    redactedQueryKeys: redactedPageUri.redactedQueryKeys,
    ...(returnTarget ? { returnTarget } : {}),
    supportReference: createRedirectErrorSupportReference({
      errorCode,
      flow,
      occurredAt,
      provider
    })
  }
}

function readRetryHref(
  pageUrl: URL,
  {
    isCloudflare,
    isConnectedAccount
  }: {
    isCloudflare: boolean
    isConnectedAccount: boolean
  }
): string {
  if (!isCloudflare) {
    return '/'
  }

  const returnTarget = readCloudflareOAuthReturnTarget(pageUrl.searchParams.get('returnTarget'))

  if (returnTarget) {
    return CLOUDFLARE_RETRY_HREF_BY_RETURN_TARGET[returnTarget]
  }

  return isConnectedAccount ? '/settings/connected-accounts/' : '/'
}

function createRedirectErrorSupportReference({
  errorCode,
  flow,
  occurredAt,
  provider
}: {
  errorCode: string
  flow: string | null
  occurredAt: Date
  provider: string | null
}): string {
  return [
    'redirect-error',
    provider === 'cloudflare' ? 'cloudflare' : 'unknown-provider',
    flow === 'connected-account' ? 'connected-account' : 'authentication',
    errorCode,
    occurredAt.toISOString()
  ].join(':')
}

function readCloudflareOAuthReturnTarget(value: string | null): CloudflareOAuthReturnTarget | null {
  if (!value) {
    return null
  }

  return Object.prototype.hasOwnProperty.call(CLOUDFLARE_RETRY_HREF_BY_RETURN_TARGET, value)
    ? (value as CloudflareOAuthReturnTarget)
    : null
}

function readSearchToken(value: string | null): string | null {
  return sanitizeVisibleText(value, 64)?.toLowerCase() ?? null
}

function readErrorCode(value: string | null): string {
  const sanitized = sanitizeVisibleText(value, MAX_ERROR_CODE_LENGTH)

  if (!sanitized || !/^[a-zA-Z0-9._:-]+$/u.test(sanitized)) {
    return 'unknown_error'
  }

  return sanitized
}

function readProviderMessage(url: URL): string | null {
  return (
    sanitizeVisibleText(url.searchParams.get('error_description'), MAX_MESSAGE_LENGTH) ??
    sanitizeVisibleText(url.searchParams.get('message'), MAX_MESSAGE_LENGTH) ??
    sanitizeVisibleText(url.searchParams.get('description'), MAX_MESSAGE_LENGTH)
  )
}

function createRedactedPageUri(url: URL): { redactedQueryKeys: string[]; uri: string } {
  const redacted = new URL(url)
  const redactedQueryKeys = new Set<string>()
  const entries = [...redacted.searchParams.entries()]
  redacted.search = ''

  for (const [key, value] of entries) {
    if (isSensitiveSearchParamName(key)) {
      redacted.searchParams.append(key, REDACTED_VALUE)
      redactedQueryKeys.add(key)
      continue
    }

    redacted.searchParams.append(key, sanitizeVisibleText(value, MAX_PARAM_VALUE_LENGTH) ?? '')
  }

  return {
    redactedQueryKeys: sortedValues(redactedQueryKeys),
    uri: truncate(redacted.toString(), MAX_URI_LENGTH)
  }
}

function createRedactedDiagnosticUri(url: URL): {
  path: string
  query: string
  queryParameterNames: string[]
  redactedQueryKeys: string[]
  uri: string
} {
  const redacted = new URL(url)
  const redactedQueryKeys = new Set<string>()
  const entries = [...redacted.searchParams.entries()]
  redacted.search = ''

  for (const [key, value] of entries) {
    if (isSensitiveSearchParamName(key)) {
      redacted.searchParams.append(key, REDACTED_VALUE)
      redactedQueryKeys.add(key)
      continue
    }

    redacted.searchParams.append(key, redactSensitiveDiagnosticValue(value))
  }

  return {
    path: redacted.pathname,
    queryParameterNames: queryParameterNames(url),
    redactedQueryKeys: sortedValues(redactedQueryKeys),
    query: redacted.searchParams.toString(),
    uri: redacted.toString()
  }
}

function isSensitiveSearchParamName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s_.-]+/gu, '')

  return (
    SENSITIVE_PARAM_NAMES.has(normalized) ||
    normalized.includes('assertion') ||
    normalized.includes('authorization') ||
    normalized.includes('bearer') ||
    normalized.includes('cookie') ||
    normalized.includes('credential') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized === 'jwt'
  )
}

function readPublicCallbackUri(value: string | null, publicHostname: string): string | null {
  const sanitized = sanitizeVisibleText(value, MAX_URI_LENGTH)

  if (!sanitized) {
    return null
  }

  try {
    const parsed = new URL(sanitized)
    const publicOrigin = new URL(publicHostname).origin

    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === publicOrigin) {
      return truncate(parsed.toString(), MAX_URI_LENGTH)
    }
  } catch {
    return null
  }

  return null
}

function readCallbackPath(callbackUri: string): string | null {
  try {
    return new URL(callbackUri).pathname
  } catch {
    return null
  }
}

function readDiagnosticUrlValue(value: string | null): {
  path?: string
  queryParameterNames: string[]
  uri: string
} | null {
  const raw = value?.trim()
  const diagnostic = readDiagnosticText(value)

  if (!raw || !diagnostic) {
    return null
  }

  const parsed = parseDiagnosticUrl(raw)

  if (!parsed) {
    return {
      queryParameterNames: [],
      uri: diagnostic
    }
  }

  const redacted = createRedactedDiagnosticUri(parsed.url)

  return {
    path: redacted.path,
    queryParameterNames: redacted.queryParameterNames,
    uri: serializeDiagnosticUrl(redacted.uri, parsed.format)
  }
}

function readDiagnosticText(value: string | null): string | null {
  const trimmed = value?.trim()

  if (!trimmed) {
    return null
  }

  return redactSensitiveDiagnosticValue(trimmed)
}

function sanitizeVisibleText(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim().replace(/\s+/gu, ' ')

  if (!trimmed) {
    return null
  }

  return truncate(redactSensitiveFragments(trimmed), maxLength)
}

function redactSensitiveFragments(value: string): string {
  return value
    .replace(ABSOLUTE_URL_PATTERN, (url) => redactAbsoluteDiagnosticUrl(url))
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, '$1=[redacted]')
    .replace(BEARER_VALUE_PATTERN, 'Bearer [redacted]')
    .replace(JWT_LIKE_VALUE_PATTERN, '[redacted]')
}

function redactSensitiveDiagnosticValue(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  try {
    return createRedactedDiagnosticUri(new URL(trimmed)).uri
  } catch {
    return redactSensitiveFragments(trimmed)
  }
}

function redactAbsoluteDiagnosticUrl(value: string): string {
  try {
    return createRedactedDiagnosticUri(new URL(value)).uri
  } catch {
    return value
  }
}

function parseDiagnosticUrl(
  value: string
): { format: 'absolute' | 'protocol-relative' | 'root-relative'; url: URL } | null {
  try {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) {
      return { format: 'absolute', url: new URL(value) }
    }

    if (value.startsWith('//')) {
      return { format: 'protocol-relative', url: new URL(`https:${value}`) }
    }

    if (value.startsWith('/')) {
      return { format: 'root-relative', url: new URL(value, DIAGNOSTIC_RELATIVE_URL_BASE) }
    }
  } catch {
    return null
  }

  return null
}

function serializeDiagnosticUrl(
  uri: string,
  format: 'absolute' | 'protocol-relative' | 'root-relative'
): string {
  const parsed = new URL(uri)

  if (format === 'absolute') {
    return parsed.toString()
  }

  if (format === 'protocol-relative') {
    return `//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

function queryParameterNames(url: URL): string[] {
  return sortedValues(new Set(url.searchParams.keys()))
}

function sortedValues(values: ReadonlySet<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function createSupportEmailHref(supportReference: string): string {
  const subject = `${SITE_STRINGS.APP_DISPLAY_NAME} redirect error ${supportReference}`
  return `mailto:${SITE_STRINGS.SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
}
