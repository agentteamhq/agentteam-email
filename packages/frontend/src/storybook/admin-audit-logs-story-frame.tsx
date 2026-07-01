import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AdminAuditLogsScreen } from '../screens/admin/admin-audit-logs-screen'
import { adminAuditLogsDefaultList } from './admin-audit-logs-fixtures'
import type { AdminAuditLogList } from '@main/backend'
import type {
  AdminAuditLogsRouteSearch,
  AdminAuditLogsRouteSearchInput
} from '../lib/admin-audit-log-search'

type AdminAuditLogsScreenProps = React.ComponentProps<typeof AdminAuditLogsScreen>

export interface AdminAuditLogsStoryFrameProps
  extends Omit<
    AdminAuditLogsScreenProps,
    'auditLogListLoader' | 'onSearchChange' | 'routeSearch'
  > {
  auditLogList?: AdminAuditLogList
  auditLogListError?: Error
  loading?: boolean
  routeSearch?: AdminAuditLogsRouteSearch
}

const defaultRouteSearch = {
  page: 1,
  pageSize: 25,
  severity: 'all',
  status: 'all'
} satisfies AdminAuditLogsRouteSearch

export function AdminAuditLogsStoryFrame({
  auditLogList = adminAuditLogsDefaultList,
  auditLogListError,
  loading = false,
  routeSearch = defaultRouteSearch,
  ...props
}: AdminAuditLogsStoryFrameProps) {
  const [currentSearch, setCurrentSearch] = React.useState(routeSearch)
  const queryClient = React.useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false
          }
        }
      }),
    []
  )
  const auditLogListLoader = React.useMemo(
    () => async () => {
      if (loading) {
        return new Promise<AdminAuditLogList>(() => {})
      }

      if (auditLogListError) {
        throw auditLogListError
      }

      return auditLogList
    },
    [auditLogList, auditLogListError, loading]
  )
  const onSearchChange = React.useCallback((nextSearch: AdminAuditLogsRouteSearchInput) => {
    setCurrentSearch((previousSearch) => ({
      ...previousSearch,
      ...nextSearch,
      action: 'action' in nextSearch ? nextSearch.action : previousSearch.action,
      page: nextSearch.page ?? previousSearch.page,
      pageSize: nextSearch.pageSize ?? previousSearch.pageSize,
      severity: nextSearch.severity ?? previousSearch.severity,
      status: nextSearch.status ?? previousSearch.status
    }))
  }, [])

  React.useEffect(
    () => () => {
      queryClient.clear()
    },
    [queryClient]
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuditLogsScreen
        {...props}
        auditLogListLoader={auditLogListLoader}
        onSearchChange={onSearchChange}
        routeSearch={currentSearch}
      />
    </QueryClientProvider>
  )
}
