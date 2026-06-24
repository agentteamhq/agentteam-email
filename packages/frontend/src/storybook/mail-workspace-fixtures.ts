import type { AgentMailWebWorkspace } from '@main/backend'

const inboxFolder = {
  id: 'inbox-id',
  name: 'Inbox',
  path: 'INBOX',
  protected: true,
  specialUse: '\\Inbox',
  total: 24,
  unread: 3
} satisfies AgentMailWebWorkspace['folders'][number]

const archiveFolder = {
  id: 'archive-id',
  name: 'Archive',
  path: 'Archive',
  protected: true,
  specialUse: '\\Archive',
  total: 12,
  unread: 0
} satisfies AgentMailWebWorkspace['folders'][number]

const draftsFolder = {
  id: 'drafts-id',
  name: 'Drafts',
  path: 'Drafts',
  protected: true,
  specialUse: '\\Drafts',
  total: 1,
  unread: 0
} satisfies AgentMailWebWorkspace['folders'][number]

const junkFolder = {
  id: 'junk-id',
  name: 'Junk',
  path: 'Junk',
  protected: true,
  specialUse: '\\Junk',
  total: 4,
  unread: 1
} satisfies AgentMailWebWorkspace['folders'][number]

const sentFolder = {
  id: 'sent-id',
  name: 'Sent',
  path: 'Sent',
  protected: true,
  specialUse: '\\Sent',
  total: 18,
  unread: 0
} satisfies AgentMailWebWorkspace['folders'][number]

const folders = [inboxFolder, archiveFolder, draftsFolder, junkFolder, sentFolder]

export const mailWorkspaceReadyView = {
  accounts: [
    {
      address: 'research@agentteam.example',
      description: 'WildDuck mailbox for agentteam.example',
      id: 'research@agentteam.example',
      name: 'Research',
      state: 'ready'
    },
    {
      address: 'assistant@second.example',
      description: 'WildDuck mailbox for second.example',
      id: 'assistant@second.example',
      name: 'Assistant',
      state: 'ready'
    }
  ],
  activeAccountId: 'research@agentteam.example',
  activeFolderId: inboxFolder.id,
  folders,
  messages: [
    {
      attachmentCount: 1,
      from: 'Avery Stone <avery@example.net>',
      id: '100',
      isDraft: false,
      isStarred: true,
      mailboxId: inboxFolder.id,
      receivedAt: '2026-06-22T18:30:00.000Z',
      subject: 'Quarterly research packet',
      teaser: 'The dataset and notes are attached for review.',
      threadId: 'thread-research-packet',
      unread: true
    },
    {
      attachmentCount: 0,
      from: 'Ops Queue <ops@example.net>',
      id: '101',
      isDraft: false,
      isStarred: false,
      mailboxId: inboxFolder.id,
      receivedAt: '2026-06-22T17:10:00.000Z',
      subject: 'Provider routing complete',
      teaser: 'The outbound provider route finished successfully.',
      threadId: 'thread-provider-routing',
      unread: false
    }
  ],
  pagination: {
    limit: 25,
    nextCursor: 'next-page-cursor',
    previousCursor: null,
    total: 42
  },
  selectedMessage: {
    attachmentCount: 1,
    attachments: [
      {
        disposition: 'attachment',
        filename: 'research-packet.txt',
        id: 'attachment-1',
        mimetype: 'text/plain',
        size: 1842,
        url: '/rpc/mail/accounts/research%40agentteam.example/mailboxes/inbox-id/messages/100/attachments/attachment-1'
      }
    ],
    cc: [],
    from: 'Avery Stone <avery@example.net>',
    html: '<p>The dataset and notes are attached for review.</p>',
    id: '100',
    isDraft: false,
    isStarred: true,
    mailboxId: inboxFolder.id,
    messageId: '<research-packet@example.net>',
    plainText: 'The dataset and notes are attached for review.',
    receivedAt: '2026-06-22T18:30:00.000Z',
    replyTo: ['avery@example.net'],
    sourceUrl: '/rpc/mail/accounts/research%40agentteam.example/mailboxes/inbox-id/messages/100/source',
    subject: 'Quarterly research packet',
    teaser: 'The dataset and notes are attached for review.',
    thread: [
      {
        attachmentCount: 0,
        attachments: [],
        cc: [],
        from: 'Research <research@agentteam.example>',
        html: '<p>Can you send over the latest research packet?</p>',
        id: '99',
        isDraft: false,
        isStarred: false,
        mailboxId: sentFolder.id,
        messageId: '<research-packet-request@example.net>',
        plainText: 'Can you send over the latest research packet?',
        receivedAt: '2026-06-22T16:00:00.000Z',
        replyTo: [],
        sourceUrl: '/rpc/mail/accounts/research%40agentteam.example/mailboxes/sent-id/messages/99/source',
        subject: 'Quarterly research packet',
        teaser: 'Can you send over the latest research packet?',
        to: ['Avery Stone <avery@example.net>'],
        threadId: 'thread-research-packet',
        unread: false
      },
      {
        attachmentCount: 1,
        attachments: [
          {
            disposition: 'attachment',
            filename: 'research-packet.txt',
            id: 'attachment-1',
            mimetype: 'text/plain',
            size: 1842,
            url: '/rpc/mail/accounts/research%40agentteam.example/mailboxes/inbox-id/messages/100/attachments/attachment-1'
          }
        ],
        cc: [],
        from: 'Avery Stone <avery@example.net>',
        html: '<p>The dataset and notes are attached for review.</p>',
        id: '100',
        isDraft: false,
        isStarred: true,
        mailboxId: inboxFolder.id,
        messageId: '<research-packet@example.net>',
        plainText: 'The dataset and notes are attached for review.',
        receivedAt: '2026-06-22T18:30:00.000Z',
        replyTo: ['avery@example.net'],
        sourceUrl: '/rpc/mail/accounts/research%40agentteam.example/mailboxes/inbox-id/messages/100/source',
        subject: 'Quarterly research packet',
        teaser: 'The dataset and notes are attached for review.',
        to: ['Research <research@agentteam.example>'],
        threadId: 'thread-research-packet',
        unread: true
      }
    ],
    threadId: 'thread-research-packet',
    to: ['Research <research@agentteam.example>'],
    unread: true
  }
} satisfies AgentMailWebWorkspace

export const mailWorkspaceEmptyView = {
  ...mailWorkspaceReadyView,
  messages: [],
  pagination: {
    limit: 25,
    nextCursor: null,
    previousCursor: null,
    total: 0
  },
  selectedMessage: null
} satisfies AgentMailWebWorkspace

export const mailWorkspaceJunkView = {
  ...mailWorkspaceReadyView,
  activeFolderId: junkFolder.id,
  messages: [
    {
      attachmentCount: 0,
      from: 'Suspicious Sender <sender@example.net>',
      id: '140',
      isDraft: false,
      isStarred: false,
      mailboxId: junkFolder.id,
      receivedAt: '2026-06-22T15:00:00.000Z',
      subject: 'False positive delivery',
      teaser: 'This message was routed to Junk but should be restored.',
      threadId: 'thread-false-positive',
      unread: false
    }
  ],
  pagination: {
    limit: 25,
    nextCursor: null,
    previousCursor: null,
    total: 1
  },
  selectedMessage: {
    attachmentCount: 0,
    attachments: [],
    cc: [],
    from: 'Suspicious Sender <sender@example.net>',
    html: '<p>This message was routed to Junk but should be restored.</p>',
    id: '140',
    isDraft: false,
    isStarred: false,
    mailboxId: junkFolder.id,
    messageId: '<false-positive@example.net>',
    plainText: 'This message was routed to Junk but should be restored.',
    receivedAt: '2026-06-22T15:00:00.000Z',
    replyTo: [],
    sourceUrl: '/rpc/mail/accounts/research%40agentteam.example/mailboxes/junk-id/messages/140/source',
    subject: 'False positive delivery',
    teaser: 'This message was routed to Junk but should be restored.',
    threadId: 'thread-false-positive',
    to: ['Research <research@agentteam.example>'],
    unread: false
  }
} satisfies AgentMailWebWorkspace

export const mailWorkspaceAssistantAccountView = {
  ...mailWorkspaceReadyView,
  activeAccountId: 'assistant@second.example',
  messages: [
    {
      attachmentCount: 0,
      from: 'Scheduler <scheduler@example.net>',
      id: '220',
      isDraft: false,
      isStarred: false,
      mailboxId: inboxFolder.id,
      receivedAt: '2026-06-22T12:00:00.000Z',
      subject: 'Assistant account handoff',
      teaser: 'This mailbox is loaded after switching accounts.',
      threadId: 'thread-assistant-handoff',
      unread: false
    }
  ],
  pagination: {
    limit: 25,
    nextCursor: null,
    previousCursor: null,
    total: 1
  },
  selectedMessage: {
    attachmentCount: 0,
    attachments: [],
    cc: [],
    from: 'Scheduler <scheduler@example.net>',
    html: '<p>This mailbox is loaded after switching accounts.</p>',
    id: '220',
    isDraft: false,
    isStarred: false,
    mailboxId: inboxFolder.id,
    messageId: '<assistant-handoff@example.net>',
    plainText: 'This mailbox is loaded after switching accounts.',
    receivedAt: '2026-06-22T12:00:00.000Z',
    replyTo: [],
    sourceUrl: '/rpc/mail/accounts/assistant%40second.example/mailboxes/inbox-id/messages/220/source',
    subject: 'Assistant account handoff',
    teaser: 'This mailbox is loaded after switching accounts.',
    threadId: 'thread-assistant-handoff',
    to: ['Assistant <assistant@second.example>'],
    unread: false
  }
} satisfies AgentMailWebWorkspace
