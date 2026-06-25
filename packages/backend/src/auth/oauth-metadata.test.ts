import { beforeEach, describe, expect, it, vi } from 'vitest'

const metadataTestState = vi.hoisted(() => ({
  getOAuthServerConfig: vi.fn(),
  getOpenIdConfig: vi.fn(),
  getProtectedResourceMetadata: vi.fn(),
  globals: vi.fn()
}))

vi.mock('@better-auth/oauth-provider/resource-client', () => ({
  oauthProviderResourceClient: () => ({
    getActions: () => ({
      getProtectedResourceMetadata: metadataTestState.getProtectedResourceMetadata
    })
  })
}))

vi.mock('../globals', () => ({
  globals: metadataTestState.globals
}))

describe('OAuth metadata public route rewriting', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    metadataTestState.getOAuthServerConfig.mockReset()
    metadataTestState.getOpenIdConfig.mockReset()
    metadataTestState.getProtectedResourceMetadata.mockReset()
    metadataTestState.globals.mockReset()
  })

  it('rewrites Better Auth logical /api URLs to the public API auth bridge', async () => {
    expect.hasAssertions()

    const { rewritePublicOAuthMetadata } = await import('./oauth-metadata')

    expect(
      rewritePublicOAuthMetadata({
        authorization_endpoint: 'https://mail.example.com/api/oauth2/authorize',
        issuer: 'https://mail.example.com',
        jwks_uri: 'https://mail.example.com/api/jwks',
        nested: {
          token_endpoint: 'https://mail.example.com/api/oauth2/token'
        },
        revocation_endpoint_aliases: [
          'https://mail.example.com/api/oauth2/revoke',
          'https://docs.example.test/api/oauth2/revoke'
        ]
      })
    ).toStrictEqual({
      authorization_endpoint: 'https://mail.example.com/api/auth/oauth2/authorize',
      issuer: 'https://mail.example.com',
      jwks_uri: 'https://mail.example.com/api/auth/jwks',
      nested: {
        token_endpoint: 'https://mail.example.com/api/auth/oauth2/token'
      },
      revocation_endpoint_aliases: [
        'https://mail.example.com/api/auth/oauth2/revoke',
        'https://docs.example.test/api/oauth2/revoke'
      ]
    })
  })

  it('forwards canonical authorization-server metadata to Better Auth and rewrites endpoint URLs', async () => {
    expect.hasAssertions()

    metadataTestState.getOAuthServerConfig.mockResolvedValue({
      authorization_endpoint: 'https://mail.example.com/api/oauth2/authorize',
      issuer: 'https://better-auth-internal.test',
      jwks_uri: 'https://mail.example.com/api/jwks',
      token_endpoint: 'https://mail.example.com/api/oauth2/token'
    })
    metadataTestState.globals.mockResolvedValue({
      auth: {
        api: {
          getOAuthServerConfig: metadataTestState.getOAuthServerConfig
        }
      }
    })

    const { handleOAuthMetadataRequest } = await import('./oauth-metadata')
    const response = await handleOAuthMetadataRequest(
      new Request('https://mail.example.com/.well-known/oauth-authorization-server')
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toStrictEqual({
      authorization_endpoint: 'https://mail.example.com/api/auth/oauth2/authorize',
      issuer: 'https://mail.example.com',
      jwks_uri: 'https://mail.example.com/api/auth/jwks',
      token_endpoint: 'https://mail.example.com/api/auth/oauth2/token'
    })
    expect(metadataTestState.getOAuthServerConfig).toHaveBeenCalledOnce()
  })

  it('serves canonical OpenID metadata from Better Auth and rewrites endpoint URLs', async () => {
    expect.hasAssertions()

    metadataTestState.getOpenIdConfig.mockResolvedValue({
      authorization_endpoint: 'https://mail.example.com/api/oauth2/authorize',
      issuer: 'https://better-auth-internal.test',
      jwks_uri: 'https://mail.example.com/api/jwks',
      token_endpoint: 'https://mail.example.com/api/oauth2/token',
      userinfo_endpoint: 'https://mail.example.com/api/userinfo'
    })
    metadataTestState.globals.mockResolvedValue({
      auth: {
        api: {
          getOpenIdConfig: metadataTestState.getOpenIdConfig
        }
      }
    })

    const { handleOAuthMetadataRequest } = await import('./oauth-metadata')
    const response = await handleOAuthMetadataRequest(
      new Request('https://mail.example.com/.well-known/openid-configuration')
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toStrictEqual({
      authorization_endpoint: 'https://mail.example.com/api/auth/oauth2/authorize',
      issuer: 'https://mail.example.com',
      jwks_uri: 'https://mail.example.com/api/auth/jwks',
      token_endpoint: 'https://mail.example.com/api/auth/oauth2/token',
      userinfo_endpoint: 'https://mail.example.com/api/auth/userinfo'
    })
    expect(metadataTestState.getOpenIdConfig).toHaveBeenCalledOnce()
  })

  it('serves public API protected-resource metadata from the Better Auth resource helper', async () => {
    expect.hasAssertions()

    const { AGENTTEAM_API_OAUTH_SCOPE_POLICIES } = await import('./oauth-provider-config')
    const apiScopes = AGENTTEAM_API_OAUTH_SCOPE_POLICIES.map((policy) => policy.scope)
    metadataTestState.globals.mockResolvedValue({ auth: {} })
    metadataTestState.getProtectedResourceMetadata.mockResolvedValue({
      authorization_servers: ['https://mail.example.com'],
      bearer_methods_supported: ['header'],
      resource: 'https://mail.example.com/api',
      resource_documentation: 'https://mail.example.com/openapi/',
      resource_name: 'AgentTeam Email API',
      scopes_supported: apiScopes
    })

    const { handleOAuthMetadataRequest } = await import('./oauth-metadata')
    const response = await handleOAuthMetadataRequest(
      new Request('https://mail.example.com/.well-known/oauth-protected-resource/api')
    )

    expect(response?.status).toBe(200)
    expect(await response?.json()).toStrictEqual({
      authorization_servers: ['https://mail.example.com'],
      bearer_methods_supported: ['header'],
      resource: 'https://mail.example.com/api',
      resource_documentation: 'https://mail.example.com/openapi/',
      resource_name: 'AgentTeam Email API',
      scopes_supported: apiScopes
    })
    expect(metadataTestState.getProtectedResourceMetadata).toHaveBeenCalledWith({
      bearer_methods_supported: ['header'],
      resource: 'https://mail.example.com/api',
      resource_documentation: 'https://mail.example.com/openapi/',
      resource_name: 'AgentTeam Email API',
      scopes_supported: apiScopes
    })
  })
})
