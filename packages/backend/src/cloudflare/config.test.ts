import { afterEach, describe, expect, it, vi } from 'vitest'

const EXPECTED_CLOUDFLARE_REQUIRED_OAUTH_SCOPES = [
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
]

describe('Cloudflare OAuth config', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('uses Authorization Code with PKCE and no token endpoint client authentication', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')

    const {
      createCloudflareGenericOAuthConfig,
      getCloudflareRequiredOAuthScopes,
      isCloudflareOAuthConfigured
    } = await import('./config')
    const config = createCloudflareGenericOAuthConfig()

    expect(isCloudflareOAuthConfigured()).toBe(true)
    expect(config).toMatchObject({
      clientId: 'cloudflare-client-id',
      pkce: true,
      providerId: 'cloudflare',
      redirectURI: 'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare',
      scopes: EXPECTED_CLOUDFLARE_REQUIRED_OAUTH_SCOPES
    })
    expect(getCloudflareRequiredOAuthScopes()).toStrictEqual(EXPECTED_CLOUDFLARE_REQUIRED_OAUTH_SCOPES)
    expect(config).not.toHaveProperty('authentication')
    expect(config).not.toHaveProperty('clientSecret')
  })

  it('maps the Cloudflare REST user envelope to a Better Auth profile', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')
    vi.stubEnv('CLOUDFLARE_API_BASE_URL', 'https://api.cloudflare.example.test/client/v4')
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        errors: [],
        messages: [],
        result: {
          email: 'admin@example.test',
          first_name: 'Ada',
          id: 'cloudflare-user-1',
          last_name: 'Lovelace'
        },
        success: true
      })
    )
    vi.stubGlobal('fetch', fetch)

    const { createCloudflareGenericOAuthConfig } = await import('./config')
    const config = createCloudflareGenericOAuthConfig()
    if (!config?.getUserInfo) {
      throw new Error('Expected Cloudflare OAuth config to define getUserInfo')
    }

    const userInfo = await config.getUserInfo({ accessToken: 'dummy-cloudflare-access-token' })

    expect(userInfo).toStrictEqual({
      email: 'admin@example.test',
      emailVerified: true,
      id: 'cloudflare-user-1',
      name: 'Ada Lovelace'
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://api.cloudflare.example.test/client/v4/user', {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer dummy-cloudflare-access-token'
      },
      method: 'GET'
    })
  })

  it('falls back to email when the Cloudflare REST user envelope omits names', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        errors: [],
        messages: [],
        result: {
          email: 'admin@example.test',
          id: 'cloudflare-user-1'
        },
        success: true
      })
    )
    vi.stubGlobal('fetch', fetch)

    const { createCloudflareGenericOAuthConfig } = await import('./config')
    const config = createCloudflareGenericOAuthConfig()
    if (!config?.getUserInfo) {
      throw new Error('Expected Cloudflare OAuth config to define getUserInfo')
    }

    await expect(config.getUserInfo({ accessToken: 'dummy-cloudflare-access-token' })).resolves.toMatchObject(
      {
        name: 'admin@example.test'
      }
    )
  })

  it.each([
    [
      'missing email',
      {
        errors: [],
        messages: [],
        result: {
          id: 'cloudflare-user-1'
        },
        success: true
      }
    ],
    [
      'missing id',
      {
        errors: [],
        messages: [],
        result: {
          email: 'admin@example.test'
        },
        success: true
      }
    ],
    [
      'failed envelope',
      {
        errors: [{ code: 1000, message: 'missing scope' }],
        messages: [],
        result: null,
        success: false
      }
    ]
  ])('returns null for a Cloudflare REST user envelope with %s', async (_caseName, envelope) => {
    expect.hasAssertions()
    stubRequiredEnv()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')
    const fetch = vi.fn().mockResolvedValue(Response.json(envelope))
    vi.stubGlobal('fetch', fetch)

    const { createCloudflareGenericOAuthConfig } = await import('./config')
    const config = createCloudflareGenericOAuthConfig()
    if (!config?.getUserInfo) {
      throw new Error('Expected Cloudflare OAuth config to define getUserInfo')
    }

    await expect(config.getUserInfo({ accessToken: 'dummy-cloudflare-access-token' })).resolves.toBeNull()
  })

  it('returns null when the Cloudflare REST user request fails', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: 'Unauthorized' }, { status: 401 }))
    vi.stubGlobal('fetch', fetch)

    const { createCloudflareGenericOAuthConfig } = await import('./config')
    const config = createCloudflareGenericOAuthConfig()
    if (!config?.getUserInfo) {
      throw new Error('Expected Cloudflare OAuth config to define getUserInfo')
    }

    await expect(config.getUserInfo({ accessToken: 'dummy-cloudflare-access-token' })).resolves.toBeNull()
  })
})

function stubRequiredEnv() {
  vi.resetModules()
  vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
  vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
}
