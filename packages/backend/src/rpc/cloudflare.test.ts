import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudflareOAuthReturnTarget } from '../cloudflare/service'

type CloudflareHeadersMock = (headers: Headers) => Promise<unknown>
type CloudflareStartMock = (input: {
  headers: Headers
  returnTarget: CloudflareOAuthReturnTarget
}) => Promise<unknown>
type CloudflareConnectionMock = (input: { headers: Headers; input: unknown }) => Promise<unknown>
type CloudflareProvisionMock = (input: { connectionPublicId: string; headers: Headers }) => Promise<unknown>
type CloudflareDisconnectMock = (input: { grantPublicId: string; headers: Headers }) => Promise<unknown>
type CloudflareFinalizeMock = (input: { headers: Headers; intentPublicId: string }) => Promise<unknown>
type CloudflareZonesMock = (input: {
  cloudflareAccountId?: string
  grantPublicId?: string
  headers: Headers
}) => Promise<unknown>
type IsCloudflareAccessErrorMock = (error: unknown) => error is Error & { status: 401 | 403 }

const cloudflareRpcTestState = vi.hoisted(() => ({
  applyCloudflareConnectionProvisioning: vi.fn<CloudflareProvisionMock>(),
  connectCloudflareDomain: vi.fn<CloudflareConnectionMock>(),
  disconnectCloudflare: vi.fn<CloudflareDisconnectMock>(),
  finalizeCloudflareOAuth: vi.fn<CloudflareFinalizeMock>(),
  getCloudflareStatus: vi.fn<CloudflareHeadersMock>(),
  isCloudflareAccessError: vi.fn<IsCloudflareAccessErrorMock>(),
  listConnectedCloudflareAccounts: vi.fn<CloudflareHeadersMock>(),
  listConnectedCloudflareZones: vi.fn<CloudflareZonesMock>(),
  startCloudflareOAuth: vi.fn<CloudflareStartMock>()
}))

vi.mock('../cloudflare/service', () => ({
  applyCloudflareConnectionProvisioning: cloudflareRpcTestState.applyCloudflareConnectionProvisioning,
  connectCloudflareDomain: cloudflareRpcTestState.connectCloudflareDomain,
  CloudflareOAuthReturnTargetValues: [
    'dashboard-onboarding',
    'settings-connected-accounts',
    'settings-domains'
  ],
  disconnectCloudflare: cloudflareRpcTestState.disconnectCloudflare,
  finalizeCloudflareOAuth: cloudflareRpcTestState.finalizeCloudflareOAuth,
  getCloudflareStatus: cloudflareRpcTestState.getCloudflareStatus,
  isCloudflareAccessError: cloudflareRpcTestState.isCloudflareAccessError,
  listConnectedCloudflareAccounts: cloudflareRpcTestState.listConnectedCloudflareAccounts,
  listConnectedCloudflareZones: cloudflareRpcTestState.listConnectedCloudflareZones,
  startCloudflareOAuth: cloudflareRpcTestState.startCloudflareOAuth
}))

describe('Cloudflare RPC routes', () => {
  beforeEach(() => {
    vi.resetModules()
    cloudflareRpcTestState.applyCloudflareConnectionProvisioning.mockReset()
    cloudflareRpcTestState.connectCloudflareDomain.mockReset()
    cloudflareRpcTestState.disconnectCloudflare.mockReset()
    cloudflareRpcTestState.finalizeCloudflareOAuth.mockReset()
    cloudflareRpcTestState.getCloudflareStatus.mockReset()
    cloudflareRpcTestState.isCloudflareAccessError.mockReset()
    cloudflareRpcTestState.listConnectedCloudflareAccounts.mockReset()
    cloudflareRpcTestState.listConnectedCloudflareZones.mockReset()
    cloudflareRpcTestState.startCloudflareOAuth.mockReset()
    cloudflareRpcTestState.isCloudflareAccessError.mockImplementation(
      (error: unknown): error is Error & { status: 401 | 403 } =>
        error instanceof Error && error.name === 'CloudflareAccessError'
    )
  })

  it.each(['dashboard-onboarding', 'settings-connected-accounts', 'settings-domains'] as const)(
    'starts Cloudflare OAuth through the webserver for %s and preserves Better Auth cookies',
    async (returnTarget) => {
      expect.hasAssertions()

      const responseHeaders = new Headers()
      responseHeaders.append('set-cookie', 'cf-oauth-state=one; Path=/; HttpOnly')
      responseHeaders.append('set-cookie', 'cf-oauth-verifier=two; Path=/; Secure')
      cloudflareRpcTestState.startCloudflareOAuth.mockResolvedValue({
        intent: {
          publicId: 'intent-public-1',
          status: 'pending'
        },
        redirectUrl: 'https://dash.cloudflare.com/oauth2/auth?state=state-1',
        responseHeaders
      })

      const { default: cloudflare } = await import('./cloudflare')
      const response = await cloudflare.handle(
        new Request('https://mail.example.com/cloudflare/oauth/start', {
          body: JSON.stringify({ returnTarget }),
          headers: {
            cookie: 'session=abc',
            'content-type': 'application/json'
          },
          method: 'POST'
        })
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')?.split(';')[0]).toBe('application/json')
      expect((response.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()).toStrictEqual([
        'cf-oauth-state=one; Path=/; HttpOnly',
        'cf-oauth-verifier=two; Path=/; Secure'
      ])
      await expect(response.json()).resolves.toStrictEqual({
        intent: {
          publicId: 'intent-public-1',
          status: 'pending'
        },
        redirectUrl: 'https://dash.cloudflare.com/oauth2/auth?state=state-1'
      })
      expect(cloudflareRpcTestState.startCloudflareOAuth).toHaveBeenCalledOnce()
      expect(cloudflareRpcTestState.startCloudflareOAuth).toHaveBeenCalledWith({
        headers: expect.any(Headers),
        returnTarget
      })
      expect(cloudflareRpcTestState.startCloudflareOAuth.mock.calls[0][0].headers.get('cookie')).toBe(
        'session=abc'
      )
    }
  )

  it('rejects missing Cloudflare OAuth return targets before reaching the service', async () => {
    expect.hasAssertions()

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/oauth/start', {
        body: JSON.stringify({}),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(422)
    expect(cloudflareRpcTestState.startCloudflareOAuth).not.toHaveBeenCalled()
  })

  it('rejects unknown Cloudflare OAuth return targets before reaching the service', async () => {
    expect.hasAssertions()

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/oauth/start', {
        body: JSON.stringify({ returnTarget: 'dashboard-settings-query' }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(422)
    expect(cloudflareRpcTestState.startCloudflareOAuth).not.toHaveBeenCalled()
  })

  it('rejects camelCase Cloudflare OAuth return targets before reaching the service', async () => {
    expect.hasAssertions()

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/oauth/start', {
        body: JSON.stringify({ returnTarget: 'settingsConnectedAccounts' }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(422)
    expect(cloudflareRpcTestState.startCloudflareOAuth).not.toHaveBeenCalled()
  })

  it('connects a domain with validated route input through the service boundary', async () => {
    expect.hasAssertions()

    cloudflareRpcTestState.connectCloudflareDomain.mockResolvedValue({
      cloudflareAccountId: 'cf-account-1',
      cloudflareZoneId: 'cf-zone-1',
      domain: 'example.com',
      provisioningStatus: 'pending',
      publicId: 'connection-public-1',
      status: 'connected'
    })

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/connections', {
        body: JSON.stringify({
          cloudflareAccountId: 'cf-account-1',
          cloudflareAccountName: 'Example Account',
          cloudflareZoneId: 'cf-zone-1',
          cloudflareZoneName: null,
          domain: 'Example.COM',
          grantPublicId: 'grant-public-1'
        }),
        headers: {
          authorization: 'Bearer user-token',
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      connection: {
        cloudflareAccountId: 'cf-account-1',
        cloudflareZoneId: 'cf-zone-1',
        domain: 'example.com',
        provisioningStatus: 'pending',
        publicId: 'connection-public-1',
        status: 'connected'
      }
    })
    expect(cloudflareRpcTestState.connectCloudflareDomain).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      input: {
        cloudflareAccountId: 'cf-account-1',
        cloudflareAccountName: 'Example Account',
        cloudflareZoneId: 'cf-zone-1',
        cloudflareZoneName: null,
        domain: 'Example.COM',
        grantPublicId: 'grant-public-1'
      }
    })
    expect(cloudflareRpcTestState.connectCloudflareDomain.mock.calls[0][0].headers.get('authorization')).toBe(
      'Bearer user-token'
    )
  })

  it('rejects invalid connection input before reaching the Cloudflare service', async () => {
    expect.hasAssertions()

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/connections', {
        body: JSON.stringify({
          cloudflareAccountId: 'cf-account-1',
          cloudflareZoneId: '',
          domain: 'example.com'
        }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(422)
    expect(cloudflareRpcTestState.connectCloudflareDomain).not.toHaveBeenCalled()
  })

  it('rejects missing connection grant public ids before reaching the Cloudflare service', async () => {
    expect.hasAssertions()

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/connections', {
        body: JSON.stringify({
          cloudflareAccountId: 'cf-account-1',
          cloudflareZoneId: 'cf-zone-1',
          domain: 'example.com'
        }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(422)
    expect(cloudflareRpcTestState.connectCloudflareDomain).not.toHaveBeenCalled()
  })

  it('returns Cloudflare account summaries with grant public ids', async () => {
    expect.hasAssertions()

    cloudflareRpcTestState.listConnectedCloudflareAccounts.mockResolvedValue([
      {
        grantPublicId: 'grant-public-1',
        id: 'cf-account-1',
        name: 'Example Account',
        type: 'standard'
      }
    ])

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(new Request('https://mail.example.com/cloudflare/accounts'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      accounts: [
        {
          grantPublicId: 'grant-public-1',
          id: 'cf-account-1',
          name: 'Example Account',
          type: 'standard'
        }
      ]
    })
    expect(cloudflareRpcTestState.listConnectedCloudflareAccounts).toHaveBeenCalledWith(expect.any(Headers))
  })

  it('passes optional grant public id selectors to Cloudflare zone listing', async () => {
    expect.hasAssertions()

    cloudflareRpcTestState.listConnectedCloudflareZones.mockResolvedValue([
      {
        accountId: 'cf-account-2',
        accountName: 'Example Account',
        grantPublicId: 'grant-public-2',
        id: 'cf-zone-2',
        name: 'example.com',
        status: 'active'
      }
    ])

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/zones?accountId=cf-account-2&grantPublicId=grant-public-2')
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      zones: [
        {
          accountId: 'cf-account-2',
          accountName: 'Example Account',
          grantPublicId: 'grant-public-2',
          id: 'cf-zone-2',
          name: 'example.com',
          status: 'active'
        }
      ]
    })
    expect(cloudflareRpcTestState.listConnectedCloudflareZones).toHaveBeenCalledWith({
      cloudflareAccountId: 'cf-account-2',
      grantPublicId: 'grant-public-2',
      headers: expect.any(Headers)
    })
  })

  it('rejects empty Cloudflare zone grant public id selectors before reaching the service', async () => {
    expect.hasAssertions()

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/zones?accountId=cf-account-2&grantPublicId=')
    )

    expect(response.status).toBe(422)
    expect(cloudflareRpcTestState.listConnectedCloudflareZones).not.toHaveBeenCalled()
  })

  it('maps Cloudflare access errors without exposing a Bearer challenge for UI routes', async () => {
    expect.hasAssertions()

    const error = new Error('Organization administrator access is required') as Error & {
      status: 401 | 403
    }
    error.name = 'CloudflareAccessError'
    error.status = 403
    cloudflareRpcTestState.getCloudflareStatus.mockRejectedValue(error)

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(new Request('https://mail.example.com/cloudflare/status'))

    expect(response.status).toBe(403)
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toStrictEqual({
      error: 'Organization administrator access is required'
    })
  })

  it('provisions a connected domain by public connection id', async () => {
    expect.hasAssertions()

    cloudflareRpcTestState.applyCloudflareConnectionProvisioning.mockResolvedValue({
      cloudflareAccountId: 'cf-account-1',
      cloudflareZoneId: 'cf-zone-1',
      domain: 'example.com',
      publicId: 'connection-public-1',
      provisioningStatus: 'succeeded',
      status: 'active'
    })

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/connections/connection-public-1/provision', {
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      connection: {
        cloudflareAccountId: 'cf-account-1',
        cloudflareZoneId: 'cf-zone-1',
        domain: 'example.com',
        provisioningStatus: 'succeeded',
        publicId: 'connection-public-1',
        status: 'active'
      }
    })
    expect(cloudflareRpcTestState.applyCloudflareConnectionProvisioning).toHaveBeenCalledWith({
      connectionPublicId: 'connection-public-1',
      headers: expect.any(Headers)
    })
  })

  it('disconnects the selected Cloudflare grant through the service boundary', async () => {
    expect.hasAssertions()

    cloudflareRpcTestState.disconnectCloudflare.mockResolvedValue({
      connections: [],
      grants: []
    })

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/disconnect', {
        body: JSON.stringify({
          grantPublicId: 'grant-public-1'
        }),
        headers: {
          authorization: 'Bearer user-token',
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      connections: [],
      grants: []
    })
    expect(cloudflareRpcTestState.disconnectCloudflare).toHaveBeenCalledWith({
      grantPublicId: 'grant-public-1',
      headers: expect.any(Headers)
    })
    expect(cloudflareRpcTestState.disconnectCloudflare.mock.calls[0][0].headers.get('authorization')).toBe(
      'Bearer user-token'
    )
  })

  it('rejects missing disconnect grant public ids before reaching the Cloudflare service', async () => {
    expect.hasAssertions()

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/disconnect', {
        body: JSON.stringify({}),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(422)
    expect(cloudflareRpcTestState.disconnectCloudflare).not.toHaveBeenCalled()
  })

  it('rejects empty disconnect grant public ids before reaching the Cloudflare service', async () => {
    expect.hasAssertions()

    const { default: cloudflare } = await import('./cloudflare')
    const response = await cloudflare.handle(
      new Request('https://mail.example.com/cloudflare/disconnect', {
        body: JSON.stringify({
          grantPublicId: ''
        }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(422)
    expect(cloudflareRpcTestState.disconnectCloudflare).not.toHaveBeenCalled()
  })
})
