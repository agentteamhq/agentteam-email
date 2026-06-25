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
import {
  getMailboxAdminSectionTitle,
  isMailboxAdminSectionId
} from '../partials/authenticated/mailbox-admin-models'
import { MailboxAdminScreen } from '../partials/authenticated/mailbox-admin-screen'
import { WebappProviders } from '../partials/webapp/webapp-providers'
import type {
  AuthenticatedComposeField,
  AuthenticatedComposeView,
  AuthenticatedDashboardView,
  AuthenticatedEmailAction,
  AuthenticatedEmailPreview,
  AuthenticatedMailActionDialogKind,
  AuthenticatedMailActionView,
  AuthenticatedMailFolderAction,
  AuthenticatedMailItem,
  AuthenticatedMailPageChange,
  AuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'
import type { DashboardSearch } from '../lib/dashboard-search'
import type { AuthProviderProps } from '@better-auth-ui/react'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

import type {
  AgentAccessSettingsState,
  DomainSettingsState,
  SettingsDialogContentState
} from '../partials/authenticated/settings-dialog'
import type { SettingsSectionId } from '../partials/authenticated/settings-dialog-sections'
import type { MailboxAdminView } from '../partials/authenticated/mailbox-admin-models'
import type { PublicEnv } from '../types'

export interface DashboardScreenProps {
  authClient?: AuthProviderProps['authClient']
  agentAccessState?: AgentAccessSettingsState
  composeView?: AuthenticatedComposeView
  dashboardView?: AuthenticatedDashboardView
  defaultSettingsOpen?: boolean
  defaultSettingsSection?: SettingsSectionId
  emailPreviewsById?: Readonly<Record<string, AuthenticatedEmailPreview>>
  mailboxAdminView?: MailboxAdminView
  mailActionView?: AuthenticatedMailActionView
  onComposeAttachmentAdd?: (files: ReadonlyArray<File>) => void
  onComposeAttachmentRemove?: (attachmentId: string) => void
  onComposeDiscardDraft?: () => void
  onComposeFieldChange?: (field: AuthenticatedComposeField, value: string) => void
  onComposeOpenChange?: (open: boolean) => void
  onComposeSaveDraft?: () => void
  onComposeSubmit?: () => void
  onEmailAttachmentPreview?: (
    attachment: NonNullable<AuthenticatedEmailPreview['attachments']>[number],
    email: AuthenticatedEmailPreview
  ) => void
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
  onDashboardOnboardingConnect?: () => void
  onMailActionDialogOpenChange?: (dialog: AuthenticatedMailActionDialogKind, open: boolean) => void
  onMailDeleteConfirm?: () => void
  onMailMoveSubmit?: () => void
  onMailMoveTargetChange?: (folderId: string) => void
  onMailOriginalSourceDownload?: () => void
  onMailboxAccountSelect?: (accountId: string) => void
  onMailboxFolderAction?: (
    action: AuthenticatedMailFolderAction,
    folder: AuthenticatedSidebarView['navMain'][number]
  ) => void
  onMailboxFolderCreateNameChange?: (name: string) => void
  onMailboxFolderCreateOpenChange?: (open: boolean) => void
  onMailboxFolderCreateSubmit?: () => void
  onMailboxFolderDeleteConfirm?: () => void
  onMailboxFolderDeleteOpenChange?: (open: boolean) => void
  onMailboxFolderRenameNameChange?: (name: string) => void
  onMailboxFolderRenameOpenChange?: (open: boolean) => void
  onMailboxFolderRenameSubmit?: () => void
  onMailboxFolderSelect?: (folderId: string) => void
  onMailboxMessageAction?: (action: AuthenticatedEmailAction, mail: AuthenticatedMailItem) => void
  onMailboxMessageSelect?: (mailId: string) => void
  onMailboxPageChange?: (pageChange: AuthenticatedMailPageChange) => void
  onMailboxRefresh?: () => void
  onMailboxRetry?: () => void
  onMailboxSearchChange?: (query: string) => void
  onMailboxUnreadOnlyChange?: (unreadOnly: boolean) => void
  onMessageRetry?: () => void
  onSettingsOpenChange?: (open: boolean) => void
  onSettingsSectionChange?: (section: SettingsSectionId) => void
  publicEnv: PublicEnv
  routeState: SettingsRouteState
  routeSearch?: DashboardSearch
  sessionCleanupEnabled?: boolean
  domainSettingsState?: DomainSettingsState
  settingsOpen?: boolean
  settingsContentState?: SettingsDialogContentState
  settingsSection?: SettingsSectionId
  sidebarView?: AuthenticatedSidebarView
}

export function DashboardScreen({
  authClient,
  agentAccessState,
  composeView,
  dashboardView = defaultAuthenticatedDashboardView,
  defaultSettingsOpen,
  defaultSettingsSection,
  emailPreviewsById,
  mailboxAdminView,
  mailActionView,
  onComposeAttachmentRemove,
  onComposeDiscardDraft,
  onComposeFieldChange,
  onComposeOpenChange,
  onComposeSaveDraft,
  onComposeSubmit,
  onComposeAttachmentAdd,
  onEmailAttachmentPreview,
  onEmailAction,
  onDashboardOnboardingConnect,
  onMailActionDialogOpenChange,
  onMailDeleteConfirm,
  onMailMoveSubmit,
  onMailMoveTargetChange,
  onMailOriginalSourceDownload,
  onMailboxAccountSelect,
  onMailboxFolderAction,
  onMailboxFolderCreateNameChange,
  onMailboxFolderCreateOpenChange,
  onMailboxFolderCreateSubmit,
  onMailboxFolderDeleteConfirm,
  onMailboxFolderDeleteOpenChange,
  onMailboxFolderRenameNameChange,
  onMailboxFolderRenameOpenChange,
  onMailboxFolderRenameSubmit,
  onMailboxFolderSelect,
  onMailboxMessageAction,
  onMailboxMessageSelect,
  onMailboxPageChange,
  onMailboxRefresh,
  onMailboxRetry,
  onMailboxSearchChange,
  onMailboxUnreadOnlyChange,
  onMessageRetry,
  onSettingsOpenChange,
  onSettingsSectionChange,
  publicEnv,
  routeState,
  routeSearch,
  sessionCleanupEnabled,
  domainSettingsState,
  settingsOpen: settingsOpenProp,
  settingsContentState,
  settingsSection: settingsSectionProp,
  sidebarView = defaultAuthenticatedSidebarView
}: DashboardScreenProps) {
  const requestedSettingsSection =
    routeSearch?.settings === 'security'
      ? 'security'
      : routeSearch?.settings === 'agentAccess'
        ? 'agentAccess'
        : routeSearch?.settings === 'connectedAccounts' || routeSearch?.settings === 'domains'
          ? 'domains'
          : undefined
  const activeItemIdBase = sidebarView.activeItemId
  const activeAccountIdBase = sidebarView.activeAccountId
  const activeItemScopeBase = getMailboxScopedStateKey(activeAccountIdBase, activeItemIdBase)
  const selectedMailIdBase = sidebarView.selectedMailId ?? dashboardView.selectedEmail?.id
  const selectedMailScopeBase = getMailboxScopedStateKey(activeAccountIdBase, selectedMailIdBase)
  const searchQueryBase = sidebarView.searchQuery ?? ''
  const searchQueryScopeBase = getMailboxScopedStateKey(activeAccountIdBase, searchQueryBase)
  const unreadOnlyBase = sidebarView.unreadOnly ?? false
  const unreadOnlyScopeBase = getMailboxScopedStateKey(activeAccountIdBase, String(unreadOnlyBase))
  const [activeItemState, setActiveItemState] = React.useState(() => ({
    base: activeItemScopeBase,
    value: activeItemIdBase
  }))
  const [selectedMailState, setSelectedMailState] = React.useState(() => ({
    base: selectedMailScopeBase,
    value: selectedMailIdBase
  }))
  const [searchQueryState, setSearchQueryState] = React.useState(() => ({
    base: searchQueryScopeBase,
    value: searchQueryBase
  }))
  const [unreadOnlyState, setUnreadOnlyState] = React.useState(() => ({
    base: unreadOnlyScopeBase,
    value: unreadOnlyBase
  }))
  const activeItemId = activeItemState.base === activeItemScopeBase ? activeItemState.value : activeItemIdBase
  const selectedMailId =
    selectedMailState.base === selectedMailScopeBase ? selectedMailState.value : selectedMailIdBase
  const searchQuery =
    searchQueryState.base === searchQueryScopeBase ? searchQueryState.value : searchQueryBase
  const unreadOnly = unreadOnlyState.base === unreadOnlyScopeBase ? unreadOnlyState.value : unreadOnlyBase
  const [remoteImagesAllowedByMessageScope, setRemoteImagesAllowedByMessageScope] = React.useState<
    ReadonlySet<string>
  >(() => new Set())
  const [uncontrolledSettingsOpen, setUncontrolledSettingsOpen] = React.useState(
    defaultSettingsOpen ?? Boolean(requestedSettingsSection)
  )
  const [uncontrolledSettingsSection, setUncontrolledSettingsSection] = React.useState<SettingsSectionId>(
    requestedSettingsSection ?? defaultSettingsSection ?? 'account'
  )
  const settingsOpen = settingsOpenProp ?? uncontrolledSettingsOpen
  const settingsSection = settingsSectionProp ?? uncontrolledSettingsSection
  const setSettingsOpen = onSettingsOpenChange ?? setUncontrolledSettingsOpen
  const setSettingsSection = onSettingsSectionChange ?? setUncontrolledSettingsSection
  const activeMailboxAdminSection = isMailboxAdminSectionId(activeItemId) ? activeItemId : null
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
    const remoteImageApprovalKey = preview
      ? getRemoteImageApprovalKey(resolvedSidebarView.activeAccountId, preview.id)
      : undefined

    if (
      !preview ||
      !remoteImageApprovalKey ||
      !remoteImagesAllowedByMessageScope.has(remoteImageApprovalKey)
    ) {
      return preview
    }

    return {
      ...preview,
      html: preview.htmlWithRemoteImages ?? preview.html,
      remoteImagesAllowed: true
    } satisfies AuthenticatedEmailPreview
  }, [
    emailPreviewsById,
    remoteImagesAllowedByMessageScope,
    resolvedSidebarView.activeAccountId,
    selectedMailId
  ])
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
        setRemoteImagesAllowedByMessageScope((current) => {
          const next = new Set(current)
          next.add(getRemoteImageApprovalKey(resolvedSidebarView.activeAccountId, email.id))
          return next
        })
      }
      onEmailAction?.(action, email)
    },
    [onEmailAction, resolvedSidebarView.activeAccountId]
  )
  const handleMailboxMessageSelect = React.useCallback(
    (mailId: string) => {
      setSelectedMailState({
        base: selectedMailScopeBase,
        value: mailId
      })
      onMailboxMessageSelect?.(mailId)
    },
    [onMailboxMessageSelect, selectedMailScopeBase]
  )
  const handleMailboxFolderSelect = React.useCallback(
    (folderId: string) => {
      setActiveItemState({
        base: activeItemScopeBase,
        value: folderId
      })
      onMailboxFolderSelect?.(folderId)
    },
    [activeItemScopeBase, onMailboxFolderSelect]
  )
  const handleMailboxSearchChange = React.useCallback(
    (query: string) => {
      setSearchQueryState({
        base: searchQueryScopeBase,
        value: query
      })
      onMailboxSearchChange?.(query)
    },
    [onMailboxSearchChange, searchQueryScopeBase]
  )
  const handleMailboxUnreadOnlyChange = React.useCallback(
    (nextUnreadOnly: boolean) => {
      setUnreadOnlyState({
        base: unreadOnlyScopeBase,
        value: nextUnreadOnly
      })
      onMailboxUnreadOnlyChange?.(nextUnreadOnly)
    },
    [onMailboxUnreadOnlyChange, unreadOnlyScopeBase]
  )
  return (
    <WebappProviders
      authClient={authClient}
      flash={routeState.flash}
      publicEnv={publicEnv}
      sessionCleanupEnabled={sessionCleanupEnabled}
    >
      <AuthenticatedShell
        agentAccessState={agentAccessState}
        composeView={composeView}
        mailActionView={mailActionView}
        onComposeAttachmentAdd={onComposeAttachmentAdd}
        onComposeAttachmentRemove={onComposeAttachmentRemove}
        onComposeDiscardDraft={onComposeDiscardDraft}
        onComposeFieldChange={onComposeFieldChange}
        onComposeOpenChange={onComposeOpenChange}
        onComposeSaveDraft={onComposeSaveDraft}
        onComposeSubmit={onComposeSubmit}
        onMailActionDialogOpenChange={onMailActionDialogOpenChange}
        onMailDeleteConfirm={onMailDeleteConfirm}
        onMailMoveSubmit={onMailMoveSubmit}
        onMailMoveTargetChange={onMailMoveTargetChange}
        onMailOriginalSourceDownload={onMailOriginalSourceDownload}
        onMailboxAccountSelect={onMailboxAccountSelect}
        onMailboxFolderAction={onMailboxFolderAction}
        onMailboxFolderCreateNameChange={onMailboxFolderCreateNameChange}
        onMailboxFolderCreateOpenChange={onMailboxFolderCreateOpenChange}
        onMailboxFolderCreateSubmit={onMailboxFolderCreateSubmit}
        onMailboxFolderDeleteConfirm={onMailboxFolderDeleteConfirm}
        onMailboxFolderDeleteOpenChange={onMailboxFolderDeleteOpenChange}
        onMailboxFolderRenameNameChange={onMailboxFolderRenameNameChange}
        onMailboxFolderRenameOpenChange={onMailboxFolderRenameOpenChange}
        onMailboxFolderRenameSubmit={onMailboxFolderRenameSubmit}
        onMailboxMessageAction={onMailboxMessageAction}
        onMailboxPageChange={onMailboxPageChange}
        onMailboxRefresh={onMailboxRefresh}
        onMailboxRetry={onMailboxRetry}
        onSettingsOpenChange={setSettingsOpen}
        onSettingsSectionChange={setSettingsSection}
        onMailSelect={handleMailboxMessageSelect}
        onSidebarSearchChange={handleMailboxSearchChange}
        onSidebarItemSelect={handleMailboxFolderSelect}
        onSidebarUnreadOnlyChange={handleMailboxUnreadOnlyChange}
        domainSettingsState={domainSettingsState}
        settingsContentState={settingsContentState}
        settingsOpen={settingsOpen}
        settingsSection={settingsSection}
        sidebarView={resolvedSidebarView}
        title={activeMailboxAdminSection ? getMailboxAdminSectionTitle(activeMailboxAdminSection) : undefined}
      >
        {activeMailboxAdminSection && mailboxAdminView ? (
          <MailboxAdminScreen
            view={{
              ...mailboxAdminView,
              section: activeMailboxAdminSection
            }}
          />
        ) : (
          <AuthenticatedDashboardContent
            onAttachmentPreview={onEmailAttachmentPreview}
            onEmailAction={handleEmailAction}
            onOnboardingConnect={onDashboardOnboardingConnect}
            onRetry={onMessageRetry}
            view={resolvedDashboardView}
          />
        )}
      </AuthenticatedShell>
    </WebappProviders>
  )
}

function getRemoteImageApprovalKey(accountId: string | undefined, emailId: string) {
  return `${accountId ?? 'default-mailbox'}:${emailId}`
}

function getMailboxScopedStateKey(accountId: string | undefined, value: string | undefined) {
  return `${accountId ?? 'default-mailbox'}:${value ?? 'empty'}`
}
