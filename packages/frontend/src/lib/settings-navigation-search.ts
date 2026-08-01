import { getSettingsSectionForRoutePathname } from '../partials/authenticated/settings-dialog-sections'
import { validateDashboardSearch } from './dashboard-search'

/**
 * Retains the authenticated shell's search contract when a navigation targets one of the
 * shell's settings or organization routes.
 *
 * Those routes are children of the `_authenticated/_shell` layout route and validate the
 * same search contract as `/dashboard/`, so the mailbox folder, account, message, and
 * mailbox administration surface the user had open must survive the navigation. Callers
 * that navigate with a pre-built href cannot use the router's `search: true` retention,
 * because the router replaces the destination search with the params parsed out of that
 * href, so the retained params are composed into the href here instead.
 *
 * Every other target is returned byte-identical: cross-origin targets, routes outside the
 * shell's settings surfaces, and settings targets with nothing to retain. Params already
 * present on the target win over the retained ones.
 */
export function settingsNavigationHrefWithRetainedSearch({
  baseURL,
  currentSearch,
  targetHref
}: {
  baseURL: string
  currentSearch: string
  targetHref: string
}): string {
  const publicURL = new URL(baseURL)
  const targetURL = new URL(targetHref, publicURL)

  if (targetURL.origin !== publicURL.origin) {
    return targetHref
  }

  if (!getSettingsSectionForRoutePathname(targetURL.pathname)) {
    return targetHref
  }

  const retainedSearch = validateDashboardSearch(
    Object.fromEntries(new URLSearchParams(currentSearch))
  )
  let retainedAnyParam = false

  for (const [key, value] of Object.entries(retainedSearch)) {
    if (value === undefined || targetURL.searchParams.has(key)) {
      continue
    }

    targetURL.searchParams.set(key, String(value))
    retainedAnyParam = true
  }

  if (!retainedAnyParam) {
    return targetHref
  }

  return `${targetURL.pathname}${targetURL.search}${targetURL.hash}`
}
