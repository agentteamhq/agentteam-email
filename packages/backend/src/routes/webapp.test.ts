import { beforeEach, describe, expect, it, vi } from 'vitest'

const webappRouteTestState = vi.hoisted(() => ({
  countAdminUsers: vi.fn(),
  getCustomerStripeStatus: vi.fn(),
  getUser: vi.fn(),
  isDelayedData: vi.fn()
}))

vi.mock('../auth/get-user', () => ({
  getUser: webappRouteTestState.getUser
}))

vi.mock('../globals', () => ({
  globals: vi.fn(async () => ({
    db: {
      models: {
        user: {
          countDocuments: webappRouteTestState.countAdminUsers
        }
      }
    }
  }))
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
    webappRouteTestState.countAdminUsers.mockReset()
    webappRouteTestState.countAdminUsers.mockReturnValue({
      exec: vi.fn(async () => 1)
    })
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
      shouldRedirectToSetup: false,
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

    expect(routeState.redirectTo).toBe('/')
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

  it('redirects home to admin setup when no admin user exists', async () => {
    expect.hasAssertions()

    webappRouteTestState.countAdminUsers.mockReturnValue({
      exec: vi.fn(async () => 0)
    })

    const { loadHomeRoute } = await import('./webapp')
    const routeState = await loadHomeRoute(new Request('https://mail.example.com/'))

    expect(routeState).toMatchObject({
      redirectTo: '/admin/setup/',
      setupRequired: true,
      user: null
    })
    expect(webappRouteTestState.getUser).not.toHaveBeenCalled()
  })

  it('routes signed-in admins from home to the admin dashboard', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue({
      id: 'user-1',
      role: 'admin'
    })

    const { loadHomeRoute } = await import('./webapp')
    const routeState = await loadHomeRoute(new Request('https://mail.example.com/'))

    expect(routeState).toMatchObject({
      redirectTo: '/admin/',
      setupRequired: false
    })
  })

  it('routes signed-in non-admin users from home to the product dashboard', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue({
      id: 'user-1',
      role: 'user'
    })

    const { loadHomeRoute } = await import('./webapp')
    const routeState = await loadHomeRoute(new Request('https://mail.example.com/'))

    expect(routeState).toMatchObject({
      redirectTo: '/dashboard/',
      setupRequired: false
    })
  })

  it('uses home as the default sign-in redirect after setup is complete', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue(null)

    const { loadSignInRoute } = await import('./webapp')
    const routeState = await loadSignInRoute(new Request('https://mail.example.com/signin/'))

    expect(routeState).toMatchObject({
      redirectTo: '/',
      shouldRedirectToDashboard: false,
      shouldRedirectToSetup: false
    })
  })

  it('redirects protected route state to setup before sign-in when no admin exists', async () => {
    expect.hasAssertions()

    webappRouteTestState.countAdminUsers.mockReturnValue({
      exec: vi.fn(async () => 0)
    })

    const { loadDashboardRoute } = await import('./webapp')
    const routeState = await loadDashboardRoute(new Request('https://mail.example.com/dashboard/'))

    expect(routeState).toMatchObject({
      redirectTo: '/admin/setup/',
      shouldRedirectToSetup: true,
      shouldRedirectToSignIn: false,
      user: null
    })
  })

  it('requires setup for admin routes until an admin user exists', async () => {
    expect.hasAssertions()

    webappRouteTestState.countAdminUsers.mockReturnValue({
      exec: vi.fn(async () => 0)
    })

    const { loadAdminRoute } = await import('./webapp')
    const routeState = await loadAdminRoute(new Request('https://mail.example.com/admin/'))

    expect(routeState).toMatchObject({
      redirectTo: '/admin/setup/',
      setupRequired: true,
      shouldNotFound: false,
      user: null
    })
  })

  it('returns not found state for anonymous admin route access after setup', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue(null)

    const { loadAdminRoute } = await import('./webapp')
    const routeState = await loadAdminRoute(new Request('https://mail.example.com/admin/'))

    expect(routeState).toMatchObject({
      setupRequired: false,
      shouldNotFound: true,
      user: null
    })
  })

  it('returns not found state for non-admin admin route access after setup', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue({
      id: 'user-1',
      role: 'user'
    })

    const { loadAdminRoute } = await import('./webapp')
    const routeState = await loadAdminRoute(new Request('https://mail.example.com/admin/'))

    expect(routeState).toMatchObject({
      setupRequired: false,
      shouldNotFound: true
    })
  })

  it('allows signed-in admin access to admin routes after setup', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue({
      id: 'user-1',
      role: 'admin'
    })

    const { loadAdminRoute } = await import('./webapp')
    const routeState = await loadAdminRoute(new Request('https://mail.example.com/admin/'))

    expect(routeState).toMatchObject({
      setupRequired: false,
      shouldNotFound: false
    })
  })

  it('keeps admin setup available while no admin exists', async () => {
    expect.hasAssertions()

    webappRouteTestState.countAdminUsers.mockReturnValue({
      exec: vi.fn(async () => 0)
    })

    const { loadAdminSetupRoute } = await import('./webapp')
    const routeState = await loadAdminSetupRoute(new Request('https://mail.example.com/admin/setup/'))

    expect(routeState).toMatchObject({
      setupRequired: true,
      shouldNotFound: false,
      shouldRedirectToAdmin: false
    })
  })

  it('redirects signed-in admins away from admin setup after setup is complete', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue({
      id: 'user-1',
      role: 'admin'
    })

    const { loadAdminSetupRoute } = await import('./webapp')
    const routeState = await loadAdminSetupRoute(new Request('https://mail.example.com/admin/setup/'))

    expect(routeState).toMatchObject({
      redirectTo: '/admin/',
      setupRequired: false,
      shouldNotFound: false,
      shouldRedirectToAdmin: true
    })
  })

  it('returns not found state for non-admin admin setup access after setup is complete', async () => {
    expect.hasAssertions()

    webappRouteTestState.getUser.mockResolvedValue({
      id: 'user-1',
      role: 'user'
    })

    const { loadAdminSetupRoute } = await import('./webapp')
    const routeState = await loadAdminSetupRoute(new Request('https://mail.example.com/admin/setup/'))

    expect(routeState).toMatchObject({
      setupRequired: false,
      shouldNotFound: true,
      shouldRedirectToAdmin: false
    })
  })
})
