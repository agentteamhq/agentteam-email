import {
  defaultAuthenticatedEmailToolbarActions,
  defaultAuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'
import { mailboxAddressOrRaw, mailboxDisplayName } from '../lib/mail-addresses'
import type {
  AgentMailWebAccount,
  AgentMailWebFolder,
  AgentMailWebMessageSummary,
  AgentMailWebWorkspace
} from '@main/backend'
import type { DashboardSearch } from '../lib/dashboard-search'
import type {
  AuthenticatedEmailAction,
  AuthenticatedEmailToolbarAction,
  AuthenticatedMailItem,
  AuthenticatedMailNavItem,
  AuthenticatedMailNavIconKey,
  AuthenticatedManagementNavGroup,
  AuthenticatedManagementNavItem,
  AuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'
import type { MailboxAdminSectionId } from '../partials/authenticated/mailbox-admin-models'

export const FIRST_USE_SETUP_NAV_ITEM_ID = 'continue-setup'

const NO_MAILBOX_FOLDER_DISABLED_REASON = 'Connect a mailbox before opening folders.'

const NO_MAILBOX_NAV_ITEMS = [
  noMailboxNavItem('inbox', 'Inbox', 'inbox'),
  noMailboxNavItem('drafts', 'Drafts', 'drafts'),
  noMailboxNavItem('sent', 'Sent', 'sent'),
  noMailboxNavItem('junk', 'Junk', 'junk'),
  noMailboxNavItem('trash', 'Trash', 'trash')
] satisfies ReadonlyArray<AuthenticatedMailNavItem>

const FIRST_USE_SETUP_NAV_ITEM = {
  iconKey: 'setup',
  id: FIRST_USE_SETUP_NAV_ITEM_ID,
  tone: 'accent',
  title: 'Continue setup',
  url: '#'
} satisfies AuthenticatedManagementNavItem

const MAILBOX_ADMIN_MANAGEMENT_NAV = [
  {
    iconKey: 'accounts',
    id: 'accounts',
    title: 'Accounts',
    url: '#'
  },
  {
    iconKey: 'groups',
    id: 'groups',
    title: 'Groups',
    url: '#'
  },
  {
    iconKey: 'agents',
    id: 'agents',
    title: 'Agents',
    url: '#'
  }
] satisfies ReadonlyArray<AuthenticatedManagementNavItem>

export function toSidebarView(
  workspace: AgentMailWebWorkspace | undefined,
  status: 'error' | 'pending' | 'success',
  error: Error | null,
  folderCreate: { errorMessage?: string; isSubmitting?: boolean; name: string; state: 'closed' | 'open' },
  folderDelete: {
    errorMessage?: string
    folderId?: string
    isSubmitting?: boolean
    state: 'closed' | 'open'
    title?: string
  },
  folderRename: {
    errorMessage?: string
    folderId?: string
    isSubmitting?: boolean
    name: string
    state: 'closed' | 'open'
    title?: string
  },
  routeSearch: DashboardSearch | undefined,
  allowedMailboxAdminSections: ReadonlyArray<MailboxAdminSectionId> | undefined
): AuthenticatedSidebarView {
  const activeManagementSection = routeSearch?.mailboxAdmin
  const firstUseWorkspace = isNoMailboxWorkspace(workspace)
  const mailboxAdminNav = mailboxAdminManagementNav(allowedMailboxAdminSections)
  const showFirstUseSetupNav =
    firstUseWorkspace && Boolean(activeManagementSection) && mailboxAdminNav.length > 0
  const managementNav = showFirstUseSetupNav ? [FIRST_USE_SETUP_NAV_ITEM, ...mailboxAdminNav] : mailboxAdminNav
  const managementNavGroups = groupedManagementNav(showFirstUseSetupNav, mailboxAdminNav)

  if (status === 'pending') {
    return {
      ...defaultAuthenticatedSidebarView,
      activeItemId: activeManagementSection ?? defaultAuthenticatedSidebarView.activeItemId,
      managementNav,
      managementNavGroups,
      state: 'loading'
    }
  }

  if (status === 'error') {
    return {
      ...defaultAuthenticatedSidebarView,
      activeItemId: activeManagementSection ?? defaultAuthenticatedSidebarView.activeItemId,
      errorDescription: errorMessage(error, 'Mailbox data could not be loaded.'),
      errorTitle: 'Mailbox unavailable',
      managementNav,
      managementNavGroups,
      retryLabel: 'Retry',
      state: 'error'
    }
  }

  const folders = workspace?.folders ?? []
  const messages = workspace?.messages ?? []
  const emptyMailbox = emptyMailboxCopy(workspace, routeSearch)
  const navMain = firstUseWorkspace ? NO_MAILBOX_NAV_ITEMS : folders.map(toNavItem)
  const activeFolderId = firstUseWorkspace
    ? NO_MAILBOX_NAV_ITEMS[0].id
    : workspace?.activeFolderId ?? defaultAuthenticatedSidebarView.activeItemId
  const activeFolderItem = navMain.find((item) => item.id === activeFolderId)

  return {
    activeAccountId: workspace?.activeAccountId ?? undefined,
    activeItemId: activeManagementSection ?? activeFolderId,
    accounts: workspace?.accounts.map((account: AgentMailWebAccount) => ({
      address: account.address,
      description: account.description,
      disabled: account.state === 'disabled',
      disabledReason: account.state === 'disabled' ? 'Mailbox account is disabled' : undefined,
      id: account.id,
      name: account.name,
      state: account.state === 'disabled' ? 'attention' : account.state
    })),
    emptyDescription: emptyMailbox.description,
    emptyTitle: emptyMailbox.title,
    filterMode: 'server',
    folderCreate: firstUseWorkspace
      ? undefined
      : {
          errorMessage: folderCreate.errorMessage,
          isSubmitting: folderCreate.isSubmitting,
          name: folderCreate.name,
          placeholder: 'Folder name',
          state: folderCreate.state,
          submitLabel: folderCreate.isSubmitting ? 'Creating folder' : 'Create folder',
          title: 'Create folder',
          triggerLabel: 'Create folder'
        },
    folderDelete: folderDelete.folderId
      ? {
          description: 'This deletes the selected WildDuck folder.',
          errorMessage: folderDelete.errorMessage,
          folderId: folderDelete.folderId,
          isSubmitting: folderDelete.isSubmitting,
          state: folderDelete.state,
          title: folderDelete.title ?? 'Delete folder?'
        }
      : undefined,
    folderRename: folderRename.folderId
      ? {
          description: 'This renames the selected WildDuck folder.',
          errorMessage: folderRename.errorMessage,
          folderId: folderRename.folderId,
          isSubmitting: folderRename.isSubmitting,
          name: folderRename.name,
          state: folderRename.state,
          submitLabel: folderRename.isSubmitting ? 'Renaming folder' : 'Rename folder',
          title: folderRename.title ?? 'Rename folder'
        }
      : undefined,
    mails: messages.map(toMailItem),
    mailboxMode: firstUseWorkspace ? 'no-mailbox' : 'mailbox',
    managementNav,
    managementNavGroups,
    navMain,
    paneTitle: firstUseWorkspace ? 'No mailbox yet' : (activeFolderItem?.title ?? emptyMailbox.title),
    pagination: toPagination(workspace),
    refreshLabel: 'Refresh',
    retryLabel: 'Retry',
    searchQuery: firstUseWorkspace ? '' : (routeSearch?.mailQuery ?? ''),
    selectedMailId: workspace?.selectedMessage?.id,
    unreadOnly: firstUseWorkspace ? undefined : routeSearch?.unreadOnly,
    state: messages.length ? 'ready' : 'empty'
  }
}

function groupedManagementNav(
  showFirstUseSetupNav: boolean,
  mailboxAdminNav: ReadonlyArray<AuthenticatedManagementNavItem>
): ReadonlyArray<AuthenticatedManagementNavGroup> {
  const groups: Array<AuthenticatedManagementNavGroup> = []

  if (showFirstUseSetupNav) {
    groups.push({
      id: 'setup-return',
      items: [FIRST_USE_SETUP_NAV_ITEM]
    })
  }

  if (mailboxAdminNav.length) {
    groups.push({
      id: 'mailbox-admin',
      items: mailboxAdminNav
    })
  }

  return groups
}

function isNoMailboxWorkspace(workspace: AgentMailWebWorkspace | undefined) {
  return Boolean(
    workspace &&
      workspace.accounts.length === 0 &&
      workspace.activeAccountId === null &&
      workspace.activeFolderId === null
  )
}

function noMailboxNavItem(
  id: AuthenticatedMailNavIconKey,
  title: string,
  iconKey: AuthenticatedMailNavIconKey
): AuthenticatedMailNavItem {
  return {
    disabled: true,
    disabledReason: NO_MAILBOX_FOLDER_DISABLED_REASON,
    iconKey,
    id: `placeholder:${id}`,
    selectable: false,
    title,
    url: '#'
  }
}

function emptyMailboxCopy(
  workspace: AgentMailWebWorkspace | undefined,
  routeSearch: DashboardSearch | undefined
): { description: string; title: string } {
  if (!workspace || workspace.accounts.length === 0) {
    return {
      description: 'Connect Cloudflare to add the first mailbox.',
      title: 'No mailbox yet'
    }
  }

  const hasServerFilter = Boolean(routeSearch?.mailQuery?.trim()) || Boolean(routeSearch?.unreadOnly)

  if (hasServerFilter) {
    return {
      description: 'Try another search or turn off the unread filter.',
      title: 'No matching messages'
    }
  }

  const activeFolder = workspace.folders.find((folder) => folder.id === workspace.activeFolderId)

  switch (activeFolder?.specialUse?.toLowerCase()) {
    case '\\drafts':
      return {
        description: 'Drafts saved from Compose will appear here.',
        title: 'No drafts'
      }
    case '\\sent':
      return {
        description: 'Messages sent from this account will appear here.',
        title: 'No sent mail'
      }
    case '\\junk':
      return {
        description: 'Messages marked as spam will appear here.',
        title: 'No junk mail'
      }
    case '\\trash':
      return {
        description: 'Deleted messages will appear here.',
        title: 'Trash is empty'
      }
    case '\\inbox':
      return {
        description:
          'New messages delivered to this mailbox will appear here. Use Compose to send the first email from this account.',
        title: 'Inbox is empty'
      }
    default:
      return {
        description: activeFolder
          ? `Messages moved to ${activeFolder.name} will appear here.`
          : 'Messages matching this mailbox view will appear here.',
        title: activeFolder ? `No messages in ${activeFolder.name}` : 'No messages'
      }
  }
}

function mailboxAdminManagementNav(
  allowedSections: ReadonlyArray<MailboxAdminSectionId> | undefined
): ReadonlyArray<AuthenticatedManagementNavItem> {
  if (!allowedSections) {
    return []
  }

  const allowedSectionSet = new Set<MailboxAdminSectionId>(allowedSections)
  return MAILBOX_ADMIN_MANAGEMENT_NAV.filter((item) =>
    allowedSectionSet.has(item.id as MailboxAdminSectionId)
  )
}

function toNavItem(folder: AgentMailWebFolder): AuthenticatedSidebarView['navMain'][number] {
  return {
    actions: folder.protected
      ? undefined
      : [
          {
            action: 'rename-folder',
            label: 'Rename folder'
          },
          {
            action: 'delete-folder',
            label: 'Delete folder'
          }
        ],
    badgeLabel: folder.unread ? String(folder.unread) : undefined,
    iconKey: folderIcon(folder),
    id: folder.id,
    title: folder.name,
    url: '#'
  }
}

function toMailItem(message: AgentMailWebMessageSummary): AuthenticatedMailItem {
  return {
    attachmentCountLabel: message.attachmentCount ? String(message.attachmentCount) : undefined,
    date: formatMessageDate(message.receivedAt),
    email: mailboxAddressOrRaw(message.from),
    folderId: message.mailboxId,
    id: message.id,
    isDraft: message.isDraft,
    isStarred: message.isStarred,
    isUnread: message.unread,
    name: mailboxDisplayName(message.from),
    subject: message.subject,
    teaser: message.teaser,
    threadId: message.threadId
  }
}

export function actionsForMessage(
  message: Pick<AgentMailWebMessageSummary, 'isDraft' | 'isStarred' | 'mailboxId' | 'unread'>,
  folders: ReadonlyArray<AgentMailWebFolder>
): ReadonlyArray<AuthenticatedEmailToolbarAction> {
  if (message.isDraft) {
    return [
      toolbarAction('back', 'navigation', 'start', 'Back to list'),
      toolbarAction('send-draft', 'response', 'start', 'Send draft'),
      toolbarAction('edit-draft', 'response', 'start', 'Edit draft'),
      toolbarAction('view-original', 'utility', 'end', 'View original'),
      toolbarAction('discard-draft', 'utility', 'end', 'Discard draft')
    ]
  }

  const currentFolder = folders.find((folder) => folder.id === message.mailboxId)
  const archiveFolder = findSystemFolder(folders, { path: 'Archive', specialUse: '\\Archive' })
  const inboxFolder = findSystemFolder(folders, { path: 'INBOX', specialUse: '\\Inbox' })
  const junkFolder = findSystemFolder(folders, { path: 'Junk', specialUse: '\\Junk' })
  const isJunk = currentFolder?.specialUse?.toLowerCase() === '\\junk'
  const baseActions = archiveFolder
    ? defaultAuthenticatedEmailToolbarActions.flatMap((action) =>
        action.action === 'move'
          ? [toolbarAction('archive', 'organization', 'start', 'Archive'), action]
          : [action]
      )
    : defaultAuthenticatedEmailToolbarActions

  return baseActions.map((action) => {
    if (action.action === 'star' && message.isStarred) {
      return { ...action, action: 'unstar', iconKey: 'unstar', label: 'Unstar' }
    }
    if (action.action === 'mark-unread' && message.unread) {
      return { ...action, action: 'mark-read', iconKey: 'mark-read', label: 'Mark as read' }
    }
    if (action.action === 'archive' && archiveFolder?.id === message.mailboxId) {
      return {
        ...action,
        disabled: true,
        disabledReason: 'Message is already in Archive',
        label: 'Archived'
      }
    }
    if (action.action === 'mark-spam' && isJunk) {
      return inboxFolder
        ? { ...action, action: 'mark-not-spam', iconKey: 'mark-not-spam', label: 'Not spam' }
        : {
            ...action,
            action: 'mark-not-spam',
            disabled: true,
            disabledReason: 'Inbox folder is not available',
            iconKey: 'mark-not-spam',
            label: 'Not spam'
          }
    }
    if (action.action === 'mark-spam' && !junkFolder) {
      return {
        ...action,
        disabled: true,
        disabledReason: 'Junk folder is not available'
      }
    }
    return action
  })
}

export function threadActionsForMessage(
  message: Pick<AgentMailWebMessageSummary, 'isDraft' | 'isStarred' | 'mailboxId' | 'unread'>,
  folders: ReadonlyArray<AgentMailWebFolder>
): ReadonlyArray<AuthenticatedEmailToolbarAction> {
  if (message.isDraft) {
    return actionsForMessage(message, folders)
  }
  return [toolbarAction('view-original', 'utility', 'end', 'View original')]
}

function toolbarAction(
  action: AuthenticatedEmailAction,
  group: AuthenticatedEmailToolbarAction['group'],
  section: AuthenticatedEmailToolbarAction['section'],
  label: string
): AuthenticatedEmailToolbarAction {
  return {
    action,
    group,
    iconKey: action,
    label,
    section
  }
}

function toPagination(workspace: AgentMailWebWorkspace | undefined): AuthenticatedSidebarView['pagination'] {
  if (!workspace) {
    return undefined
  }

  const messageCount = workspace.messages.length
  return {
    canGoNext: Boolean(workspace.pagination.nextCursor),
    canGoPrevious: Boolean(workspace.pagination.previousCursor),
    nextCursor: workspace.pagination.nextCursor,
    previousCursor: workspace.pagination.previousCursor,
    rangeLabel: `${messageCount.toLocaleString()} shown`,
    totalLabel:
      workspace.pagination.total === null
        ? undefined
        : `${workspace.pagination.total.toLocaleString()} messages`
  }
}

function folderIcon(folder: AgentMailWebFolder): AuthenticatedMailNavIconKey {
  const specialUse = folder.specialUse?.toLowerCase()
  if (specialUse === '\\drafts') {
    return 'drafts'
  }
  if (specialUse === '\\junk') {
    return 'junk'
  }
  if (specialUse === '\\sent') {
    return 'sent'
  }
  if (specialUse === '\\trash') {
    return 'trash'
  }
  if (specialUse === '\\inbox' || folder.path.toLowerCase() === 'inbox') {
    return 'inbox'
  }
  return 'folder'
}

export function findSystemFolder(
  folders: ReadonlyArray<AgentMailWebFolder>,
  { path, specialUse }: { path: string; specialUse: string }
) {
  const normalizedPath = path.toLowerCase()
  const normalizedSpecialUse = specialUse.toLowerCase()
  return (
    folders.find((folder) => folder.specialUse?.toLowerCase() === normalizedSpecialUse) ??
    folders.find((folder) => folder.path.toLowerCase() === normalizedPath)
  )
}

export function formatMessageDate(value: string | undefined) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(date)
    : value
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
