export type AuthenticatedViewState = 'ready' | 'loading' | 'empty' | 'error'
export type AuthenticatedMailNavIconKey = 'drafts' | 'folder' | 'inbox' | 'junk' | 'sent' | 'trash'
export type AuthenticatedManagementNavIconKey = 'accounts' | 'agents' | 'groups'
export type AuthenticatedEmailBodySize = 'compact' | 'standard' | 'tall' | 'fill'
export type AuthenticatedComposeMode = 'new' | 'reply' | 'reply-all' | 'forward' | 'draft'
export type AuthenticatedComposeField = 'bcc' | 'body' | 'cc' | 'subject' | 'to'
export type AuthenticatedMailFilterMode = 'client' | 'server'
export type AuthenticatedMailActionDialogKind = 'delete' | 'move' | 'originalSource'
export type AuthenticatedMailPageDirection = 'next' | 'previous'

export interface AuthenticatedMailAccount {
  address: string
  description?: string
  disabled?: boolean
  disabledReason?: string
  id: string
  name: string
  state?: 'ready' | 'loading' | 'attention'
}

export interface AuthenticatedWorkspaceSwitcherWorkspace {
  badgeLabel?: string
  disabled?: boolean
  id: string
  name: string
  slug?: string
}

export interface AuthenticatedWorkspaceSwitcherView {
  activeWorkspaceId?: string
  workspaces: ReadonlyArray<AuthenticatedWorkspaceSwitcherWorkspace>
}

export interface AuthenticatedMailPagination {
  canGoNext?: boolean
  canGoPrevious?: boolean
  nextCursor?: string | null
  previousCursor?: string | null
  rangeLabel: string
  state?: AuthenticatedViewState
  totalLabel?: string
}

export interface AuthenticatedMailPageChange {
  cursor?: string | null
  direction: AuthenticatedMailPageDirection
}

export interface AuthenticatedMailNavItem {
  actions?: ReadonlyArray<AuthenticatedMailFolderActionItem>
  badgeLabel?: string
  iconKey: AuthenticatedMailNavIconKey
  id: string
  title: string
  url: string
}

export type AuthenticatedMailFolderAction = 'delete-folder' | 'rename-folder'

export interface AuthenticatedMailFolderActionItem {
  action: AuthenticatedMailFolderAction
  disabled?: boolean
  disabledReason?: string
  label: string
  pending?: boolean
}

export interface AuthenticatedManagementNavItem {
  iconKey: AuthenticatedManagementNavIconKey
  id: string
  title: string
  url: string
}

export interface AuthenticatedMailItem {
  attachmentCountLabel?: string
  date: string
  email: string
  folderId?: string
  hasDraft?: boolean
  id: string
  isDraft?: boolean
  isStarred?: boolean
  isUnread?: boolean
  name: string
  needsReply?: boolean
  subject: string
  teaser: string
  threadCountLabel?: string
  threadId?: string
}

export interface AuthenticatedEmailPreview {
  actions?: ReadonlyArray<AuthenticatedEmailToolbarAction>
  attachments?: ReadonlyArray<AuthenticatedEmailAttachment>
  bodySize?: AuthenticatedEmailBodySize
  draftId?: string
  externalLinks?: ReadonlyArray<AuthenticatedExternalLink>
  folderId?: string
  html: string
  htmlWithRemoteImages?: string
  id: string
  isDraft?: boolean
  isStarred?: boolean
  isUnread?: boolean
  receivedAt: string
  recipientEmail: string
  remoteImages?: ReadonlyArray<AuthenticatedRemoteImage>
  remoteImagesAllowed?: boolean
  senderEmail: string
  senderName: string
  subject: string
  thread?: ReadonlyArray<AuthenticatedEmailThreadMessage>
  threadId?: string
}

export interface AuthenticatedEmailThreadMessage {
  actions?: ReadonlyArray<AuthenticatedEmailToolbarAction>
  attachments?: ReadonlyArray<AuthenticatedEmailAttachment>
  bodySize?: Exclude<AuthenticatedEmailBodySize, 'fill'>
  collapsedQuotes?: ReadonlyArray<AuthenticatedEmailCollapsedQuote>
  folderId?: string
  html: string
  id: string
  isDraft?: boolean
  receivedAt: string
  recipientEmail: string
  senderEmail: string
  senderName: string
  state?: 'expanded' | 'collapsed'
  teaser?: string
}

export interface AuthenticatedEmailCollapsedQuote {
  attribution?: string
  id: string
  preview: string
}

export interface AuthenticatedExternalLink {
  host?: string
  id: string
  text?: string
  url: string
}

export interface AuthenticatedRemoteImage {
  alt?: string
  host?: string
  id: string
  url: string
}

export interface AuthenticatedEmailAttachment {
  contentId?: string | null
  disposition?: string | null
  filename: string
  id: string
  mimetype?: string | null
  sizeLabel?: string
  status?: 'error' | 'ready' | 'uploading'
  statusLabel?: string
  url?: string
}

export interface AuthenticatedMailFolderOption {
  description?: string
  disabled?: boolean
  disabledReason?: string
  id: string
  title: string
  unreadCountLabel?: string
}

export interface AuthenticatedMailCreateFolderView {
  description?: string
  errorMessage?: string
  isSubmitting?: boolean
  name: string
  placeholder?: string
  state: 'closed' | 'open'
  submitLabel?: string
  title: string
  triggerLabel?: string
}

export interface AuthenticatedMailRenameFolderView {
  description?: string
  errorMessage?: string
  folderId: string
  isSubmitting?: boolean
  name: string
  placeholder?: string
  state: 'closed' | 'open'
  submitLabel?: string
  title: string
}

export interface AuthenticatedMailDeleteFolderView {
  confirmLabel?: string
  description: string
  errorMessage?: string
  folderId: string
  isSubmitting?: boolean
  state: 'closed' | 'open'
  title: string
}

export type AuthenticatedEmailAction =
  | 'archive'
  | 'back'
  | 'close'
  | 'collapse-thread-message'
  | 'delete'
  | 'discard-draft'
  | 'edit-draft'
  | 'expand-thread-message'
  | 'forward'
  | 'mark-not-spam'
  | 'mark-read'
  | 'mark-spam'
  | 'mark-unread'
  | 'move'
  | 'reply'
  | 'reply-all'
  | 'restore'
  | 'send-draft'
  | 'show-remote-images'
  | 'snooze'
  | 'star'
  | 'unstar'
  | 'view-original'

export type AuthenticatedEmailActionIconKey = AuthenticatedEmailAction | 'more'
export type AuthenticatedEmailToolbarActionGroup = 'navigation' | 'organization' | 'response' | 'utility'
export type AuthenticatedEmailToolbarSection = 'start' | 'end'

export interface AuthenticatedEmailToolbarAction {
  action: AuthenticatedEmailAction
  disabled?: boolean
  disabledReason?: string
  group: AuthenticatedEmailToolbarActionGroup
  iconKey: AuthenticatedEmailActionIconKey
  label: string
  pending?: boolean
  section: AuthenticatedEmailToolbarSection
}

export interface AuthenticatedSidebarView {
  activeItemId: string
  activeAccountId?: string
  accounts?: ReadonlyArray<AuthenticatedMailAccount>
  emptyDescription: string
  emptyTitle: string
  errorDescription?: string
  errorTitle?: string
  filterMode?: AuthenticatedMailFilterMode
  folderCreate?: AuthenticatedMailCreateFolderView
  folderDelete?: AuthenticatedMailDeleteFolderView
  folderRename?: AuthenticatedMailRenameFolderView
  isRefreshing?: boolean
  managementNav?: ReadonlyArray<AuthenticatedManagementNavItem>
  mails: ReadonlyArray<AuthenticatedMailItem>
  navMain: ReadonlyArray<AuthenticatedMailNavItem>
  pagination?: AuthenticatedMailPagination
  refreshLabel?: string
  retryLabel?: string
  searchQuery?: string
  selectedMailId?: string
  state: AuthenticatedViewState
  unreadOnly?: boolean
  workspaceSwitcher?: AuthenticatedWorkspaceSwitcherView
}

export interface AuthenticatedDashboardView {
  emptyDescription: string
  emptyTitle: string
  errorDescription?: string
  errorTitle?: string
  onboardingPrompt?: AuthenticatedDashboardOnboardingView
  retryLabel?: string
  selectedEmail?: AuthenticatedEmailPreview
  state: AuthenticatedViewState
}

export interface AuthenticatedDashboardOnboardingView {
  actionLabel: string
  description: string
  errorDescription?: string
  helperText?: string
  state: 'ready' | 'connecting' | 'error'
  title: string
}

export interface AuthenticatedComposeView {
  attachments?: ReadonlyArray<AuthenticatedEmailAttachment>
  bcc?: string
  body: string
  canSaveDraft?: boolean
  canSend?: boolean
  cc?: string
  draftId?: string
  draftStatusLabel?: string
  errorMessage?: string
  fieldErrors?: Partial<Record<AuthenticatedComposeField, string>>
  fromAddress?: string
  fromLabel?: string
  isSavingDraft?: boolean
  isSending?: boolean
  mode: AuthenticatedComposeMode
  state: 'closed' | 'open'
  subject: string
  title: string
  to: string
}

export interface AuthenticatedMailMoveActionView {
  description?: string
  errorMessage?: string
  folders: ReadonlyArray<AuthenticatedMailFolderOption>
  isSubmitting?: boolean
  selectedFolderId?: string
  state: 'closed' | 'open'
  submitLabel?: string
  title: string
}

export interface AuthenticatedMailDeleteActionView {
  confirmLabel?: string
  description: string
  errorMessage?: string
  isSubmitting?: boolean
  state: 'closed' | 'open'
  title: string
}

export interface AuthenticatedMailOriginalSourceEvidenceItem {
  description?: string
  id: string
  label: string
  status?: 'fail' | 'neutral' | 'pass'
  value: string
}

export interface AuthenticatedMailOriginalSourceAuthMethod {
  id: string
  method: string
  result: string
}

export interface AuthenticatedMailOriginalSourceAuthHeader {
  id: string
  methods?: ReadonlyArray<AuthenticatedMailOriginalSourceAuthMethod>
  raw: string
  sourceLabel?: string
  title: string
}

export interface AuthenticatedMailOriginalSourceHeader {
  layer?: string
  name: string
  value: string
}

export interface AuthenticatedMailOriginalSourceHeaderSection {
  description?: string
  emptyMessage?: string
  headers: ReadonlyArray<AuthenticatedMailOriginalSourceHeader>
  id: string
  title: string
}

export interface AuthenticatedMailOriginalSourceRawSection {
  emptyMessage?: string
  id: string
  source?: string
  title: string
}

export interface AuthenticatedMailOriginalSourceView {
  authenticationHeaders?: ReadonlyArray<AuthenticatedMailOriginalSourceAuthHeader>
  description?: string
  downloadLabel?: string
  errorMessage?: string
  evidence?: ReadonlyArray<AuthenticatedMailOriginalSourceEvidenceItem>
  headerSections?: ReadonlyArray<AuthenticatedMailOriginalSourceHeaderSection>
  isLoading?: boolean
  rawSources?: ReadonlyArray<AuthenticatedMailOriginalSourceRawSection>
  source?: string
  state: 'closed' | 'open'
  title: string
}

export interface AuthenticatedMailActionView {
  delete?: AuthenticatedMailDeleteActionView
  move?: AuthenticatedMailMoveActionView
  originalSource?: AuthenticatedMailOriginalSourceView
}

export const defaultAuthenticatedSidebarView = {
  activeItemId: 'inbox',
  emptyDescription: 'Messages matching this mailbox view will appear here.',
  emptyTitle: 'No messages',
  navMain: [
    {
      id: 'inbox',
      title: 'Inbox',
      url: '#',
      iconKey: 'inbox'
    },
    {
      id: 'drafts',
      title: 'Drafts',
      url: '#',
      iconKey: 'drafts'
    },
    {
      id: 'sent',
      title: 'Sent',
      url: '#',
      iconKey: 'sent'
    },
    {
      id: 'junk',
      title: 'Junk',
      url: '#',
      iconKey: 'junk'
    },
    {
      id: 'trash',
      title: 'Trash',
      url: '#',
      iconKey: 'trash'
    }
  ],
  mails: [],
  searchQuery: '',
  state: 'ready',
  workspaceSwitcher: {
    activeWorkspaceId: 'agentteam-email',
    workspaces: [
      {
        id: 'agentteam-email',
        name: 'AgentTeam Email',
        slug: 'mail client'
      }
    ]
  }
} satisfies AuthenticatedSidebarView

export const defaultAuthenticatedDashboardView = {
  emptyDescription: 'Choose a message from the mailbox to read it here.',
  emptyTitle: 'Select a message',
  state: 'ready'
} satisfies AuthenticatedDashboardView

export const defaultAuthenticatedEmailToolbarActions = [
  {
    action: 'back',
    group: 'navigation',
    iconKey: 'back',
    label: 'Back to list',
    section: 'start'
  },
  {
    action: 'reply',
    group: 'response',
    iconKey: 'reply',
    label: 'Reply',
    section: 'start'
  },
  {
    action: 'reply-all',
    group: 'response',
    iconKey: 'reply-all',
    label: 'Reply all',
    section: 'start'
  },
  {
    action: 'forward',
    group: 'response',
    iconKey: 'forward',
    label: 'Forward',
    section: 'start'
  },
  {
    action: 'star',
    group: 'organization',
    iconKey: 'star',
    label: 'Star',
    section: 'start'
  },
  {
    action: 'mark-unread',
    group: 'organization',
    iconKey: 'mark-unread',
    label: 'Mark as unread',
    section: 'start'
  },
  {
    action: 'move',
    group: 'organization',
    iconKey: 'move',
    label: 'Move to folder',
    section: 'start'
  },
  {
    action: 'mark-spam',
    group: 'organization',
    iconKey: 'mark-spam',
    label: 'Mark as spam',
    section: 'start'
  },
  {
    action: 'view-original',
    group: 'utility',
    iconKey: 'view-original',
    label: 'View original',
    section: 'end'
  },
  {
    action: 'delete',
    group: 'utility',
    iconKey: 'delete',
    label: 'Delete',
    section: 'end'
  },
  {
    action: 'close',
    group: 'utility',
    iconKey: 'close',
    label: 'Close',
    section: 'end'
  }
] satisfies ReadonlyArray<AuthenticatedEmailToolbarAction>

export function withActiveSidebarItem(
  view: AuthenticatedSidebarView,
  activeItemId: string
): AuthenticatedSidebarView {
  return {
    ...view,
    activeItemId
  }
}
