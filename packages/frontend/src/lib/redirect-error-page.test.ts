import { describe, expect, it } from 'vitest'

import { createRedirectErrorDiagnosticLogDetails, createRedirectErrorViewState } from './redirect-error-page'
import type { CloudflareOAuthReturnTarget } from '@main/backend'

const cloudflareReturnTargetRetryCases = [
  {
    retryHref: '/dashboard/',
    returnTarget: 'dashboard-onboarding'
  },
  {
    retryHref: '/settings/connected-accounts/',
    returnTarget: 'settings-connected-accounts'
  },
  {
    retryHref: '/settings/domains/',
    returnTarget: 'settings-domains'
  }
] as const satisfies readonly {
  retryHref: string
  returnTarget: CloudflareOAuthReturnTarget
}[]

describe('redirect error page state', () => {
  it('builds Cloudflare connection context and redacts sensitive redirect fields', () => {
    expect.hasAssertions()
    const state = createRedirectErrorViewState({
      occurredAt: new Date('2026-06-30T12:00:00.000Z'),
      publicHostname: 'https://mail.example.test',
      url:
        'https://mail.example.test/redirect/error?' +
        new URLSearchParams({
          access_token: 'cloudflare-access-token',
          callbackUri: 'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare',
          cloudflareIntentId: 'intent_public_test',
          code: 'cloudflare-code',
          error: 'invalid_request',
          error_description: 'The request is missing the required redirect uri',
          flow: 'connected-account',
          provider: 'cloudflare',
          state: 'cloudflare-state'
        }).toString()
    })

    expect(state.title).toBe('Cloudflare connection failed')
    expect(state.providerLabel).toBe('Cloudflare')
    expect(state.flowLabel).toBe('Connected account')
    expect(state.errorCode).toBe('invalid_request')
    expect(state.providerMessage).toBe('The request is missing the required redirect uri')
    expect(state.callbackUri).toBe('https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare')
    expect(state.retryHref).toBe('/settings/connected-accounts/')
    expect(state.redactedQueryKeys).toStrictEqual(['access_token', 'code', 'state'])
    expect(state.pageUri).toContain('code=%5Bredacted%5D')
    expect(state.pageUri).toContain('state=%5Bredacted%5D')
    expect(state.pageUri).toContain('access_token=%5Bredacted%5D')
    expect(state.pageUri).not.toContain('cloudflare-code')
    expect(state.pageUri).not.toContain('cloudflare-state')
    expect(state.pageUri).not.toContain('cloudflare-access-token')
    expect(state.supportReference).toBe(
      'redirect-error:cloudflare:connected-account:invalid_request:2026-06-30T12:00:00.000Z'
    )
  })

  it.each(cloudflareReturnTargetRetryCases)(
    'uses $returnTarget as the Cloudflare OAuth retry target',
    ({ retryHref, returnTarget }) => {
      expect.hasAssertions()
      const state = createRedirectErrorViewState({
        occurredAt: new Date('2026-06-30T12:00:00.000Z'),
        publicHostname: 'https://mail.example.test',
        url:
          'https://mail.example.test/redirect/error?' +
          new URLSearchParams({
            error: 'invalid_request',
            flow: 'connected-account',
            provider: 'cloudflare',
            returnTarget
          }).toString()
      })

      expect(state.retryHref).toBe(retryHref)
    }
  )

  it('falls back to connected account settings for invalid Cloudflare OAuth return targets', () => {
    expect.hasAssertions()
    const state = createRedirectErrorViewState({
      occurredAt: new Date('2026-06-30T12:00:00.000Z'),
      publicHostname: 'https://mail.example.test',
      url:
        'https://mail.example.test/redirect/error?' +
        new URLSearchParams({
          error: 'invalid_request',
          flow: 'connected-account',
          provider: 'cloudflare',
          returnTarget: 'https://attacker.example.test/settings'
        }).toString()
    })

    expect(state.retryHref).toBe('/settings/connected-accounts/')
  })

  it('falls back to generic redirect context when provider metadata is absent', () => {
    expect.hasAssertions()
    const state = createRedirectErrorViewState({
      occurredAt: new Date('2026-06-30T12:00:00.000Z'),
      publicHostname: 'https://mail.example.test',
      url: 'https://mail.example.test/redirect/error?error=server_error&returnTarget=settings-domains'
    })

    expect(state.title).toBe('Connection redirect failed')
    expect(state.providerLabel).toBe('Unknown provider')
    expect(state.flowLabel).toBe('Authentication')
    expect(state.callbackUri).toBe('Not provided')
    expect(state.retryHref).toBe('/')
  })

  it('rejects external callback URIs and redacts secret-like message fragments', () => {
    expect.hasAssertions()
    const state = createRedirectErrorViewState({
      occurredAt: new Date('2026-06-30T12:00:00.000Z'),
      publicHostname: 'https://mail.example.test',
      url:
        'https://mail.example.test/redirect/error?' +
        new URLSearchParams({
          callbackUri: 'https://attacker.example.test/callback',
          error: 'invalid_request',
          error_description: 'authorization=Bearer provider-secret client_secret=secret-value',
          flow: 'connected-account',
          provider: 'cloudflare'
        }).toString()
    })

    expect(state.callbackUri).toBe('https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare')
    expect(state.providerMessage).toBe('authorization=[redacted] client_secret=[redacted]')
    expect(state.pageUri).not.toContain('provider-secret')
    expect(state.pageUri).not.toContain('secret-value')
  })

  it('redacts PKCE verifier and assertion-style secrets from public redirect diagnostics', () => {
    expect.hasAssertions()
    const state = createRedirectErrorViewState({
      occurredAt: new Date('2026-06-30T12:00:00.000Z'),
      publicHostname: 'https://mail.example.test',
      url:
        'https://mail.example.test/redirect/error?' +
        new URLSearchParams({
          accessToken: 'raw-access-token',
          admission_token: 'raw-admission-token',
          apiKey: 'raw-api-key',
          assertion: 'raw-assertion',
          bearer: 'raw-bearer-param',
          callbackUri:
            'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?code_verifier=raw-callback-verifier&sessionToken=raw-callback-session-token',
          clientSecret: 'raw-client-secret',
          codeVerifier: 'raw-code-verifier',
          credential: 'raw-credential',
          error: 'invalid_request',
          error_description:
            'codeVerifier=raw-message-code-verifier pkce_verifier=raw-message-pkce assertion=raw-message-assertion sessionState=raw-message-session-state authorization: Bearer raw-message-bearer jwt=raw-message-jwt oauth_token=raw-message-oauth-token bearer=raw-message-bearer-key admission_token=raw-message-admission-token',
          flow: 'connected-account',
          idToken: 'raw-id-token',
          jwt: 'raw-jwt-param',
          oauthCode: 'raw-oauth-code',
          oauth_token: 'raw-oauth-token',
          pkceVerifier: 'raw-pkce-verifier',
          provider: 'cloudflare',
          refreshToken: 'raw-refresh-token',
          sessionState: 'raw-session-state',
          session_token: 'raw-session-token',
          verifier: 'raw-verifier'
        }).toString()
    })
    const serialized = JSON.stringify(state)

    expect(state.providerMessage).toBe(
      'codeVerifier=[redacted] pkce_verifier=[redacted] assertion=[redacted] sessionState=[redacted] authorization=[redacted] jwt=[redacted] oauth_token=[redacted] bearer=[redacted] admission_token=[redacted]'
    )
    expect(state.callbackUri).toContain('code_verifier=[redacted]')
    expect(state.callbackUri).toContain('sessionToken=[redacted]')
    expect(state.redactedQueryKeys).toStrictEqual([
      'accessToken',
      'admission_token',
      'apiKey',
      'assertion',
      'bearer',
      'clientSecret',
      'codeVerifier',
      'credential',
      'idToken',
      'jwt',
      'oauth_token',
      'oauthCode',
      'pkceVerifier',
      'refreshToken',
      'session_token',
      'sessionState',
      'verifier'
    ])
    expect(serialized).not.toContain('raw-access-token')
    expect(serialized).not.toContain('raw-admission-token')
    expect(serialized).not.toContain('raw-api-key')
    expect(serialized).not.toContain('raw-assertion')
    expect(serialized).not.toContain('raw-bearer-param')
    expect(serialized).not.toContain('raw-callback-session-token')
    expect(serialized).not.toContain('raw-callback-verifier')
    expect(serialized).not.toContain('raw-client-secret')
    expect(serialized).not.toContain('raw-code-verifier')
    expect(serialized).not.toContain('raw-credential')
    expect(serialized).not.toContain('raw-id-token')
    expect(serialized).not.toContain('raw-jwt-param')
    expect(serialized).not.toContain('raw-message')
    expect(serialized).not.toContain('raw-oauth-code')
    expect(serialized).not.toContain('raw-oauth-token')
    expect(serialized).not.toContain('raw-pkce-verifier')
    expect(serialized).not.toContain('raw-refresh-token')
    expect(serialized).not.toContain('raw-session-state')
    expect(serialized).not.toContain('raw-session-token')
    expect(serialized).not.toContain('raw-verifier')
  })

  it('creates concrete server diagnostics with narrow query secret redactions', () => {
    expect.hasAssertions()
    const details = createRedirectErrorDiagnosticLogDetails({
      occurredAt: new Date('2026-07-06T06:45:42.151Z'),
      publicHostname: 'https://mail.example.test',
      url:
        'https://mail.example.test/redirect/error?' +
        new URLSearchParams({
          access_token: 'cloudflare-access-token',
          authorization: 'Bearer provider-secret',
          callbackUri:
            'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?code=callback-code-secret',
          client_secret: 'client-secret-value',
          cloudflareIntentId: 'intent_public_test',
          code: 'cloudflare-code',
          error: 'oauth_code_verification_failed',
          error_description:
            'authorization=Bearer provider-secret client_secret=client-secret-value code=cloudflare-code',
          flow: 'connected-account',
          provider: 'cloudflare',
          returnTarget: 'settings-connected-accounts',
          state: 'cloudflare-state'
        }).toString()
    })
    const serialized = JSON.stringify(details)

    expect(details).toMatchObject({
      callbackUri: 'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?code=%5Bredacted%5D',
      callbackPath: '/rpc/auth/api/oauth2/callback/cloudflare',
      cloudflareIntentId: 'intent_public_test',
      errorCode: 'oauth_code_verification_failed',
      error_description: 'authorization=[redacted] client_secret=[redacted] code=[redacted]',
      flow: 'connected-account',
      provider: 'cloudflare',
      providerId: 'cloudflare',
      providerMessage: 'authorization=[redacted] client_secret=[redacted] code=[redacted]',
      redactedQueryKeys: ['access_token', 'authorization', 'client_secret', 'code', 'state'],
      returnTarget: 'settings-connected-accounts',
      supportReference:
        'redirect-error:cloudflare:connected-account:oauth_code_verification_failed:2026-07-06T06:45:42.151Z'
    })
    expect(details.pageUri).toContain('callbackUri=https%3A%2F%2Fmail.example.test')
    expect(details.pageUri).toContain('cloudflareIntentId=intent_public_test')
    expect(details.pageUri).toContain('error_description=authorization%3D%5Bredacted%5D')
    expect(details.redactedQuery).toContain('cloudflareIntentId=intent_public_test')
    expect(details.redactedQuery).toContain('returnTarget=settings-connected-accounts')
    expect(serialized).not.toContain('cloudflare-code')
    expect(serialized).not.toContain('cloudflare-state')
    expect(serialized).not.toContain('cloudflare-access-token')
    expect(serialized).not.toContain('provider-secret')
    expect(serialized).not.toContain('client-secret-value')
    expect(serialized).not.toContain('callback-code-secret')
    expect(serialized).toContain('intent_public_test')
    expect(serialized).toContain('error_description')
  })

  it('preserves callbackURL and redirect_uri as sanitized first-class server diagnostics', () => {
    expect.hasAssertions()
    const details = createRedirectErrorDiagnosticLogDetails({
      occurredAt: new Date('2026-07-06T06:45:42.151Z'),
      publicHostname: 'https://mail.example.test',
      url:
        'https://mail.example.test/redirect/error?' +
        new URLSearchParams({
          callbackURL:
            '/settings/connected-accounts/?sessionToken=raw-callback-url-session-token&returnTarget=settings-connected-accounts',
          callbackUri:
            'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?code_verifier=raw-callback-uri-verifier',
          error: 'invalid_request',
          error_description:
            'assertion=raw-message-assertion codeVerifier=raw-message-code-verifier Bearer raw-message-bearer',
          flow: 'connected-account',
          provider: 'cloudflare',
          redirect_uri:
            'https://provider.example.test/oauth/callback?clientSecret=raw-redirect-client-secret&scope=read',
          returnTarget:
            'https://mail.example.test/settings/domains?apiKey=raw-return-api-key&cloudflareIntentId=intent_public_test'
        }).toString()
    })
    const serialized = JSON.stringify(details)

    expect(details).toMatchObject({
      callbackQueryParameterNames: ['code_verifier'],
      callbackURL:
        '/settings/connected-accounts/?sessionToken=%5Bredacted%5D&returnTarget=settings-connected-accounts',
      callbackURLPath: '/settings/connected-accounts/',
      callbackURLQueryParameterNames: ['returnTarget', 'sessionToken'],
      callbackUri:
        'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare?code_verifier=%5Bredacted%5D',
      redirect_uri: 'https://provider.example.test/oauth/callback?clientSecret=%5Bredacted%5D&scope=read',
      redirectUriPath: '/oauth/callback',
      redirectUriQueryParameterNames: ['clientSecret', 'scope'],
      returnTarget:
        'https://mail.example.test/settings/domains?apiKey=%5Bredacted%5D&cloudflareIntentId=intent_public_test'
    })
    expect(details.error_description).toBe('assertion=[redacted] codeVerifier=[redacted] Bearer [redacted]')
    expect(details.pageQueryParameterNames).toContain('callbackURL')
    expect(details.pageQueryParameterNames).toContain('redirect_uri')
    expect(serialized).toContain('intent_public_test')
    expect(serialized).not.toContain('raw-callback-uri-verifier')
    expect(serialized).not.toContain('raw-callback-url-session-token')
    expect(serialized).not.toContain('raw-message')
    expect(serialized).not.toContain('raw-redirect-client-secret')
    expect(serialized).not.toContain('raw-return-api-key')
  })

  it('preserves unknown provider and flow diagnostics as supplied by the redirect', () => {
    expect.hasAssertions()
    const details = createRedirectErrorDiagnosticLogDetails({
      occurredAt: new Date('2026-07-06T06:45:42.151Z'),
      publicHostname: 'https://mail.example.test',
      url:
        'https://mail.example.test/redirect/error?' +
        new URLSearchParams({
          callbackUri:
            'https://oauth.example.test/callback?code=external-code-secret&error=JWTAccessTokenError',
          cloudflareIntentId: 'intent_public_unknown_provider',
          error: 'JWTAccessTokenError',
          flow: 'authorization-code-with-pkce',
          message: 'JWTAccessTokenError from provider callback',
          provider: 'OIDC-Enterprise',
          returnTarget: 'operator-console'
        }).toString()
    })
    const serialized = JSON.stringify(details)

    expect(details).toMatchObject({
      callbackUri: 'https://oauth.example.test/callback?code=%5Bredacted%5D&error=JWTAccessTokenError',
      cloudflareIntentId: 'intent_public_unknown_provider',
      errorCode: 'JWTAccessTokenError',
      flow: 'authorization-code-with-pkce',
      message: 'JWTAccessTokenError from provider callback',
      provider: 'OIDC-Enterprise',
      providerMessage: 'JWTAccessTokenError from provider callback',
      returnTarget: 'operator-console'
    })
    expect(details).not.toHaveProperty('providerId')
    expect(details.redactedQuery).toContain('provider=OIDC-Enterprise')
    expect(details.redactedQuery).toContain('flow=authorization-code-with-pkce')
    expect(details.redactedQuery).toContain('returnTarget=operator-console')
    expect(serialized).toContain('JWTAccessTokenError')
    expect(serialized).toContain('intent_public_unknown_provider')
    expect(serialized).not.toContain('external-code-secret')
  })
})
