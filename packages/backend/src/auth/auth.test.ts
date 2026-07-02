import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/db'

describe('Better Auth organization API-key configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
  })

  it('allows only organization owners and admins to manage organization API keys', async () => {
    expect.hasAssertions()

    const { organizationAccessControl, organizationRoles } = await import('./auth')

    expect(organizationAccessControl.statements.apiKey).toStrictEqual(['create', 'read', 'update', 'delete'])
    expect(
      organizationRoles.owner.authorize({
        apiKey: ['create', 'read', 'update', 'delete']
      }).success
    ).toBe(true)
    expect(
      organizationRoles.admin.authorize({
        apiKey: ['create', 'read', 'update', 'delete']
      }).success
    ).toBe(true)
    expect(
      organizationRoles.member.authorize({
        apiKey: ['read']
      }).success
    ).toBe(false)
  })

  it('keeps user and organization API keys credential scoped and non-session-bearing', async () => {
    expect.hasAssertions()

    const { apiKeyConfigurationDefaults, apiKeyConfigurations } = await import('./auth')

    expect(apiKeyConfigurationDefaults).toMatchObject({
      defaultPrefix: '_secret_api_',
      enableMetadata: true,
      enableSessionForAPIKeys: false,
      fallbackToDatabase: true,
      rateLimit: {
        enabled: true,
        maxRequests: 200,
        timeWindow: 60_000
      },
      storage: 'secondary-storage'
    })
    expect(apiKeyConfigurations).toStrictEqual([
      {
        ...apiKeyConfigurationDefaults,
        configId: 'default',
        references: 'user'
      },
      {
        ...apiKeyConfigurationDefaults,
        configId: 'organization',
        references: 'organization'
      }
    ])
  })

  it('creates the device authorization plugin with the AT Email CLI client gate', async () => {
    expect.hasAssertions()

    const { createAtEmailCliDeviceAuthorizationPlugin } = await import('./auth')

    const plugin = createAtEmailCliDeviceAuthorizationPlugin()
    const validateClient = plugin.options.validateClient

    expect(plugin.id).toBe('device-authorization')
    expect(plugin.schema.deviceCode.fields.deviceCode.required).toBe(true)
    expect(validateClient).toBeTypeOf('function')
    await expect(Promise.resolve(validateClient?.('at-email-cli'))).resolves.toBe(true)
    await expect(Promise.resolve(validateClient?.('unknown-client'))).resolves.toBe(false)
  })

  it('advertises the mail API OAuth scope without adding it to default client registration scopes', async () => {
    expect.hasAssertions()

    const {
      AGENTTEAM_API_OAUTH_SCOPE_POLICIES,
      AGENTTEAM_API_OAUTH_SCOPES,
      AGENTTEAM_MAIL_API_OAUTH_SCOPE,
      AGENTTEAM_OAUTH_CLIENT_REGISTRATION_SCOPES,
      AGENTTEAM_OAUTH_SCOPES,
      hasAgentTeamApiOAuthScope
    } = await import('./oauth-provider-config')

    expect(AGENTTEAM_API_OAUTH_SCOPES).toStrictEqual([AGENTTEAM_MAIL_API_OAUTH_SCOPE])
    expect(AGENTTEAM_API_OAUTH_SCOPE_POLICIES).toStrictEqual([
      {
        authorizesMailboxOperations: false,
        requiresPersistedAuthorization: true,
        scope: AGENTTEAM_MAIL_API_OAUTH_SCOPE
      }
    ])
    expect(AGENTTEAM_OAUTH_CLIENT_REGISTRATION_SCOPES).toStrictEqual(AGENTTEAM_OAUTH_SCOPES)
    expect(AGENTTEAM_OAUTH_CLIENT_REGISTRATION_SCOPES).not.toContain(AGENTTEAM_MAIL_API_OAUTH_SCOPE)
    expect(
      hasAgentTeamApiOAuthScope(['openid', AGENTTEAM_MAIL_API_OAUTH_SCOPE], AGENTTEAM_MAIL_API_OAUTH_SCOPE)
    ).toBe(true)
    expect(hasAgentTeamApiOAuthScope(['openid', 'email'], AGENTTEAM_MAIL_API_OAUTH_SCOPE)).toBe(false)
  })

  it('uses the app-owned redirect route for browser-facing auth errors', async () => {
    expect.hasAssertions()

    const {
      AUTH_REDIRECT_ERROR_PATH,
      AUTH_REDIRECT_ERROR_ROUTE,
      BETTER_AUTH_BASE_PATH,
      BETTER_AUTH_MANUAL_BASE_PATH,
      BETTER_AUTH_ROUTE
    } = await import('./auth-routes')

    expect(BETTER_AUTH_BASE_PATH).toBe('/api')
    expect(BETTER_AUTH_MANUAL_BASE_PATH).toBe('/rpc/auth/api')
    expect(BETTER_AUTH_ROUTE).toBe('https://mail.example.com/rpc/auth/api')
    expect(AUTH_REDIRECT_ERROR_PATH).toBe('/redirect/error')
    expect(AUTH_REDIRECT_ERROR_ROUTE).toBe('https://mail.example.com/redirect/error')
  })

  it('routes OAuth provider post-login client management to canonical Agent access settings', async () => {
    expect.hasAssertions()

    const { AGENTTEAM_OAUTH_PROVIDER_POST_LOGIN_PAGE } = await import('./auth')

    expect(AGENTTEAM_OAUTH_PROVIDER_POST_LOGIN_PAGE).toBe('/settings/agent-access/')
    expect(AGENTTEAM_OAUTH_PROVIDER_POST_LOGIN_PAGE).not.toBe('/settings/developer/')
  })

  it('gates OAuth client management through CASL OAuthConnection ability', async () => {
    expect.hasAssertions()

    const { canManageOAuthClientsForSession } = await import('./oauth-client-privileges')
    const session = {
      activeOrganizationId: 'org-1',
      id: 'session-1',
      userId: 'user-1'
    }

    await expect(
      canManageOAuthClientsForSession({
        db: createOAuthPrivilegeDatabase({ role: 'member' }),
        session
      })
    ).resolves.toBe(false)
    await expect(
      canManageOAuthClientsForSession({
        db: createOAuthPrivilegeDatabase({ role: 'admin' }),
        session
      })
    ).resolves.toBe(true)
    await expect(
      canManageOAuthClientsForSession({
        db: createOAuthPrivilegeDatabase({
          role: 'member',
          systemGrants: [
            {
              constraints: null,
              expiresAt: null,
              organizationId: 'org-1',
              permission: 'manageOAuthConnections',
              principalId: 'user-1',
              principalType: 'user_session',
              status: 'active'
            }
          ]
        }),
        session
      })
    ).resolves.toBe(true)
  })
})

function createOAuthPrivilegeDatabase({
  role,
  systemGrants = []
}: {
  role: 'admin' | 'member' | 'owner' | null
  systemGrants?: ReadonlyArray<Record<string, unknown>>
}): Database {
  return {
    models: {
      agentMailMailboxGrant: {
        find: vi.fn(() => ({
          exec: async () => []
        }))
      },
      agentMailSystemGrant: {
        find: vi.fn(() => ({
          exec: async () => systemGrants
        }))
      },
      member: {
        findOne: vi.fn(() => ({
          exec: async () => (role ? { role } : null)
        }))
      }
    }
  } as unknown as Database
}
