import {
  defaultAuthenticatedDashboardView,
  defaultAuthenticatedEmailToolbarActions,
  defaultAuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'
import allowedRemoteImagesHtml from './fixtures/emails/allowed-remote-images.fixture?raw'
import appointmentAlertEmailHtml from './fixtures/emails/appointment-alert.fixture?raw'
import blockedRemoteImagesHtml from './fixtures/emails/blocked-remote-images.fixture?raw'
import conversationLatestHtml from './fixtures/emails/conversation-latest.fixture?raw'
import conversationOriginalHtml from './fixtures/emails/conversation-original.fixture?raw'
import welcomeEmailHtml from './fixtures/emails/welcome-email.fixture?raw'
import { storyAuthClient } from './auth-client-fixtures'
import { authenticatedSettingsRouteState, storyPublicEnv } from './screen-fixtures'
import type { DashboardScreenProps } from '../screens/dashboard-screen'
import type { DomainSettingsState, DomainSettingsStatus } from '../partials/authenticated/settings-dialog'
import type {
  AuthenticatedDashboardView,
  AuthenticatedEmailPreview,
  AuthenticatedEmailToolbarAction,
  AuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'

type CloudflareGrantFixture = DomainSettingsStatus['grants'][number]
type CloudflareConnectionFixture = DomainSettingsStatus['connections'][number]

const cloudflareGrantPublicId = (value: string) => value as CloudflareGrantFixture['publicId']
const cloudflareConnectionPublicId = (value: string) => value as CloudflareConnectionFixture['publicId']

const requiredCloudflareScopes = [
  'account:read',
  'user:read',
  'zone:read',
  'workers:write',
  'workers_routes:write',
  'r2:write'
]

const activeCloudflareGrant = {
  publicId: cloudflareGrantPublicId('4k8wVa7Z5pM9eT2hQ0nYbC'),
  cloudflareUserId: 'cloudflare-user-9f52',
  cloudflareEmail: 'admin@example.com',
  grantedScopes: requiredCloudflareScopes,
  requiredScopes: requiredCloudflareScopes,
  status: 'active',
  lastTokenCheckAt: new Date('2026-06-21T16:12:00.000Z'),
  lastErrorMessage: null
} satisfies CloudflareGrantFixture

const secondaryCloudflareGrant = {
  ...activeCloudflareGrant,
  publicId: cloudflareGrantPublicId('7n2bQa9K4rT0wCx6Pd3LmS'),
  cloudflareUserId: 'cloudflare-user-a381',
  cloudflareEmail: 'ops@example.com',
  lastTokenCheckAt: new Date('2026-06-21T16:14:00.000Z')
} satisfies CloudflareGrantFixture

const connectedCloudflareAccounts = [
  {
    grantPublicId: activeCloudflareGrant.publicId,
    id: '3d6f2b2d8e2a49a2bb6f2fb97e4c9d17',
    name: 'AgentTeam Production',
    type: 'standard'
  },
  {
    grantPublicId: secondaryCloudflareGrant.publicId,
    id: '8a1c19e53f8543a79a91c8cdb6b0e7f2',
    name: 'AgentTeam Operations',
    type: 'standard'
  }
] satisfies DomainSettingsState['accounts']

const connectedCloudflareZones = [
  {
    accountId: '3d6f2b2d8e2a49a2bb6f2fb97e4c9d17',
    accountName: 'AgentTeam Production',
    grantPublicId: activeCloudflareGrant.publicId,
    id: '0f8b5f1816a946f28d263671a8f5e4aa',
    name: 'agentteam.example',
    status: 'active'
  },
  {
    accountId: '8a1c19e53f8543a79a91c8cdb6b0e7f2',
    accountName: 'AgentTeam Operations',
    grantPublicId: secondaryCloudflareGrant.publicId,
    id: '7db727db0bb348e9a2db284a1f7a6cf4',
    name: 'ops.agentteam.example',
    status: 'active'
  }
] satisfies DomainSettingsState['zones']

const pendingCloudflareConnection = {
  publicId: cloudflareConnectionPublicId('5Ue0nPqJ3xVb1ZyL8sTaMn'),
  cloudflareAccountId: '3d6f2b2d8e2a49a2bb6f2fb97e4c9d17',
  cloudflareAccountName: 'AgentTeam Production',
  cloudflareZoneId: '0f8b5f1816a946f28d263671a8f5e4aa',
  cloudflareZoneName: 'agentteam.example',
  domain: 'agentteam.example',
  workerScriptName: null,
  status: 'provisioning',
  provisioningStatus: 'pending',
  lastProvisionedAt: null,
  lastErrorMessage: null,
  updatedAt: new Date('2026-06-21T16:18:00.000Z')
} satisfies CloudflareConnectionFixture

const liveCloudflareConnection = {
  ...pendingCloudflareConnection,
  workerScriptName: 'agent-mail-ingest-agentteam-example',
  status: 'active',
  provisioningStatus: 'succeeded',
  lastProvisionedAt: new Date('2026-06-21T16:24:00.000Z'),
  updatedAt: new Date('2026-06-21T16:26:00.000Z')
} satisfies CloudflareConnectionFixture

const connectedCloudflareConnection = {
  ...pendingCloudflareConnection,
  status: 'connected',
  provisioningStatus: 'not_started',
  updatedAt: new Date('2026-06-21T16:16:00.000Z')
} satisfies CloudflareConnectionFixture

const degradedCloudflareConnection = {
  ...pendingCloudflareConnection,
  status: 'degraded',
  provisioningStatus: 'failed',
  lastErrorMessage: 'Cloudflare worker route could not be applied to the selected zone.',
  updatedAt: new Date('2026-06-21T16:20:00.000Z')
} satisfies CloudflareConnectionFixture

const denseCloudflareConnections = [
  liveCloudflareConnection,
  {
    ...liveCloudflareConnection,
    publicId: cloudflareConnectionPublicId('6yc0nPqJ3xVb1ZyL8sTbQa'),
    domain: 'ops.agentteam.example',
    cloudflareZoneName: 'ops.agentteam.example',
    workerScriptName: 'agent-mail-ingest-ops-agentteam-example',
    updatedAt: new Date('2026-06-21T16:31:00.000Z')
  },
  {
    ...connectedCloudflareConnection,
    publicId: cloudflareConnectionPublicId('7Tq0nPqJ3xVb1ZyL8sTbRc'),
    domain: 'support.agentteam.example',
    cloudflareZoneName: 'support.agentteam.example'
  },
  {
    ...degradedCloudflareConnection,
    publicId: cloudflareConnectionPublicId('8Kp0nPqJ3xVb1ZyL8sTbSd'),
    domain: 'reply.agentteam.example',
    cloudflareZoneName: 'reply.agentteam.example'
  },
  {
    ...pendingCloudflareConnection,
    publicId: cloudflareConnectionPublicId('9Da0nPqJ3xVb1ZyL8sTbTe'),
    domain: 'notify.agentteam.example',
    cloudflareZoneName: 'notify.agentteam.example'
  }
] satisfies CloudflareConnectionFixture[]

export const domainSettingsEmptyFirstUseState = {
  mode: 'addDomain',
  status: {
    connections: [],
    grants: []
  }
} satisfies DomainSettingsState

export const domainSettingsAddDomainAuthorizeCloudflareState = domainSettingsEmptyFirstUseState

export const domainSettingsAddDomainSelectZoneState = {
  accounts: connectedCloudflareAccounts,
  draftDomain: 'agentteam.example',
  mode: 'addDomain',
  selectedAccountId: connectedCloudflareAccounts[0]?.id,
  selectedGrantPublicId: activeCloudflareGrant.publicId,
  selectedZoneId: connectedCloudflareZones[0]?.id,
  status: {
    connections: [],
    grants: [activeCloudflareGrant, secondaryCloudflareGrant]
  },
  zones: connectedCloudflareZones
} satisfies DomainSettingsState

export const domainSettingsDomainConnectedState = {
  ...domainSettingsAddDomainSelectZoneState,
  mode: 'domain',
  selectedDomainPublicId: connectedCloudflareConnection.publicId,
  status: {
    connections: [connectedCloudflareConnection],
    grants: [activeCloudflareGrant, secondaryCloudflareGrant]
  }
} satisfies DomainSettingsState

export const domainSettingsDomainProvisioningState = {
  ...domainSettingsAddDomainSelectZoneState,
  message: 'Domain provisioning is queued for Cloudflare.',
  mode: 'domain',
  selectedDomainPublicId: pendingCloudflareConnection.publicId,
  status: {
    connections: [pendingCloudflareConnection],
    grants: [activeCloudflareGrant, secondaryCloudflareGrant]
  }
} satisfies DomainSettingsState

export const domainSettingsDomainLiveState = {
  ...domainSettingsAddDomainSelectZoneState,
  mode: 'domain',
  selectedDomainPublicId: liveCloudflareConnection.publicId,
  status: {
    connections: [liveCloudflareConnection],
    grants: [activeCloudflareGrant, secondaryCloudflareGrant]
  }
} satisfies DomainSettingsState

export const domainSettingsDomainNeedsAttentionState = {
  ...domainSettingsAddDomainSelectZoneState,
  mode: 'domain',
  selectedDomainPublicId: degradedCloudflareConnection.publicId,
  status: {
    connections: [degradedCloudflareConnection],
    grants: [activeCloudflareGrant, secondaryCloudflareGrant]
  }
} satisfies DomainSettingsState

export const domainSettingsDenseDomainListState = {
  ...domainSettingsAddDomainSelectZoneState,
  mode: 'domain',
  selectedDomainPublicId: denseCloudflareConnections[0]?.publicId,
  status: {
    connections: denseCloudflareConnections,
    grants: [activeCloudflareGrant, secondaryCloudflareGrant]
  }
} satisfies DomainSettingsState

export const authenticatedSectionBaseArgs = {
  authClient: storyAuthClient,
  dashboardView: defaultAuthenticatedDashboardView,
  publicEnv: storyPublicEnv,
  routeState: authenticatedSettingsRouteState,
  sessionCleanupEnabled: false
} satisfies Pick<
  DashboardScreenProps,
  'authClient' | 'dashboardView' | 'publicEnv' | 'routeState' | 'sessionCleanupEnabled'
>

export const loadingAuthenticatedSidebarView = {
  ...defaultAuthenticatedSidebarView,
  mails: [],
  state: 'loading'
} satisfies AuthenticatedSidebarView

export const emptyAuthenticatedSidebarView = {
  ...defaultAuthenticatedSidebarView,
  emptyDescription: 'This mailbox does not have any messages yet.',
  emptyTitle: 'No messages',
  mails: [],
  state: 'empty'
} satisfies AuthenticatedSidebarView

export const errorAuthenticatedSidebarView = {
  ...defaultAuthenticatedSidebarView,
  errorDescription: 'WildDuck did not return the selected mailbox messages.',
  errorTitle: 'Mailbox failed to load',
  mails: [],
  retryLabel: 'Retry mailbox',
  state: 'error'
} satisfies AuthenticatedSidebarView

export const loadingAuthenticatedDashboardView = {
  ...defaultAuthenticatedDashboardView,
  state: 'loading'
} satisfies AuthenticatedDashboardView

export const emptyAuthenticatedDashboardView = {
  ...defaultAuthenticatedDashboardView,
  emptyDescription: 'Messages delivered to this mailbox will appear in the list.',
  emptyTitle: 'No messages in this mailbox',
  state: 'empty'
} satisfies AuthenticatedDashboardView

export const errorAuthenticatedDashboardView = {
  ...defaultAuthenticatedDashboardView,
  errorDescription: 'Message details could not be loaded from the web server.',
  errorTitle: 'Message failed to load',
  retryLabel: 'Retry message',
  state: 'error'
} satisfies AuthenticatedDashboardView

const emailPreviewMails = [
  {
    id: 'appointment-alert',
    name: 'Ricardo Freire',
    email: 'templates@crafting.email',
    isUnread: true,
    subject: 'Appointment alert',
    date: '09:34 AM',
    teaser:
      'Just a friendly reminder that we have an upcoming appointment.\nDate: DD-MM-YYYY. Duration: 30 minutes.'
  },
  {
    id: 'welcome-email',
    name: 'Mailjet Templates',
    email: 'templates@mailjet.example',
    subject: 'Welcome aboard',
    date: 'Yesterday',
    teaser: 'Dear [[FirstName]], welcome to [[CompanyName]]. You can log in to your account with your email.'
  },
  {
    id: 'conversation-thread',
    name: 'Testing',
    email: 'testingtesting@example.test',
    isUnread: true,
    subject: 'Re: Agent Mail smoke - 20260601-044348Z',
    date: 'May 31',
    teaser:
      'Hi, confirming that this mailbox is receiving and sending replies correctly; the message came through with the original context.'
  },
  {
    id: 'blocked-images',
    name: 'Provider Portal',
    email: 'updates@provider.example',
    isUnread: true,
    subject: 'Deployment checklist and routing review',
    date: 'May 30',
    teaser:
      'Thanks for checking out the deployment notes. Review the rollout checklist at the provider portal.'
  }
] satisfies AuthenticatedSidebarView['mails']

export const emailPreviewSidebarView = {
  ...defaultAuthenticatedSidebarView,
  mails: emailPreviewMails,
  selectedMailId: 'appointment-alert',
  state: 'ready'
} satisfies AuthenticatedSidebarView

export const refreshingMailboxSidebarView = {
  ...emailPreviewSidebarView,
  isRefreshing: true,
  refreshLabel: 'Refreshing mailbox'
} satisfies AuthenticatedSidebarView

export const welcomeEmailSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'welcome-email'
} satisfies AuthenticatedSidebarView

export const conversationThreadSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'conversation-thread'
} satisfies AuthenticatedSidebarView

export const threadedMailboxSidebarView = {
  ...emailPreviewSidebarView,
  mails: emailPreviewMails.map((mail) =>
    mail.id === 'conversation-thread'
      ? {
          ...mail,
          attachmentCountLabel: '2 attachments',
          hasDraft: true,
          needsReply: true,
          threadCountLabel: '3'
        }
      : mail
  ),
  selectedMailId: 'conversation-thread'
} satisfies AuthenticatedSidebarView

export const blockedImagesSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'blocked-images'
} satisfies AuthenticatedSidebarView

export const searchFilteredSidebarView = {
  ...emailPreviewSidebarView,
  searchQuery: 'welcome',
  selectedMailId: 'welcome-email'
} satisfies AuthenticatedSidebarView

export const searchEmptySidebarView = {
  ...emailPreviewSidebarView,
  searchQuery: 'missing provider invoice',
  selectedMailId: undefined
} satisfies AuthenticatedSidebarView

export const unreadOnlySidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'appointment-alert',
  unreadOnly: true
} satisfies AuthenticatedSidebarView

export const starredMessageSidebarView = {
  ...emailPreviewSidebarView,
  mails: emailPreviewMails.map((mail) =>
    mail.id === 'welcome-email'
      ? {
          ...mail,
          isStarred: true
        }
      : mail
  ),
  selectedMailId: 'welcome-email'
} satisfies AuthenticatedSidebarView

export const junkMailboxSidebarView = {
  ...emailPreviewSidebarView,
  activeItemId: 'junk',
  emptyDescription: 'Messages WildDuck classifies as junk will appear here.',
  emptyTitle: 'No junk messages',
  mails: [
    {
      ...emailPreviewMails[3],
      folderId: 'junk',
      isUnread: true
    }
  ],
  selectedMailId: 'blocked-images'
} satisfies AuthenticatedSidebarView

export const sentMailboxSidebarView = {
  ...emailPreviewSidebarView,
  activeItemId: 'sent',
  emptyDescription: 'Sent messages from this mailbox will appear here.',
  emptyTitle: 'No sent messages',
  mails: [
    {
      id: 'sent-follow-up',
      date: 'Today',
      email: 'support@agentteam.test',
      folderId: 'sent',
      name: 'Support Agent',
      subject: 'Re: Deployment checklist and routing review',
      teaser: 'Thanks for sending the routing notes. We confirmed the values and will monitor delivery.'
    }
  ],
  selectedMailId: 'sent-follow-up'
} satisfies AuthenticatedSidebarView

export const trashMailboxSidebarView = {
  ...emailPreviewSidebarView,
  activeItemId: 'trash',
  emptyDescription: 'Deleted messages waiting for cleanup will appear here.',
  emptyTitle: 'No deleted messages',
  mails: [
    {
      id: 'trash-archive',
      date: 'Jun 18',
      email: 'alerts@example.test',
      folderId: 'trash',
      name: 'Old Alert',
      subject: 'Expired deployment alert',
      teaser: 'This alert was deleted after the deployment was verified.'
    }
  ],
  selectedMailId: 'trash-archive'
} satisfies AuthenticatedSidebarView

export const disabledToolbarActionSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'appointment-alert'
} satisfies AuthenticatedSidebarView

const disabledReplyAllActions = defaultAuthenticatedEmailToolbarActions.map((action) =>
  action.action === 'reply-all'
    ? {
        ...action,
        disabled: true,
        disabledReason: 'This message has one visible recipient.'
      }
    : action
)

const archiveToolbarAction = {
  action: 'archive',
  group: 'organization',
  iconKey: 'archive',
  label: 'Archive',
  section: 'start'
} satisfies AuthenticatedEmailToolbarAction

const archiveMessageActions =
  defaultAuthenticatedEmailToolbarActions.flatMap<AuthenticatedEmailToolbarAction>((action) =>
    action.action === 'move' ? [archiveToolbarAction, action] : [action]
  ) satisfies ReadonlyArray<AuthenticatedEmailToolbarAction>

const threadMessageOriginalActions = [
  {
    action: 'view-original',
    group: 'utility',
    iconKey: 'view-original',
    label: 'View message original',
    section: 'end'
  }
] satisfies ReadonlyArray<AuthenticatedEmailToolbarAction>

const threadDraftMessageActions = [
  {
    action: 'send-draft',
    group: 'response',
    iconKey: 'send-draft',
    label: 'Send draft',
    section: 'start'
  },
  {
    action: 'edit-draft',
    group: 'response',
    iconKey: 'edit-draft',
    label: 'Edit draft',
    section: 'start'
  },
  {
    action: 'discard-draft',
    group: 'utility',
    iconKey: 'discard-draft',
    label: 'Discard draft',
    section: 'end'
  }
] satisfies ReadonlyArray<AuthenticatedEmailToolbarAction>

export const emailPreviewsById = {
  'appointment-alert': {
    id: 'appointment-alert',
    senderName: 'Ricardo Freire',
    senderEmail: 'templates@crafting.email',
    recipientEmail: 'info@agentteam.test',
    subject: 'Appointment alert',
    receivedAt: 'Today at 09:34 AM',
    html: appointmentAlertEmailHtml
  },
  'welcome-email': {
    id: 'welcome-email',
    senderName: 'Mailjet Templates',
    senderEmail: 'templates@mailjet.example',
    recipientEmail: 'info@agentteam.test',
    subject: 'Welcome aboard',
    receivedAt: 'Yesterday at 4:12 PM',
    html: welcomeEmailHtml
  },
  'conversation-thread': {
    id: 'conversation-thread',
    senderName: 'Testing',
    senderEmail: 'testingtesting@example.test',
    recipientEmail: 'info@agentteam.test',
    subject: 'Re: Agent Mail smoke - 20260601-044348Z',
    receivedAt: 'May 31, 12:18 PM',
    html: conversationLatestHtml,
    thread: [
      {
        id: 'thread-latest',
        actions: threadMessageOriginalActions,
        senderName: 'Testing',
        senderEmail: 'testingtesting@example.test',
        recipientEmail: 'info@agentteam.test',
        receivedAt: 'May 31, 12:18 PM',
        bodySize: 'tall',
        html: conversationLatestHtml,
        state: 'expanded',
        collapsedQuotes: [
          {
            id: 'quote-original',
            attribution: 'Testing wrote',
            preview: 'Can you confirm the smoke-test reply path is working for this mailbox?'
          }
        ]
      },
      {
        id: 'thread-original',
        senderName: 'AgentTeam Email',
        senderEmail: 'info@agentteam.test',
        recipientEmail: 'testingtesting@example.test',
        receivedAt: 'May 31, 12:04 PM',
        html: conversationOriginalHtml,
        state: 'collapsed',
        teaser: 'Can you confirm the smoke-test reply path is working for this mailbox?'
      },
      {
        id: 'thread-draft-reply',
        actions: threadDraftMessageActions,
        folderId: 'drafts',
        html: '<p>Drafting reply from the selected WildDuck Drafts folder.</p>',
        isDraft: true,
        receivedAt: 'Saved 1 minute ago',
        recipientEmail: 'testingtesting@example.test',
        senderEmail: 'info@agentteam.test',
        senderName: 'Draft',
        state: 'expanded'
      }
    ]
  },
  'blocked-images': {
    id: 'blocked-images',
    senderName: 'Provider Portal',
    senderEmail: 'updates@provider.example',
    recipientEmail: 'info@agentteam.test',
    subject: 'Deployment checklist and routing review',
    receivedAt: 'May 30, 9:22 AM',
    html: blockedRemoteImagesHtml,
    htmlWithRemoteImages: allowedRemoteImagesHtml,
    remoteImagesAllowed: false,
    remoteImages: [
      {
        id: 'image-1',
        url: 'https://static.mailjet.com/mjml-website/templates/welcome-hero.jpg',
        host: 'static.mailjet.com',
        alt: 'Remote launch banner'
      }
    ],
    externalLinks: [
      {
        id: 'link-1',
        url: 'https://dash.cloudflare.com/?to=provider-routing',
        host: 'dash.cloudflare.com',
        text: 'the provider portal'
      },
      {
        id: 'link-2',
        url: 'https://developers.cloudflare.com/workers/configuration/routing/routes/',
        host: 'developers.cloudflare.com',
        text: 'worker route documentation'
      }
    ]
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const disabledToolbarEmailPreviewsById = {
  ...emailPreviewsById,
  'appointment-alert': {
    ...emailPreviewsById['appointment-alert'],
    actions: disabledReplyAllActions
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const archiveActionEmailPreviewsById = {
  ...emailPreviewsById,
  'blocked-images': {
    ...emailPreviewsById['blocked-images'],
    actions: archiveMessageActions
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const starredEmailPreviewsById = {
  ...emailPreviewsById,
  'welcome-email': {
    ...emailPreviewsById['welcome-email'],
    actions: defaultAuthenticatedEmailToolbarActions.map((action) =>
      action.action === 'star'
        ? {
            ...action,
            action: 'unstar',
            iconKey: 'unstar',
            label: 'Unstar'
          }
        : action
    ),
    isStarred: true
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const sentEmailPreviewsById = {
  ...emailPreviewsById,
  'sent-follow-up': {
    id: 'sent-follow-up',
    folderId: 'sent',
    html: '<p>Thanks for sending the routing notes. We confirmed the values and will monitor delivery.</p>',
    receivedAt: 'Today at 11:04 AM',
    recipientEmail: 'updates@provider.example',
    senderEmail: 'support@agentteam.test',
    senderName: 'Support Agent',
    subject: 'Re: Deployment checklist and routing review'
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const trashEmailPreviewsById = {
  ...emailPreviewsById,
  'trash-archive': {
    id: 'trash-archive',
    folderId: 'trash',
    html: '<p>This alert was deleted after the deployment was verified.</p>',
    receivedAt: 'Jun 18, 8:06 AM',
    recipientEmail: 'support@agentteam.test',
    senderEmail: 'alerts@example.test',
    senderName: 'Old Alert',
    subject: 'Expired deployment alert'
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

const junkMessageActions = [
  {
    action: 'mark-not-spam',
    group: 'organization',
    iconKey: 'mark-not-spam',
    label: 'Mark as not spam',
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
    action: 'delete',
    group: 'utility',
    iconKey: 'delete',
    label: 'Delete',
    section: 'end'
  }
] satisfies ReadonlyArray<AuthenticatedEmailToolbarAction>

export const junkActionEmailPreviewsById = {
  ...emailPreviewsById,
  'blocked-images': {
    ...emailPreviewsById['blocked-images'],
    actions: junkMessageActions,
    folderId: 'junk'
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

const trashMessageActions = [
  {
    action: 'restore',
    group: 'organization',
    iconKey: 'restore',
    label: 'Restore',
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
    action: 'delete',
    group: 'utility',
    iconKey: 'delete',
    label: 'Delete permanently',
    section: 'end'
  }
] satisfies ReadonlyArray<AuthenticatedEmailToolbarAction>

export const trashActionEmailPreviewsById = {
  ...trashEmailPreviewsById,
  'trash-archive': {
    ...trashEmailPreviewsById['trash-archive'],
    actions: trashMessageActions
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const customFolderEmailPreviewsById = {
  ...emailPreviewsById,
  'archive-routing-review': {
    id: 'archive-routing-review',
    folderId: 'archive',
    html: '<p>This completed routing review is stored in the custom Archive mailbox.</p>',
    receivedAt: 'Jun 12, 3:31 PM',
    recipientEmail: 'support@agentteam.test',
    senderEmail: 'updates@provider.example',
    senderName: 'Provider Portal',
    subject: 'Archived routing review'
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const unreadMessageEmailPreviewsById = {
  ...emailPreviewsById,
  'appointment-alert': {
    ...emailPreviewsById['appointment-alert'],
    actions: defaultAuthenticatedEmailToolbarActions.map((action) =>
      action.action === 'mark-unread'
        ? {
            ...action,
            action: 'mark-read',
            iconKey: 'mark-read',
            label: 'Mark as read'
          }
        : action
    ),
    isUnread: true
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const unsafeExternalLinkEmailPreviewsById = {
  ...emailPreviewsById,
  'blocked-images': {
    ...emailPreviewsById['blocked-images'],
    externalLinks: [
      {
        id: 'link-1',
        host: 'unsupported destination',
        text: 'the provider portal',
        url: 'javascript:alert(1)'
      },
      ...(emailPreviewsById['blocked-images'].externalLinks ?? []).filter((link) => link.id !== 'link-1')
    ]
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const mailtoLinkSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'mailto-link-message'
} satisfies AuthenticatedSidebarView

export const mailtoLinkEmailPreviewsById = {
  ...emailPreviewsById,
  'mailto-link-message': {
    id: 'mailto-link-message',
    senderName: 'Provider Portal',
    senderEmail: 'updates@provider.example',
    recipientEmail: 'support@agentteam.test',
    subject: 'Contact support by email',
    receivedAt: 'Today at 11:08 AM',
    html: '<p>Need follow-up?</p><p><a href="mailto:support@example.test?subject=Routing%20review">Email support</a></p>'
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const externalLinkCollisionSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'external-link-collision-message'
} satisfies AuthenticatedSidebarView

export const externalLinkCollisionEmailPreviewsById = {
  ...emailPreviewsById,
  'external-link-collision-message': {
    id: 'external-link-collision-message',
    senderName: 'Provider Portal',
    senderEmail: 'updates@provider.example',
    recipientEmail: 'support@agentteam.test',
    subject: 'External link collision handling',
    receivedAt: 'Today at 11:16 AM',
    html: [
      '<p><a href="https://docs.example.test/path">Generated docs link</a></p>',
      '<p><a href="#agent-mail-external-link-1" data-agent-mail-external-link-id="link-1">Controller link</a></p>'
    ].join(''),
    externalLinks: [
      {
        id: 'generated-link-1',
        host: 'reserved.example.test',
        text: 'reserved generated link',
        url: 'https://reserved.example.test/'
      },
      {
        id: 'link-1',
        host: 'controller.example.test',
        text: 'controller link',
        url: 'https://controller.example.test/path'
      }
    ]
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const formEmailSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'form-message'
} satisfies AuthenticatedSidebarView

export const formEmailPreviewsById = {
  ...emailPreviewsById,
  'form-message': {
    id: 'form-message',
    senderName: 'Provider Portal',
    senderEmail: 'updates@provider.example',
    recipientEmail: 'support@agentteam.test',
    subject: 'Form in email body',
    receivedAt: 'Today at 11:22 AM',
    html: [
      '<p>Please do not submit credentials from an email.</p>',
      '<form action="https://phish.example.test/login" method="post" target="_blank">',
      '<label>Email <input name="email" required autofocus></label>',
      '<button formaction="https://phish.example.test/pay">Submit</button>',
      '</form>'
    ].join('')
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const remoteBackgroundImagesSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'remote-background-images-message'
} satisfies AuthenticatedSidebarView

export const remoteBackgroundImagesEmailPreviewsById = {
  ...emailPreviewsById,
  'remote-background-images-message': {
    id: 'remote-background-images-message',
    senderName: 'Provider Portal',
    senderEmail: 'updates@provider.example',
    recipientEmail: 'support@agentteam.test',
    subject: 'Background image tracking',
    receivedAt: 'Today at 11:38 AM',
    html: [
      '<table background="https://assets.provider.example/tracker-table.png">',
      '<tr><td style="background-image: url(https://assets.provider.example/tracker-cell.png); color: #111827">',
      'Background image content',
      '</td></tr>',
      '</table>'
    ].join(''),
    remoteImages: [
      {
        id: 'background-table',
        host: 'assets.provider.example',
        url: 'https://assets.provider.example/tracker-table.png'
      },
      {
        id: 'background-cell',
        host: 'assets.provider.example',
        url: 'https://assets.provider.example/tracker-cell.png'
      }
    ]
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const documentResourceSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'document-resource-message'
} satisfies AuthenticatedSidebarView

export const documentResourceEmailPreviewsById = {
  ...emailPreviewsById,
  'document-resource-message': {
    id: 'document-resource-message',
    senderName: 'Provider Portal',
    senderEmail: 'updates@provider.example',
    recipientEmail: 'support@agentteam.test',
    subject: 'Document resource controls',
    receivedAt: 'Today at 11:44 AM',
    html: [
      '<base href="https://wildduck.example.test/">',
      '<meta http-equiv="refresh" content="0; url=https://wildduck.example.test/session">',
      '<link rel="stylesheet" href="https://wildduck.example.test/email.css">',
      '<p>Document resource content</p>',
      '<script><img src="https://wildduck.example.test/script-pixel.png"></script>',
      '<iframe src="https://wildduck.example.test/frame">iframe fallback</iframe>',
      '<object data="https://wildduck.example.test/object">object fallback</object>',
      '<embed src="https://wildduck.example.test/embed">'
    ].join('')
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const accountSwitchingSidebarView = {
  ...emailPreviewSidebarView,
  activeAccountId: 'agent-support',
  accounts: [
    {
      id: 'agent-support',
      name: 'Support Agent',
      address: 'support@agentteam.test',
      description: 'Primary customer replies'
    },
    {
      id: 'agent-billing',
      name: 'Billing Agent',
      address: 'billing@agentteam.test',
      description: 'Invoices and account notices'
    },
    {
      id: 'agent-alerts',
      name: 'Alerts Agent',
      address: 'alerts@agentteam.test',
      description: 'System notifications',
      state: 'attention'
    }
  ],
  filterMode: 'server'
} satisfies AuthenticatedSidebarView

export const accountScopedRemoteImagesSidebarView = {
  ...blockedImagesSidebarView,
  accounts: accountSwitchingSidebarView.accounts,
  activeAccountId: 'agent-support',
  filterMode: 'server'
} satisfies AuthenticatedSidebarView

export const accountPermissionsSidebarView = {
  ...accountSwitchingSidebarView,
  accounts: [
    {
      id: 'agent-support',
      name: 'Support Agent',
      address: 'support@agentteam.test',
      description: 'Primary customer replies'
    },
    {
      id: 'agent-finance',
      name: 'Finance Agent',
      address: 'finance@agentteam.test',
      description: 'Billing mailbox',
      disabled: true,
      disabledReason: 'No mailbox permission'
    },
    {
      id: 'agent-importing',
      name: 'Importing Agent',
      address: 'importing@agentteam.test',
      description: 'Provisioning mailbox access',
      state: 'loading'
    }
  ]
} satisfies AuthenticatedSidebarView

const customFolderActions = [
  {
    action: 'rename-folder',
    label: 'Rename folder'
  },
  {
    action: 'delete-folder',
    label: 'Delete folder'
  }
] satisfies NonNullable<AuthenticatedSidebarView['navMain'][number]['actions']>

export const customFolderSidebarView = {
  ...accountSwitchingSidebarView,
  activeItemId: 'archive',
  emptyDescription: 'Archived WildDuck messages for this mailbox will appear here.',
  emptyTitle: 'No archived messages',
  mails: [
    {
      id: 'archive-routing-review',
      date: 'Jun 12',
      email: 'updates@provider.example',
      folderId: 'archive',
      name: 'Provider Portal',
      subject: 'Archived routing review',
      teaser: 'This completed routing review is stored in the custom Archive mailbox.'
    }
  ],
  navMain: [
    ...accountSwitchingSidebarView.navMain,
    {
      actions: customFolderActions,
      id: 'archive',
      title: 'Archive',
      url: '#',
      iconKey: 'folder',
      badgeLabel: '42'
    }
  ],
  selectedMailId: 'archive-routing-review'
} satisfies AuthenticatedSidebarView

const protectedFolderActions = [
  {
    action: 'rename-folder',
    label: 'Rename folder',
    disabled: true,
    disabledReason: 'System folder managed by WildDuck'
  },
  {
    action: 'delete-folder',
    label: 'Delete folder',
    disabled: true,
    disabledReason: 'System folder managed by WildDuck'
  }
] satisfies NonNullable<AuthenticatedSidebarView['navMain'][number]['actions']>

export const protectedFolderActionSidebarView = {
  ...accountSwitchingSidebarView,
  navMain: accountSwitchingSidebarView.navMain.map((item) =>
    item.id === 'inbox'
      ? {
          ...item,
          actions: protectedFolderActions
        }
      : item
  )
} satisfies AuthenticatedSidebarView

const folderCreateView = {
  description: 'Create a WildDuck mailbox folder for this account.',
  name: '',
  placeholder: 'Projects',
  state: 'closed',
  submitLabel: 'Create folder',
  title: 'Create folder',
  triggerLabel: 'Create folder'
} satisfies NonNullable<AuthenticatedSidebarView['folderCreate']>

export const folderCreateSidebarView = {
  ...customFolderSidebarView,
  folderCreate: folderCreateView
} satisfies AuthenticatedSidebarView

export const folderCreateOpenSidebarView = {
  ...customFolderSidebarView,
  folderCreate: {
    ...folderCreateView,
    name: 'Projects',
    state: 'open'
  }
} satisfies AuthenticatedSidebarView

export const folderCreateSubmittingSidebarView = {
  ...customFolderSidebarView,
  folderCreate: {
    ...folderCreateView,
    isSubmitting: true,
    name: 'Vendor notices',
    state: 'open',
    submitLabel: 'Creating folder'
  }
} satisfies AuthenticatedSidebarView

export const folderCreateErrorSidebarView = {
  ...customFolderSidebarView,
  folderCreate: {
    ...folderCreateView,
    errorMessage: 'WildDuck already has a folder named Projects.',
    name: 'Projects',
    state: 'open'
  }
} satisfies AuthenticatedSidebarView

const folderRenameView = {
  description: 'Rename the WildDuck mailbox folder for this account.',
  folderId: 'archive',
  name: 'Archive',
  placeholder: 'Archive',
  state: 'closed',
  submitLabel: 'Rename folder',
  title: 'Rename folder'
} satisfies NonNullable<AuthenticatedSidebarView['folderRename']>

export const folderRenameOpenSidebarView = {
  ...customFolderSidebarView,
  folderRename: {
    ...folderRenameView,
    state: 'open'
  }
} satisfies AuthenticatedSidebarView

export const folderRenameSubmittingSidebarView = {
  ...customFolderSidebarView,
  folderRename: {
    ...folderRenameView,
    isSubmitting: true,
    name: 'Provider Archive',
    state: 'open',
    submitLabel: 'Renaming folder'
  }
} satisfies AuthenticatedSidebarView

export const folderRenameErrorSidebarView = {
  ...customFolderSidebarView,
  folderRename: {
    ...folderRenameView,
    errorMessage: 'WildDuck could not rename this folder because it no longer exists.',
    name: 'Provider Archive',
    state: 'open'
  }
} satisfies AuthenticatedSidebarView

const folderDeleteView = {
  confirmLabel: 'Delete folder',
  description:
    'Delete the Archive folder from this mailbox. Move or archive messages elsewhere before deleting the folder.',
  folderId: 'archive',
  state: 'closed',
  title: 'Delete Archive folder?'
} satisfies NonNullable<AuthenticatedSidebarView['folderDelete']>

export const folderDeleteOpenSidebarView = {
  ...customFolderSidebarView,
  folderDelete: {
    ...folderDeleteView,
    state: 'open'
  }
} satisfies AuthenticatedSidebarView

export const folderDeleteSubmittingSidebarView = {
  ...customFolderSidebarView,
  folderDelete: {
    ...folderDeleteView,
    confirmLabel: 'Deleting folder',
    isSubmitting: true,
    state: 'open'
  }
} satisfies AuthenticatedSidebarView

export const folderDeleteErrorSidebarView = {
  ...customFolderSidebarView,
  folderDelete: {
    ...folderDeleteView,
    errorMessage: 'WildDuck rejected the delete because the folder still contains messages.',
    state: 'open'
  }
} satisfies AuthenticatedSidebarView

export const paginatedMailboxSidebarView = {
  ...accountSwitchingSidebarView,
  pagination: {
    canGoNext: true,
    canGoPrevious: true,
    nextCursor: 'next-cursor-page-3',
    previousCursor: 'previous-cursor-page-1',
    rangeLabel: '51-75',
    totalLabel: '235 messages'
  }
} satisfies AuthenticatedSidebarView

export const paginatedMailboxLoadingSidebarView = {
  ...paginatedMailboxSidebarView,
  pagination: {
    ...paginatedMailboxSidebarView.pagination,
    state: 'loading'
  }
} satisfies AuthenticatedSidebarView

export const draftSidebarView = {
  ...accountSwitchingSidebarView,
  activeItemId: 'drafts',
  mails: [
    {
      id: 'draft-reply',
      name: 'Draft',
      email: 'support@agentteam.test',
      isDraft: true,
      subject: 'Re: Deployment checklist and routing review',
      date: 'Saved 2m ago',
      teaser: 'Thanks for the notes. I am checking the routing values now.'
    },
    ...emailPreviewMails
  ],
  selectedMailId: 'draft-reply'
} satisfies AuthenticatedSidebarView

export const draftEmailPreviewsById = {
  ...emailPreviewsById,
  'draft-reply': {
    id: 'draft-reply',
    draftId: 'draft-reply',
    folderId: 'drafts',
    isDraft: true,
    senderName: 'Support Agent',
    senderEmail: 'support@agentteam.test',
    recipientEmail: 'updates@provider.example',
    subject: 'Re: Deployment checklist and routing review',
    receivedAt: 'Saved 2 minutes ago',
    html: '<p>Thanks for the notes. I am checking the routing values now.</p>'
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

const draftMessageToolbarActions = [
  {
    action: 'back',
    group: 'navigation',
    iconKey: 'back',
    label: 'Back to list',
    section: 'start'
  },
  {
    action: 'send-draft',
    group: 'response',
    iconKey: 'send-draft',
    label: 'Send draft',
    section: 'start'
  },
  {
    action: 'edit-draft',
    group: 'response',
    iconKey: 'edit-draft',
    label: 'Edit draft',
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
    action: 'discard-draft',
    group: 'utility',
    iconKey: 'discard-draft',
    label: 'Discard draft',
    section: 'end'
  }
] satisfies ReadonlyArray<AuthenticatedEmailToolbarAction>

export const draftToolbarEmailPreviewsById = {
  ...draftEmailPreviewsById,
  'draft-reply': {
    ...draftEmailPreviewsById['draft-reply'],
    actions: draftMessageToolbarActions
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const attachmentSidebarView = {
  ...accountSwitchingSidebarView,
  selectedMailId: 'attachment-message'
} satisfies AuthenticatedSidebarView

export const attachmentEmailPreviewsById = {
  ...emailPreviewsById,
  'attachment-message': {
    id: 'attachment-message',
    senderName: 'Build System',
    senderEmail: 'builds@example.test',
    recipientEmail: 'support@agentteam.test',
    subject: 'Release artifact bundle',
    receivedAt: 'Today at 10:18 AM',
    html: '<p>The release artifact bundle is attached for review.</p>',
    attachments: [
      {
        id: 'attachment-manifest',
        filename: 'manifest.json',
        mimetype: 'application/json',
        sizeLabel: '8 KB',
        url: '/rpc/mail/accounts/agent-support/mailboxes/inbox/messages/attachment-message/attachments/attachment-manifest'
      },
      {
        id: 'attachment-preview',
        filename: 'preview.png',
        mimetype: 'image/png',
        sizeLabel: '94 KB',
        url: '/rpc/mail/accounts/agent-support/mailboxes/inbox/messages/attachment-message/attachments/attachment-preview'
      },
      {
        id: 'attachment-log',
        filename: 'wildduck-source.eml',
        mimetype: 'text/plain',
        sizeLabel: '42 KB',
        url: 'https://wildduck.example.test/users/agent-support/attachments/attachment-log'
      }
    ]
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const inlineAttachmentSidebarView = {
  ...accountSwitchingSidebarView,
  selectedMailId: 'inline-attachment-message'
} satisfies AuthenticatedSidebarView

export const inlineAttachmentEmailPreviewsById = {
  ...emailPreviewsById,
  'inline-attachment-message': {
    id: 'inline-attachment-message',
    senderName: 'Provider Portal',
    senderEmail: 'updates@provider.example',
    recipientEmail: 'support@agentteam.test',
    subject: 'Inline attachment rendering',
    receivedAt: 'Today at 10:42 AM',
    html: [
      '<p>The provider logo is inline in the message body.</p>',
      '<img src="cid:provider-logo%40provider.example" alt="Provider logo">',
      '<img src="cid:unsafe-inline@provider.example" alt="Unsafe inline image">'
    ].join(''),
    attachments: [
      {
        id: 'inline-provider-logo',
        contentId: '<provider-logo@provider.example>',
        disposition: 'inline',
        filename: 'provider-logo.png',
        mimetype: 'image/png',
        sizeLabel: '14 KB',
        url: '/rpc/mail/accounts/agent-support/mailboxes/inbox/messages/inline-attachment-message/attachments/inline-provider-logo'
      },
      {
        id: 'inline-unsafe-image',
        contentId: 'unsafe-inline@provider.example',
        disposition: 'inline',
        filename: 'unsafe-inline.png',
        mimetype: 'image/png',
        sizeLabel: '10 KB',
        url: 'https://wildduck.example.test/users/agent-support/attachments/inline-unsafe-image'
      }
    ]
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

const pendingMoveActions = defaultAuthenticatedEmailToolbarActions.map((action) =>
  action.action === 'move'
    ? {
        ...action,
        pending: true
      }
    : action
)

export const pendingActionSidebarView = {
  ...accountSwitchingSidebarView,
  selectedMailId: 'blocked-images'
} satisfies AuthenticatedSidebarView

export const pendingActionEmailPreviewsById = {
  ...emailPreviewsById,
  'blocked-images': {
    ...emailPreviewsById['blocked-images'],
    actions: pendingMoveActions
  }
} satisfies Readonly<Record<string, AuthenticatedEmailPreview>>

export const composeDraftView = {
  body: 'Thanks for sending this over. I will confirm once the WildDuck folder sync has finished.',
  canSaveDraft: true,
  canSend: true,
  cc: '',
  mode: 'reply',
  state: 'open',
  subject: 'Re: Deployment checklist and routing review',
  title: 'Reply',
  to: 'updates@provider.example'
} satisfies DashboardScreenProps['composeView']

export const composeSelectedAccountView = {
  ...composeDraftView,
  fromAddress: 'support@agentteam.test',
  fromLabel: 'Support Agent'
} satisfies DashboardScreenProps['composeView']

export const composeSavedDraftView = {
  ...composeSelectedAccountView,
  draftId: 'draft-reply',
  draftStatusLabel: 'Saved to WildDuck Drafts 2 minutes ago',
  title: 'Draft reply'
} satisfies DashboardScreenProps['composeView']

export const composeSendingView = {
  ...composeDraftView,
  isSending: true,
  title: 'Sending reply'
} satisfies DashboardScreenProps['composeView']

export const composeSavingDraftView = {
  ...composeDraftView,
  isSavingDraft: true,
  title: 'Saving draft'
} satisfies DashboardScreenProps['composeView']

export const composeReplyAllView = {
  ...composeDraftView,
  cc: 'ops-lead@example.test, delivery@example.test',
  mode: 'reply-all',
  title: 'Reply all'
} satisfies DashboardScreenProps['composeView']

export const composeForwardView = {
  bcc: '',
  body: [
    'Can you review the routing notes below before we confirm the customer response?',
    '',
    '---------- Forwarded message ---------',
    'From: Provider Portal <updates@provider.example>',
    'Subject: Deployment checklist and routing review'
  ].join('\n'),
  canSaveDraft: true,
  canSend: true,
  cc: '',
  mode: 'forward',
  state: 'open',
  subject: 'Fwd: Deployment checklist and routing review',
  title: 'Forward message',
  to: 'ops-lead@example.test'
} satisfies DashboardScreenProps['composeView']

export const composeDraftSaveErrorView = {
  ...composeDraftView,
  canSaveDraft: true,
  errorMessage: 'Draft could not be saved. Keep this compose window open and try again.',
  title: 'Reply'
} satisfies DashboardScreenProps['composeView']

export const composeValidationErrorView = {
  ...composeDraftView,
  body: '',
  fieldErrors: {
    body: 'Message body is required before sending.',
    to: 'Use a valid recipient address.'
  },
  title: 'Reply with validation errors',
  to: 'updates@'
} satisfies DashboardScreenProps['composeView']

export const composeWithAttachmentsView = {
  ...composeDraftView,
  attachments: [
    {
      id: 'compose-attachment-checklist',
      filename: 'routing-checklist.pdf',
      mimetype: 'application/pdf',
      sizeLabel: '186 KB'
    },
    {
      id: 'compose-attachment-log',
      filename: 'wildduck-delivery-log.txt',
      mimetype: 'text/plain',
      sizeLabel: '12 KB'
    }
  ],
  title: 'Reply with attachments'
} satisfies DashboardScreenProps['composeView']

export const composeAttachmentUploadStatusView = {
  ...composeDraftView,
  attachments: [
    {
      id: 'compose-attachment-uploading',
      filename: 'provider-log.csv',
      mimetype: 'text/csv',
      sizeLabel: '42 KB',
      status: 'uploading',
      statusLabel: 'Uploading'
    },
    {
      id: 'compose-attachment-error',
      filename: 'large-export.zip',
      mimetype: 'application/zip',
      sizeLabel: '28 MB',
      status: 'error',
      statusLabel: 'Upload failed'
    },
    {
      id: 'compose-attachment-ready',
      filename: 'routing-summary.txt',
      mimetype: 'text/plain',
      sizeLabel: '4 KB',
      status: 'ready',
      statusLabel: 'Ready'
    }
  ],
  title: 'Reply with attachment status'
} satisfies DashboardScreenProps['composeView']

export const moveToSpamActionView = {
  move: {
    description: 'Choose the WildDuck folder that should receive this message.',
    folders: [
      {
        id: 'inbox',
        title: 'Inbox',
        description: 'Primary incoming messages'
      },
      {
        id: 'junk',
        title: 'Junk',
        description: 'Mark as spam by moving to Junk'
      },
      {
        id: 'trash',
        title: 'Trash',
        description: 'Messages waiting for deletion'
      }
    ],
    selectedFolderId: 'junk',
    state: 'open',
    submitLabel: 'Move to Junk',
    title: 'Move message'
  }
} satisfies DashboardScreenProps['mailActionView']

export const moveDisabledTargetActionView = {
  move: {
    ...moveToSpamActionView.move,
    folders: [
      {
        id: 'inbox',
        title: 'Inbox',
        description: 'Primary incoming messages',
        disabled: true,
        disabledReason: 'Message is already in Inbox'
      },
      ...(moveToSpamActionView.move?.folders ?? []).filter((folder) => folder.id !== 'inbox')
    ],
    selectedFolderId: 'inbox',
    submitLabel: 'Move to Inbox'
  }
} satisfies DashboardScreenProps['mailActionView']

export const moveActionSubmittingView = {
  move: {
    ...moveToSpamActionView.move,
    isSubmitting: true,
    submitLabel: 'Moving'
  }
} satisfies DashboardScreenProps['mailActionView']

export const moveActionErrorView = {
  move: {
    ...moveToSpamActionView.move,
    errorMessage: 'Message could not be moved. The mailbox may have changed; refresh and try again.'
  }
} satisfies DashboardScreenProps['mailActionView']

export const deleteMessageActionView = {
  delete: {
    confirmLabel: 'Delete message',
    description: 'This removes the message from the selected WildDuck folder.',
    state: 'open',
    title: 'Delete this message?'
  }
} satisfies DashboardScreenProps['mailActionView']

export const deleteMessageSubmittingActionView = {
  delete: {
    ...deleteMessageActionView.delete,
    isSubmitting: true
  }
} satisfies DashboardScreenProps['mailActionView']

export const originalSourceActionView = {
  originalSource: {
    description: 'WildDuck reconstructed RFC822 source for the selected message.',
    downloadLabel: 'Download .eml',
    source: [
      'From: Provider Portal <updates@provider.example>',
      'To: Support Agent <support@agentteam.test>',
      'Subject: Deployment checklist and routing review',
      'Message-ID: <storybook-original-source@example.test>',
      'Date: Mon, 22 Jun 2026 09:22:00 +0000',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Thanks for checking out the deployment notes.</p>'
    ].join('\r\n'),
    state: 'open',
    title: 'Original source'
  }
} satisfies DashboardScreenProps['mailActionView']

export const originalSourceEvidenceActionView = {
  originalSource: {
    description: 'Backend-provided source, provenance, security evidence, and raw headers.',
    downloadLabel: 'Download evidence bundle',
    evidence: [
      {
        id: 'spf',
        label: 'SPF',
        status: 'pass',
        value: 'pass',
        description: 'Cloudflare edge Authentication-Results verdict'
      },
      {
        id: 'archive-status',
        label: 'Archive status',
        status: 'neutral',
        value: 'available'
      },
      {
        id: 'wildduck-uid',
        label: 'WildDuck UID',
        value: '981'
      }
    ],
    authenticationHeaders: [
      {
        id: 'cloudflare-auth-results',
        methods: [
          {
            id: 'cloudflare-auth-results-spf',
            method: 'spf',
            result: 'pass'
          },
          {
            id: 'cloudflare-auth-results-dkim',
            method: 'dkim',
            result: 'pass'
          }
        ],
        raw: 'Authentication-Results: mx.cloudflare.net; spf=pass smtp.mailfrom=sender@example.net',
        sourceLabel: 'Cloudflare edge evidence from verified archived raw.eml',
        title: 'mx.cloudflare.net'
      },
      {
        id: 'wildduck-local-auth-results',
        methods: [
          {
            id: 'wildduck-local-auth-results-dkim',
            method: 'dkim',
            result: 'pass'
          }
        ],
        raw: 'Authentication-Results: haraka.agent-mail.test; dkim=pass header.d=sender.example',
        sourceLabel: 'Haraka/WildDuck local replay, not original internet authentication',
        title: 'haraka.agent-mail.test'
      }
    ],
    headerSections: [
      {
        id: 'cloudflare-archived-headers',
        description: 'Headers parsed from the verified archived raw message.',
        headers: [
          {
            layer: 'Cloudflare edge evidence',
            name: 'Authentication-Results',
            value: 'mx.cloudflare.net; spf=pass smtp.mailfrom=sender@example.net'
          },
          {
            layer: 'Cloudflare edge evidence',
            name: 'X-CF-Trace',
            value: 'one'
          },
          {
            layer: 'Cloudflare edge evidence',
            name: 'X-CF-Trace',
            value: 'two'
          }
        ],
        title: 'Cloudflare Archived Raw Headers'
      },
      {
        id: 'final-wildduck-headers',
        description: 'Headers parsed from the final WildDuck source.',
        headers: [
          {
            layer: 'Haraka/WildDuck local replay',
            name: 'Authentication-Results',
            value: 'haraka.agent-mail.test; dkim=pass header.d=sender.example'
          },
          {
            layer: 'Agent Mail replay provenance',
            name: 'X-ATMCF-Edge-Status',
            value: 'received'
          }
        ],
        title: 'Final WildDuck Source Headers'
      }
    ],
    rawSources: [
      {
        id: 'archived-raw-source',
        source:
          'Authentication-Results: mx.cloudflare.net; spf=pass smtp.mailfrom=sender@example.net\r\nX-CF-Trace: one\r\nX-CF-Trace: two\r\n\r\nbody',
        title: 'Cloudflare Archived Raw Source'
      },
      {
        id: 'final-wildduck-source',
        source:
          'Authentication-Results: haraka.agent-mail.test; dkim=pass header.d=sender.example\r\nX-ATMCF-Edge-Status: received\r\n\r\nbody',
        title: 'Final WildDuck Raw Source'
      }
    ],
    state: 'open',
    title: 'Original source and evidence'
  }
} satisfies DashboardScreenProps['mailActionView']

export const originalSourceLoadingActionView = {
  originalSource: {
    ...originalSourceActionView.originalSource,
    isLoading: true,
    source: undefined
  }
} satisfies DashboardScreenProps['mailActionView']

export const originalSourceErrorActionView = {
  originalSource: {
    ...originalSourceActionView.originalSource,
    errorMessage: 'Original source could not be loaded from WildDuck.',
    source: undefined
  }
} satisfies DashboardScreenProps['mailActionView']
