import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadAuthenticatedRouteState } from './authenticated-app-route'
import type { FrontendLoaderInput } from '../server-route-context'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

const authenticatedRouteTestState = vi.hoisted(() => {
  const redirectError = new Error('redirect thrown')

  return {
    authGetSession: vi.fn(),
    redirect: vi.fn((_options: Record<string, unknown>) => {
      throw redirectError
    }),
    redirectError
  }
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()

  return {
    ...actual,
    redirect: authenticatedRouteTestState.redirect
  }
})

vi.mock('./auth-react-client', () => ({
  authReactClient: {
    getSession: authenticatedRouteTestState.authGetSession
  }
}))

describe('authenticated app route loader', () => {
  beforeEach(() => {
    authenticatedRouteTestState.authGetSession.mockReset()
    authenticatedRouteTestState.redirect.mockClear()
  })

  it('redirects unauthenticated dashboard requests to sign-in with router default redirect status', async () => {
    expect.hasAssertions()
    const request = new Request('https://mail.example.test/dashboard/')
    const routeState = {
      flash: null,
      redirectTo: '/signin/',
      setCookieHeaders: [],
      shouldRedirectToSetup: false,
      shouldRedirectToSignIn: true,
      user: null
    } satisfies SettingsRouteState
    const loadDashboardRoute = vi.fn(
      async (_request: Request): Promise<SettingsRouteState> => routeState
    )
    const loaderInput = createAuthenticatedLoaderInput({
      serverContext: {
        request,
        serverRouteHandlers: {
          loadDashboardRoute
        }
      }
    })

    await expect(loadAuthenticatedRouteState(loaderInput, '/dashboard/')).rejects.toBe(
      authenticatedRouteTestState.redirectError
    )
    expect(loadDashboardRoute).toHaveBeenCalledWith(request)
    expect(authenticatedRouteTestState.redirect).toHaveBeenCalledWith({
      href: '/signin/?redirect=%2Fdashboard%2F',
      throw: true,
      to: undefined
    })
    expect(authenticatedRouteTestState.redirect.mock.calls[0]?.[0]).not.toHaveProperty(
      'statusCode'
    )
  })
})

function createAuthenticatedLoaderInput(
  overrides: Partial<FrontendLoaderInput> = {}
): FrontendLoaderInput {
  return {
    context: {
      publicEnv: {} as FrontendLoaderInput['context']['publicEnv'],
      queryClient: new QueryClient()
    },
    ...overrides
  }
}
