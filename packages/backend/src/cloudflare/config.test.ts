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
    vi.unstubAllEnvs()
  })

  it('uses Authorization Code with PKCE and no token endpoint client authentication', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')

    const { createCloudflareGenericOAuthConfig, getCloudflareRequiredOAuthScopes, isCloudflareOAuthConfigured } =
      await import('./config')
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
})

function stubRequiredEnv() {
  vi.resetModules()
  vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
  vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
}
