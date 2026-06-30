import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouter, useRouterState } from '@tanstack/react-router'

import { validateDashboardSearch } from '../../lib/dashboard-search'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import type { DashboardSearch } from '../../lib/dashboard-search'
import type { AgentAccessSettingsState } from '../../partials/authenticated/settings-dialog'

type DashboardMailControllerArgs = React.ComponentProps<typeof DashboardMailController>

export type DashboardMailControllerStoryFrameProps = DashboardMailControllerArgs & {
  agentAccessView?: NonNullable<AgentAccessSettingsState['view']>
}

export function DashboardMailControllerStoryFrame({
  agentAccessView,
  routeSearch: initialRouteSearch,
  ...props
}: DashboardMailControllerStoryFrameProps) {
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
  const agentAccessViewLoader = React.useMemo(() => {
    if (agentAccessView === undefined) {
      return props.agentAccessViewLoader
    }

    return async () => agentAccessView
  }, [agentAccessView, props.agentAccessViewLoader])

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
        agentAccessViewLoader={agentAccessViewLoader}
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
    select: (state) => storyDashboardSearchFromRouterSearch(state.location.search as Record<string, unknown>)
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

function storyDashboardSearchFromRouterSearch(search: Record<string, unknown>): DashboardSearch {
  const directSearch = validateDashboardSearch(search)
  if (hasDashboardSearchValue(directSearch)) {
    return directSearch
  }

  const redirect = typeof search.redirect === 'string' ? search.redirect : undefined
  if (!redirect) {
    return directSearch
  }

  try {
    const redirectUrl = new URL(redirect, 'http://storybook.local')
    if (redirectUrl.pathname !== '/dashboard/' && redirectUrl.pathname !== '/dashboard') {
      return directSearch
    }

    return validateDashboardSearch(Object.fromEntries(redirectUrl.searchParams.entries()))
  } catch {
    return directSearch
  }
}

function hasDashboardSearchValue(search: DashboardSearch) {
  return Object.values(search).some((value) => value !== undefined)
}

function ignoreAsyncError() {}
