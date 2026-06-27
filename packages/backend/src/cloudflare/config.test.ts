import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Cloudflare OAuth config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses Authorization Code with PKCE and no token endpoint client authentication', async () => {
    expect.hasAssertions()
    stubRequiredEnv()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')

    const { createCloudflareGenericOAuthConfig, isCloudflareOAuthConfigured } = await import('./config')
    const config = createCloudflareGenericOAuthConfig()

    expect(isCloudflareOAuthConfigured()).toBe(true)
    expect(config).toMatchObject({
      clientId: 'cloudflare-client-id',
      pkce: true,
      providerId: 'cloudflare',
      scopes: expect.arrayContaining(['email-sending.read', 'email-sending.write', 'offline_access'])
    })
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
