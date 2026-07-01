/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, useRouter } from '@tanstack/react-router'
import * as React from 'react'

import { validateAdminAuditLogsSearch } from '../../lib/admin-audit-log-search'
import { AdminAuditLogsScreen } from '../../screens/admin/admin-audit-logs-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { AdminAuditLogsRouteSearchInput } from '../../lib/admin-audit-log-search'
import type { AdminRouteState } from '@main/backend/routes/webapp'

export const Route = createFileRoute('/admin/audit-logs')({
  validateSearch: validateAdminAuditLogsSearch,
  loader: ({ context }) => {
    const adminRouteState = (context as { adminRouteState?: AdminRouteState }).adminRouteState

    if (!adminRouteState) {
      throw new Error('Admin audit logs route loaded without admin route state.')
    }

    return adminRouteState
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Audit logs')
      },
      {
        name: 'description',
        content: `Browse ${SITE_STRINGS.BRAND_NAME} admin audit logs.`
      }
    ]
  }),
  component: AdminAuditLogsRouteScreen
})

function AdminAuditLogsRouteScreen() {
  const routeState = Route.useLoaderData()
  const routeSearch = Route.useSearch()
  const router = useRouter()
  const onSearchChange = React.useCallback(
    (nextSearch: AdminAuditLogsRouteSearchInput) => {
      router.navigate({
        search: validateAdminAuditLogsSearch({
          ...routeSearch,
          ...nextSearch
        }),
        to: '/admin/audit-logs/'
      }).catch(() => {})
    },
    [routeSearch, router]
  )

  return (
    <AdminAuditLogsScreen
      onSearchChange={onSearchChange}
      publicEnv={router.options.context.publicEnv}
      routeSearch={routeSearch}
      routeState={routeState}
    />
  )
}
