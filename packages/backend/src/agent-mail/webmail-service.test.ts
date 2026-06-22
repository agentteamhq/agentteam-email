import { beforeEach, describe, expect, it, vi } from 'vitest'

const webmailTestState = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  cloudflareConnectionFind: vi.fn(),
  createMailbox: vi.fn(),
  createWildDuckClient: vi.fn(),
  deleteMailbox: vi.fn(),
  deleteMessage: vi.fn(),
  fetchAttachment: vi.fn(),
  fetchMessageSource: vi.fn(),
  getMessage: vi.fn(),
  listMailboxes: vi.fn(),
  listMessages: vi.fn(),
  listUsers: vi.fn(),
  memberFindOne: vi.fn(),
  agentMailDomainFind: vi.fn(),
  resolveAddress: vi.fn(),
  searchMessages: vi.fn(),
  submitDraft: vi.fn(),
  submitMessage: vi.fn(),
  updateMessage: vi.fn(),
  uploadMessage: vi.fn()
}))

class TestWildDuckAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
  }
}

vi.mock('../globals', () => ({
  globals: () =>
    Promise.resolve({
      auth: {
        api: {
          getSession: webmailTestState.authGetSession
        }
      },
      db: {
        models: {
          agentMailDomain: {
            find: webmailTestState.agentMailDomainFind
          },
          cloudflareConnection: {
            find: webmailTestState.cloudflareConnectionFind
          },
          member: {
            findOne: webmailTestState.memberFindOne
          }
        }
      }
    })
}))

vi.mock('./wildduck-client', () => ({
  WildDuckAPIError: TestWildDuckAPIError,
  createWildDuckClient: webmailTestState.createWildDuckClient
}))

describe('Agent Mail WildDuck webmail service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    webmailTestState.authGetSession.mockReset()
    webmailTestState.cloudflareConnectionFind.mockReset()
    webmailTestState.createMailbox.mockReset()
    webmailTestState.createWildDuckClient.mockReset()
    webmailTestState.deleteMailbox.mockReset()
    webmailTestState.deleteMessage.mockReset()
    webmailTestState.fetchAttachment.mockReset()
    webmailTestState.fetchMessageSource.mockReset()
    webmailTestState.getMessage.mockReset()
    webmailTestState.listMailboxes.mockReset()
    webmailTestState.listMessages.mockReset()
    webmailTestState.listUsers.mockReset()
    webmailTestState.memberFindOne.mockReset()
    webmailTestState.agentMailDomainFind.mockReset()
    webmailTestState.resolveAddress.mockReset()
    webmailTestState.searchMessages.mockReset()
    webmailTestState.submitDraft.mockReset()
    webmailTestState.submitMessage.mockReset()
    webmailTestState.updateMessage.mockReset()
    webmailTestState.uploadMessage.mockReset()

    webmailTestState.createWildDuckClient.mockReturnValue({
      createMailbox: webmailTestState.createMailbox,
      deleteMailbox: webmailTestState.deleteMailbox,
      deleteMessage: webmailTestState.deleteMessage,
      fetchAttachment: webmailTestState.fetchAttachment,
      fetchMessageSource: webmailTestState.fetchMessageSource,
      listMailboxes: webmailTestState.listMailboxes,
      listMessages: webmailTestState.listMessages,
      listUsers: webmailTestState.listUsers,
      getMessage: webmailTestState.getMessage,
      resolveAddress: webmailTestState.resolveAddress,
      searchMessages: webmailTestState.searchMessages,
      submitDraft: webmailTestState.submitDraft,
      submitMessage: webmailTestState.submitMessage,
      updateMessage: webmailTestState.updateMessage,
      uploadMessage: webmailTestState.uploadMessage
    })
    webmailTestState.authGetSession.mockResolvedValue({
      session: {
        activeOrganizationId: 'org-1'
      },
      user: {
        id: 'user-1'
      }
    })
    webmailTestState.memberFindOne.mockReturnValue({ exec: () => Promise.resolve({ id: 'member-1' }) })
    webmailTestState.agentMailDomainFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            domain: 'example.test',
            status: 'active'
          }
        ])
    })
    webmailTestState.cloudflareConnectionFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    webmailTestState.listUsers.mockResolvedValue({
      results: [
        {
          address: 'support@example.test',
          id: 'wildduck-user-1',
          name: 'Support'
        },
        {
          address: 'intruder@other.test',
          id: 'wildduck-user-2',
          name: 'Intruder'
        }
      ]
    })
    webmailTestState.resolveAddress.mockResolvedValue({ user: 'wildduck-user-1' })
    webmailTestState.listMailboxes.mockResolvedValue({
      results: [
        {
          id: 'inbox-id',
          name: 'Inbox',
          path: 'INBOX',
          specialUse: '\\Inbox',
          total: 1,
          unseen: 1
        },
        {
          id: 'drafts-id',
          name: 'Drafts',
          path: 'Drafts',
          specialUse: '\\Drafts',
          total: 0,
          unseen: 0
        }
      ]
    })
    webmailTestState.listMessages.mockResolvedValue({
      nextCursor: 'next-page',
      previousCursor: false,
      results: [
        {
          attachments: true,
          attachmentsList: [
            {
              cid: 'unsafe@example.test',
              contentType: 'text/html',
              disposition: 'attachment',
              filename: 'unsafe.html',
              id: 'attachment-1',
              size: 42
            }
          ],
          date: '2026-06-22T12:00:00.000Z',
          from: {
            address: 'sender@example.net',
            name: 'Sender'
          },
          html: '<p>Hello</p>',
          id: 12,
          mailbox: 'inbox-id',
          seen: false,
          subject: 'Hello',
          text: 'Hello',
          to: [
            {
              address: 'support@example.test',
              name: 'Support'
            }
          ]
        }
      ],
      total: 1
    })
    webmailTestState.searchMessages.mockResolvedValue({
      nextCursor: false,
      previousCursor: false,
      results: [],
      total: 0
    })
    webmailTestState.getMessage.mockResolvedValue({
      attachments: [
        {
          cid: 'unsafe@example.test',
          contentType: 'text/html',
          disposition: 'attachment',
          filename: 'unsafe.html',
          id: 'attachment-1',
          size: 42
        }
      ],
      date: '2026-06-22T12:00:00.000Z',
      from: {
        address: 'sender@example.net',
        name: 'Sender'
      },
      html: '<p>Hello</p>',
      id: 12,
      mailbox: 'inbox-id',
      seen: false,
      subject: 'Hello',
      text: 'Hello',
      to: [
        {
          address: 'support@example.test',
          name: 'Support'
        }
      ]
    })
    webmailTestState.createMailbox.mockResolvedValue({
      id: 'created-folder-id',
      path: 'Projects',
      success: true
    })
    webmailTestState.deleteMailbox.mockResolvedValue({ success: true })
    webmailTestState.deleteMessage.mockResolvedValue({ success: true })
    webmailTestState.fetchAttachment.mockResolvedValue(
      new Response('attachment-body', {
        headers: {
          'content-length': '15',
          'content-type': 'text/html'
        }
      })
    )
    webmailTestState.fetchMessageSource.mockResolvedValue(
      new Response('raw-source', {
        headers: {
          'content-length': '10',
          'content-type': 'text/plain'
        }
      })
    )
    webmailTestState.submitDraft.mockResolvedValue({ success: true })
    webmailTestState.submitMessage.mockResolvedValue({ success: true })
    webmailTestState.updateMessage.mockResolvedValue({ success: true })
  })

  it('requires an authenticated active organization before creating a WildDuck client', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers(),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  })

  it('returns only active-organization domain accounts and same-origin message resource URLs', async () => {
    expect.hasAssertions()
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace.accounts).toStrictEqual([
      {
        address: 'support@example.test',
        description: 'WildDuck mailbox for example.test',
        id: 'support@example.test',
        name: 'Support',
        state: 'ready'
      }
    ])
    expect(workspace.selectedMessage?.attachments[0]?.url).toBe(
      '/rpc/mail/accounts/support%40example.test/mailboxes/inbox-id/messages/12/attachments/attachment-1'
    )
    expect(workspace.selectedMessage?.attachments[0]?.contentId).toBe('unsafe@example.test')
    expect(workspace.selectedMessage?.sourceUrl).toBe(
      '/rpc/mail/accounts/support%40example.test/mailboxes/inbox-id/messages/12/source'
    )
    expect(workspace.messages[0]?.attachmentCount).toBe(1)
    expect(workspace.pagination.nextCursor).toBe('next-page')
    expect(workspace.pagination.previousCursor).toBeNull()
    expect(JSON.stringify(workspace)).not.toContain('http://wildduck.example.test')
    expect(JSON.stringify(workspace)).not.toContain('x-access-token')
    expect(JSON.stringify(workspace)).not.toContain('admin-token')
  })

  it('uses WildDuck mailbox ids from search results when fetching selected message details and thread messages', async () => {
    expect.hasAssertions()
    const threadId = '64b112233445566778899001'
    const searchMessage = {
      date: '2026-06-22T12:05:00.000Z',
      from: {
        address: 'support@example.test',
        name: 'Support'
      },
      html: '<p>Sent reply</p>',
      id: 13,
      mailbox: 'sent-id',
      seen: true,
      subject: 'Re: Hello',
      text: 'Sent reply',
      thread: threadId,
      to: [
        {
          address: 'sender@example.net',
          name: 'Sender'
        }
      ]
    }
    webmailTestState.searchMessages
      .mockResolvedValueOnce({
        nextCursor: false,
        previousCursor: false,
        results: [searchMessage],
        total: 1
      })
      .mockResolvedValueOnce({
        nextCursor: false,
        previousCursor: false,
        results: [
          {
            ...searchMessage,
            date: '2026-06-22T12:00:00.000Z',
            from: {
              address: 'sender@example.net',
              name: 'Sender'
            },
            id: 12,
            mailbox: 'inbox-id',
            subject: 'Hello',
            to: [
              {
                address: 'support@example.test',
                name: 'Support'
              }
            ]
          },
          searchMessage
        ],
        total: 2
      })
    webmailTestState.getMessage.mockImplementation(
      (_userId: string, mailboxId: string, messageId: string | number) =>
        Promise.resolve({
          ...searchMessage,
          id: Number(messageId),
          mailbox: mailboxId,
          subject: mailboxId === 'sent-id' ? 'Re: Hello' : 'Hello'
        })
    )
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {
        cursor: 'cursor-1',
        direction: 'next',
        messageId: '13',
        query: 'hello'
      }
    })

    expect(webmailTestState.searchMessages).toHaveBeenNthCalledWith(1, 'wildduck-user-1', 'hello', {
      limit: 25,
      next: 'cursor-1',
      previous: undefined
    })
    expect(webmailTestState.searchMessages).toHaveBeenNthCalledWith(
      2,
      'wildduck-user-1',
      `thread:${threadId}`,
      {
        limit: 250
      }
    )
    expect(webmailTestState.getMessage).toHaveBeenNthCalledWith(1, 'wildduck-user-1', 'sent-id', '13')
    expect(workspace.selectedMessage?.mailboxId).toBe('sent-id')
    expect(
      workspace.selectedMessage?.thread?.map((message) => `${message.mailboxId}:${message.id}`)
    ).toStrictEqual(['inbox-id:12', 'sent-id:13'])
  })

  it('submits outbound mail through WildDuck with structured recipients and reply references', async () => {
    expect.hasAssertions()
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          bcc: 'Audit <audit@example.net>',
          body: 'Line one\nLine two',
          cc: 'Manager <manager@example.net>',
          html: '<p>Line one</p><p>Line two</p>',
          reference: {
            action: 'replyAll',
            mailboxId: 'inbox-id',
            messageId: '12'
          },
          subject: 'Re: Hello',
          to: 'Sender <sender@example.net>'
        }
      })
    ).resolves.toStrictEqual({ success: true })

    expect(webmailTestState.submitMessage).toHaveBeenCalledWith('wildduck-user-1', {
      bcc: [
        {
          address: 'audit@example.net',
          name: 'Audit'
        }
      ],
      cc: [
        {
          address: 'manager@example.net',
          name: 'Manager'
        }
      ],
      from: {
        address: 'support@example.test'
      },
      html: '<p>Line one</p><p>Line two</p>',
      reference: {
        action: 'replyAll',
        id: 12,
        mailbox: 'inbox-id'
      },
      subject: 'Re: Hello',
      text: 'Line one\r\nLine two',
      to: [
        {
          address: 'sender@example.net',
          name: 'Sender'
        }
      ]
    })
  })

  it('performs mailbox-qualified message actions through WildDuck only after account authorization', async () => {
    expect.hasAssertions()
    const {
      deleteAgentMailMessageForWeb,
      moveAgentMailMessageForWeb,
      sendAgentMailDraftForWeb,
      updateAgentMailMessageForWeb
    } = await import('./webmail-service')
    const headers = new Headers()
    const input = {
      accountId: 'support@example.test',
      mailboxId: 'inbox-id',
      messageId: '12'
    }

    await expect(
      updateAgentMailMessageForWeb({
        headers,
        input: {
          ...input,
          flagged: true,
          seen: true
        }
      })
    ).resolves.toStrictEqual({ success: true })
    await expect(
      moveAgentMailMessageForWeb({
        headers,
        input: {
          ...input,
          targetMailboxId: 'drafts-id'
        }
      })
    ).resolves.toStrictEqual({ success: true })
    await expect(sendAgentMailDraftForWeb({ headers, input })).resolves.toStrictEqual({ success: true })
    await expect(deleteAgentMailMessageForWeb({ headers, input })).resolves.toStrictEqual({ success: true })

    expect(webmailTestState.updateMessage).toHaveBeenNthCalledWith(1, 'wildduck-user-1', 'inbox-id', '12', {
      flagged: true,
      seen: true
    })
    expect(webmailTestState.updateMessage).toHaveBeenNthCalledWith(2, 'wildduck-user-1', 'inbox-id', '12', {
      moveTo: 'drafts-id'
    })
    expect(webmailTestState.submitDraft).toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', '12')
    expect(webmailTestState.deleteMessage).toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', '12')
  })

  it('proxies attachments and original sources with safe same-origin response headers', async () => {
    expect.hasAssertions()
    const { getAgentMailAttachmentForWeb, getAgentMailOriginalSourceForWeb } =
      await import('./webmail-service')

    const attachment = await getAgentMailAttachmentForWeb({
      accountId: 'support@example.test',
      attachmentId: 'attachment-1',
      headers: new Headers(),
      mailboxId: 'inbox-id',
      messageId: '12'
    })
    const source = await getAgentMailOriginalSourceForWeb({
      accountId: 'support@example.test',
      headers: new Headers(),
      mailboxId: 'inbox-id',
      messageId: '12'
    })

    expect(attachment.headers.get('content-type')).toBe('application/octet-stream')
    expect(attachment.headers.get('content-disposition')).toBe('attachment')
    expect(attachment.headers.get('content-security-policy')).toBe('sandbox')
    expect(attachment.headers.get('x-content-type-options')).toBe('nosniff')
    await expect(attachment.text()).resolves.toBe('attachment-body')
    expect(source.headers.get('content-type')).toBe('message/rfc822')
    expect(source.headers.get('content-disposition')).toBe('attachment')
    await expect(source.text()).resolves.toBe('raw-source')
    expect(webmailTestState.fetchAttachment).toHaveBeenCalledWith(
      'wildduck-user-1',
      'inbox-id',
      '12',
      'attachment-1'
    )
    expect(webmailTestState.fetchMessageSource).toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', '12')
  })

  it('rejects account-scoped attachment access outside the authorized organization domain before resolving WildDuck user data', async () => {
    expect.hasAssertions()
    const { getAgentMailAttachmentForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailAttachmentForWeb({
        accountId: 'intruder@other.test',
        attachmentId: 'attachment-1',
        headers: new Headers(),
        mailboxId: 'inbox-id',
        messageId: '12'
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account is not available',
      status: 403
    })
    expect(webmailTestState.resolveAddress).not.toHaveBeenCalled()
  })

  it('saves drafts into the WildDuck Drafts folder with structured recipients and replacement metadata', async () => {
    expect.hasAssertions()
    webmailTestState.uploadMessage.mockResolvedValue({
      message: {
        id: 24,
        mailbox: 'drafts-id',
        size: 512
      },
      previousDeleted: true,
      success: true
    })
    const { saveAgentMailDraftForWeb } = await import('./webmail-service')

    const result = await saveAgentMailDraftForWeb({
      headers: new Headers(),
      input: {
        accountId: 'support@example.test',
        body: 'Draft body',
        draftMailboxId: 'drafts-id',
        draftMessageId: '23',
        subject: 'Draft subject',
        to: 'Recipient <recipient@example.net>'
      }
    })

    expect(result).toStrictEqual({
      draftId: '24',
      mailboxId: 'drafts-id',
      previousDeleted: true,
      success: true
    })
    expect(webmailTestState.uploadMessage).toHaveBeenCalledWith('wildduck-user-1', 'drafts-id', {
      draft: true,
      from: {
        address: 'support@example.test'
      },
      replacePrevious: {
        id: 23,
        mailbox: 'drafts-id'
      },
      subject: 'Draft subject',
      text: 'Draft body',
      to: [
        {
          address: 'recipient@example.net',
          name: 'Recipient'
        }
      ]
    })
  })
})
