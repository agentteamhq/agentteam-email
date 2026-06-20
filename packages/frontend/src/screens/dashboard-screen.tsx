import * as React from 'react'
import type { AuthProviderProps } from '@better-auth-ui/react'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

import {
  AuthenticatedDashboardContent,
  AuthenticatedShell,
  defaultAuthenticatedDashboardView,
  defaultAuthenticatedSidebarView,
  withActiveSidebarItem,
  type AuthenticatedDashboardView,
  type AuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell'
import type {
  SettingsDialogContentState,
  SettingsSectionId
} from '../partials/authenticated/settings-dialog'
import { WebappProviders } from '../partials/webapp/webapp-providers'
import type { PublicEnv } from '../types'

export interface DashboardScreenProps {
  authClient?: AuthProviderProps['authClient']
  dashboardView?: AuthenticatedDashboardView
  defaultSettingsOpen?: boolean
  defaultSettingsSection?: SettingsSectionId
  publicEnv: PublicEnv
  routeState: SettingsRouteState
  settingsContentState?: SettingsDialogContentState
  sidebarView?: AuthenticatedSidebarView
}

export function DashboardScreen({
  authClient,
  dashboardView = defaultAuthenticatedDashboardView,
  defaultSettingsOpen,
  defaultSettingsSection,
  publicEnv,
  routeState,
  settingsContentState,
  sidebarView = defaultAuthenticatedSidebarView
}: DashboardScreenProps) {
  const [activeItemId, setActiveItemId] = React.useState(sidebarView.activeItemId)
  const [settingsOpen, setSettingsOpen] = React.useState(defaultSettingsOpen ?? false)
  const [settingsSection, setSettingsSection] = React.useState<SettingsSectionId>(
    defaultSettingsSection ?? 'messagesMedia'
  )
  const resolvedSidebarView = React.useMemo(
    () => withActiveSidebarItem(sidebarView, activeItemId),
    [activeItemId, sidebarView]
  )

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const url = new URL(window.location.href)
    if (url.searchParams.get('settings') !== 'connectedAccounts') {
      return
    }

    setSettingsSection('connectedAccounts')
    setSettingsOpen(true)
  }, [])

  return (
    <WebappProviders
      authClient={authClient}
      flash={routeState.flash}
      publicEnv={publicEnv}
    >
      <AuthenticatedShell
        onSettingsOpenChange={setSettingsOpen}
        onSettingsSectionChange={setSettingsSection}
        onSidebarItemSelect={setActiveItemId}
        settingsContentState={settingsContentState}
        settingsOpen={settingsOpen}
        settingsSection={settingsSection}
        sidebarView={resolvedSidebarView}
        user={routeState.user}
      >
        <AuthenticatedDashboardContent view={dashboardView} />
      </AuthenticatedShell>
    </WebappProviders>
  )
}
