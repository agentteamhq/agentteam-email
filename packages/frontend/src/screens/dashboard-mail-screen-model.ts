import { mailboxAddressOrRaw, mailboxDisplayName } from '../lib/mail-addresses'
import {
  actionsForMessage,
  threadActionsForMessage,
  toSidebarView
} from './dashboard-mail-sidebar-view'
import { toDashboardView } from './dashboard-mail-dashboard-view'
import type { DashboardSearch } from '../lib/dashboard-search'
import type {
  AuthenticatedEmailPreview,
  FirstMailboxSetupState
} from '../partials/authenticated/authenticated-shell-models'
import type { MailboxAdminSectionId } from '../partials/authenticated/mailbox-admin-models'
import type { DomainSettingsState } from '../partials/authenticated/settings-dialog'
import type {
  AgentMailWebFolder,
  AgentMailWebMessageDetail,
  AgentMailWebThreadMessage,
  AgentMailWebWorkspace
} from '@main/backend'

type DashboardMailLoadStatus = 'error' | 'pending' | 'success'

export interface DashboardMailFolderCreateState {
  errorMessage?: string
  isSubmitting?: boolean
  name: string
  state: 'closed' | 'open'
}

export interface DashboardMailFolderDeleteState {
  errorMessage?: string
  folderId?: string
  isSubmitting?: boolean
  state: 'closed' | 'open'
  title?: string
}

export interface DashboardMailFolderRenameState {
  errorMessage?: string
  folderId?: string
  isSubmitting?: boolean
  name: string
  state: 'closed' | 'open'
  title?: string
}

export interface DashboardMailWorkspaceScreenModelInput {
  allowedMailboxAdminSections: ReadonlyArray<MailboxAdminSectionId> | undefined
  domainSettingsState: DomainSettingsState
  firstMailboxSetupState?: FirstMailboxSetupState
  folderCreate: DashboardMailFolderCreateState
  folderDelete: DashboardMailFolderDeleteState
  folderRename: DashboardMailFolderRenameState
  routeSearch: DashboardSearch | undefined
  sidebarError: Error | null
  sidebarStatus: DashboardMailLoadStatus
  workspace: AgentMailWebWorkspace | undefined
  workspaceError: Error | null
  workspaceStatus: DashboardMailLoadStatus
}

export function deriveDashboardMailWorkspaceScreenModel({
  allowedMailboxAdminSections,
  domainSettingsState,
  firstMailboxSetupState,
  folderCreate,
  folderDelete,
  folderRename,
  routeSearch,
  sidebarError,
  sidebarStatus,
  workspace,
  workspaceError,
  workspaceStatus
}: DashboardMailWorkspaceScreenModelInput) {
  const selectedPreview = workspace?.selectedMessage
    ? toEmailPreview(workspace.selectedMessage, workspace.folders)
    : undefined

  return {
    dashboardView: toDashboardView(
      workspaceStatus,
      workspaceError,
      selectedPreview,
      workspace,
      domainSettingsState,
      firstMailboxSetupState
    ),
    emailPreviewsById: selectedPreview ? { [selectedPreview.id]: selectedPreview } : {},
    sidebarView: toSidebarView(
      workspace,
      sidebarStatus,
      sidebarError,
      folderCreate,
      folderDelete,
      folderRename,
      routeSearch,
      allowedMailboxAdminSections
    )
  }
}

export function toEmailPreview(
  message: AgentMailWebMessageDetail,
  folders: ReadonlyArray<AgentMailWebFolder>
): AuthenticatedEmailPreview {
  return {
    actions: actionsForMessage(message, folders),
    attachments: message.attachments.map(toEmailAttachment),
    folderId: message.mailboxId,
    html: message.html,
    id: message.id,
    isDraft: message.isDraft,
    isStarred: message.isStarred,
    isUnread: message.unread,
    receivedAt: message.receivedAt ?? '',
    recipientEmail: message.to.join(', '),
    senderEmail: mailboxAddressOrRaw(message.from),
    senderName: mailboxDisplayName(message.from),
    subject: message.subject,
    thread: message.thread?.map((threadMessage: AgentMailWebThreadMessage) =>
      toEmailThreadMessage(
        threadMessage,
        folders,
        threadMessage.id === message.id && threadMessage.mailboxId === message.mailboxId
          ? 'expanded'
          : 'collapsed'
      )
    ),
    threadId: message.threadId
  }
}

function toEmailThreadMessage(
  message: AgentMailWebThreadMessage,
  folders: ReadonlyArray<AgentMailWebFolder>,
  state: 'collapsed' | 'expanded'
): NonNullable<AuthenticatedEmailPreview['thread']>[number] {
  return {
    actions: threadActionsForMessage(message, folders),
    attachments: message.attachments.map(toEmailAttachment),
    folderId: message.mailboxId,
    html: message.html,
    id: message.id,
    isDraft: message.isDraft,
    receivedAt: message.receivedAt ?? '',
    recipientEmail: message.to.join(', '),
    senderEmail: mailboxAddressOrRaw(message.from),
    senderName: mailboxDisplayName(message.from),
    state,
    teaser: message.teaser
  }
}

function toEmailAttachment(
  attachment: AgentMailWebThreadMessage['attachments'][number]
): NonNullable<AuthenticatedEmailPreview['attachments']>[number] {
  return {
    contentId: attachment.contentId,
    disposition: attachment.disposition,
    filename: attachment.filename,
    id: attachment.id,
    mimetype: attachment.mimetype,
    sizeLabel: attachment.size === undefined ? undefined : formatBytes(attachment.size),
    status: 'ready',
    url: attachment.url
  }
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
