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

  it('creates safe server diagnostics without query secrets or callback query values', () => {
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

    expect(details).toStrictEqual({
      callbackPath: '/rpc/auth/api/oauth2/callback/cloudflare',
      errorCode: 'oauth_code_verification_failed',
      flow: 'connected-account',
      provider: 'cloudflare',
      providerId: 'cloudflare',
      redactedQueryKeys: ['access_token', 'authorization', 'client_secret', 'code', 'state'],
      returnTarget: 'settings-connected-accounts',
      supportReference:
        'redirect-error:cloudflare:connected-account:oauth_code_verification_failed:2026-07-06T06:45:42.151Z'
    })
    expect(serialized).not.toContain('cloudflare-code')
    expect(serialized).not.toContain('cloudflare-state')
    expect(serialized).not.toContain('cloudflare-access-token')
    expect(serialized).not.toContain('provider-secret')
    expect(serialized).not.toContain('client-secret-value')
    expect(serialized).not.toContain('callback-code-secret')
    expect(serialized).not.toContain('intent_public_test')
    expect(serialized).not.toContain('error_description')
  })
})
