import { PUBLIC_VARS } from '../vars.public'

export const AGENTTEAM_OAUTH_PUBLIC_ROUTE = new URL('/api/auth', PUBLIC_VARS.PUBLIC_HOSTNAME).toString()
export const AGENTTEAM_API_OAUTH_AUDIENCE = new URL('/api', PUBLIC_VARS.PUBLIC_HOSTNAME).toString()

export const AGENTTEAM_OAUTH_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const

export const AGENTTEAM_MAIL_API_OAUTH_SCOPE = 'email.full_access' as const

export const AGENTTEAM_API_OAUTH_SCOPES = [AGENTTEAM_MAIL_API_OAUTH_SCOPE] as const
export const AGENTTEAM_OAUTH_CLIENT_REGISTRATION_SCOPES = AGENTTEAM_OAUTH_SCOPES

export type AgentTeamOAuthScope = (typeof AGENTTEAM_OAUTH_SCOPES)[number]
export type AgentTeamApiOAuthScope = (typeof AGENTTEAM_API_OAUTH_SCOPES)[number]

export const AGENTTEAM_API_OAUTH_SCOPE_POLICIES = [
  {
    authorizesMailboxOperations: false,
    requiresPersistedAuthorization: true,
    scope: AGENTTEAM_MAIL_API_OAUTH_SCOPE
  }
] as const satisfies ReadonlyArray<{
  authorizesMailboxOperations: boolean
  requiresPersistedAuthorization: boolean
  scope: AgentTeamApiOAuthScope
}>

export function hasAgentTeamApiOAuthScope(
  scopes: Iterable<string>,
  requiredScope: AgentTeamApiOAuthScope
): boolean {
  for (const scope of scopes) {
    if (scope === requiredScope) {
      return true
    }
  }
  return false
}

export const AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS = {
  organizationId: 'https://www.agentteam.email/claims/organization_id',
  credentialKind: 'https://www.agentteam.email/claims/credential_kind'
} as const
