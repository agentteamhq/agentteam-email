import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CloudflareGenericOAuthPlugin } from './config'
import type { AuthContext } from '@better-auth/core'
import type { OAuthProvider } from '@better-auth/core/oauth2'

const EXPECTED_CLOUDFLARE_REQUIRED_OAUTH_SCOPES = [
  'workers-r2.read',
  'workers-r2.write',
  'workers-scripts.read',
  'workers-scripts.write',
  'user-details.read',
  'dns.read',
  'dns.write',
  'zone-dns-settings.read',
  'zone-dns-settings.write',
  'zone.read',
  'zone-settings.read',
  'zone-settings.write',
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
    expect(config).not.toHaveProperty('getToken')
  })

  it('adds a Cloudflare-only Worker token exchanger when Worker config is present', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')
    vi.stubEnv('CLOUDFLARE_WORKER_ACCOUNT_ID', 'cf-account-1')
    vi.stubEnv('CLOUDFLARE_WORKER_API_TOKEN', 'cf-worker-api-token')
    vi.stubEnv('CLOUDFLARE_WORKER_PASSWORD', 'worker-password')
    vi.stubEnv('CLOUDFLARE_WORKER_NAME', 'agentteam-service-worker')
    vi.stubEnv('CLOUDFLARE_WORKER_SUBDOMAIN', 'agentteam-test')

    const { createCloudflareGenericOAuthConfig, getCloudflareWorkerConfig } = await import('./config')
    const config = createCloudflareGenericOAuthConfig()
    const workerConfig = getCloudflareWorkerConfig()

    expect(config).toMatchObject({
      clientId: 'cloudflare-client-id',
      pkce: true,
      providerId: 'cloudflare'
    })
    expect(config).toHaveProperty('getToken')
    expect(config).not.toHaveProperty('authentication')
    expect(config).not.toHaveProperty('clientSecret')
    expect(workerConfig).toMatchObject({
      accountId: 'cf-account-1',
      oauthTokenExchangeUrl: 'https://agentteam-service-worker.agentteam-test.workers.dev/oauth2/token',
      password: 'worker-password',
      subdomain: 'agentteam-test',
      workerName: 'agentteam-service-worker',
      workerUrl: 'https://agentteam-service-worker.agentteam-test.workers.dev'
    })
  })

  it('renews the Better Auth Cloudflare provider grant through the Worker when Cloudflare challenges', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    stubWorkerEnv()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>Cloudflare challenge</html>', {
          headers: {
            'cf-mitigated': 'challenge',
            'content-type': 'text/html; charset=UTF-8'
          },
          status: 403
        })
      )
      .mockImplementation(() =>
        Response.json({
          access_token: 'worker-renewed-access-token',
          expires_in: 3600,
          refresh_token: 'worker-renewed-refresh-token',
          scope: 'workers-scripts.read offline_access',
          token_type: 'Bearer'
        })
      )
    vi.stubGlobal('fetch', fetch)

    const { createCloudflareGenericOAuthPlugin } = await import('./config')
    const provider = cloudflareProviderFrom(createCloudflareGenericOAuthPlugin())

    if (!provider.refreshAccessToken) {
      throw new Error('Expected the Cloudflare provider to support token refresh')
    }

    await expect(provider.refreshAccessToken('stored-refresh-token')).resolves.toMatchObject({
      accessToken: 'worker-renewed-access-token',
      accessTokenExpiresAt: expect.any(Date),
      refreshToken: 'worker-renewed-refresh-token',
      scopes: ['workers-scripts.read', 'offline_access']
    })
    expect(fetch.mock.calls.map((call) => String(call[0]))).toStrictEqual([
      'https://dash.cloudflare.com/oauth2/token',
      'https://agentteam-service-worker.agentteam-test.workers.dev/oauth2/token'
    ])
    expect(new Headers((fetch.mock.calls[1][1] as RequestInit).headers).get('authorization')).toBe(
      'Bearer worker-password'
    )
    expect((fetch.mock.calls[1][1] as { body: string }).body).toContain('grant_type=refresh_token')
  })

  it('fails Better Auth token renewal closed when direct and Worker renewal are both challenged', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    stubWorkerEnv()
    const fetch = vi.fn().mockImplementation(
      () =>
        new Response('<html>Cloudflare challenge</html>', {
          headers: {
            'cf-mitigated': 'challenge',
            'content-type': 'text/html; charset=UTF-8'
          },
          status: 403
        })
    )
    vi.stubGlobal('fetch', fetch)

    const { createCloudflareGenericOAuthPlugin } = await import('./config')
    const provider = cloudflareProviderFrom(createCloudflareGenericOAuthPlugin())

    if (!provider.refreshAccessToken) {
      throw new Error('Expected the Cloudflare provider to support token refresh')
    }

    await expect(provider.refreshAccessToken('stored-refresh-token')).rejects.toMatchObject({
      diagnostic: {
        classification: 'challenge_html',
        operation: 'refresh_token',
        via: 'worker'
      },
      name: 'CloudflareOAuthTokenExchangeError'
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps Cloudflare token renewal on the direct endpoint when no Worker is configured', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')
    const fetch = vi.fn().mockResolvedValue(
      new Response('<html>Cloudflare challenge</html>', {
        headers: {
          'cf-mitigated': 'challenge',
          'content-type': 'text/html; charset=UTF-8'
        },
        status: 403
      })
    )
    vi.stubGlobal('fetch', fetch)

    const { createCloudflareGenericOAuthPlugin } = await import('./config')
    const provider = cloudflareProviderFrom(createCloudflareGenericOAuthPlugin())

    if (!provider.refreshAccessToken) {
      throw new Error('Expected the Cloudflare provider to support token refresh')
    }

    await expect(provider.refreshAccessToken('stored-refresh-token')).rejects.toBeDefined()
    expect(fetch.mock.calls.map((call) => String(call[0]))).toStrictEqual([
      'https://dash.cloudflare.com/oauth2/token'
    ])
  })

  it('returns no Cloudflare Better Auth plugin when Cloudflare OAuth is not configured', async () => {
    expect.hasAssertions()
    stubRequiredEnv()

    const { createCloudflareGenericOAuthPlugin, isCloudflareOAuthConfigured } = await import('./config')

    expect(isCloudflareOAuthConfigured()).toBe(false)
    expect(createCloudflareGenericOAuthPlugin()).toBeNull()
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

function cloudflareProviderFrom(plugin: CloudflareGenericOAuthPlugin | null): OAuthProvider {
  if (!plugin) {
    throw new Error('Expected a Cloudflare Better Auth plugin')
  }

  const { socialProviders } = plugin.init({
    baseURL: 'https://mail.example.test/rpc/auth/api',
    socialProviders: []
  } as unknown as AuthContext).context
  const provider = socialProviders.find((candidate) => candidate.id === 'cloudflare')

  if (!provider) {
    throw new Error('Expected the Cloudflare provider to be published to Better Auth')
  }

  return provider
}

function stubWorkerEnv() {
  vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')
  vi.stubEnv('CLOUDFLARE_WORKER_ACCOUNT_ID', 'cf-account-1')
  vi.stubEnv('CLOUDFLARE_WORKER_API_TOKEN', 'cf-worker-api-token')
  vi.stubEnv('CLOUDFLARE_WORKER_PASSWORD', 'worker-password')
  vi.stubEnv('CLOUDFLARE_WORKER_NAME', 'agentteam-service-worker')
  vi.stubEnv('CLOUDFLARE_WORKER_SUBDOMAIN', 'agentteam-test')
}

function stubRequiredEnv() {
  vi.resetModules()
  vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
  vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
}
