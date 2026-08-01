import * as React from 'react'
import { createFileRoute, useMatch, useRouter } from '@tanstack/react-router'
import debug from 'debug'

import { readAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { validateDashboardSearch } from '../../lib/dashboard-search'
import {
  getOrganizationSettingsSectionFromSegment,
  getSettingsSectionFromSegment,
  getSettingsSectionRouteTarget
} from '../../partials/authenticated/settings-dialog-sections'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import {
  mailWorkspaceQueryInput,
  mailWorkspaceQueryOptions
} from '../../screens/dashboard-mail-workspace-query'
import { resolveFrontendServerRouteContext } from '../../server-route-context'
import type { FrontendLoaderInput } from '../../server-route-context'
import type { SettingsSectionId } from '../../partials/authenticated/settings-dialog-sections'
import type { AgentMailWorkspaceInput } from '@main/backend'
import type { QueryClient } from '@tanstack/react-query'

const log = debug('app:frontend:authenticated-shell')

const DASHBOARD_ROUTE = '/dashboard/' as const
const DEFAULT_SETTINGS_SECTION = 'account' satisfies SettingsSectionId

type ShellSettingsProps = Pick<
  React.ComponentProps<typeof DashboardMailController>,
  'onSettingsOpenChange' | 'onSettingsSectionChange' | 'settingsOpen' | 'settingsSection'
>

/**
 * Single mounted owner of the authenticated product shell. `/dashboard/`, `/settings/`,
 * `/settings/$section/`, and `/organization/$section/` are children of this pathless
 * layout route, so navigating between them keeps one `DashboardMailController` instance
 * mounted and preserves in-progress local state such as compose drafts.
 *
 * The child routes stay the owners of their own public path, head metadata, and
 * not-found handling; this route owns the shared search contract, the mail workspace
 * prefetch, and the rendered shell.
 */
export const Route = createFileRoute('/_authenticated/_shell')({
  validateSearch: validateDashboardSearch,
  loaderDeps: ({ search }) => ({ mailWorkspace: mailWorkspaceQueryInput(search) }),
  loader: async (loaderInput) => {
    const routeState = readAuthenticatedRouteState(loaderInput.context)
    const queryClient = loaderInput.context.queryClient
    const input = loaderInput.deps.mailWorkspace

    if (await seedServerMailWorkspace(loaderInput, queryClient, input)) {
      return routeState
    }

    prefetchMailWorkspace(queryClient, input)

    return routeState
  },
  component: AuthenticatedShellRoute
})

/**
 * Resolves first-paint mail workspace data during the server render so the delivered
 * HTML carries the screen's data instead of skeleton-only markup.
 *
 * The product RPC client in `lib/rpc-api-client` is browser-owned: it derives its origin
 * from `window.location` and authenticates with the browser session cookie, so it cannot
 * be called from the server render. The server render instead uses the existing
 * authenticated server route handler seam that already carries the browser request into
 * loaders, and seeds the same query key the browser query reads. The seeded value is
 * dehydrated by `setupRouterSsrQueryIntegration` and hydrated by the client.
 *
 * Returns `true` when the cache was seeded, so the browser prefetch is skipped.
 */
async function seedServerMailWorkspace(
  loaderInput: FrontendLoaderInput,
  queryClient: QueryClient,
  input: AgentMailWorkspaceInput
): Promise<boolean> {
  const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)
  const loadMailWorkspaceRoute = serverRouteContext?.serverRouteHandlers.loadMailWorkspaceRoute

  if (!serverRouteContext || !loadMailWorkspaceRoute) {
    return false
  }

  const { workspace } = await loadMailWorkspaceRoute(serverRouteContext.request, input)

  if (!workspace) {
    log('mail workspace server render produced no workspace %o', input)
    return false
  }

  queryClient.setQueryData(mailWorkspaceQueryOptions({ input }).queryKey, workspace)
  log('mail workspace seeded from the server render %o', input)

  return true
}

/**
 * Starts the browser mail workspace request from the owning route loader so route
 * preloading and route transitions have the data in flight before the screen renders.
 *
 * The prefetch is not awaited: `placeholderData: keepPreviousData` already holds every
 * rendered region while the next search-keyed request resolves, and blocking the loader
 * would stall search-param-driven controls such as the mailbox search input.
 */
function prefetchMailWorkspace(queryClient: QueryClient, input: AgentMailWorkspaceInput) {
  if (import.meta.env.SSR) {
    return
  }

  log('mail workspace prefetch started %o', input)

  queryClient
    .ensureQueryData(mailWorkspaceQueryOptions({ input }))
    .then(() => {
      log('mail workspace prefetch resolved %o', input)
    })
    .catch((error: unknown) => {
      log('mail workspace prefetch failed %o %o', input, error)
    })
}

function AuthenticatedShellRoute() {
  const routeState = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const settingsSection = useShellSettingsSection()

  const navigateToSettingsSection = useSettingsSectionNavigation()

  // Settings visibility is route state: opening navigates to the settings route, closing
  // returns to the dashboard. The shell never leaves it to the screen's uncontrolled state.
  const handleSettingsOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) {
        log('settings opened; navigating to the settings route')
        navigateToSettingsSection(DEFAULT_SETTINGS_SECTION)
        return
      }

      log('settings closed; returning to the dashboard')
      // `search: true` keeps the shell's search contract, so the mailbox folder, account,
      // message, and mailbox administration surface the user had open survive the round trip.
      router.navigate({ search: true, to: DASHBOARD_ROUTE }).catch((error: unknown) => {
        log('dashboard navigation failed %o', error)
      })
    },
    [navigateToSettingsSection, router]
  )
  const handleSettingsSectionChange = React.useCallback(
    (nextSection: SettingsSectionId) => {
      log('settings section changed %s', nextSection)
      navigateToSettingsSection(nextSection)
    },
    [navigateToSettingsSection]
  )

  // The shell stays mounted across every product route, so settings visibility must stay
  // fully controlled by the matched route. Leaving `settingsOpen` undefined would fall
  // back to the screen's uncontrolled state, which would now persist across navigation.
  const settingsProps = React.useMemo<ShellSettingsProps>(
    () =>
      settingsSection
        ? {
            onSettingsOpenChange: handleSettingsOpenChange,
            onSettingsSectionChange: handleSettingsSectionChange,
            settingsOpen: true,
            settingsSection
          }
        : {
            onSettingsOpenChange: handleSettingsOpenChange,
            onSettingsSectionChange: handleSettingsSectionChange,
            settingsOpen: false
          },
    [handleSettingsOpenChange, handleSettingsSectionChange, settingsSection]
  )

  return (
    <DashboardMailController
      {...settingsProps}
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      routeSearch={search}
    />
  )
}

/**
 * Navigates to the settings or organization route that owns a settings surface while
 * retaining the current search params.
 *
 * The settings, organization, and dashboard routes are children of this layout route and
 * share one validated search contract, so the retained params stay valid on every target.
 * Navigating with a pre-built href instead would replace the destination search with the
 * params parsed out of that href, of which there are none, and silently reset the mailbox
 * folder, account, message, and mailbox administration surface the user had open.
 *
 * The route template is chosen by the owning `settings-dialog-sections` definition; the
 * branch stays here because each template has its own typed `to`/`params` pair.
 */
function useSettingsSectionNavigation() {
  const router = useRouter()

  return React.useCallback(
    (section: SettingsSectionId) => {
      const target = getSettingsSectionRouteTarget(section)
      const navigation =
        target.route === 'organization'
          ? router.navigate({
              params: { section: target.segment },
              search: true,
              to: '/organization/$section/'
            })
          : router.navigate({
              params: { section: target.segment },
              search: true,
              to: '/settings/$section/'
            })

      navigation.catch((error: unknown) => {
        log('settings section navigation failed %s %o', section, error)
      })
    },
    [router]
  )
}

/**
 * Derives the settings surface from the matched route's own params and feeds the segment to
 * the owning `settings-dialog-sections` helpers.
 *
 * Matching on routes rather than parsing `location.pathname` keeps this correct under a
 * router basepath and gives the same decoded segment the route loader validated.
 */
function useShellSettingsSection(): SettingsSectionId | null {
  const organizationSection = useMatch({
    from: '/_authenticated/_shell/organization/$section',
    shouldThrow: false,
    select: (match) => getOrganizationSettingsSectionFromSegment(match.params.section)
  })
  const settingsSection = useMatch({
    from: '/_authenticated/_shell/settings/$section',
    shouldThrow: false,
    select: (match) => getSettingsSectionFromSegment(match.params.section)
  })
  const settingsRootMatched = useMatch({
    from: '/_authenticated/_shell/settings',
    shouldThrow: false,
    select: () => true
  })

  return organizationSection ?? settingsSection ?? (settingsRootMatched ? DEFAULT_SETTINGS_SECTION : null)
}
