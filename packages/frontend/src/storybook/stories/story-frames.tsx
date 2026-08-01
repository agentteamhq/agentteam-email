import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouter, useRouterState } from '@tanstack/react-router'

import { validateDashboardSearch } from '../../lib/dashboard-search'
import {
  getSettingsSectionForRoutePathname,
  getSettingsSectionHref,
  resolveOrganizationRouteSegment,
  resolveSettingsRouteSegment
} from '../../partials/authenticated/settings-dialog-sections'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import { integrationsEmptyView } from '../integrations-fixtures'
import type { DashboardSearch } from '../../lib/dashboard-search'
import type { AgentAccessSettingsState } from '../../partials/authenticated/settings-dialog'

type DashboardMailControllerArgs = React.ComponentProps<typeof DashboardMailController>

/**
 * `settingsOpen` and `settingsSection` are owned by the route, not by a story: the frame
 * derives them from `storyPath` through the same `settings-dialog-sections` definition the
 * authenticated shell route uses. Stories choose the route, never the derived state.
 */
export type DashboardMailControllerStoryFrameProps = Omit<
  DashboardMailControllerArgs,
  'onSettingsOpenChange' | 'onSettingsSectionChange' | 'settingsOpen' | 'settingsSection'
> & {
  agentAccessView?: NonNullable<AgentAccessSettingsState['view']>
  storyPath?: string
}

export function DashboardMailControllerStoryFrame({
  agentAccessView,
  routeSearch: initialRouteSearch,
  storyPath = '/dashboard/',
  ...props
}: DashboardMailControllerStoryFrameProps) {
  const router = useRouter()
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
  const settingsSection = useStorySettingsSection(storyPath)
  const handleSettingsOpenChange = React.useCallback(
    (open: boolean) => {
      router
        .navigate({
          href: open ? getSettingsSectionHref('account') : '/dashboard/'
        })
        .catch(ignoreAsyncError)
    },
    [router]
  )
  const handleSettingsSectionChange = React.useCallback(
    (nextSection: Parameters<typeof getSettingsSectionHref>[0]) => {
      router.navigate({ href: getSettingsSectionHref(nextSection) }).catch(ignoreAsyncError)
    },
    [router]
  )
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
        onSettingsOpenChange={handleSettingsOpenChange}
        onSettingsSectionChange={handleSettingsSectionChange}
        routeSearch={routeSearch}
        settingsOpen={settingsSection !== null}
        settingsSection={settingsSection ?? undefined}
      />
    </QueryClientProvider>
  )
}

/**
 * Derives the settings surface from the story's route with the production owner, so the
 * catalog cannot hand-craft a settings-open/section combination the app cannot reach.
 */
function useStorySettingsSection(storyPath: string) {
  const routerPathname = useRouterState({ select: (state) => state.location.pathname })
  const appliedPathname = isCanonicalSettingsRoutePath(routerPathname) ? routerPathname : storyPath

  return getSettingsSectionForRoutePathname(appliedPathname)
}

function useStoryDashboardSearch(initialRouteSearch: DashboardSearch | undefined, storyPath: string) {
  const router = useRouter()
  const initialSearch = React.useMemo(
    () => validateDashboardSearch(initialRouteSearch ? { ...initialRouteSearch } : {}),
    [initialRouteSearch]
  )
  const initialSearchKey = JSON.stringify(initialSearch)
  const storyRouteKey = `${storyPath}:${initialSearchKey}`
  const [appliedStoryRouteKey, setAppliedStoryRouteKey] = React.useState<string | null>(null)
  const routerSearch = useRouterState({
    select: (state) => storyDashboardSearchFromRouterSearch(state.location.search as Record<string, unknown>)
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

function hasDashboardSearchValue(search: DashboardSearch) {
  return Object.values(search).some((value) => value !== undefined)
}

function ignoreAsyncError() {}
