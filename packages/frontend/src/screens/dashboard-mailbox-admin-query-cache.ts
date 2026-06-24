import type { QueryClient } from '@tanstack/react-query'

const MAILBOX_ADMIN_QUERY_KEY_PREFIX = ['mail', 'admin'] as const

export async function invalidateMailboxAdminQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: MAILBOX_ADMIN_QUERY_KEY_PREFIX })
}
