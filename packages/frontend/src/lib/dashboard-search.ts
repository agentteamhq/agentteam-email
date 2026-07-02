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

export interface SettingsRouteSearch extends DashboardSearch {
  integrationSource?: 'paperclip'
  paperclipCompanyId?: string
  paperclipPluginId?: string
}

export function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  return {
    ...validateDashboardBaseSearch(search)
  }
}

export function validateSettingsSearch(search: Record<string, unknown>): SettingsRouteSearch {
  const paperclipSource =
    search.source === 'paperclip' ||
    search.integrationSource === 'paperclip' ||
    search.agentAccessSource === 'paperclip'
  const paperclipCompanyId =
    readSearchString(search.paperclip_company_id) ?? readSearchString(search.paperclipCompanyId)
  const paperclipPluginId =
    readSearchString(search.paperclip_plugin_id) ?? readSearchString(search.paperclipPluginId)

  return {
    ...validateDashboardBaseSearch(search),
    integrationSource: paperclipSource ? 'paperclip' : undefined,
    paperclipCompanyId,
    paperclipPluginId
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

function readSearchString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
