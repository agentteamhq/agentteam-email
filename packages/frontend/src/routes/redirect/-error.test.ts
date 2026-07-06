import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { loadRedirectErrorRouteState } from './error'
import type { RedirectErrorLoaderInput } from './error'

describe('redirect error route loader', () => {
  it('logs the same safe support reference that it renders', () => {
    expect.hasAssertions()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T06:45:42.151Z'))

    try {
      const logRedirectError = vi.fn()
      const state = loadRedirectErrorRouteState({
        context: {
          publicEnv: {
            PUBLIC_HOSTNAME: 'https://mail.example.test'
          } as RedirectErrorLoaderInput['context']['publicEnv'],
          queryClient: new QueryClient()
        },
        location: {
          href:
            'https://mail.example.test/redirect/error?' +
            new URLSearchParams({
              code: 'cloudflare-code',
              error: 'oauth_code_verification_failed',
              flow: 'connected-account',
              provider: 'cloudflare',
              returnTarget: 'settings-connected-accounts',
              state: 'cloudflare-state'
            }).toString()
        },
        serverContext: {
          logRedirectError
        }
      })

      expect(state.supportReference).toBe(
        'redirect-error:cloudflare:connected-account:oauth_code_verification_failed:2026-07-06T06:45:42.151Z'
      )
      expect(logRedirectError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'oauth_code_verification_failed',
          providerId: 'cloudflare',
          supportReference: state.supportReference
        })
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
