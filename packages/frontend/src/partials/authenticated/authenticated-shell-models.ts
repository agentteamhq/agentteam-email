export type AuthenticatedViewState = 'ready' | 'loading' | 'empty'
export type AuthenticatedMailNavIconKey = 'drafts' | 'inbox' | 'junk' | 'sent' | 'trash'
export type AuthenticatedManagementNavIconKey = 'accounts' | 'agents' | 'groups'
export type AuthenticatedEmailBodySize = 'compact' | 'standard' | 'tall' | 'fill'

export interface AuthenticatedMailNavItem {
  iconKey: AuthenticatedMailNavIconKey
  id: string
  title: string
  url: string
}

export interface AuthenticatedManagementNavItem {
  iconKey: AuthenticatedManagementNavIconKey
  id: string
  title: string
  url: string
}

export interface AuthenticatedMailItem {
  date: string
  email: string
  id: string
  isUnread?: boolean
  name: string
  subject: string
  teaser: string
}

export interface AuthenticatedEmailPreview {
  actions?: ReadonlyArray<AuthenticatedEmailToolbarAction>
  bodySize?: AuthenticatedEmailBodySize
  externalLinks?: ReadonlyArray<AuthenticatedExternalLink>
  html: string
  htmlWithRemoteImages?: string
  id: string
  receivedAt: string
  recipientEmail: string
  remoteImages?: ReadonlyArray<AuthenticatedRemoteImage>
  remoteImagesAllowed?: boolean
  senderEmail: string
  senderName: string
  subject: string
  thread?: ReadonlyArray<AuthenticatedEmailThreadMessage>
}

export interface AuthenticatedEmailThreadMessage {
  bodySize?: Exclude<AuthenticatedEmailBodySize, 'fill'>
  collapsedQuotes?: ReadonlyArray<AuthenticatedEmailCollapsedQuote>
  html: string
  id: string
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

export type AuthenticatedEmailAction =
  | 'back'
  | 'delete'
  | 'forward'
  | 'mark-unread'
  | 'move'
  | 'reply'
  | 'reply-all'
  | 'show-remote-images'
  | 'snooze'
  | 'star'
  | 'view-original'
  | 'close'

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
  section: AuthenticatedEmailToolbarSection
}

export interface AuthenticatedSidebarView {
  activeItemId: string
  emptyDescription: string
  emptyTitle: string
  managementNav?: ReadonlyArray<AuthenticatedManagementNavItem>
  mails: ReadonlyArray<AuthenticatedMailItem>
  navMain: ReadonlyArray<AuthenticatedMailNavItem>
  searchQuery?: string
  selectedMailId?: string
  state: AuthenticatedViewState
  unreadOnly?: boolean
}

export interface AuthenticatedDashboardView {
  emptyDescription: string
  emptyTitle: string
  selectedEmail?: AuthenticatedEmailPreview
  state: AuthenticatedViewState
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
  state: 'ready'
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
