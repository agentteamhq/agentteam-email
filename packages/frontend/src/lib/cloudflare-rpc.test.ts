import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudflareOAuthReturnTarget } from '@main/backend'

const validCloudflareOAuthReturnTargets = [
  'dashboard-onboarding',
  'settings-connected-accounts',
  'settings-domains'
] as const satisfies readonly CloudflareOAuthReturnTarget[]

const cloudflareRpcTestState = vi.hoisted(() => ({
  oauthStartPost: vi.fn()
}))

vi.mock('./rpc-api-client', () => ({
  rpc: {
    cloudflare: {
      oauth: {
        start: {
          post: cloudflareRpcTestState.oauthStartPost
        }
      }
    }
  }
}))

describe('Cloudflare RPC adapter', () => {
  beforeEach(() => {
    cloudflareRpcTestState.oauthStartPost.mockReset()
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
})
