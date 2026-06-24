import { beforeEach, describe, expect, it, vi } from 'vitest'

const webappRouteTestState = vi.hoisted(() => ({
  getCustomerStripeStatus: vi.fn(),
  getUser: vi.fn(),
  isDelayedData: vi.fn()
}))

vi.mock('../auth/get-user', () => ({
  getUser: webappRouteTestState.getUser
}))

vi.mock('../payments/get-customer-status', () => ({
  getCustomerStripeStatus: webappRouteTestState.getCustomerStripeStatus
}))

vi.mock('../payments/is-delayed-data', () => ({
  isDelayedData: webappRouteTestState.isDelayedData
}))

describe('webapp auth route state', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    webappRouteTestState.getCustomerStripeStatus.mockReset()
    webappRouteTestState.getUser.mockReset()
    webappRouteTestState.isDelayedData.mockReset()
  })

  it('preserves the device approval callback when redirecting unauthenticated users to sign in', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue(null)

    const { loadDeviceRoute } = await import('./webapp')
    const routeState = await loadDeviceRoute(
      new Request('https://mail.example.com/device/approve/?user_code=abcd-1234#confirm')
    )

    expect(routeState).toMatchObject({
      redirectTo: '/device/approve/?user_code=abcd-1234#confirm',
      shouldRedirectToSignIn: true,
      user: null,
      userCode: 'ABCD1234'
    })
  })

  it('rejects external sign-in redirects', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue(null)

    const { loadSignInRoute } = await import('./webapp')
    const routeState = await loadSignInRoute(
      new Request('https://mail.example.com/signin/?redirect=https%3A%2F%2Fevil.example%2Fdevice')
    )

    expect(routeState.redirectTo).toBe('/dashboard/')
  })

  it('allows internal sign-in redirects for device approval', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue(null)

    const { loadSignInRoute } = await import('./webapp')
    const routeState = await loadSignInRoute(
      new Request('https://mail.example.com/signin/?redirect=%2Fdevice%2Fapprove%2F%3Fuser_code%3DABCD1234')
    )

    expect(routeState.redirectTo).toBe('/device/approve/?user_code=ABCD1234')
  })
})
