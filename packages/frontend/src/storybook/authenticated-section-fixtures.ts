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
import type {
  DomainSettingsState,
  DomainSettingsStatus
} from '../partials/authenticated/settings-dialog'
import type {
  AuthenticatedDashboardView,
  AuthenticatedEmailPreview,
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

const connectedCloudflareAccounts = [
  {
    id: '3d6f2b2d8e2a49a2bb6f2fb97e4c9d17',
    name: 'AgentTeam Production',
    type: 'standard'
  }
] satisfies DomainSettingsState['accounts']

const connectedCloudflareZones = [
  {
    accountId: '3d6f2b2d8e2a49a2bb6f2fb97e4c9d17',
    accountName: 'AgentTeam Production',
    id: '0f8b5f1816a946f28d263671a8f5e4aa',
    name: 'agentteam.example',
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
  r2BucketName: null,
  workerScriptName: null,
  status: 'provisioning',
  provisioningStatus: 'pending',
  lastProvisionedAt: null,
  lastErrorMessage: null,
  updatedAt: new Date('2026-06-21T16:18:00.000Z')
} satisfies CloudflareConnectionFixture

const liveCloudflareConnection = {
  ...pendingCloudflareConnection,
  r2BucketName: 'agent-mail-archive-production',
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
  selectedZoneId: connectedCloudflareZones[0]?.id,
  status: {
    connections: [],
    grants: [activeCloudflareGrant]
  },
  zones: connectedCloudflareZones
} satisfies DomainSettingsState

export const domainSettingsDomainConnectedState = {
  ...domainSettingsAddDomainSelectZoneState,
  mode: 'domain',
  selectedDomainPublicId: connectedCloudflareConnection.publicId,
  status: {
    connections: [connectedCloudflareConnection],
    grants: [activeCloudflareGrant]
  }
} satisfies DomainSettingsState

export const domainSettingsDomainProvisioningState = {
  ...domainSettingsAddDomainSelectZoneState,
  message: 'Domain provisioning is queued for Cloudflare.',
  mode: 'domain',
  selectedDomainPublicId: pendingCloudflareConnection.publicId,
  status: {
    connections: [pendingCloudflareConnection],
    grants: [activeCloudflareGrant]
  }
} satisfies DomainSettingsState

export const domainSettingsDomainLiveState = {
  ...domainSettingsAddDomainSelectZoneState,
  message: 'Agent email is live for mailboxes on agentteam.example.',
  mode: 'domain',
  selectedDomainPublicId: liveCloudflareConnection.publicId,
  status: {
    connections: [liveCloudflareConnection],
    grants: [activeCloudflareGrant]
  }
} satisfies DomainSettingsState

export const domainSettingsDomainNeedsAttentionState = {
  ...domainSettingsAddDomainSelectZoneState,
  mode: 'domain',
  selectedDomainPublicId: degradedCloudflareConnection.publicId,
  status: {
    connections: [degradedCloudflareConnection],
    grants: [activeCloudflareGrant]
  }
} satisfies DomainSettingsState

export const domainSettingsDenseDomainListState = {
  ...domainSettingsAddDomainSelectZoneState,
  mode: 'domain',
  selectedDomainPublicId: denseCloudflareConnections[0]?.publicId,
  status: {
    connections: denseCloudflareConnections,
    grants: [activeCloudflareGrant]
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
    teaser:
      'Dear [[FirstName]], welcome to [[CompanyName]]. You can log in to your account with your username.'
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

export const welcomeEmailSidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'welcome-email'
} satisfies AuthenticatedSidebarView

export const conversationThreadSidebarView = {
  ...emailPreviewSidebarView,
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

export const unreadOnlySidebarView = {
  ...emailPreviewSidebarView,
  selectedMailId: 'appointment-alert',
  unreadOnly: true
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
