import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouter, useRouterState } from '@tanstack/react-router'

import { agentAccessActionableState } from '../agent-access-fixtures'
import { validateDashboardSearch } from '../../lib/dashboard-search'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import type { DashboardSearch } from '../../lib/dashboard-search'
import type { ComponentProps } from 'react'

type DashboardMailControllerArgs = ComponentProps<typeof DashboardMailController>

export function MailWorkspaceControllerStoryFrame({
  routeSearch: initialRouteSearch,
  ...props
}: DashboardMailControllerArgs) {
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
  const routeSearch = useStoryDashboardSearch(initialRouteSearch)
  const loadStoryAgentAccessView = React.useCallback(async () => agentAccessActionableState.view, [])

  React.useEffect(
    () => () => {
      queryClient.clear()
    },
    [queryClient]
  )

  return (
    <QueryClientProvider client={queryClient}>
      <DashboardMailController
        {...props}
        agentAccessViewLoader={loadStoryAgentAccessView}
        routeSearch={routeSearch}
      />
    </QueryClientProvider>
  )
}

function useStoryDashboardSearch(initialRouteSearch: DashboardSearch | undefined) {
  const router = useRouter()
  const initialSearch = React.useMemo(
    () => validateDashboardSearch(initialRouteSearch ? { ...initialRouteSearch } : {}),
    [initialRouteSearch]
  )
  const initialSearchKey = JSON.stringify(initialSearch)
  const routeSearch = useRouterState({
    select: (state) => validateDashboardSearch(state.location.search as Record<string, unknown>)
  })

  React.useEffect(() => {
    router
      .navigate({
        replace: true,
        search: initialSearch,
        to: '/dashboard/'
      })
      .catch(ignoreAsyncError)
  }, [initialSearch, initialSearchKey, router])

  return routeSearch
}

function ignoreAsyncError() {}
