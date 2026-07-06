import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CloudflareOAuthTokenExchangeError,
  createAuthorizationCodeTokenRequest,
  exchangeCloudflareAuthorizationCode,
  resetCloudflareOAuthTokenExchangeStateForTest
} from './oauth-token-exchange'

describe('Cloudflare OAuth token exchange Worker', () => {
  afterEach(() => {
    resetCloudflareOAuthTokenExchangeStateForTest()
    vi.unstubAllGlobals()
  })

  it('builds the public PKCE authorization-code token body', () => {
    const request = createAuthorizationCodeTokenRequest({
      clientId: 'cloudflare-client-id',
      code: 'code+value',
      codeVerifier: 'pkce-verifier',
      redirectURI: 'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare'
    })

    expect(request.headers.get('accept')).toBe('application/json')
    expect(request.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(request.bodyText).toBe(
      'grant_type=authorization_code&code=code%2Bvalue&code_verifier=pkce-verifier&redirect_uri=https%3A%2F%2Fmail.example.test%2Frpc%2Fauth%2Fapi%2Foauth2%2Fcallback%2Fcloudflare&client_id=cloudflare-client-id'
    )
  })

  it('uses the direct token endpoint when direct exchange succeeds', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'direct-access-token',
        expires_in: 3600,
        refresh_token: 'direct-refresh-token',
        scope: 'workers-scripts.read offline_access',
        token_type: 'Bearer'
      })
    )
    vi.stubGlobal('fetch', fetch)

    const result = await exchangeCloudflareAuthorizationCode(baseExchangeInput())

    expect(result).toMatchObject({
      accessToken: 'direct-access-token',
      refreshToken: 'direct-refresh-token',
      scopes: ['workers-scripts.read', 'offline_access'],
      tokenType: 'Bearer'
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://dash.cloudflare.test/oauth2/token', {
      body: expect.stringContaining('grant_type=authorization_code'),
      headers: expect.any(Headers),
      method: 'POST'
    })
  })

  it('uses the Worker on Cloudflare challenge and keeps using the Worker for the process', async () => {
    expect.hasAssertions()
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
          access_token: 'worker-access-token',
          expires_in: 3600,
          refresh_token: 'worker-refresh-token',
          scope: 'offline_access',
          token_type: 'Bearer'
        })
      )
    vi.stubGlobal('fetch', fetch)

    await expect(exchangeCloudflareAuthorizationCode(baseExchangeInput())).resolves.toMatchObject({
      accessToken: 'worker-access-token'
    })
    await expect(exchangeCloudflareAuthorizationCode(baseExchangeInput())).resolves.toMatchObject({
      accessToken: 'worker-access-token'
    })

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[0][0]).toBe('https://dash.cloudflare.test/oauth2/token')
    expect(fetch.mock.calls[1][0]).toBe('https://worker.example.test/oauth2/token')
    expect(fetch.mock.calls[2][0]).toBe('https://worker.example.test/oauth2/token')
    expect(new Headers((fetch.mock.calls[1][1] as RequestInit).headers).get('authorization')).toBe(
      'Bearer worker-password'
    )
    expect(new Headers((fetch.mock.calls[2][1] as RequestInit).headers).get('authorization')).toBe(
      'Bearer worker-password'
    )
  })

  it('preserves OAuth JSON errors without treating them as challenge fallback', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: 'invalid_client',
          error_description: 'Client authentication failed'
        },
        {
          headers: {
            'content-type': 'application/json;charset=UTF-8'
          },
          status: 401
        }
      )
    )
    vi.stubGlobal('fetch', fetch)

    await expect(exchangeCloudflareAuthorizationCode(baseExchangeInput())).rejects.toMatchObject({
      diagnostic: {
        body: {
          error: 'invalid_client',
          error_description: 'Client authentication failed'
        },
        classification: 'oauth_error_json',
        status: 401,
        via: 'direct'
      },
      name: 'CloudflareOAuthTokenExchangeError'
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves OAuth JSON errors returned through the Worker', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: 'invalid_client',
          error_description: 'Client authentication failed'
        },
        {
          headers: {
            'cf-ray': 'worker-ray-SJC',
            'content-type': 'application/json;charset=UTF-8'
          },
          status: 401
        }
      )
    )
    vi.stubGlobal('fetch', fetch)

    const input = baseExchangeInput()
    input.worker.directFirst = false
    await expect(exchangeCloudflareAuthorizationCode(input)).rejects.toMatchObject({
      diagnostic: {
        body: {
          error: 'invalid_client',
          error_description: 'Client authentication failed'
        },
        cfRay: 'worker-ray-SJC',
        classification: 'oauth_error_json',
        status: 401,
        via: 'worker'
      },
      name: 'CloudflareOAuthTokenExchangeError'
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(new Headers((fetch.mock.calls[0][1] as RequestInit).headers).get('authorization')).toBe(
      'Bearer worker-password'
    )
  })

  it('preserves Cloudflare challenge response metadata from the Worker', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockResolvedValue(
      new Response('<html>Cloudflare challenge</html>', {
        headers: {
          'cf-mitigated': 'challenge',
          'cf-ray': 'challenge-ray-SJC',
          'content-type': 'text/html; charset=UTF-8'
        },
        status: 403
      })
    )
    vi.stubGlobal('fetch', fetch)

    const input = baseExchangeInput()
    input.worker.directFirst = false
    let caught: unknown
    try {
      await exchangeCloudflareAuthorizationCode(input)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CloudflareOAuthTokenExchangeError)
    expect((caught as CloudflareOAuthTokenExchangeError).diagnostic).toMatchObject({
      body: '<html>Cloudflare challenge</html>',
      cfMitigated: 'challenge',
      cfRay: 'challenge-ray-SJC',
      classification: 'challenge_html',
      contentType: 'text/html; charset=UTF-8',
      status: 403,
      via: 'worker'
    })
  })

  it('keeps client-visible token exchange errors generic and redacts known response secrets', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          access_token: 'actual-access-token',
          error: 'server_error',
          refresh_token: 'actual-refresh-token'
        },
        { status: 502 }
      )
    )
    vi.stubGlobal('fetch', fetch)

    let caught: unknown
    try {
      await exchangeCloudflareAuthorizationCode(baseExchangeInput())
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CloudflareOAuthTokenExchangeError)
    expect((caught as Error).message).toBe('Cloudflare OAuth token exchange failed')
    expect(String(caught)).not.toContain('actual-access-token')
    expect(String(caught)).not.toContain('actual-refresh-token')
    expect((caught as CloudflareOAuthTokenExchangeError).diagnostic.body).toMatchObject({
      access_token: '[redacted]',
      error: 'server_error',
      refresh_token: '[redacted]'
    })
  })
})

function baseExchangeInput() {
  return {
    callbackRedirectURI: 'https://mail.example.test/api/oauth2/callback/cloudflare',
    clientId: 'cloudflare-client-id',
    code: 'authorization-code',
    codeVerifier: 'pkce-verifier',
    redirectURI: 'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare',
    worker: {
      directFirst: true,
      password: 'worker-password',
      tokenExchangeUrl: 'https://worker.example.test/oauth2/token'
    },
    tokenEndpoint: 'https://dash.cloudflare.test/oauth2/token'
  }
}
