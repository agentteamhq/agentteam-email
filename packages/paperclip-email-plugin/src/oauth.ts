import { createHash, randomBytes } from 'node:crypto'

export const AGENTTEAM_EMAIL_OAUTH_SCOPE = 'openid profile email offline_access email.full_access'
export const AGENTTEAM_OAUTH_AUTHORIZE_PATH = '/rpc/auth/api/oauth2/authorize'
export const PKCE_CHALLENGE_METHOD = 'S256'

export interface AgentTeamEmailOAuthConnectUrlInput {
  codeChallenge: string
  oauthClientId: string
  oauthRedirectUri: string
  serviceBaseUrl: string
  state: string
}

export function buildAgentTeamEmailOAuthConnectUrl({
  codeChallenge,
  oauthClientId,
  oauthRedirectUri,
  serviceBaseUrl,
  state
}: AgentTeamEmailOAuthConnectUrlInput): string {
  const url = new URL(AGENTTEAM_OAUTH_AUTHORIZE_PATH, serviceBaseUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', oauthClientId)
  url.searchParams.set('redirect_uri', oauthRedirectUri)
  url.searchParams.set('scope', AGENTTEAM_EMAIL_OAUTH_SCOPE)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', PKCE_CHALLENGE_METHOD)
  url.searchParams.set('audience', new URL('/api', serviceBaseUrl).toString())
  return url.toString()
}

export function createOAuthPkce() {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeChallenge, codeVerifier }
}

export function createOAuthState() {
  return randomBytes(24).toString('base64url')
}
