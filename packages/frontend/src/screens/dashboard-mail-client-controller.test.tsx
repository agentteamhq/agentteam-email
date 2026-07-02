import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { validateDashboardSearch } from '../lib/dashboard-search'
import { cloudflareConnectionInputForSelectedDomain } from './dashboard-cloudflare-connection-input'
import { cloudflareOAuthCompletionPath } from './dashboard-cloudflare-oauth-routing'
import { DashboardMailController } from './dashboard-mail-client-controller'
import type { DashboardSearch } from '../lib/dashboard-search'
import type { DashboardScreenProps } from './dashboard-screen'
import type { PublicEnv } from '../types'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

type CloudflareAccountFixture = NonNullable<
  NonNullable<DashboardScreenProps['domainSettingsState']>['accounts']
>[number]
type CloudflareZoneFixture = NonNullable<
  NonNullable<DashboardScreenProps['domainSettingsState']>['zones']
>[number]
type CloudflareGrantPublicIdFixture = CloudflareAccountFixture['grantPublicId']

const controllerTestState = vi.hoisted(() => ({
  capturedScreenProps: undefined as DashboardScreenProps | undefined,
  connectCloudflareDomain: vi.fn(),
  disconnectCloudflareConnection: vi.fn(),
  fetchCloudflareAccounts: vi.fn(),
  fetchCloudflareStatus: vi.fn(),
  fetchCloudflareZones: vi.fn(),
  finalizeCloudflareOAuth: vi.fn(),
  navigate: vi.fn(() => Promise.resolve()),
  provisionCloudflareConnection: vi.fn(),
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
  connectCloudflareDomain: controllerTestState.connectCloudflareDomain,
  disconnectCloudflareConnection: controllerTestState.disconnectCloudflareConnection,
  fetchCloudflareAccounts: controllerTestState.fetchCloudflareAccounts,
  fetchCloudflareStatus: controllerTestState.fetchCloudflareStatus,
  fetchCloudflareZones: controllerTestState.fetchCloudflareZones,
  finalizeCloudflareOAuth: controllerTestState.finalizeCloudflareOAuth,
  provisionCloudflareConnection: controllerTestState.provisionCloudflareConnection,
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
    controllerTestState.connectCloudflareDomain.mockReset()
    controllerTestState.disconnectCloudflareConnection.mockReset()
    controllerTestState.fetchCloudflareAccounts.mockReset()
    controllerTestState.fetchCloudflareStatus.mockReset()
    controllerTestState.fetchCloudflareZones.mockReset()
    controllerTestState.finalizeCloudflareOAuth.mockReset()
    controllerTestState.navigate.mockClear()
    controllerTestState.provisionCloudflareConnection.mockReset()
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

  it('starts settings connected-account OAuth with the Cloudflare connected-account return target', async () => {
    expect.hasAssertions()
    const props = renderController('/settings/connected-accounts/')

    props.domainSettingsState?.onStartConnectedAccountOAuth?.()
    await flushPromises()

    expect(controllerTestState.startCloudflareOAuth).toHaveBeenCalledWith('settings-connected-accounts')
    expect(controllerTestState.navigate).toHaveBeenCalledWith({
      href: 'https://dash.cloudflare.test/oauth/start'
    })
  })

  it('clears OAuth callback search on the canonical return surface', () => {
    expect(cloudflareOAuthCompletionPath('/dashboard/')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/dashboard')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/dashboard/?settings=domains')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/dashboard/?settings=connectedAccounts')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/dashboard/?source=paperclip')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/settings/connected-accounts/')).toBe(
      '/settings/connected-accounts/'
    )
    expect(cloudflareOAuthCompletionPath('/settings/connected-accounts')).toBe(
      '/settings/connected-accounts/'
    )
    expect(cloudflareOAuthCompletionPath('/settings/integrations/')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/settings/integrations')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/settings/connectedAccounts')).toBe('/dashboard/')
    expect(cloudflareOAuthCompletionPath('/settings/connectedAccounts/?cloudflareIntentId=abc')).toBe(
      '/dashboard/'
    )
    expect(cloudflareOAuthCompletionPath('/settings/domains/')).toBe('/settings/domains/')
    expect(cloudflareOAuthCompletionPath('/settings/domains')).toBe('/settings/domains/')
    expect(cloudflareOAuthCompletionPath('/settings/domains/?cloudflareIntentId=abc')).toBe(
      '/settings/domains/'
    )
    expect(cloudflareOAuthCompletionPath('/organization/people')).toBe('/organization/people/')
  })

  it.each(['/dashboard/', '/dashboard/?settings=domains', '/dashboard/?settings=connectedAccounts'])(
    'does not force settings open for %s',
    (href) => {
      expect.hasAssertions()
      const props = renderControllerForDashboardUrl(href)

      expect(props.settingsOpen).toBeUndefined()
      expect(props.settingsSection).toBeUndefined()
      expect(props.defaultSettingsOpen).toBeUndefined()
      expect(props.defaultSettingsSection).toBeUndefined()
    }
  )

  it('does not preserve Paperclip handoff state on dashboard route search', () => {
    expect.hasAssertions()
    const props = renderControllerForDashboardUrl('/dashboard/?source=paperclip')

    expect(props.settingsOpen).toBeUndefined()
    expect(props.settingsSection).toBeUndefined()
    expect(props.agentAccessState?.connectionHandoff).toBeNull()
  })

  it('loads Cloudflare zones with the account grantPublicId for each usable account', async () => {
    expect.hasAssertions()
    controllerTestState.fetchCloudflareAccounts.mockResolvedValue([
      cloudflareAccount({
        grantPublicId: cloudflareGrantPublicId('grant-primary-public-id'),
        id: 'cloudflare-account-primary'
      }),
      cloudflareAccount({
        grantPublicId: cloudflareGrantPublicId('grant-secondary-public-id'),
        id: 'cloudflare-account-secondary'
      })
    ])
    controllerTestState.fetchCloudflareZones.mockResolvedValue([])
    const props = renderController('/settings/domains/')

    props.domainSettingsState?.onLoadAccounts?.()
    await flushPromises()

    expect(controllerTestState.fetchCloudflareZones).toHaveBeenNthCalledWith(1, {
      accountId: 'cloudflare-account-primary',
      grantPublicId: 'grant-primary-public-id'
    })
    expect(controllerTestState.fetchCloudflareZones).toHaveBeenNthCalledWith(2, {
      accountId: 'cloudflare-account-secondary',
      grantPublicId: 'grant-secondary-public-id'
    })
  })

  it('builds Cloudflare domain setup input with the selected zone grantPublicId', () => {
    expect(
      cloudflareConnectionInputForSelectedDomain({
        account: cloudflareAccount({
          grantPublicId: cloudflareGrantPublicId('grant-secondary-public-id'),
          id: 'cloudflare-account-secondary',
          name: 'AgentTeam Secondary'
        }),
        domain: 'agentteam.example',
        zone: cloudflareZone({
          accountId: 'cloudflare-account-secondary',
          accountName: 'AgentTeam Secondary',
          grantPublicId: cloudflareGrantPublicId('grant-secondary-public-id'),
          id: 'cloudflare-zone-secondary'
        })
      })
    ).toStrictEqual({
      cloudflareAccountId: 'cloudflare-account-secondary',
      cloudflareAccountName: 'AgentTeam Secondary',
      cloudflareZoneId: 'cloudflare-zone-secondary',
      cloudflareZoneName: 'agentteam.example',
      domain: 'agentteam.example',
      grantPublicId: 'grant-secondary-public-id'
    })
  })
})

function renderController(routePathname = '/dashboard/', routeSearch?: DashboardSearch) {
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
        routeSearch={routeSearch}
      />
    </QueryClientProvider>
  )
  queryClient.clear()

  if (!controllerTestState.capturedScreenProps) {
    throw new Error('Expected DashboardMailController to render DashboardScreen.')
  }

  return controllerTestState.capturedScreenProps
}

function renderControllerForDashboardUrl(href: string) {
  const url = new URL(href, 'https://mail.example.com')

  return renderController(
    url.pathname,
    validateDashboardSearch(Object.fromEntries(url.searchParams.entries()))
  )
}

async function flushPromises() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function cloudflareAccount(overrides: Partial<CloudflareAccountFixture> = {}): CloudflareAccountFixture {
  return {
    grantPublicId: cloudflareGrantPublicId('grant-public-id'),
    id: 'cloudflare-account-id',
    name: 'AgentTeam Production',
    type: 'standard',
    ...overrides
  }
}

function cloudflareZone(overrides: Partial<CloudflareZoneFixture> = {}): CloudflareZoneFixture {
  return {
    accountId: 'cloudflare-account-id',
    accountName: 'AgentTeam Production',
    grantPublicId: cloudflareGrantPublicId('grant-public-id'),
    id: 'cloudflare-zone-id',
    name: 'agentteam.example',
    status: 'active',
    ...overrides
  }
}

function cloudflareGrantPublicId(value: string): CloudflareGrantPublicIdFixture {
  return value as CloudflareGrantPublicIdFixture
}
