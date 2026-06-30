import allowedRemoteImagesHtml from './fixtures/emails/allowed-remote-images.fixture?raw'
import appointmentAlertEmailHtml from './fixtures/emails/appointment-alert.fixture?raw'
import conversationLatestHtml from './fixtures/emails/conversation-latest.fixture?raw'
import conversationOriginalHtml from './fixtures/emails/conversation-original.fixture?raw'
import welcomeEmailHtml from './fixtures/emails/welcome-email.fixture?raw'
import type { AgentMailWebWorkspace } from '@main/backend'

type MailWorkspace = AgentMailWebWorkspace
type MailAccount = MailWorkspace['accounts'][number]
type MailAttachment = NonNullable<MailWorkspace['selectedMessage']>['attachments'][number]
type MailFolder = MailWorkspace['folders'][number]
type MailMessageDetail = NonNullable<MailWorkspace['selectedMessage']>
type MailMessageSummary = MailWorkspace['messages'][number]
type MailThreadMessage = NonNullable<MailMessageDetail['thread']>[number]

const supportAccount = {
  address: 'support@agentteam.test',
  description: 'Primary customer replies',
  id: 'agent-support',
  name: 'Support Agent',
  state: 'ready'
} satisfies MailAccount

const billingAccount = {
  address: 'billing@agentteam.test',
  description: 'Invoices and account notices',
  id: 'agent-billing',
  name: 'Billing Agent',
  state: 'ready'
} satisfies MailAccount

const alertsAccount = {
  address: 'alerts@agentteam.test',
  description: 'System notifications',
  id: 'agent-alerts',
  name: 'Alerts Agent',
  state: 'ready'
} satisfies MailAccount

const disabledFinanceAccount = {
  address: 'finance@agentteam.test',
  description: 'Billing mailbox',
  id: 'agent-finance',
  name: 'Finance Agent',
  state: 'disabled'
} satisfies MailAccount

const inboxFolder = systemFolder('inbox', 'Inbox', 'INBOX', '\\Inbox', 16, 3)
const draftsFolder = systemFolder('drafts', 'Drafts', 'Drafts', '\\Drafts', 1, 0)
const sentFolder = systemFolder('sent', 'Sent', 'Sent', '\\Sent', 18, 0)
const junkFolder = systemFolder('junk', 'Junk', 'Junk', '\\Junk', 4, 1)
const trashFolder = systemFolder('trash', 'Trash', 'Trash', '\\Trash', 2, 0)
const archiveFolder = {
  id: 'archive',
  name: 'Archive',
  path: 'Archive',
  protected: false,
  specialUse: '\\Archive',
  total: 42,
  unread: 42
} satisfies MailFolder

const baseFolders = [inboxFolder, draftsFolder, sentFolder, junkFolder, trashFolder, archiveFolder]
const baseAccounts = [supportAccount, billingAccount, alertsAccount]

const appointmentMessage = createMessageDetail({
  from: 'Ricardo Freire <templates@crafting.email>',
  html: appointmentAlertEmailHtml,
  id: 'appointment-alert',
  isUnread: true,
  receivedAt: '2026-06-22T16:34:00.000Z',
  replyTo: ['templates@crafting.email'],
  subject: 'Appointment alert',
  teaser:
    'Just a friendly reminder that we have an upcoming appointment. Date: DD-MM-YYYY. Duration: 30 minutes.',
  to: ['Support Agent <support@agentteam.test>']
})

const welcomeMessage = createMessageDetail({
  from: 'Mailjet Templates <templates@mailjet.example>',
  html: welcomeEmailHtml,
  id: 'welcome-email',
  isStarred: true,
  receivedAt: '2026-06-21T18:05:00.000Z',
  subject: 'Welcome aboard',
  teaser: 'Dear [[FirstName]], welcome to [[CompanyName]]. You can log in with your email.',
  to: ['Support Agent <support@agentteam.test>']
})

const blockedImagesMessage = createMessageDetail({
  from: 'Provider Portal <updates@provider.example>',
  html: [
    '<p>Thanks for checking out the deployment notes.</p>',
    '<img src="https://assets.provider.example/launch-banner.png" alt="Remote launch banner" height="120" width="320">',
    '<p>Review the rollout checklist at <a href="https://dash.cloudflare.com/provider/example">the provider portal</a>.</p>'
  ].join(''),
  id: 'blocked-images',
  isUnread: true,
  receivedAt: '2026-06-20T16:22:00.000Z',
  replyTo: ['updates@provider.example'],
  subject: 'Deployment checklist and routing review',
  teaser: 'Review the rollout checklist at the provider portal.',
  to: ['Support Agent <support@agentteam.test>']
})

const blockedImagesAllowedMessage = createMessageDetail({
  ...messageInputFromDetail(blockedImagesMessage),
  html: allowedRemoteImagesHtml,
  id: 'blocked-images-allowed'
})

const conversationOriginalMessage = createThreadMessage({
  from: 'AgentTeam Email <info@agentteam.test>',
  html: conversationOriginalHtml,
  id: 'thread-original',
  mailboxId: sentFolder.id,
  receivedAt: '2026-05-31T19:04:00.000Z',
  subject: 'Re: Agent Mail smoke - 20260601-044348Z',
  teaser: 'Can you confirm the smoke-test reply path is working for this mailbox?',
  to: ['Testing <testingtesting@example.test>']
})

const conversationLatestMessage = createThreadMessage({
  from: 'Testing <testingtesting@example.test>',
  html: conversationLatestHtml,
  id: 'conversation-thread',
  isUnread: true,
  receivedAt: '2026-06-01T04:43:48.000Z',
  replyTo: ['testingtesting@example.test'],
  subject: 'Re: Agent Mail smoke - 20260601-044348Z',
  teaser: 'Confirming that this mailbox is receiving and sending replies correctly.',
  to: ['Support Agent <support@agentteam.test>']
})

const conversationDraftMessage = createThreadMessage({
  from: 'Draft <support@agentteam.test>',
  html: '<p>Drafting reply from the selected WildDuck Drafts folder.</p>',
  id: 'thread-draft-reply',
  isDraft: true,
  mailboxId: draftsFolder.id,
  receivedAt: '2026-06-01T04:45:00.000Z',
  subject: 'Re: Agent Mail smoke - 20260601-044348Z',
  teaser: 'Drafting reply from the selected WildDuck Drafts folder.',
  to: ['Testing <testingtesting@example.test>']
})

const conversationMessage = {
  ...conversationLatestMessage,
  thread: [conversationOriginalMessage, conversationLatestMessage, conversationDraftMessage]
} satisfies MailMessageDetail

const sentMessage = createMessageDetail({
  from: 'Support Agent <support@agentteam.test>',
  html: '<p>Thanks for sending the routing notes. We confirmed the values and will monitor delivery.</p>',
  id: 'sent-follow-up',
  mailboxId: sentFolder.id,
  receivedAt: '2026-06-22T18:04:00.000Z',
  subject: 'Re: Deployment checklist and routing review',
  teaser: 'Thanks for sending the routing notes. We confirmed the values and will monitor delivery.',
  to: ['Provider Portal <updates@provider.example>']
})

const trashMessage = createMessageDetail({
  from: 'Old Alert <alerts@example.test>',
  html: '<p>This alert was deleted after the deployment was verified.</p>',
  id: 'trash-archive',
  mailboxId: trashFolder.id,
  receivedAt: '2026-06-18T15:06:00.000Z',
  subject: 'Expired deployment alert',
  teaser: 'This alert was deleted after the deployment was verified.',
  to: ['Support Agent <support@agentteam.test>']
})

const archiveMessage = createMessageDetail({
  from: 'Provider Portal <updates@provider.example>',
  html: '<p>This completed routing review is stored in the custom Archive mailbox.</p>',
  id: 'archive-routing-review',
  mailboxId: archiveFolder.id,
  receivedAt: '2026-06-12T22:31:00.000Z',
  subject: 'Archived routing review',
  teaser: 'This completed routing review is stored in the custom Archive mailbox.',
  to: ['Support Agent <support@agentteam.test>']
})

const draftMessage = createMessageDetail({
  from: 'Draft <support@agentteam.test>',
  html: '<p>Thanks for sending this over. I will confirm once the WildDuck folder sync has finished.</p>',
  id: 'draft-reply',
  isDraft: true,
  mailboxId: draftsFolder.id,
  receivedAt: '2026-06-22T18:10:00.000Z',
  subject: 'Re: Deployment checklist and routing review',
  teaser: 'Thanks for sending this over. I will confirm once the WildDuck folder sync has finished.',
  to: ['Provider Portal <updates@provider.example>']
})

const attachmentMessage = createMessageDetail({
  attachments: [
    attachment({
      filename: 'manifest.json',
      id: 'attachment-manifest',
      mimetype: 'application/json',
      size: 8192
    }),
    attachment({
      filename: 'preview.png',
      id: 'attachment-preview',
      mimetype: 'image/png',
      size: 94 * 1024
    }),
    attachment({
      filename: 'wildduck-source.eml',
      id: 'attachment-log',
      mimetype: 'text/plain',
      size: 42 * 1024,
      url: 'https://wildduck.example.test/users/agent-support/attachments/attachment-log'
    })
  ],
  from: 'Provider Portal <updates@provider.example>',
  html: '<p>The deployment manifest and preview image are attached.</p>',
  id: 'attachment-message',
  receivedAt: '2026-06-22T17:52:00.000Z',
  subject: 'Deployment attachments',
  teaser: 'The deployment manifest and preview image are attached.',
  to: ['Support Agent <support@agentteam.test>']
})

const inlineAttachmentMessage = createMessageDetail({
  attachments: [
    attachment({
      contentId: '<provider-logo@provider.example>',
      disposition: 'inline',
      filename: 'provider-logo.png',
      id: 'inline-provider-logo',
      mimetype: 'image/png',
      size: 14 * 1024
    }),
    attachment({
      contentId: 'unsafe-inline@provider.example',
      disposition: 'inline',
      filename: 'unsafe-inline.png',
      id: 'inline-unsafe-image',
      mimetype: 'image/png',
      size: 10 * 1024,
      url: 'https://wildduck.example.test/users/agent-support/attachments/inline-unsafe-image'
    })
  ],
  from: 'Provider Portal <updates@provider.example>',
  html: [
    '<p>The provider logo is inline in the message body.</p>',
    '<img src="cid:provider-logo%40provider.example" alt="Provider logo">',
    '<img src="cid:unsafe-inline@provider.example" alt="Unsafe inline image">'
  ].join(''),
  id: 'inline-attachment-message',
  receivedAt: '2026-06-22T17:42:00.000Z',
  subject: 'Inline attachment rendering',
  teaser: 'The provider logo is inline in the message body.',
  to: ['Support Agent <support@agentteam.test>']
})

const remoteBackgroundMessage = createMessageDetail({
  from: 'Provider Portal <updates@provider.example>',
  html: [
    '<table background="https://assets.provider.example/tracker-table.png">',
    '<tr><td style="background-image: url(https://assets.provider.example/tracker-cell.png); color: #111827">',
    'Background image content',
    '</td></tr>',
    '</table>'
  ].join(''),
  id: 'remote-background-images-message',
  receivedAt: '2026-06-22T17:38:00.000Z',
  subject: 'Background image tracking',
  teaser: 'Background image content',
  to: ['Support Agent <support@agentteam.test>']
})

const documentResourceMessage = createMessageDetail({
  from: 'Provider Portal <updates@provider.example>',
  html: [
    '<base href="https://wildduck.example.test/">',
    '<meta http-equiv="refresh" content="0; url=https://wildduck.example.test/session">',
    '<link rel="stylesheet" href="https://wildduck.example.test/email.css">',
    '<p>Document resource content</p>',
    '<script><img src="https://wildduck.example.test/script-pixel.png"></script>',
    '<iframe src="https://wildduck.example.test/frame">iframe fallback</iframe>',
    '<object data="https://wildduck.example.test/object">object fallback</object>',
    '<embed src="https://wildduck.example.test/embed">'
  ].join(''),
  id: 'document-resource-message',
  receivedAt: '2026-06-22T17:44:00.000Z',
  subject: 'Document resource controls',
  teaser: 'Document resource content',
  to: ['Support Agent <support@agentteam.test>']
})

const mailtoLinkMessage = createMessageDetail({
  from: 'Provider Portal <updates@provider.example>',
  html: '<p>Need follow-up?</p><p><a href="mailto:support@example.test?subject=Routing%20review">Email support</a></p>',
  id: 'mailto-link-message',
  receivedAt: '2026-06-22T18:08:00.000Z',
  subject: 'Contact support by email',
  teaser: 'Need follow-up? Email support.',
  to: ['Support Agent <support@agentteam.test>']
})

const externalLinkMessage = createMessageDetail({
  from: 'Provider Portal <updates@provider.example>',
  html: '<p><a href="https://docs.example.test/path">Generated docs link</a></p>',
  id: 'external-link-message',
  receivedAt: '2026-06-22T18:16:00.000Z',
  subject: 'External link handling',
  teaser: 'Generated docs link',
  to: ['Support Agent <support@agentteam.test>']
})

const formMessage = createMessageDetail({
  from: 'Provider Portal <updates@provider.example>',
  html: [
    '<p>Please do not submit credentials from an email.</p>',
    '<form action="https://phish.example.test/login" method="post" target="_blank">',
    '<label>Email <input name="email" required autofocus></label>',
    '<button formaction="https://phish.example.test/pay">Submit</button>',
    '</form>'
  ].join(''),
  id: 'form-message',
  receivedAt: '2026-06-22T18:22:00.000Z',
  subject: 'Form in email body',
  teaser: 'Please do not submit credentials from an email.',
  to: ['Support Agent <support@agentteam.test>']
})

const billingMessage = createMessageDetail({
  from: 'Scheduler <scheduler@example.net>',
  html: '<p>This mailbox is loaded after switching accounts.</p>',
  id: 'billing-handoff',
  receivedAt: '2026-06-22T12:00:00.000Z',
  subject: 'Billing account handoff',
  teaser: 'This mailbox is loaded after switching accounts.',
  to: ['Billing Agent <billing@agentteam.test>']
})

const longMailboxAccounts = [
  supportAccount,
  billingAccount,
  {
    address: 'routing@agentteam.example',
    description: 'Routing checks',
    id: 'routing',
    name: 'Routing checks',
    state: 'ready'
  },
  {
    address: 'cloudflare-workers@agentteam.example',
    description: 'Cloudflare workers',
    id: 'cloudflare-workers',
    name: 'Cloudflare workers',
    state: 'ready'
  },
  {
    address: 'smtp-relay@agentteam.example',
    description: 'SMTP relay',
    id: 'smtp-relay',
    name: 'SMTP relay',
    state: 'ready'
  },
  {
    address: 'abuse@agentteam.example',
    description: 'Policy alerts open',
    id: 'abuse',
    name: 'Abuse review',
    state: 'ready'
  },
  {
    address: 'postmaster@agentteam.example',
    description: 'Postmaster',
    id: 'postmaster',
    name: 'Postmaster',
    state: 'ready'
  },
  {
    address: 'deliverability@agentteam.example',
    description: 'Deliverability',
    id: 'deliverability',
    name: 'Deliverability',
    state: 'ready'
  },
  {
    address: 'customer-success@agentteam.example',
    description: 'Customer success',
    id: 'customer-success',
    name: 'Customer success',
    state: 'ready'
  },
  {
    address: 'agent-runs@agentteam.example',
    description: 'Agent runs',
    id: 'agent-runs',
    name: 'Agent runs',
    state: 'ready'
  },
  {
    address: 'notifications@agentteam.example',
    description: 'Provisioning mailbox access',
    id: 'notifications',
    name: 'Notifications',
    state: 'disabled'
  }
] satisfies MailAccount[]

const baseMessages = [appointmentMessage, welcomeMessage, conversationMessage, blockedImagesMessage].map(
  summaryFromDetail
)

export const mailWorkspaceScreenReadyView = workspace({
  messages: baseMessages,
  pagination: pagination(baseMessages.length, 42),
  selectedMessage: appointmentMessage
})

export const mailWorkspaceScreenLoadingView = mailWorkspaceScreenReadyView

export const mailWorkspaceScreenEmptyView = workspace({
  messages: [],
  pagination: pagination(0, 0),
  selectedMessage: null
})

export const mailWorkspaceScreenSearchFilteredView = workspace({
  messages: [summaryFromDetail(welcomeMessage)],
  pagination: pagination(1, 1),
  selectedMessage: welcomeMessage
})

export const mailWorkspaceScreenSearchEmptyView = workspace({
  messages: [],
  pagination: pagination(0, 0),
  selectedMessage: null
})

export const mailWorkspaceScreenUnreadOnlyView = workspace({
  messages: [summaryFromDetail(appointmentMessage), summaryFromDetail(blockedImagesMessage)],
  pagination: pagination(2, 2),
  selectedMessage: appointmentMessage
})

export const mailWorkspaceScreenPaginatedView = workspace({
  messages: baseMessages,
  pagination: {
    limit: 25,
    nextCursor: 'next-cursor-page-3',
    previousCursor: 'previous-cursor-page-1',
    total: 235
  },
  selectedMessage: appointmentMessage
})

export const mailWorkspaceScreenJunkView = workspace({
  activeFolderId: junkFolder.id,
  messages: [summaryFromDetail({ ...blockedImagesMessage, mailboxId: junkFolder.id })],
  pagination: pagination(1, 1),
  selectedMessage: { ...blockedImagesMessage, mailboxId: junkFolder.id }
})

export const mailWorkspaceScreenSentView = workspace({
  activeFolderId: sentFolder.id,
  messages: [summaryFromDetail(sentMessage)],
  pagination: pagination(1, 1),
  selectedMessage: sentMessage
})

export const mailWorkspaceScreenTrashView = workspace({
  activeFolderId: trashFolder.id,
  messages: [summaryFromDetail(trashMessage)],
  pagination: pagination(1, 1),
  selectedMessage: trashMessage
})

export const mailWorkspaceScreenCustomFolderView = workspace({
  activeFolderId: archiveFolder.id,
  messages: [summaryFromDetail(archiveMessage)],
  pagination: pagination(1, 1),
  selectedMessage: archiveMessage
})

export const mailWorkspaceScreenConversationView = workspace({
  messages: [
    summaryFromDetail(conversationMessage),
    ...baseMessages.filter((message) => message.id !== 'conversation-thread')
  ],
  selectedMessage: conversationMessage
})

export const mailWorkspaceScreenDraftView = workspace({
  activeFolderId: draftsFolder.id,
  messages: [summaryFromDetail(draftMessage)],
  pagination: pagination(1, 1),
  selectedMessage: draftMessage
})

export const mailWorkspaceScreenAttachmentView = workspace({
  messages: [summaryFromDetail(attachmentMessage)],
  selectedMessage: attachmentMessage
})

export const mailWorkspaceScreenInlineAttachmentView = workspace({
  messages: [summaryFromDetail(inlineAttachmentMessage)],
  selectedMessage: inlineAttachmentMessage
})

export const mailWorkspaceScreenBlockedImagesView = workspace({
  messages: [summaryFromDetail(blockedImagesMessage)],
  selectedMessage: blockedImagesMessage
})

export const mailWorkspaceScreenAllowedImagesView = workspace({
  messages: [summaryFromDetail(blockedImagesAllowedMessage)],
  selectedMessage: blockedImagesAllowedMessage
})

export const mailWorkspaceScreenRemoteBackgroundView = workspace({
  messages: [summaryFromDetail(remoteBackgroundMessage)],
  selectedMessage: remoteBackgroundMessage
})

export const mailWorkspaceScreenDocumentResourceView = workspace({
  messages: [summaryFromDetail(documentResourceMessage)],
  selectedMessage: documentResourceMessage
})

export const mailWorkspaceScreenMailtoView = workspace({
  messages: [summaryFromDetail(mailtoLinkMessage)],
  selectedMessage: mailtoLinkMessage
})

export const mailWorkspaceScreenExternalLinkView = workspace({
  messages: [summaryFromDetail(externalLinkMessage)],
  selectedMessage: externalLinkMessage
})

export const mailWorkspaceScreenFormView = workspace({
  messages: [summaryFromDetail(formMessage)],
  selectedMessage: formMessage
})

export const mailWorkspaceScreenAccountSwitchingView = workspace({
  accounts: baseAccounts,
  activeAccountId: supportAccount.id,
  messages: baseMessages,
  selectedMessage: appointmentMessage
})

export const mailWorkspaceScreenBillingAccountView = workspace({
  accounts: baseAccounts,
  activeAccountId: billingAccount.id,
  messages: [summaryFromDetail(billingMessage)],
  pagination: pagination(1, 1),
  selectedMessage: billingMessage
})

export const mailWorkspaceScreenAccountPermissionsView = workspace({
  accounts: [supportAccount, disabledFinanceAccount],
  messages: baseMessages,
  selectedMessage: appointmentMessage
})

export const mailWorkspaceScreenLongMailboxListView = workspace({
  accounts: longMailboxAccounts,
  messages: baseMessages,
  selectedMessage: appointmentMessage
})

export const mailWorkspaceScreenNoAccountsView = workspace({
  accounts: [],
  activeAccountId: null,
  activeFolderId: null,
  folders: [],
  messages: [],
  pagination: pagination(0, 0),
  selectedMessage: null
})

export const mailWorkspaceScreenViewsByMessageId: Readonly<Record<string, AgentMailWebWorkspace>> = {
  'appointment-alert': mailWorkspaceScreenReadyView,
  'welcome-email': mailWorkspaceScreenSearchFilteredView,
  'conversation-thread': mailWorkspaceScreenConversationView,
  'blocked-images': mailWorkspaceScreenBlockedImagesView
}

export const mailWorkspaceScreenViewsByFolderId: Readonly<Record<string, AgentMailWebWorkspace>> = {
  [archiveFolder.id]: mailWorkspaceScreenCustomFolderView,
  [draftsFolder.id]: mailWorkspaceScreenDraftView,
  [inboxFolder.id]: mailWorkspaceScreenReadyView,
  [junkFolder.id]: mailWorkspaceScreenJunkView,
  [sentFolder.id]: mailWorkspaceScreenSentView,
  [trashFolder.id]: mailWorkspaceScreenTrashView
}

export const mailWorkspaceScreenFolderIds = {
  archive: archiveFolder.id,
  drafts: draftsFolder.id,
  inbox: inboxFolder.id,
  junk: junkFolder.id,
  sent: sentFolder.id,
  trash: trashFolder.id
} as const

function systemFolder(
  id: string,
  name: string,
  path: string,
  specialUse: string,
  total: number,
  unread: number
) {
  return {
    id,
    name,
    path,
    protected: true,
    specialUse,
    total,
    unread
  } satisfies MailFolder
}

function workspace(overrides: Partial<MailWorkspace> = {}) {
  return {
    accounts: baseAccounts,
    activeAccountId: supportAccount.id,
    activeFolderId: inboxFolder.id,
    folders: baseFolders,
    messages: baseMessages,
    pagination: pagination(baseMessages.length, baseMessages.length),
    selectedMessage: appointmentMessage,
    ...overrides
  } satisfies MailWorkspace
}

function pagination(_messageCount: number, total: number | null) {
  return {
    limit: 25,
    nextCursor: null,
    previousCursor: null,
    total
  } satisfies MailWorkspace['pagination']
}

function attachment({
  contentId,
  disposition = 'attachment',
  filename,
  id,
  mimetype,
  size,
  url
}: {
  contentId?: string
  disposition?: string
  filename: string
  id: string
  mimetype?: string
  size?: number
  url?: string
}) {
  return {
    contentId,
    disposition,
    filename,
    id,
    mimetype,
    size,
    url:
      url ?? `/rpc/mail/accounts/agent-support/mailboxes/inbox/messages/attachment-message/attachments/${id}`
  } satisfies MailAttachment
}

function createMessageDetail(input: MessageInput & { thread?: MailThreadMessage[] }) {
  return {
    ...createThreadMessage(input),
    thread: input.thread
  } satisfies MailMessageDetail
}

function createThreadMessage({
  attachmentCount,
  attachments = [],
  cc = [],
  from,
  html,
  id,
  isDraft = false,
  isStarred = false,
  isUnread = false,
  mailboxId = inboxFolder.id,
  messageId = `<${id}@agentteam.test>`,
  plainText,
  receivedAt,
  replyTo = [],
  subject,
  teaser,
  threadId = `thread-${id}`,
  to
}: MessageInput) {
  return {
    attachmentCount: attachmentCount ?? attachments.length,
    attachments,
    cc,
    from,
    html,
    id,
    isDraft,
    isStarred,
    mailboxId,
    messageId,
    plainText: plainText ?? teaser,
    receivedAt,
    replyTo,
    sourceUrl: `/rpc/mail/accounts/agent-support/mailboxes/${mailboxId}/messages/${id}/source`,
    subject,
    teaser,
    threadId,
    to,
    unread: isUnread
  } satisfies MailThreadMessage
}

function summaryFromDetail(message: MailThreadMessage): MailMessageSummary {
  return {
    attachmentCount: message.attachmentCount,
    from: message.from,
    id: message.id,
    isDraft: message.isDraft,
    isStarred: message.isStarred,
    mailboxId: message.mailboxId,
    receivedAt: message.receivedAt,
    subject: message.subject,
    teaser: message.teaser,
    threadId: message.threadId,
    unread: message.unread
  }
}

function messageInputFromDetail(message: MailMessageDetail): MessageInput {
  return {
    attachmentCount: message.attachmentCount,
    attachments: message.attachments,
    cc: message.cc,
    from: message.from,
    html: message.html,
    id: message.id,
    isDraft: message.isDraft,
    isStarred: message.isStarred,
    isUnread: message.unread,
    mailboxId: message.mailboxId,
    messageId: message.messageId,
    plainText: message.plainText,
    receivedAt: message.receivedAt,
    replyTo: message.replyTo,
    subject: message.subject,
    teaser: message.teaser,
    threadId: message.threadId,
    to: message.to
  }
}

interface MessageInput {
  attachmentCount?: number
  attachments?: MailAttachment[]
  cc?: string[]
  from: string
  html: string
  id: string
  isDraft?: boolean
  isStarred?: boolean
  isUnread?: boolean
  mailboxId?: string
  messageId?: string
  plainText?: string
  receivedAt?: string
  replyTo?: string[]
  subject: string
  teaser: string
  threadId?: string
  to: string[]
}
