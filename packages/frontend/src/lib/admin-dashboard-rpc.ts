import { rpc } from './rpc-api-client'
import { AdminRPCError, readAdminRpcResult } from './admin-rpc-result'
import type { AdminDashboardSummary } from '@main/backend'

export { AdminRPCError as AdminDashboardRPCError }

export async function fetchAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const result = await rpc.admin.dashboard.get()
  return readAdminRpcResult<AdminDashboardSummary>(result)
}
