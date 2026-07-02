import { beforeEach, describe, expect, it, vi } from 'vitest'

const mailRpcTestState = vi.hoisted(() => {
  const accountsRoute = vi.fn()
  const mailboxRoute = vi.fn()
  const mailboxesRoute = vi.fn()
  const messageRoute = vi.fn()
  const messagesRoute = vi.fn()

  return {
    accountsRoute,
    draftsPost: vi.fn(),
    mailboxDelete: vi.fn(),
    mailboxPatch: vi.fn(),
    mailboxRoute,
    mailboxesPost: vi.fn(),
    mailboxesRoute,
    messageDelete: vi.fn(),
    messageMovePost: vi.fn(),
    messagePatch: vi.fn(),
    messageRoute,
    messageSendDraftPost: vi.fn(),
    messageSourceGet: vi.fn(),
    messagesPost: vi.fn(),
    messagesRoute,
    workspaceGet: vi.fn()
  }
})

vi.mock('./rpc-api-client', () => ({
  rpc: {
    mail: {
      accounts: mailRpcTestState.accountsRoute,
      workspace: {
        get: mailRpcTestState.workspaceGet
      }
    }
  }
}))

describe('mail RPC adapter', () => {
  beforeEach(() => {
    mailRpcTestState.accountsRoute.mockReset()
    mailRpcTestState.draftsPost.mockReset()
    mailRpcTestState.mailboxDelete.mockReset()
    mailRpcTestState.mailboxPatch.mockReset()
    mailRpcTestState.mailboxRoute.mockReset()
    mailRpcTestState.mailboxesPost.mockReset()
    mailRpcTestState.mailboxesRoute.mockReset()
    mailRpcTestState.messageDelete.mockReset()
    mailRpcTestState.messageMovePost.mockReset()
    mailRpcTestState.messagePatch.mockReset()
    mailRpcTestState.messageRoute.mockReset()
    mailRpcTestState.messageSendDraftPost.mockReset()
    mailRpcTestState.messageSourceGet.mockReset()
    mailRpcTestState.messagesPost.mockReset()
    mailRpcTestState.messagesRoute.mockReset()
    mailRpcTestState.workspaceGet.mockReset()

    mailRpcTestState.accountsRoute.mockReturnValue({
      drafts: { post: mailRpcTestState.draftsPost },
      mailboxes: Object.assign(mailRpcTestState.mailboxesRoute, {
        post: mailRpcTestState.mailboxesPost
      }),
      messages: {
        post: mailRpcTestState.messagesPost
      }
    })
    mailRpcTestState.mailboxesRoute.mockReturnValue({
      delete: mailRpcTestState.mailboxDelete,
      messages: mailRpcTestState.messagesRoute,
      patch: mailRpcTestState.mailboxPatch
    })
    mailRpcTestState.messagesRoute.mockReturnValue({
      delete: mailRpcTestState.messageDelete,
      move: { post: mailRpcTestState.messageMovePost },
      patch: mailRpcTestState.messagePatch,
      'send-draft': { post: mailRpcTestState.messageSendDraftPost },
      'source-preview': { get: mailRpcTestState.messageSourceGet }
    })
  })

  it('passes workspace filters through the RPC query object', async () => {
    expect.hasAssertions()
    mailRpcTestState.workspaceGet.mockResolvedValue({
      data: { accounts: [] },
      error: null,
      status: 200
    })
    const { fetchMailWorkspace } = await import('./mail-rpc')

    await expect(
      fetchMailWorkspace({
        accountId: 'support@example.test',
        cursor: null,
        direction: 'next',
        folderId: 'inbox-id',
        limit: 25,
        messageId: '12',
        query: 'invoice',
        unreadOnly: true
      })
    ).resolves.toStrictEqual({ accounts: [] })
    expect(mailRpcTestState.workspaceGet).toHaveBeenCalledWith({
      query: {
        accountId: 'support@example.test',
        cursor: undefined,
        direction: 'next',
        folderId: 'inbox-id',
        limit: 25,
        messageId: '12',
        query: 'invoice',
        unreadOnly: true
      }
    })
  })

  it('posts compose bodies to the selected account message route', async () => {
    expect.hasAssertions()
    mailRpcTestState.messagesPost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { sendMailMessage } = await import('./mail-rpc')

    await sendMailMessage({
      accountId: 'support@example.test',
      bcc: 'audit@example.test',
      body: 'Plain body',
      cc: 'manager@example.test',
      html: '<p>Plain body</p>',
      subject: 'Hello',
      to: 'recipient@example.net'
    })

    expect(mailRpcTestState.accountsRoute).toHaveBeenCalledWith({
      accountId: 'support@example.test'
    })
    expect(mailRpcTestState.messagesPost).toHaveBeenCalledWith({
      bcc: 'audit@example.test',
      body: 'Plain body',
      cc: 'manager@example.test',
      draftMailboxId: undefined,
      draftMessageId: undefined,
      html: '<p>Plain body</p>',
      reference: undefined,
      replyTo: undefined,
      subject: 'Hello',
      to: 'recipient@example.net'
    })
  })

  it('includes draft replacement ids when saving drafts', async () => {
    expect.hasAssertions()
    mailRpcTestState.draftsPost.mockResolvedValue({
      data: { draftId: '27', mailboxId: 'drafts-id', previousDeleted: true, success: true },
      error: null,
      status: 200
    })
    const { saveMailDraft } = await import('./mail-rpc')

    await saveMailDraft({
      accountId: 'support@example.test',
      body: 'Draft body',
      draftMailboxId: 'drafts-id',
      draftMessageId: '26',
      subject: 'Draft',
      to: 'recipient@example.net'
    })

    expect(mailRpcTestState.draftsPost).toHaveBeenCalledWith({
      bcc: undefined,
      body: 'Draft body',
      cc: undefined,
      draftMailboxId: 'drafts-id',
      draftMessageId: '26',
      html: undefined,
      reference: undefined,
      replyTo: undefined,
      subject: 'Draft',
      to: 'recipient@example.net'
    })
  })

  it('routes message updates and moves through the selected mailbox message path', async () => {
    expect.hasAssertions()
    mailRpcTestState.messagePatch.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    mailRpcTestState.messageMovePost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { moveMailMessage, updateMailMessage } = await import('./mail-rpc')

    await updateMailMessage({
      accountId: 'support@example.test',
      flagged: true,
      mailboxId: 'inbox-id',
      messageId: '12',
      seen: false
    })
    await moveMailMessage({
      accountId: 'support@example.test',
      mailboxId: 'inbox-id',
      messageId: '12',
      targetMailboxId: 'archive-id'
    })

    expect(mailRpcTestState.mailboxesRoute).toHaveBeenCalledWith({ mailboxId: 'inbox-id' })
    expect(mailRpcTestState.messagesRoute).toHaveBeenCalledWith({ messageId: '12' })
    expect(mailRpcTestState.messagePatch).toHaveBeenCalledWith({
      flagged: true,
      seen: false
    })
    expect(mailRpcTestState.messageMovePost).toHaveBeenCalledWith({
      targetMailboxId: 'archive-id'
    })
  })

  it('routes draft send, source preview, and message delete through the selected message path', async () => {
    expect.hasAssertions()
    mailRpcTestState.messageSendDraftPost.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    mailRpcTestState.messageSourceGet.mockResolvedValue({
      data: 'From: support@example.test',
      error: null,
      status: 200
    })
    mailRpcTestState.messageDelete.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { deleteMailMessage, fetchMailOriginalSource, sendMailDraft } = await import('./mail-rpc')
    const input = {
      accountId: 'support@example.test',
      mailboxId: 'drafts-id',
      messageId: '27'
    }

    await expect(sendMailDraft(input)).resolves.toStrictEqual({ success: true })
    await expect(fetchMailOriginalSource(input)).resolves.toBe('From: support@example.test')
    await expect(deleteMailMessage(input)).resolves.toStrictEqual({ success: true })

    expect(mailRpcTestState.accountsRoute).toHaveBeenCalledWith({
      accountId: 'support@example.test'
    })
    expect(mailRpcTestState.mailboxesRoute).toHaveBeenCalledWith({
      mailboxId: 'drafts-id'
    })
    expect(mailRpcTestState.messagesRoute).toHaveBeenCalledWith({
      messageId: '27'
    })
    expect(mailRpcTestState.messageSendDraftPost).toHaveBeenCalledWith()
    expect(mailRpcTestState.messageSourceGet).toHaveBeenCalledWith()
    expect(mailRpcTestState.messageDelete).toHaveBeenCalledWith()
  })

  it('routes folder create, rename, and delete through the selected mailbox paths', async () => {
    expect.hasAssertions()
    mailRpcTestState.mailboxesPost.mockResolvedValue({
      data: { folder: { id: 'folder-new', name: 'Receipts' }, success: true },
      error: null,
      status: 200
    })
    mailRpcTestState.mailboxPatch.mockResolvedValue({
      data: { folder: { id: 'folder-new', name: 'Receipts 2026' }, success: true },
      error: null,
      status: 200
    })
    mailRpcTestState.mailboxDelete.mockResolvedValue({
      data: { success: true },
      error: null,
      status: 200
    })
    const { createMailFolder, deleteMailFolder, renameMailFolder } = await import('./mail-rpc')

    await createMailFolder({
      accountId: 'support@example.test',
      name: 'Receipts'
    })
    await renameMailFolder({
      accountId: 'support@example.test',
      mailboxId: 'folder-new',
      name: 'Receipts 2026'
    })
    await deleteMailFolder({
      accountId: 'support@example.test',
      mailboxId: 'folder-new'
    })

    expect(mailRpcTestState.mailboxesPost).toHaveBeenCalledWith({
      name: 'Receipts'
    })
    expect(mailRpcTestState.mailboxesRoute).toHaveBeenCalledWith({
      mailboxId: 'folder-new'
    })
    expect(mailRpcTestState.mailboxPatch).toHaveBeenCalledWith({
      name: 'Receipts 2026'
    })
    expect(mailRpcTestState.mailboxDelete).toHaveBeenCalledWith()
  })

  it('throws typed RPC errors with server-provided messages', async () => {
    expect.hasAssertions()
    mailRpcTestState.workspaceGet.mockResolvedValue({
      data: null,
      error: { value: { message: 'Mailbox operation is not authorized' } },
      status: 403
    })
    const { MailRPCError, fetchMailWorkspace } = await import('./mail-rpc')

    await expect(fetchMailWorkspace({})).rejects.toBeInstanceOf(MailRPCError)
    await expect(fetchMailWorkspace({})).rejects.toMatchObject({
      message: 'Mailbox operation is not authorized',
      status: 403
    })
  })
})
