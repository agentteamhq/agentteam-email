import { keepPreviousData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { mailWorkspaceQueryInput, mailWorkspaceQueryOptions } from './dashboard-mail-workspace-query'
import type { AgentMailWebWorkspace } from '@main/backend'

describe('mail workspace query contract', () => {
  it('keeps route-keyed query keys JSON-serializable', () => {
    expect.hasAssertions()
    const options = mailWorkspaceQueryOptions({
      input: mailWorkspaceQueryInput({ folderId: 'junk-id', messageId: 'message-id' }),
      mailWorkspaceLoader: async () => emptyWorkspace
    })

    expect(JSON.parse(JSON.stringify(options.queryKey))).toStrictEqual([
      'mail',
      'workspace',
      {
        folderId: 'junk-id',
        limit: 25,
        messageId: 'message-id'
      }
    ])
    expect(options.queryKey.some((part) => typeof part === 'function')).toBe(false)
  })

  it('builds the same query key for the same route search', () => {
    expect.hasAssertions()

    expect(mailWorkspaceQueryInput({ folderId: 'inbox-id' })).toStrictEqual(
      mailWorkspaceQueryInput({ folderId: 'inbox-id' })
    )
  })

  it('drops mailbox message filters while the mailbox administration section is active', () => {
    expect.hasAssertions()

    expect(
      mailWorkspaceQueryInput({
        accountId: 'research@agentteam.example',
        cursor: 'next-page-cursor',
        direction: 'next',
        folderId: 'junk-id',
        mailboxAdmin: 'accounts',
        mailQuery: 'welcome',
        messageId: 'message-id',
        unreadOnly: true
      })
    ).toStrictEqual({
      accountId: 'research@agentteam.example',
      cursor: undefined,
      direction: undefined,
      folderId: undefined,
      limit: 25,
      messageId: undefined,
      query: undefined,
      unreadOnly: undefined
    })
  })

  it('keeps the previously rendered workspace while the next key resolves', () => {
    expect.hasAssertions()
    const options = mailWorkspaceQueryOptions({
      input: mailWorkspaceQueryInput({}),
      mailWorkspaceLoader: async () => emptyWorkspace
    })

    expect(options.placeholderData).toBe(keepPreviousData)
  })
})

const emptyWorkspace = {
  accounts: [],
  activeAccountId: null,
  activeFolderId: null,
  folders: [],
  messages: [],
  pagination: {
    limit: 25,
    nextCursor: null,
    previousCursor: null,
    total: 0
  },
  selectedMessage: null
} satisfies AgentMailWebWorkspace
