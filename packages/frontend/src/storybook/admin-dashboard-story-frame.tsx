import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AdminDashboardScreen } from '../screens/admin/admin-dashboard-screen'
import { adminDashboardHealthySummary } from './admin-dashboard-fixtures'
import type { AdminDashboardSummary } from '@main/backend'

type AdminDashboardScreenProps = React.ComponentProps<typeof AdminDashboardScreen>

export interface AdminDashboardStoryFrameProps extends Omit<AdminDashboardScreenProps, 'summaryLoader'> {
  loading?: boolean
  summary?: AdminDashboardSummary
  summaryError?: Error
}

export function AdminDashboardStoryFrame({
  loading = false,
  summary = adminDashboardHealthySummary,
  summaryError,
  ...props
}: AdminDashboardStoryFrameProps) {
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
  const summaryLoader = React.useMemo(
    () => async () => {
      if (loading) {
        return new Promise<AdminDashboardSummary>(() => {})
      }

      if (summaryError) {
        throw summaryError
      }

      return summary
    },
    [loading, summary, summaryError]
  )

  React.useEffect(
    () => () => {
      queryClient.clear()
    },
    [queryClient]
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AdminDashboardScreen
        {...props}
        summaryLoader={summaryLoader}
      />
    </QueryClientProvider>
  )
}
