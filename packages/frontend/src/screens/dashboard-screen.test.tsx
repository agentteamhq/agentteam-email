import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  defaultAuthenticatedDashboardView,
  defaultAuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'
import { DashboardScreen } from './dashboard-screen'
import type { DashboardScreenProps } from './dashboard-screen'
import type { PublicEnv } from '../types'
import type { ReactNode } from 'react'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

const dashboardScreenTestState = vi.hoisted(() => ({
  shellProps: undefined as Record<string, unknown> | undefined
}))

vi.mock('../partials/webapp/webapp-providers', () => ({
  WebappProviders: ({ children }: { children: ReactNode }) => children
}))

vi.mock('../partials/authenticated/authenticated-shell', () => ({
  AuthenticatedDashboardContent: () => null,
  AuthenticatedShell: (props: Record<string, unknown> & { children?: ReactNode }) => {
    dashboardScreenTestState.shellProps = props
    return props.children ?? null
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

describe('DashboardScreen settings ownership', () => {
  beforeEach(() => {
    dashboardScreenTestState.shellProps = undefined
  })

  it('keeps settings closed by default on dashboard-owned rendering', () => {
    const shellProps = renderDashboardScreen()

    expect(shellProps.settingsOpen).toBe(false)
    expect(shellProps.settingsSection).toBe('account')
  })

  it('opens settings only when a route owner passes explicit settings props', () => {
    const shellProps = renderDashboardScreen({
      settingsOpen: true,
      settingsSection: 'domains'
    })

    expect(shellProps.settingsOpen).toBe(true)
    expect(shellProps.settingsSection).toBe('domains')
  })
})

function renderDashboardScreen(overrides: Partial<DashboardScreenProps> = {}) {
  renderToStaticMarkup(
    <DashboardScreen
      dashboardView={defaultAuthenticatedDashboardView}
      publicEnv={publicEnv}
      routeState={routeState}
      sidebarView={defaultAuthenticatedSidebarView}
      {...overrides}
    />
  )

  if (!dashboardScreenTestState.shellProps) {
    throw new Error('Expected DashboardScreen to render AuthenticatedShell.')
  }

  return dashboardScreenTestState.shellProps
}
