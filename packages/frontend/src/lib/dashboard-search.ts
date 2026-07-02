import { isMailboxAdminSectionId } from '../partials/authenticated/mailbox-admin-models'
import type { MailboxAdminSectionId } from '../partials/authenticated/mailbox-admin-models'

export interface DashboardSearch {
  accountId?: string
  cloudflareIntentId?: string
  cloudflareOAuthError?: string
  cursor?: string
  direction?: 'next' | 'previous'
  folderId?: string
  mailboxAdmin?: MailboxAdminSectionId
  mailQuery?: string
  messageId?: string
  unreadOnly?: boolean
}

export type SettingsRouteSearch = DashboardSearch

export function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  return {
    ...validateDashboardBaseSearch(search)
  }
}

export function validateSettingsSearch(search: Record<string, unknown>): SettingsRouteSearch {
  return {
    ...validateDashboardBaseSearch(search)
  }
}

function validateDashboardBaseSearch(search: Record<string, unknown>): DashboardSearch {
  return {
    accountId: typeof search.accountId === 'string' && search.accountId.trim() ? search.accountId : undefined,
    cloudflareIntentId:
      typeof search.cloudflareIntentId === 'string' && search.cloudflareIntentId.trim()
        ? search.cloudflareIntentId
        : undefined,
    cloudflareOAuthError:
      typeof search.cloudflareOAuthError === 'string' && search.cloudflareOAuthError.trim()
        ? search.cloudflareOAuthError
        : undefined,
    cursor: typeof search.cursor === 'string' && search.cursor.trim() ? search.cursor : undefined,
    direction: search.direction === 'next' || search.direction === 'previous' ? search.direction : undefined,
    folderId: typeof search.folderId === 'string' && search.folderId.trim() ? search.folderId : undefined,
    mailboxAdmin:
      typeof search.mailboxAdmin === 'string' && isMailboxAdminSectionId(search.mailboxAdmin)
        ? search.mailboxAdmin
        : undefined,
    mailQuery: typeof search.mailQuery === 'string' ? search.mailQuery : undefined,
    messageId: typeof search.messageId === 'string' && search.messageId.trim() ? search.messageId : undefined,
    unreadOnly: search.unreadOnly === true || search.unreadOnly === 'true' ? true : undefined
  }
}
