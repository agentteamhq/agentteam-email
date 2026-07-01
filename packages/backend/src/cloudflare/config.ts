import { z } from 'zod'

import { PRIVATE_VARS } from '../vars.private'
import { BETTER_AUTH_ROUTE } from '../auth/auth-routes'
import type { GenericOAuthConfig } from 'better-auth/plugins'

export const CLOUDFLARE_OAUTH_PROVIDER_ID = 'cloudflare'

const CLOUDFLARE_REQUIRED_OAUTH_SCOPES = [
  'workers-r2.read',
  'workers-r2.write',
  'workers-scripts.read',
  'workers-scripts.write',
  'user-details.read',
  'dns.read',
  'dns.write',
  'zone.read',
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

export function createCloudflareGenericOAuthConfig(): GenericOAuthConfig | null {
  const clientId = PRIVATE_VARS.CLOUDFLARE_OAUTH_CLIENT_ID

  if (!clientId) {
    return null
  }

  return {
    providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
    authorizationUrl:
      PRIVATE_VARS.CLOUDFLARE_OAUTH_AUTHORIZATION_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.authorizationUrl,
    tokenUrl: PRIVATE_VARS.CLOUDFLARE_OAUTH_TOKEN_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.tokenUrl,
    issuer: PRIVATE_VARS.CLOUDFLARE_OAUTH_ISSUER,
    clientId,
    redirectURI: createCloudflareOAuthRedirectURI(),
    scopes: getCloudflareRequiredOAuthScopes(),
    pkce: true,
    disableImplicitSignUp: true,
    disableSignUp: true,
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
