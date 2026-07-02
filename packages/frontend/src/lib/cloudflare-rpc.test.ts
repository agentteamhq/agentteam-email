import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CloudflareAccountSummary,
  CloudflareConnectionInput,
  CloudflareOAuthReturnTarget
} from '@main/backend'

type CloudflareGrantPublicIdFixture = CloudflareAccountSummary['grantPublicId']

const validCloudflareOAuthReturnTargets = [
  'dashboard-onboarding',
  'settings-connected-accounts',
  'settings-domains'
] as const satisfies readonly CloudflareOAuthReturnTarget[]

const cloudflareRpcTestState = vi.hoisted(() => ({
  accountsGet: vi.fn(),
  connectionsPost: vi.fn(),
  disconnectPost: vi.fn(),
  oauthStartPost: vi.fn(),
  statusGet: vi.fn(),
  zonesGet: vi.fn()
}))

vi.mock('./rpc-api-client', () => ({
  rpc: {
    cloudflare: {
      accounts: {
        get: cloudflareRpcTestState.accountsGet
      },
      connections: {
        post: cloudflareRpcTestState.connectionsPost
      },
      disconnect: {
        post: cloudflareRpcTestState.disconnectPost
      },
      oauth: {
        start: {
          post: cloudflareRpcTestState.oauthStartPost
        }
      },
      status: {
        get: cloudflareRpcTestState.statusGet
      },
      zones: {
        get: cloudflareRpcTestState.zonesGet
      }
    }
  }
}))

describe('Cloudflare RPC adapter', () => {
  beforeEach(() => {
    cloudflareRpcTestState.accountsGet.mockReset()
    cloudflareRpcTestState.connectionsPost.mockReset()
    cloudflareRpcTestState.disconnectPost.mockReset()
    cloudflareRpcTestState.oauthStartPost.mockReset()
    cloudflareRpcTestState.statusGet.mockReset()
    cloudflareRpcTestState.zonesGet.mockReset()
  })

  it.each(validCloudflareOAuthReturnTargets)(
    'passes %s and returns the Cloudflare OAuth redirect URL from a JSON RPC response',
    async (returnTarget) => {
      expect.hasAssertions()
      cloudflareRpcTestState.oauthStartPost.mockResolvedValue({
        data: {
          redirectUrl: 'https://dash.cloudflare.com/oauth2/auth?state=state-1'
        },
        error: null,
        status: 200
      })
      const { startCloudflareOAuth } = await import('./cloudflare-rpc')

      await expect(startCloudflareOAuth(returnTarget)).resolves.toStrictEqual({
        redirectUrl: 'https://dash.cloudflare.com/oauth2/auth?state=state-1'
      })
      expect(cloudflareRpcTestState.oauthStartPost).toHaveBeenCalledWith({
        returnTarget
      })
    }
  )

  it('rejects Eden streamed text responses instead of navigating without a redirect URL', async () => {
    expect.hasAssertions()
    async function* streamedTextResponse() {
      yield '{"redirectUrl":"https://dash.cloudflare.com/oauth2/auth?state=state-1"}'
    }
    cloudflareRpcTestState.oauthStartPost.mockResolvedValue({
      data: streamedTextResponse(),
      error: null,
      status: 200
    })
    const { startCloudflareOAuth } = await import('./cloudflare-rpc')

    await expect(startCloudflareOAuth('settings-domains')).rejects.toMatchObject({
      message: 'Cloudflare OAuth start returned an invalid redirect URL',
      status: 200
    })
    expect(cloudflareRpcTestState.oauthStartPost).toHaveBeenCalledWith({
      returnTarget: 'settings-domains'
    })
  })

  it('rejects non-HTTP Cloudflare OAuth redirect URLs', async () => {
    expect.hasAssertions()
    cloudflareRpcTestState.oauthStartPost.mockResolvedValue({
      data: {
        redirectUrl: 'javascript:alert(1)'
      },
      error: null,
      status: 200
    })
    const { startCloudflareOAuth } = await import('./cloudflare-rpc')

    await expect(startCloudflareOAuth('settings-domains')).rejects.toMatchObject({
      message: 'Cloudflare OAuth start returned an invalid redirect URL',
      status: 200
    })
  })

  it('passes grantPublicId and accountId when loading Cloudflare zones', async () => {
    expect.hasAssertions()
    const grantPublicId = cloudflareGrantPublicId('grant-public-id')
    cloudflareRpcTestState.zonesGet.mockResolvedValue({
      data: {
        zones: [
          {
            accountId: 'cloudflare-account-id',
            accountName: 'AgentTeam Production',
            grantPublicId,
            id: 'cloudflare-zone-id',
            name: 'agentteam.example',
            status: 'active'
          }
        ]
      },
      error: null,
      status: 200
    })
    const { fetchCloudflareZones } = await import('./cloudflare-rpc')

    await expect(
      fetchCloudflareZones({
        accountId: 'cloudflare-account-id',
        grantPublicId
      })
    ).resolves.toStrictEqual([
      {
        accountId: 'cloudflare-account-id',
        accountName: 'AgentTeam Production',
        grantPublicId,
        id: 'cloudflare-zone-id',
        name: 'agentteam.example',
        status: 'active'
      }
    ])
    expect(cloudflareRpcTestState.zonesGet).toHaveBeenCalledWith({
      query: {
        accountId: 'cloudflare-account-id',
        grantPublicId: 'grant-public-id'
      }
    })
  })

  it('passes grantPublicId through domain connection and refreshes status', async () => {
    expect.hasAssertions()
    const connection = {
      cloudflareAccountId: 'cloudflare-account-id',
      cloudflareAccountName: 'AgentTeam Production',
      cloudflareZoneId: 'cloudflare-zone-id',
      cloudflareZoneName: 'agentteam.example',
      createdAt: new Date('2026-06-21T16:16:00.000Z'),
      domain: 'agentteam.example',
      lastErrorCode: null,
      lastErrorMessage: null,
      lastProvisionedAt: null,
      provisioningStatus: 'not_started',
      publicId: 'connection-public-id',
      status: 'connected',
      updatedAt: new Date('2026-06-21T16:16:00.000Z'),
      workerScriptName: null
    }
    const status = {
      connections: [connection],
      grants: []
    }
    const input = {
      cloudflareAccountId: 'cloudflare-account-id',
      cloudflareAccountName: 'AgentTeam Production',
      cloudflareZoneId: 'cloudflare-zone-id',
      cloudflareZoneName: 'agentteam.example',
      domain: 'agentteam.example',
      grantPublicId: 'grant-public-id'
    } as CloudflareConnectionInput
    cloudflareRpcTestState.connectionsPost.mockResolvedValue({
      data: { connection },
      error: null,
      status: 200
    })
    cloudflareRpcTestState.statusGet.mockResolvedValue({
      data: status,
      error: null,
      status: 200
    })
    const { connectCloudflareDomain } = await import('./cloudflare-rpc')

    await expect(connectCloudflareDomain(input)).resolves.toStrictEqual(status)
    expect(cloudflareRpcTestState.connectionsPost).toHaveBeenCalledWith(input)
    expect(cloudflareRpcTestState.statusGet).toHaveBeenCalled()
  })

  it('passes grantPublicId when disconnecting a Cloudflare grant', async () => {
    expect.hasAssertions()
    const status = {
      connections: [],
      grants: []
    }
    cloudflareRpcTestState.disconnectPost.mockResolvedValue({
      data: status,
      error: null,
      status: 200
    })
    const { disconnectCloudflareConnection } = await import('./cloudflare-rpc')

    await expect(disconnectCloudflareConnection('grant-public-id')).resolves.toStrictEqual(status)
    expect(cloudflareRpcTestState.disconnectPost).toHaveBeenCalledWith({
      grantPublicId: 'grant-public-id'
    })
  })
})

function cloudflareGrantPublicId(value: string): CloudflareGrantPublicIdFixture {
  return value as CloudflareGrantPublicIdFixture
}
