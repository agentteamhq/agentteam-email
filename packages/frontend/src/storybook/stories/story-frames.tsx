import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouter, useRouterState } from '@tanstack/react-router'

import { validateDashboardSearch, validateSettingsSearch } from '../../lib/dashboard-search'
import {
  resolveOrganizationRouteSegment,
  resolveSettingsRouteSegment
} from '../../partials/authenticated/settings-dialog-sections'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import { integrationsEmptyView } from '../integrations-fixtures'
import type { SettingsRouteSearch } from '../../lib/dashboard-search'
import type { AgentAccessSettingsState } from '../../partials/authenticated/settings-dialog'

type DashboardMailControllerArgs = React.ComponentProps<typeof DashboardMailController>

export type DashboardMailControllerStoryFrameProps = DashboardMailControllerArgs & {
  agentAccessView?: NonNullable<AgentAccessSettingsState['view']>
  storyPath?: string
}

export function DashboardMailControllerStoryFrame({
  agentAccessView,
  routeSearch: initialRouteSearch,
  storyPath = '/dashboard/',
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
  const routeSearch = useStoryDashboardSearch(initialRouteSearch, storyPath)
  const agentAccessViewLoader = React.useMemo(() => {
    if (agentAccessView === undefined) {
      return props.agentAccessViewLoader
    }

    return async () => agentAccessView
  }, [agentAccessView, props.agentAccessViewLoader])
  const integrationsViewLoader = React.useMemo(
    () => props.integrationsViewLoader ?? (async () => integrationsEmptyView),
    [props.integrationsViewLoader]
  )

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
        integrationsViewLoader={integrationsViewLoader}
        routeSearch={routeSearch}
      />
    </QueryClientProvider>
  )
}

function useStoryDashboardSearch(initialRouteSearch: SettingsRouteSearch | undefined, storyPath: string) {
  const router = useRouter()
  const initialSearch = React.useMemo(
    () => validateStorySearch(storyPath, initialRouteSearch ? { ...initialRouteSearch } : {}),
    [initialRouteSearch, storyPath]
  )
  const initialSearchKey = JSON.stringify(initialSearch)
  const storyRouteKey = `${storyPath}:${initialSearchKey}`
  const [appliedStoryRouteKey, setAppliedStoryRouteKey] = React.useState<string | null>(null)
  const routerSearch = useRouterState({
    select: (state) =>
      storyDashboardSearchFromRouterSearch(
        state.location.pathname,
        state.location.search as Record<string, unknown>
      )
  })

  React.useEffect(() => {
    if (isCanonicalSettingsRoutePath(storyPath)) {
      router
        .navigate({
          href: storyPath,
          replace: true
        })
        .then(() => {
          setAppliedStoryRouteKey(storyRouteKey)
        })
        .catch(ignoreAsyncError)
      return
    }

    router
      .navigate({
        replace: true,
        search: validateDashboardSearch({ ...initialSearch }),
        to: '/dashboard/'
      })
      .then(() => {
        setAppliedStoryRouteKey(storyRouteKey)
      })
      .catch(ignoreAsyncError)
  }, [initialSearch, initialSearchKey, router, storyPath, storyRouteKey])

  return appliedStoryRouteKey === storyRouteKey && hasDashboardSearchValue(routerSearch)
    ? routerSearch
    : initialSearch
}

function storyDashboardSearchFromRouterSearch(
  pathname: string,
  search: Record<string, unknown>
): SettingsRouteSearch {
  const directSearch = validateStorySearch(pathname, search)
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

    return validateStorySearch(redirectUrl.pathname, Object.fromEntries(redirectUrl.searchParams.entries()))
  } catch {
    return directSearch
  }
}

function validateStorySearch(pathname: string, search: Record<string, unknown>): SettingsRouteSearch {
  return isCanonicalSettingsRoutePath(pathname)
    ? validateSettingsSearch(search)
    : validateDashboardSearch(search)
}

function isCanonicalSettingsRoutePath(pathname: string) {
  const normalizedPathname = pathname.endsWith('/') ? pathname : `${pathname}/`
  if (normalizedPathname === '/settings/') {
    return true
  }

  const settingsSectionMatch = /^\/settings\/([^/]+)\/$/u.exec(normalizedPathname)

  return settingsSectionMatch
    ? resolveSettingsRouteSegment(settingsSectionMatch[1]).type === 'section'
    : isCanonicalOrganizationSettingsRoutePath(normalizedPathname)
}

function isCanonicalOrganizationSettingsRoutePath(pathname: string) {
  const organizationSectionMatch = /^\/organization\/([^/]+)\/$/u.exec(pathname)

  return organizationSectionMatch
    ? resolveOrganizationRouteSegment(organizationSectionMatch[1]).type === 'section'
    : false
}

function hasDashboardSearchValue(search: SettingsRouteSearch) {
  return Object.values(search).some((value) => value !== undefined)
}

function ignoreAsyncError() {}
