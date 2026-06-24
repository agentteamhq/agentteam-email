import { isMailboxAdminSectionId } from '../partials/authenticated/mailbox-admin-models'
import type { MailboxAdminSectionId } from '../partials/authenticated/mailbox-admin-models'

export interface DashboardSearch {
  accountId?: string
  agentAccessSource?: 'paperclip'
  cloudflareIntentId?: string
  cloudflareOAuthError?: string
  cursor?: string
  direction?: 'next' | 'previous'
  folderId?: string
  mailboxAdmin?: MailboxAdminSectionId
  mailQuery?: string
  messageId?: string
  paperclipCompanyId?: string
  paperclipPluginId?: string
  settings?: 'agentAccess' | 'connectedAccounts' | 'domains' | 'security'
  unreadOnly?: boolean
}

export function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  const paperclipSource = search.source === 'paperclip' || search.agentAccessSource === 'paperclip'
  const paperclipCompanyId =
    readSearchString(search.paperclip_company_id) ?? readSearchString(search.paperclipCompanyId)
  const paperclipPluginId =
    readSearchString(search.paperclip_plugin_id) ?? readSearchString(search.paperclipPluginId)

  return {
    accountId: typeof search.accountId === 'string' && search.accountId.trim() ? search.accountId : undefined,
    agentAccessSource: paperclipSource ? 'paperclip' : undefined,
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
    paperclipCompanyId,
    paperclipPluginId,
    settings:
      search.settings === 'cli-access' || search.settings === 'cliAccess'
        ? 'security'
        : search.settings === 'agent-access' || search.settings === 'agentAccess'
          ? 'agentAccess'
          : search.settings === 'domains' ||
              search.settings === 'connectedAccounts' ||
              search.settings === 'security'
            ? search.settings
            : paperclipSource
              ? 'agentAccess'
              : undefined,
    unreadOnly: search.unreadOnly === true || search.unreadOnly === 'true' ? true : undefined
  }
}

function readSearchString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
