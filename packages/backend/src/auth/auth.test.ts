import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('Better Auth organization API-key configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
  })

  it('allows only organization owners and admins to manage organization API keys', async () => {
    expect.hasAssertions()

    const { organizationAccessControl, organizationRoles } = await import('./auth')

    expect(organizationAccessControl.statements.apiKey).toStrictEqual([
      'create',
      'read',
      'update',
      'delete'
    ])
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
})
