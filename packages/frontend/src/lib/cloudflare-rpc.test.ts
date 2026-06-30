import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('returns the Cloudflare OAuth redirect URL from a JSON RPC response', async () => {
    expect.hasAssertions()
    cloudflareRpcTestState.oauthStartPost.mockResolvedValue({
      data: {
        redirectUrl: 'https://dash.cloudflare.com/oauth2/auth?state=state-1'
      },
      error: null,
      status: 200
    })
    const { startCloudflareOAuth } = await import('./cloudflare-rpc')

    await expect(startCloudflareOAuth()).resolves.toStrictEqual({
      redirectUrl: 'https://dash.cloudflare.com/oauth2/auth?state=state-1'
    })
  })

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

    await expect(startCloudflareOAuth()).rejects.toMatchObject({
      message: 'Cloudflare OAuth start returned an invalid redirect URL',
      status: 200
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

    await expect(startCloudflareOAuth()).rejects.toMatchObject({
      message: 'Cloudflare OAuth start returned an invalid redirect URL',
      status: 200
    })
  })
})
