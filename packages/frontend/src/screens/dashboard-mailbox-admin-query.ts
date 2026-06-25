import type { MailboxAdminViewQuery } from '../lib/mail-admin-rpc'
import type {
  MailboxAdminSectionId,
  MailboxAdminStatusFilter
} from '../partials/authenticated/mailbox-admin-models'

export function mailboxAdminViewQueryForSection({
  page,
  pageSize,
  searchQuery,
  section,
  statusFilter
}: {
  page: number
  pageSize: number
  searchQuery: string
  section: MailboxAdminSectionId | undefined
  statusFilter: MailboxAdminStatusFilter
}): MailboxAdminViewQuery | undefined {
  if (!section) {
    return undefined
  }

  return {
    page,
    pageSize,
    searchQuery,
    section,
    statusFilter
  }
}
