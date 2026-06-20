import { PUBLIC_VARS } from '../vars.public'

export const AGENTTEAM_OAUTH_PUBLIC_ROUTE = new URL('/api/auth', PUBLIC_VARS.PUBLIC_HOSTNAME).toString()
export const AGENTTEAM_API_OAUTH_AUDIENCE = new URL('/api', PUBLIC_VARS.PUBLIC_HOSTNAME).toString()

export const AGENTTEAM_OAUTH_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const

export const AGENTTEAM_API_OAUTH_SCOPES = [] as const

export type AgentTeamOAuthScope = (typeof AGENTTEAM_OAUTH_SCOPES)[number]

export const AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS = {
  organizationId: 'https://www.agentteam.email/claims/organization_id',
  credentialKind: 'https://www.agentteam.email/claims/credential_kind'
} as const
