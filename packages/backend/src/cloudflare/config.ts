import { genericOAuth } from 'better-auth/plugins'
import debug from 'debug'
import { z } from 'zod'

import { PRIVATE_VARS } from '../vars.private'
import { BETTER_AUTH_ROUTE } from '../auth/auth-routes'

import { CLOUDFLARE_OAUTH_PROVIDER_ID } from './constants'
import {
  createCloudflareOAuthTokenExchanger,
  createCloudflareOAuthTokenRefresher
} from './oauth-token-exchange'
import type { CloudflareOAuthTokenExchangeWorkerConfig } from './oauth-token-exchange'
import type { GenericOAuthConfig } from 'better-auth/plugins'

export { CLOUDFLARE_OAUTH_PROVIDER_ID } from './constants'

const log = debug('app:cloudflare:oauth-token')

const CLOUDFLARE_REQUIRED_OAUTH_SCOPES = [
  'workers-r2.read',
  'workers-r2.write',
  'workers-scripts.read',
  'workers-scripts.write',
  'user-details.read',
  'dns.read',
  'dns.write',
  'zone-dns-settings.read',
  'zone-dns-settings.write',
  'zone.read',
  'zone-settings.read',
  'zone-settings.write',
  'cloud-email-security.read',
  'email-routing-address.read',
  'email-routing-address.write',
  'email-routing-rule.read',
  'email-routing-rule.write',
  'email-routing-suppression.read',
  'email-security-dmarcreports.read',
  'email-sending.read',
  'email-sending.write',
  'offline_access'
] as const

export const CLOUDFLARE_OAUTH_DEFAULTS = {
  authorizationUrl: 'https://dash.cloudflare.com/oauth2/auth',
  tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
  revokeUrl: 'https://dash.cloudflare.com/oauth2/revoke',
  apiBaseUrl: 'https://api.cloudflare.com/client/v4'
} as const

export type CloudflareRequiredOAuthScope = (typeof CLOUDFLARE_REQUIRED_OAUTH_SCOPES)[number]

type CloudflareOAuthGetUserInfo = NonNullable<GenericOAuthConfig['getUserInfo']>

export type CloudflareGenericOAuthPlugin = ReturnType<typeof genericOAuth>

const CLOUDFLARE_WORKERS_DEV_DOMAIN = 'workers.dev'
const CLOUDFLARE_OAUTH_TOKEN_EXCHANGE_PATH = '/oauth2/token'
const CLOUDFLARE_OAUTH_TOKEN_EXCHANGE_DIRECT_FIRST = true

const CLOUDFLARE_WORKER_CONFIG_ENV_NAMES = {
  accountId: 'CLOUDFLARE_WORKER_ACCOUNT_ID',
  apiToken: 'CLOUDFLARE_WORKER_API_TOKEN',
  password: 'CLOUDFLARE_WORKER_PASSWORD',
  subdomain: 'CLOUDFLARE_WORKER_SUBDOMAIN',
  workerName: 'CLOUDFLARE_WORKER_NAME'
} as const

export interface CloudflareWorkerConfig {
  accountId: string
  apiToken: string
  oauthTokenExchangeUrl: string
  password: string
  subdomain: string
  workerName: string
  workerUrl: string
}

type CloudflareWorkerConfigKey = keyof typeof CLOUDFLARE_WORKER_CONFIG_ENV_NAMES

type RawCloudflareWorkerConfig = Record<CloudflareWorkerConfigKey, string | undefined>

export interface CreateCloudflareWorkerUrlInput {
  workerName: string
  subdomain: string
}

const trimmedNonEmptyString = z.string().trim().min(1)

const cloudflareUserDetailsResponseSchema = z.object({
  result: z.object({
    email: trimmedNonEmptyString,
    first_name: z.string().trim().nullable().optional(),
    id: trimmedNonEmptyString,
    last_name: z.string().trim().nullable().optional()
  }),
  success: z.literal(true)
})

export function getCloudflareRequiredOAuthScopes(): string[] {
  return [...CLOUDFLARE_REQUIRED_OAUTH_SCOPES]
}

export function isCloudflareOAuthConfigured(): boolean {
  return Boolean(PRIVATE_VARS.CLOUDFLARE_OAUTH_CLIENT_ID)
}

export function createCloudflareOAuthRedirectURI(): string {
  return `${BETTER_AUTH_ROUTE}/oauth2/callback/${CLOUDFLARE_OAUTH_PROVIDER_ID}`
}

export function getCloudflareApiBaseUrl(): string {
  return PRIVATE_VARS.CLOUDFLARE_API_BASE_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.apiBaseUrl
}

export function getCloudflareOAuthRevokeUrl(): string {
  return PRIVATE_VARS.CLOUDFLARE_OAUTH_REVOKE_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.revokeUrl
}

export function getCloudflareOAuthTokenUrl(): string {
  return PRIVATE_VARS.CLOUDFLARE_OAUTH_TOKEN_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.tokenUrl
}

export function getCloudflareWorkerConfig(): CloudflareWorkerConfig | null {
  const raw: RawCloudflareWorkerConfig = {
    accountId: PRIVATE_VARS.CLOUDFLARE_WORKER_ACCOUNT_ID,
    apiToken: PRIVATE_VARS.CLOUDFLARE_WORKER_API_TOKEN,
    password: PRIVATE_VARS.CLOUDFLARE_WORKER_PASSWORD,
    subdomain: PRIVATE_VARS.CLOUDFLARE_WORKER_SUBDOMAIN,
    workerName: PRIVATE_VARS.CLOUDFLARE_WORKER_NAME
  }
  const hasAnyWorkerConfig = Object.values(raw).some(Boolean)

  if (!hasAnyWorkerConfig) {
    return null
  }

  const missing = Object.entries(raw)
    .filter(([, value]) => !value)
    .map(([key]) => CLOUDFLARE_WORKER_CONFIG_ENV_NAMES[key as CloudflareWorkerConfigKey])

  if (missing.length > 0) {
    throw new Error(`Incomplete Cloudflare Worker configuration: ${missing.join(', ')}`)
  }

  const workerName = requireDNSLabel(raw.workerName, 'CLOUDFLARE_WORKER_NAME')
  const subdomain = requireDNSLabel(raw.subdomain, 'CLOUDFLARE_WORKER_SUBDOMAIN')
  const workerUrl = createCloudflareWorkerUrl({ workerName, subdomain })

  return {
    accountId: raw.accountId!,
    apiToken: raw.apiToken!,
    oauthTokenExchangeUrl: createCloudflareOAuthTokenExchangeUrl(workerUrl),
    password: raw.password!,
    subdomain,
    workerName,
    workerUrl
  }
}

export function createCloudflareWorkerUrl({ workerName, subdomain }: CreateCloudflareWorkerUrlInput): string {
  return `https://${workerName}.${subdomain}.${CLOUDFLARE_WORKERS_DEV_DOMAIN}`
}

export function createCloudflareOAuthTokenExchangeUrl(workerUrl: string): string {
  const url = new URL(workerUrl)
  url.pathname = CLOUDFLARE_OAUTH_TOKEN_EXCHANGE_PATH
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function createCloudflareGenericOAuthConfig(): GenericOAuthConfig | null {
  const clientId = PRIVATE_VARS.CLOUDFLARE_OAUTH_CLIENT_ID

  if (!clientId) {
    return null
  }

  const redirectURI = createCloudflareOAuthRedirectURI()
  const tokenUrl = getCloudflareOAuthTokenUrl()
  const workerConfig = getCloudflareWorkerConfig()

  return {
    providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
    authorizationUrl:
      PRIVATE_VARS.CLOUDFLARE_OAUTH_AUTHORIZATION_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.authorizationUrl,
    tokenUrl,
    issuer: PRIVATE_VARS.CLOUDFLARE_OAUTH_ISSUER,
    clientId,
    redirectURI,
    scopes: getCloudflareRequiredOAuthScopes(),
    pkce: true,
    disableImplicitSignUp: true,
    disableSignUp: true,
    ...(workerConfig
      ? {
          getToken: createCloudflareOAuthTokenExchanger({
            clientId,
            redirectURI,
            worker: createCloudflareWorkerTokenTransport(workerConfig),
            tokenEndpoint: tokenUrl
          })
        }
      : {}),
    getUserInfo: getCloudflareOAuthUserInfo,
    mapProfileToUser: (profile: Record<string, unknown>) => {
      const email = readProfileString(profile, 'email')
      const name = readProfileString(profile, 'name') ?? email ?? 'Cloudflare user'
      const image = readProfileString(profile, 'picture') ?? readProfileString(profile, 'avatar_url')
      const emailVerified =
        readProfileBoolean(profile, 'email_verified') ?? readProfileBoolean(profile, 'emailVerified')

      return {
        email,
        emailVerified,
        image,
        name
      }
    }
  }
}

/**
 * Builds the Cloudflare Better Auth provider. Better Auth's generic OAuth
 * config surface owns the authorization-code exchange only, so the
 * challenge-resilient refresh-token grant is installed on the provider this
 * plugin publishes. Both grants are gated on the same service Worker
 * configuration and fail closed to Better Auth's credential errors when the
 * grant cannot be renewed.
 */
export function createCloudflareGenericOAuthPlugin(): CloudflareGenericOAuthPlugin | null {
  const config = createCloudflareGenericOAuthConfig()

  if (!config) {
    return null
  }

  const plugin = genericOAuth({ config: [config] })
  const workerConfig = getCloudflareWorkerConfig()
  const tokenUrl = getCloudflareOAuthTokenUrl()

  if (!workerConfig) {
    log('cloudflare_oauth_token_refresh_transport %o', {
      providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
      tokenEndpoint: tokenUrl,
      transport: 'direct',
      workerTokenExchangeUrl: null
    })
    return plugin
  }

  const refreshAccessToken = createCloudflareOAuthTokenRefresher({
    accessTokenExpiresIn: config.accessTokenExpiresIn,
    clientId: config.clientId,
    tokenEndpoint: tokenUrl,
    worker: createCloudflareWorkerTokenTransport(workerConfig)
  })

  log('cloudflare_oauth_token_refresh_transport %o', {
    directFirst: CLOUDFLARE_OAUTH_TOKEN_EXCHANGE_DIRECT_FIRST,
    providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
    tokenEndpoint: tokenUrl,
    transport: 'direct_first_worker_fallback',
    workerTokenExchangeUrl: workerConfig.oauthTokenExchangeUrl
  })

  return {
    ...plugin,
    init: (ctx) => {
      const initialized = plugin.init(ctx)

      return {
        ...initialized,
        context: {
          ...initialized.context,
          socialProviders: initialized.context.socialProviders.map((provider) =>
            provider.id === CLOUDFLARE_OAUTH_PROVIDER_ID ? { ...provider, refreshAccessToken } : provider
          )
        }
      }
    }
  }
}

function createCloudflareWorkerTokenTransport(
  workerConfig: CloudflareWorkerConfig
): CloudflareOAuthTokenExchangeWorkerConfig {
  return {
    directFirst: CLOUDFLARE_OAUTH_TOKEN_EXCHANGE_DIRECT_FIRST,
    password: workerConfig.password,
    tokenExchangeUrl: workerConfig.oauthTokenExchangeUrl
  }
}

const getCloudflareOAuthUserInfo: CloudflareOAuthGetUserInfo = async (tokens) => {
  const accessToken = readTokenString(tokens.accessToken)
  if (!accessToken) {
    return null
  }

  let response: Response
  try {
    response = await fetch(createCloudflareApiUrl('/user'), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      method: 'GET'
    })
  } catch {
    return null
  }

  if (!response.ok) {
    return null
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return null
  }

  const parsed = cloudflareUserDetailsResponseSchema.safeParse(body)
  if (!parsed.success) {
    return null
  }

  const { email, first_name: firstName, id, last_name: lastName } = parsed.data.result
  return {
    email,
    emailVerified: true,
    id,
    name: buildCloudflareUserName(firstName, lastName) ?? email
  }
}

function createCloudflareApiUrl(pathname: `/${string}`): string {
  const url = new URL(getCloudflareApiBaseUrl())
  url.pathname = `${url.pathname.replace(/\/$/, '')}${pathname}`
  url.search = ''
  url.hash = ''
  return url.toString()
}

function buildCloudflareUserName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string | undefined {
  const name = [firstName, lastName].filter((part): part is string => Boolean(part)).join(' ')
  return name || undefined
}

function readTokenString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readProfileString(profile: Record<string, unknown>, key: string): string | undefined {
  const value = profile[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readProfileBoolean(profile: Record<string, unknown>, key: string): boolean | undefined {
  const value = profile[key]
  return typeof value === 'boolean' ? value : undefined
}

function requireDNSLabel(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required`)
  }
  const normalized = value.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(normalized)) {
    throw new Error(`${label} must be a lowercase DNS label`)
  }
  return normalized
}
