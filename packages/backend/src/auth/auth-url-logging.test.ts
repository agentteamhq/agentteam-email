import { describe, expect, it } from 'vitest'

import { createAuthUrlComparisonLogDetails } from './auth-url-logging'

describe('auth URL logging', () => {
  it('compares token-bearing auth URLs without exposing query values', () => {
    expect.hasAssertions()

    const details = createAuthUrlComparisonLogDetails({
      betterAuthBasePath: '/api',
      betterAuthUrl:
        'https://mail.example.test/api/verify-email?token=better-auth-secret-token&callbackURL=%2Fredirect%2Femail-verified%2F',
      manualBasePath: '/rpc/auth/api',
      manualUrl:
        'https://mail.example.test/rpc/auth/api/verify-email?token=manual-secret-token&callbackURL=%2Fredirect%2Femail-verified%2F'
    })

    expect(details).toMatchObject({
      hostnameMatch: true,
      paramKeysMatch: true,
      paramValuesMatch: false,
      pathMatch: true,
      pathPatternMatch: true,
      strippedPath1: '/verify-email',
      strippedPath2: '/verify-email'
    })
    expect(details.betterAuthUrl.paramKeys).toStrictEqual(['callbackURL', 'token'])
    expect(details.manualUrl.paramKeys).toStrictEqual(['callbackURL', 'token'])
    expect(JSON.stringify(details)).not.toContain('better-auth-secret-token')
    expect(JSON.stringify(details)).not.toContain('manual-secret-token')
    expect(JSON.stringify(details)).not.toContain('/redirect/email-verified/')
    expect(JSON.stringify(details)).not.toContain('mail.example.test')
  })

  it('logs path patterns instead of raw auth path tokens', () => {
    expect.hasAssertions()

    const details = createAuthUrlComparisonLogDetails({
      betterAuthBasePath: '/api',
      betterAuthUrl:
        'https://mail.example.test/api/reset-password/better-auth-reset-token?callbackURL=%2Freset-password%2F',
      manualBasePath: '/rpc/auth/api',
      manualUrl:
        'https://mail.example.test/rpc/auth/api/reset-password/manual-reset-token?callbackURL=%2Freset-password%2F'
    })
    const serialized = JSON.stringify(details)

    expect(details).toMatchObject({
      hostnameMatch: true,
      paramKeysMatch: true,
      paramValuesMatch: true,
      pathMatch: false,
      pathPatternMatch: true,
      strippedPath1: '/reset-password/:token',
      strippedPath2: '/reset-password/:token'
    })
    expect(details.betterAuthUrl.path).toBe('/api/reset-password/:token')
    expect(details.manualUrl.path).toBe('/rpc/auth/api/reset-password/:token')
    expect(serialized).not.toContain('better-auth-reset-token')
    expect(serialized).not.toContain('manual-reset-token')
    expect(serialized).not.toContain('mail.example.test')
  })
})
