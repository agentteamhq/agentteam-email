import { describe, expect, it } from 'vitest'

import {
  mailboxAdminPendingAgentEnrollmentsView,
  mailboxAdminReadyView
} from '../../storybook/mailbox-admin-fixtures'
import {
  formatMailboxCapability,
  getMailboxAdminVisibleRecordsForView
} from './mailbox-admin-visible-records'
import type { MailboxAdminMailboxCapability, MailboxAdminView } from './mailbox-admin-models'

describe('mailbox admin visible records', () => {
  it('filters static Storybook views locally', () => {
    expect.hasAssertions()

    const records = getMailboxAdminVisibleRecordsForView({
      ...mailboxAdminReadyView,
      statusFilter: 'active'
    })

    expect(records.accounts).toHaveLength(
      mailboxAdminReadyView.accounts.filter((account) => account.status === 'active').length
    )
    expect(records.accounts.every((account) => account.status === 'active')).toBe(true)
  })

  it('filters connected clients for static Storybook views', () => {
    expect.hasAssertions()

    const records = getMailboxAdminVisibleRecordsForView({
      ...mailboxAdminReadyView,
      searchQuery: 'paperclip',
      section: 'agents'
    })

    expect(records.agents).toStrictEqual([])
    expect(records.principals).toStrictEqual([
      expect.objectContaining({
        id: 'paperclip-client'
      })
    ])
  })

  it('filters pending agent enrollments for static Storybook views', () => {
    expect.hasAssertions()

    const records = getMailboxAdminVisibleRecordsForView({
      ...mailboxAdminPendingAgentEnrollmentsView,
      searchQuery: 'research',
      section: 'agents',
      statusFilter: 'pending'
    })

    expect(records.pendingEnrollments).toStrictEqual([
      expect.objectContaining({
        id: '2zPendingAgentEnrollment',
        name: 'Research Agent',
        status: 'pending'
      })
    ])
    expect(records.agents).toStrictEqual([])
  })

  it('treats backend-paginated records as authoritative', () => {
    expect.hasAssertions()

    const serverView = {
      ...mailboxAdminReadyView,
      pagination: {
        filteredRecords: mailboxAdminReadyView.accounts.length,
        page: 1,
        pageSize: mailboxAdminReadyView.accounts.length,
        totalRecords: mailboxAdminReadyView.accounts.length
      },
      statusFilter: 'active'
    } satisfies MailboxAdminView

    const records = getMailboxAdminVisibleRecordsForView(serverView)

    expect(records.accounts).toBe(mailboxAdminReadyView.accounts)
    expect(records.principals).toBe(mailboxAdminReadyView.principals)
    expect(records.accounts.map((account) => account.status)).toContain('disabled')
  })

  it('does not invent friendly labels for unknown backend capability values', () => {
    expect.hasAssertions()

    expect(
      formatMailboxCapability(
        mailboxAdminReadyView.permissionCatalog,
        'deleteEverything' as MailboxAdminMailboxCapability
      )
    ).toBe('Unknown capability (deleteEverything)')
  })
})
