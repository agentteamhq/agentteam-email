/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, useRouter } from '@tanstack/react-router'

import { AdminDashboardScreen } from '../../screens/admin/admin-dashboard-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { AdminRouteState } from '@main/backend/routes/webapp'

export const Route = createFileRoute('/admin/')({
  loader: ({ context }) => {
    const adminRouteState = (context as { adminRouteState?: AdminRouteState }).adminRouteState

    if (!adminRouteState) {
      throw new Error('Admin route loaded without admin route state.')
    }

    return adminRouteState
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Admin')
      },
      {
        name: 'description',
        content: `Review ${SITE_STRINGS.BRAND_NAME} audit logs and instance setup health.`
      }
    ]
  }),
  component: AdminRouteScreen
})

function AdminRouteScreen() {
  const routeState = Route.useLoaderData()
  const router = useRouter()

  return (
    <AdminDashboardScreen
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
    />
  )
}
