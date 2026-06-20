import type { GenericOAuthConfig } from 'better-auth/plugins'

import { PRIVATE_VARS } from '../vars.private'

export const CLOUDFLARE_OAUTH_PROVIDER_ID = 'cloudflare'

const DEFAULT_CLOUDFLARE_REQUIRED_OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'zone.read',
  'dns.write',
  'email-routing-rules.write',
  'workers-scripts.write',
  'workers-r2-storage.write'
] as const

export const CLOUDFLARE_OAUTH_DEFAULTS = {
  authorizationUrl: 'https://dash.cloudflare.com/oauth2/auth',
  tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
  userInfoUrl: 'https://dash.cloudflare.com/oauth2/userinfo',
  revokeUrl: 'https://dash.cloudflare.com/oauth2/revoke',
  apiBaseUrl: 'https://api.cloudflare.com/client/v4'
} as const

export type CloudflareRequiredOAuthScope = (typeof DEFAULT_CLOUDFLARE_REQUIRED_OAUTH_SCOPES)[number]

export function getCloudflareRequiredOAuthScopes(): string[] {
  const configuredScopes = PRIVATE_VARS.CLOUDFLARE_OAUTH_SCOPES
  if (!configuredScopes) {
    return [...DEFAULT_CLOUDFLARE_REQUIRED_OAUTH_SCOPES]
  }

  return configuredScopes
    .split(/[,\s]+/u)
    .map((scope) => scope.trim())
    .filter(Boolean)
}

export function isCloudflareOAuthConfigured(): boolean {
  return Boolean(
    PRIVATE_VARS.CLOUDFLARE_OAUTH_CLIENT_ID && PRIVATE_VARS.CLOUDFLARE_OAUTH_CLIENT_SECRET
  )
}

export function getCloudflareApiBaseUrl(): string {
  return PRIVATE_VARS.CLOUDFLARE_API_BASE_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.apiBaseUrl
}

export function getCloudflareOAuthRevokeUrl(): string {
  return PRIVATE_VARS.CLOUDFLARE_OAUTH_REVOKE_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.revokeUrl
}

export function createCloudflareGenericOAuthConfig(): GenericOAuthConfig | null {
  const clientId = PRIVATE_VARS.CLOUDFLARE_OAUTH_CLIENT_ID
  const clientSecret = PRIVATE_VARS.CLOUDFLARE_OAUTH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
    authorizationUrl:
      PRIVATE_VARS.CLOUDFLARE_OAUTH_AUTHORIZATION_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.authorizationUrl,
    tokenUrl: PRIVATE_VARS.CLOUDFLARE_OAUTH_TOKEN_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.tokenUrl,
    userInfoUrl: PRIVATE_VARS.CLOUDFLARE_OAUTH_USERINFO_URL ?? CLOUDFLARE_OAUTH_DEFAULTS.userInfoUrl,
    issuer: PRIVATE_VARS.CLOUDFLARE_OAUTH_ISSUER,
    clientId,
    clientSecret,
    scopes: getCloudflareRequiredOAuthScopes(),
    authentication: 'basic',
    disableImplicitSignUp: true,
    disableSignUp: true,
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

function readProfileString(profile: Record<string, unknown>, key: string): string | undefined {
  const value = profile[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readProfileBoolean(profile: Record<string, unknown>, key: string): boolean | undefined {
  const value = profile[key]
  return typeof value === 'boolean' ? value : undefined
}
