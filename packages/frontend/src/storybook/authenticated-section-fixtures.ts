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
import { authenticatedSettingsRouteState, storyPublicEnv } from './screen-fixtures'
import type { DashboardScreenProps } from '../screens/dashboard-screen'
import type {
  AuthenticatedDashboardView,
  AuthenticatedEmailPreview,
  AuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'

export const authenticatedSectionBaseArgs = {
  dashboardView: defaultAuthenticatedDashboardView,
  publicEnv: storyPublicEnv,
  routeState: authenticatedSettingsRouteState,
  sessionCleanupEnabled: false
} satisfies Pick<DashboardScreenProps, 'dashboardView' | 'publicEnv' | 'routeState' | 'sessionCleanupEnabled'>

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
