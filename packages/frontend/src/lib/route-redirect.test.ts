import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSignInRedirectHref, throwAuthRequiredRedirect, throwRouteRedirect } from './route-redirect'

const routeRedirectTestState = vi.hoisted(() => {
  const redirectError = new Error('redirect thrown')

  return {
    redirect: vi.fn((_options: Record<string, unknown>) => {
      throw redirectError
    }),
    redirectError
  }
})

vi.mock('@tanstack/react-router', () => ({
  redirect: routeRedirectTestState.redirect
}))

describe('route redirect helpers', () => {
  beforeEach(() => {
    routeRedirectTestState.redirect.mockClear()
  })

  it('creates sign-in redirect hrefs with the original target encoded', () => {
    expect(createSignInRedirectHref('/dashboard/?view=inbox')).toBe(
      '/signin/?redirect=%2Fdashboard%2F%3Fview%3Dinbox'
    )
  })

  it('uses the router default redirect status for auth-required page navigation', () => {
    expect.hasAssertions()

    expect(() => throwAuthRequiredRedirect('/dashboard/')).toThrow(routeRedirectTestState.redirectError)
    expect(routeRedirectTestState.redirect).toHaveBeenCalledWith({
      href: '/signin/?redirect=%2Fdashboard%2F',
      throw: true,
      to: undefined
    })
    expect(routeRedirectTestState.redirect.mock.calls[0]?.[0]).not.toHaveProperty('statusCode')
  })

  it('preserves explicit redirect status codes for callers that need them', () => {
    expect.hasAssertions()

    expect(() => throwRouteRedirect('/signin/', { statusCode: 303 })).toThrow(
      routeRedirectTestState.redirectError
    )
    expect(routeRedirectTestState.redirect).toHaveBeenCalledWith({
      href: '/signin/',
      statusCode: 303,
      throw: true,
      to: undefined
    })
  })
})
