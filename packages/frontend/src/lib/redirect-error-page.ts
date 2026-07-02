import { SITE_STRINGS } from '../strings'
import type { CloudflareOAuthReturnTarget } from '@main/backend'

export const REDIRECT_ERROR_ROUTE_PATH = '/redirect/error'

const MAX_ERROR_CODE_LENGTH = 80
const MAX_MESSAGE_LENGTH = 320
const MAX_PARAM_VALUE_LENGTH = 180
const MAX_URI_LENGTH = 800

const SENSITIVE_PARAM_NAMES = new Set([
  'accesstoken',
  'authorization',
  'clientsecret',
  'code',
  'cookie',
  'credential',
  'idtoken',
  'password',
  'refreshtoken',
  'secret',
  'sessionstate',
  'state',
  'token'
])

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
  const supportReference = [
    'redirect-error',
    isCloudflare ? 'cloudflare' : 'unknown-provider',
    isConnectedAccount ? 'connected-account' : 'authentication',
    errorCode,
    occurredAt.toISOString()
  ].join(':')

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
      redacted.searchParams.append(key, '[redacted]')
      redactedQueryKeys.add(key)
      continue
    }

    redacted.searchParams.append(key, sanitizeVisibleText(value, MAX_PARAM_VALUE_LENGTH) ?? '')
  }

  return {
    redactedQueryKeys: [...redactedQueryKeys].sort((left, right) => left.localeCompare(right)),
    uri: truncate(redacted.toString(), MAX_URI_LENGTH)
  }
}

function isSensitiveSearchParamName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s_.-]+/gu, '')

  return (
    SENSITIVE_PARAM_NAMES.has(normalized) ||
    normalized.includes('assertion') ||
    normalized.includes('authorization') ||
    normalized.includes('cookie') ||
    normalized.includes('credential') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('token')
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

function sanitizeVisibleText(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim().replace(/\s+/gu, ' ')

  if (!trimmed) {
    return null
  }

  return truncate(redactSensitiveFragments(trimmed), maxLength)
}

function redactSensitiveFragments(value: string): string {
  return value
    .replace(/\bauthorization\s*=\s*Bearer\s+[^\s&]+/giu, 'authorization=[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu, 'Bearer [redacted]')
    .replace(
      /\b(code|state|token|access_token|refresh_token|id_token|client_secret|authorization|cookie|session_state|password|secret)\s*=\s*([^\s&]+)/giu,
      '$1=[redacted]'
    )
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
