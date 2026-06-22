import * as React from 'react'
import {
  AuthenticatedDashboardContent,
  AuthenticatedShell
} from '../partials/authenticated/authenticated-shell'
import {
  defaultAuthenticatedDashboardView,
  defaultAuthenticatedSidebarView,
  withActiveSidebarItem
} from '../partials/authenticated/authenticated-shell-models'
import { WebappProviders } from '../partials/webapp/webapp-providers'
import type {
  AuthenticatedDashboardView,
  AuthenticatedEmailAction,
  AuthenticatedEmailPreview,
  AuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'
import type { DashboardSearch } from '../routes/_authenticated/dashboard'
import type { AuthProviderProps } from '@better-auth-ui/react'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

import type { SettingsDialogContentState, SettingsSectionId } from '../partials/authenticated/settings-dialog'
import type { PublicEnv } from '../types'

export interface DashboardScreenProps {
  authClient?: AuthProviderProps['authClient']
  dashboardView?: AuthenticatedDashboardView
  defaultSettingsOpen?: boolean
  defaultSettingsSection?: SettingsSectionId
  emailPreviewsById?: Readonly<Record<string, AuthenticatedEmailPreview>>
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
  publicEnv: PublicEnv
  routeState: SettingsRouteState
  routeSearch?: DashboardSearch
  sessionCleanupEnabled?: boolean
  settingsContentState?: SettingsDialogContentState
  sidebarView?: AuthenticatedSidebarView
}

export function DashboardScreen({
  authClient,
  dashboardView = defaultAuthenticatedDashboardView,
  defaultSettingsOpen,
  defaultSettingsSection,
  emailPreviewsById,
  onEmailAction,
  publicEnv,
  routeState,
  routeSearch,
  sessionCleanupEnabled,
  settingsContentState,
  sidebarView = defaultAuthenticatedSidebarView
}: DashboardScreenProps) {
  const requestedSettingsSection =
    routeSearch?.settings === 'connectedAccounts' || routeSearch?.settings === 'cliAccess'
      ? routeSearch.settings
      : undefined
  const [activeItemId, setActiveItemId] = React.useState(sidebarView.activeItemId)
  const [selectedMailId, setSelectedMailId] = React.useState(
    sidebarView.selectedMailId ?? dashboardView.selectedEmail?.id
  )
  const [searchQuery, setSearchQuery] = React.useState(sidebarView.searchQuery ?? '')
  const [unreadOnly, setUnreadOnly] = React.useState(sidebarView.unreadOnly ?? false)
  const [remoteImagesAllowedByEmailId, setRemoteImagesAllowedByEmailId] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [settingsOpen, setSettingsOpen] = React.useState(
    defaultSettingsOpen ?? Boolean(requestedSettingsSection)
  )
  const [settingsSection, setSettingsSection] = React.useState<SettingsSectionId>(
    requestedSettingsSection ?? defaultSettingsSection ?? 'messagesMedia'
  )
  const resolvedSidebarView = React.useMemo(
    () => ({
      ...withActiveSidebarItem(sidebarView, activeItemId),
      searchQuery,
      selectedMailId,
      unreadOnly
    }),
    [activeItemId, searchQuery, selectedMailId, sidebarView, unreadOnly]
  )
  const selectedEmailPreview = React.useMemo(() => {
    const preview = selectedMailId ? emailPreviewsById?.[selectedMailId] : undefined

    if (!preview || !remoteImagesAllowedByEmailId.has(preview.id)) {
      return preview
    }

    return {
      ...preview,
      html: preview.htmlWithRemoteImages ?? preview.html,
      remoteImagesAllowed: true
    } satisfies AuthenticatedEmailPreview
  }, [emailPreviewsById, remoteImagesAllowedByEmailId, selectedMailId])
  const resolvedDashboardView = React.useMemo<AuthenticatedDashboardView>(
    () =>
      selectedEmailPreview
        ? {
            ...dashboardView,
            selectedEmail: selectedEmailPreview,
            state: 'ready' as const
          }
        : dashboardView,
    [dashboardView, selectedEmailPreview]
  )
  const handleEmailAction = React.useCallback(
    (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => {
      if (action === 'show-remote-images') {
        setRemoteImagesAllowedByEmailId((current) => {
          const next = new Set(current)
          next.add(email.id)
          return next
        })
      }
      onEmailAction?.(action, email)
    },
    [onEmailAction]
  )

  return (
    <WebappProviders
      authClient={authClient}
      flash={routeState.flash}
      publicEnv={publicEnv}
      sessionCleanupEnabled={sessionCleanupEnabled}
    >
      <AuthenticatedShell
        onSettingsOpenChange={setSettingsOpen}
        onSettingsSectionChange={setSettingsSection}
        onMailSelect={setSelectedMailId}
        onSidebarSearchChange={setSearchQuery}
        onSidebarItemSelect={setActiveItemId}
        onSidebarUnreadOnlyChange={setUnreadOnly}
        cloudflareOAuthCallback={
          routeSearch?.cloudflareIntentId
            ? {
                intentPublicId: routeSearch.cloudflareIntentId,
                oauthError: routeSearch.cloudflareOAuthError
              }
            : null
        }
        settingsContentState={settingsContentState}
        settingsOpen={settingsOpen}
        settingsSection={settingsSection}
        sidebarView={resolvedSidebarView}
        user={routeState.user}
      >
        <AuthenticatedDashboardContent
          onEmailAction={handleEmailAction}
          view={resolvedDashboardView}
        />
      </AuthenticatedShell>
    </WebappProviders>
  )
}
