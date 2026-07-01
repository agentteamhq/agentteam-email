import { readAdminRpcResult } from './admin-rpc-result'
import { rpc } from './rpc-api-client'
import type { AdminAuditLogList, AdminAuditLogListInput } from '@main/backend'

export async function fetchAdminAuditLogList(input: AdminAuditLogListInput): Promise<AdminAuditLogList> {
  const result = await rpc.admin['audit-logs'].get({
    query: input
  })

  return readAdminRpcResult<AdminAuditLogList>(result)
}
