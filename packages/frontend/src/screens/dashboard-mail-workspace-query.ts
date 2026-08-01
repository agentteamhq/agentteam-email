import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import { fetchMailWorkspace } from '../lib/mail-rpc'
import type { AgentMailWorkspaceInput } from '@main/backend'
import type { DashboardSearch } from '../lib/dashboard-search'

export type MailWorkspaceLoader = typeof fetchMailWorkspace

export const MAIL_WORKSPACE_QUERY_LIMIT = 25

/**
 * Query key prefix for every mail workspace query. Keys hold only JSON-serializable
 * values so route-keyed cache entries stay stable and inspectable.
 */
export const MAIL_WORKSPACE_QUERY_KEY_PREFIX = ['mail', 'workspace'] as const

/**
 * Owns the route-search to mail workspace RPC input mapping so the route loader and
 * the mail controller resolve the same cache entry for a given URL.
 */
export function mailWorkspaceQueryInput(routeSearch: DashboardSearch | undefined): AgentMailWorkspaceInput {
  const mailboxAdmin = routeSearch?.mailboxAdmin

  return {
    accountId: routeSearch?.accountId,
    cursor: mailboxAdmin ? undefined : routeSearch?.cursor,
    direction: mailboxAdmin ? undefined : routeSearch?.direction,
    folderId: mailboxAdmin ? undefined : routeSearch?.folderId,
    limit: MAIL_WORKSPACE_QUERY_LIMIT,
    messageId: mailboxAdmin ? undefined : routeSearch?.messageId,
    query: mailboxAdmin ? undefined : routeSearch?.mailQuery,
    unreadOnly: mailboxAdmin ? undefined : routeSearch?.unreadOnly
  }
}

/**
 * `placeholderData: keepPreviousData` keeps the previously rendered workspace visible
 * while a new search-param-keyed request resolves, so search-param navigation never
 * replaces an already-rendered region with a skeleton.
 */
export function mailWorkspaceQueryOptions({
  enabled = true,
  input,
  mailWorkspaceLoader = fetchMailWorkspace
}: {
  enabled?: boolean
  input: AgentMailWorkspaceInput
  mailWorkspaceLoader?: MailWorkspaceLoader
}) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- Query keys must hold only JSON-serializable values; the Storybook-injectable loader is a transport seam isolated by the story frame's own QueryClient.
  return queryOptions({
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => mailWorkspaceLoader(input),
    queryKey: [...MAIL_WORKSPACE_QUERY_KEY_PREFIX, input] as const
  })
}
