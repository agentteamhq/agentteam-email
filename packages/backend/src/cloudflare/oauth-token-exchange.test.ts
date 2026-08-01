import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CloudflareOAuthTokenExchangeError,
  createAuthorizationCodeTokenRequest,
  createCloudflareOAuthTokenRefresher,
  createRefreshTokenRequest,
  exchangeCloudflareAuthorizationCode,
  refreshCloudflareAccessToken,
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
      method: 'POST',
      signal: expect.any(AbortSignal)
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

describe('Cloudflare OAuth token refresh Worker', () => {
  afterEach(() => {
    resetCloudflareOAuthTokenExchangeStateForTest()
    vi.unstubAllGlobals()
  })

  it('builds the public refresh-token grant body', async () => {
    expect.hasAssertions()
    const request = await createRefreshTokenRequest({
      clientId: 'cloudflare-client-id',
      refreshToken: 'stored+refresh+token'
    })

    expect(request.headers.get('accept')).toBe('application/json')
    expect(request.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(request.bodyText).toBe(
      'grant_type=refresh_token&refresh_token=stored%2Brefresh%2Btoken&client_id=cloudflare-client-id'
    )
    expect(request.bodyText).not.toContain('client_secret')
  })

  it('renews the grant on the direct token endpoint when direct egress is allowed', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'direct-renewed-access-token',
        expires_in: 3600,
        refresh_token: 'direct-renewed-refresh-token',
        scope: 'workers-scripts.read offline_access',
        token_type: 'Bearer'
      })
    )
    vi.stubGlobal('fetch', fetch)

    const tokens = await refreshCloudflareAccessToken(baseRefreshInput())

    expect(tokens).toMatchObject({
      accessToken: 'direct-renewed-access-token',
      accessTokenExpiresAt: expect.any(Date),
      refreshToken: 'direct-renewed-refresh-token',
      scopes: ['workers-scripts.read', 'offline_access'],
      tokenType: 'Bearer'
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://dash.cloudflare.test/oauth2/token', {
      body: expect.stringContaining('grant_type=refresh_token'),
      headers: expect.any(Headers),
      method: 'POST',
      signal: expect.any(AbortSignal)
    })
  })

  it('renews the grant through the Worker when Cloudflare challenges the refresh grant', async () => {
    expect.hasAssertions()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>Cloudflare challenge</html>', {
          headers: {
            'cf-mitigated': 'challenge',
            'cf-ray': 'challenge-ray-SJC',
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
          scope: 'offline_access',
          token_type: 'Bearer'
        })
      )
    vi.stubGlobal('fetch', fetch)

    const refreshAccessToken = createCloudflareOAuthTokenRefresher({
      accessTokenExpiresIn: undefined,
      clientId: 'cloudflare-client-id',
      tokenEndpoint: 'https://dash.cloudflare.test/oauth2/token',
      worker: {
        directFirst: true,
        password: 'worker-password',
        tokenExchangeUrl: 'https://worker.example.test/oauth2/token'
      }
    })

    await expect(refreshAccessToken('stored-refresh-token')).resolves.toMatchObject({
      accessToken: 'worker-renewed-access-token',
      refreshToken: 'worker-renewed-refresh-token'
    })
    await expect(refreshAccessToken('stored-refresh-token')).resolves.toMatchObject({
      accessToken: 'worker-renewed-access-token'
    })

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[0][0]).toBe('https://dash.cloudflare.test/oauth2/token')
    expect(fetch.mock.calls[1][0]).toBe('https://worker.example.test/oauth2/token')
    expect(fetch.mock.calls[2][0]).toBe('https://worker.example.test/oauth2/token')
    expect(new Headers((fetch.mock.calls[1][1] as RequestInit).headers).get('authorization')).toBe(
      'Bearer worker-password'
    )
    expect((fetch.mock.calls[1][1] as { body: string }).body).toContain('grant_type=refresh_token')
  })

  it('classifies the refresh failure when the Worker is also challenged', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockImplementation(
      () =>
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

    let caught: unknown
    try {
      await refreshCloudflareAccessToken(baseRefreshInput())
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CloudflareOAuthTokenExchangeError)
    expect((caught as CloudflareOAuthTokenExchangeError).diagnostic).toMatchObject({
      callbackRedirectURI: null,
      cfMitigated: 'challenge',
      cfRay: 'challenge-ray-SJC',
      classification: 'challenge_html',
      operation: 'refresh_token',
      pkceVerifierPresent: false,
      providerId: 'cloudflare',
      redirectURI: null,
      status: 403,
      via: 'worker',
      workerTokenExchangeUrl: 'https://worker.example.test/oauth2/token'
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('preserves the OAuth error classification when Cloudflare rejects the refresh token', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: 'invalid_grant',
          error_description: 'Refresh token is expired'
        },
        {
          headers: {
            'content-type': 'application/json;charset=UTF-8'
          },
          status: 400
        }
      )
    )
    vi.stubGlobal('fetch', fetch)

    await expect(refreshCloudflareAccessToken(baseRefreshInput())).rejects.toMatchObject({
      diagnostic: {
        body: {
          error: 'invalid_grant',
          error_description: 'Refresh token is expired'
        },
        classification: 'oauth_error_json',
        operation: 'refresh_token',
        status: 400,
        via: 'direct'
      },
      name: 'CloudflareOAuthTokenExchangeError'
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps refresh token values out of the client-visible error', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          access_token: 'actual-renewed-access-token',
          error: 'server_error',
          refresh_token: 'actual-renewed-refresh-token'
        },
        { status: 502 }
      )
    )
    vi.stubGlobal('fetch', fetch)

    let caught: unknown
    try {
      await refreshCloudflareAccessToken(baseRefreshInput())
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CloudflareOAuthTokenExchangeError)
    expect(String(caught)).not.toContain('actual-renewed-access-token')
    expect(String(caught)).not.toContain('actual-renewed-refresh-token')
    expect(String(caught)).not.toContain('stored-refresh-token')
    expect((caught as CloudflareOAuthTokenExchangeError).diagnostic.body).toMatchObject({
      access_token: '[redacted]',
      error: 'server_error',
      refresh_token: '[redacted]'
    })
  })
})

describe('Cloudflare OAuth token transport failures', () => {
  afterEach(() => {
    resetCloudflareOAuthTokenExchangeStateForTest()
    vi.unstubAllGlobals()
  })

  it('bounds every token leg with a request timeout', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockImplementation(() =>
      Response.json({
        access_token: 'direct-renewed-access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      })
    )
    vi.stubGlobal('fetch', fetch)

    await refreshCloudflareAccessToken(baseRefreshInput())

    const signal = (fetch.mock.calls[0][1] as RequestInit).signal
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(false)
  })

  it('falls through to the Worker when the direct leg times out without pinning the process', async () => {
    expect.hasAssertions()
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockImplementation((url: string) =>
        Response.json({
          access_token: url.includes('worker') ? 'worker-access-token' : 'direct-access-token',
          expires_in: 3600,
          token_type: 'Bearer'
        })
      )
    vi.stubGlobal('fetch', fetch)

    await expect(refreshCloudflareAccessToken(baseRefreshInput())).resolves.toMatchObject({
      accessToken: 'worker-access-token'
    })
    await expect(refreshCloudflareAccessToken(baseRefreshInput())).resolves.toMatchObject({
      accessToken: 'direct-access-token'
    })

    expect(fetch.mock.calls.map((call) => String(call[0]))).toStrictEqual([
      'https://dash.cloudflare.test/oauth2/token',
      'https://worker.example.test/oauth2/token',
      'https://dash.cloudflare.test/oauth2/token'
    ])
  })

  it('falls through to the Worker when the direct leg cannot connect', async () => {
    expect.hasAssertions()
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockImplementation(() =>
        Response.json({
          access_token: 'worker-access-token',
          expires_in: 3600,
          token_type: 'Bearer'
        })
      )
    vi.stubGlobal('fetch', fetch)

    await expect(exchangeCloudflareAuthorizationCode(baseExchangeInput())).resolves.toMatchObject({
      accessToken: 'worker-access-token'
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('classifies a Worker timeout as a transport failure instead of a challenge', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockRejectedValue(timeoutError())
    vi.stubGlobal('fetch', fetch)

    let caught: unknown
    try {
      await refreshCloudflareAccessToken(baseRefreshInput())
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CloudflareOAuthTokenExchangeError)
    expect((caught as CloudflareOAuthTokenExchangeError).diagnostic).toMatchObject({
      body: null,
      cfMitigated: null,
      classification: 'transport_timeout',
      operation: 'refresh_token',
      status: 0,
      transportError: {
        kind: 'timeout',
        name: 'TimeoutError'
      },
      via: 'worker',
      workerTokenExchangeUrl: 'https://worker.example.test/oauth2/token'
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('classifies an unreachable Worker as a network transport failure', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetch)

    await expect(refreshCloudflareAccessToken(baseRefreshInput())).rejects.toMatchObject({
      diagnostic: {
        classification: 'transport_network',
        transportError: {
          kind: 'network',
          message: 'fetch failed',
          name: 'TypeError'
        },
        via: 'worker'
      },
      name: 'CloudflareOAuthTokenExchangeError'
    })
  })

  it('keeps the transport failure free of the request body and credentials', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetch)

    let caught: unknown
    try {
      await refreshCloudflareAccessToken(baseRefreshInput())
    } catch (error) {
      caught = error
    }

    const serialized = JSON.stringify((caught as CloudflareOAuthTokenExchangeError).diagnostic)
    expect(serialized).not.toContain('stored-refresh-token')
    expect(serialized).not.toContain('worker-password')
    expect(serialized).not.toContain('grant_type')
  })

  it('applies the provider access-token expiry fallback to renewed tokens', async () => {
    expect.hasAssertions()
    const fetch = vi.fn().mockImplementation(() =>
      Response.json({
        access_token: 'direct-renewed-access-token',
        token_type: 'Bearer'
      })
    )
    vi.stubGlobal('fetch', fetch)

    const refreshAccessToken = createCloudflareOAuthTokenRefresher({
      accessTokenExpiresIn: 900,
      clientId: 'cloudflare-client-id',
      tokenEndpoint: 'https://dash.cloudflare.test/oauth2/token',
      worker: {
        directFirst: true,
        password: 'worker-password',
        tokenExchangeUrl: 'https://worker.example.test/oauth2/token'
      }
    })
    const tokens = await refreshAccessToken('stored-refresh-token')

    expect(tokens.accessTokenExpiresAt).toBeInstanceOf(Date)
    expect(tokens.accessTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now())
  })
})

function timeoutError() {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError')
}

function baseRefreshInput() {
  return {
    clientId: 'cloudflare-client-id',
    refreshToken: 'stored-refresh-token',
    worker: {
      directFirst: true,
      password: 'worker-password',
      tokenExchangeUrl: 'https://worker.example.test/oauth2/token'
    },
    tokenEndpoint: 'https://dash.cloudflare.test/oauth2/token'
  }
}

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
