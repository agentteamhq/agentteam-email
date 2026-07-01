import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cloudflareOAuthCompletionPath } from './dashboard-cloudflare-oauth-routing'
import { DashboardMailController } from './dashboard-mail-client-controller'
import type { DashboardScreenProps } from './dashboard-screen'
import type { PublicEnv } from '../types'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

const controllerTestState = vi.hoisted(() => ({
  capturedScreenProps: undefined as DashboardScreenProps | undefined,
  navigate: vi.fn(() => Promise.resolve()),
  routePathname: '/dashboard/',
  startCloudflareOAuth: vi.fn()
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()

  return {
    ...actual,
    useRouter: () => ({
      navigate: controllerTestState.navigate
    }),
    useRouterState: ({
      select
    }: {
      select: (state: { location: { pathname: string; search: Record<string, unknown> } }) => unknown
    }) =>
      select({
        location: {
          pathname: controllerTestState.routePathname,
          search: {}
        }
      })
  }
})

vi.mock('../lib/cloudflare-rpc', () => ({
  connectCloudflareDomain: vi.fn(),
  disconnectCloudflareConnection: vi.fn(),
  fetchCloudflareAccounts: vi.fn(),
  fetchCloudflareStatus: vi.fn(),
  fetchCloudflareZones: vi.fn(),
  finalizeCloudflareOAuth: vi.fn(),
  provisionCloudflareConnection: vi.fn(),
  startCloudflareOAuth: controllerTestState.startCloudflareOAuth
}))

vi.mock('./dashboard-screen', () => ({
  DashboardScreen: (props: DashboardScreenProps) => {
    controllerTestState.capturedScreenProps = props
    return null
  }
}))

const publicEnv = {
  DEV: false,
  NODE_ENV: 'test',
  PROD: false,
  PUBLIC_GOOGLE_CLIENT_ID: undefined,
  PUBLIC_HOSTNAME: 'https://mail.example.com',
  PUBLIC_HTTPS_PROTO: true,
  PUBLIC_LINKEDIN_CLIENT_ID: undefined,
  TEST: true
} satisfies PublicEnv

const routeState = {
  flash: null,
  redirectTo: '/signin/',
  setCookieHeaders: [],
  shouldRedirectToSignIn: false,
  shouldRedirectToSetup: false,
  user: null
} satisfies SettingsRouteState

describe('DashboardMailController Cloudflare OAuth routing', () => {
  beforeEach(() => {
    controllerTestState.capturedScreenProps = undefined
    controllerTestState.navigate.mockClear()
    controllerTestState.routePathname = '/dashboard/'
    controllerTestState.startCloudflareOAuth.mockReset()
    controllerTestState.startCloudflareOAuth.mockResolvedValue({
      redirectUrl: 'https://dash.cloudflare.test/oauth/start'
    })
  })

  it('starts dashboard onboarding OAuth with the dashboard return target', async () => {
    expect.hasAssertions()
    const props = renderController()

    props.onDashboardOnboardingConnect?.()
    await flushPromises()

    expect(controllerTestState.startCloudflareOAuth).toHaveBeenCalledWith('dashboard-onboarding')
    expect(controllerTestState.navigate).toHaveBeenCalledWith({
      href: 'https://dash.cloudflare.test/oauth/start'
    })
  })

  it('starts settings add-domain OAuth with the settings return target', async () => {
    expect.hasAssertions()
    const props = renderController('/settings/domains/')

    props.domainSettingsState?.onStartOAuth?.()
    await flushPromises()

    expect(controllerTestState.startCloudflareOAuth).toHaveBeenCalledWith('settings-domains')
    expect(controllerTestState.navigate).toHaveBeenCalledWith({
      href: 'https://dash.cloudflare.test/oauth/start'
    })
  })

  it('clears OAuth callback search on the canonical return surface', () => {
    expect(cloudflareOAuthCompletionPath('/dashboard/')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/dashboard')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/settings/domains/')).toBe('/settings/domains/')
    expect(cloudflareOAuthCompletionPath('/settings/domains')).toBe('/settings/domains/')
    expect(cloudflareOAuthCompletionPath('/organization/people')).toBe('/organization/people/')
  })
})

function renderController(routePathname = '/dashboard/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  })

  controllerTestState.routePathname = routePathname

  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <DashboardMailController
        publicEnv={publicEnv}
        routeState={routeState}
      />
    </QueryClientProvider>
  )
  queryClient.clear()

  if (!controllerTestState.capturedScreenProps) {
    throw new Error('Expected DashboardMailController to render DashboardScreen.')
  }

  return controllerTestState.capturedScreenProps
}

async function flushPromises() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
