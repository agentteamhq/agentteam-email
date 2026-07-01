import { describe, expect, it } from 'vitest'

import { createRedirectErrorViewState } from './redirect-error-page'

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
    expect(state.retryHref).toBe('/settings/domains/')
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

  it('falls back to generic redirect context when provider metadata is absent', () => {
    expect.hasAssertions()
    const state = createRedirectErrorViewState({
      occurredAt: new Date('2026-06-30T12:00:00.000Z'),
      publicHostname: 'https://mail.example.test',
      url: 'https://mail.example.test/redirect/error?error=server_error'
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
})
