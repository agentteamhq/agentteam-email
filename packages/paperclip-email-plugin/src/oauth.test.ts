import { describe, expect, it } from 'vitest'

import {
  AGENTTEAM_EMAIL_OAUTH_SCOPE,
  buildAgentTeamEmailOAuthConnectUrl
} from './oauth'

describe('AgentTeam Email OAuth URL builder', () => {
  it('builds an authorization-code PKCE URL for the AgentTeam OAuth server', () => {
    expect.hasAssertions()

    const url = new URL(
      buildAgentTeamEmailOAuthConnectUrl({
        codeChallenge: 'challenge-1',
        oauthClientId: 'paperclip-email',
        oauthRedirectUri: 'https://paperclip.example/oauth/callback',
        serviceBaseUrl: 'https://mail.example.com',
        state: 'state-1'
      })
    )

    expect(url.origin).toBe('https://mail.example.com')
    expect(url.pathname).toBe('/rpc/auth/api/oauth2/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('paperclip-email')
    expect(url.searchParams.get('redirect_uri')).toBe('https://paperclip.example/oauth/callback')
    expect(url.searchParams.get('scope')).toBe(AGENTTEAM_EMAIL_OAUTH_SCOPE)
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('audience')).toBe('https://mail.example.com/api')
  })
})
