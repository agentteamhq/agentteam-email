import { createFileRoute } from '@tanstack/react-router'

import { SITE_STRINGS, formatSiteTitle } from '../../strings'

/**
 * `/dashboard/` renders through the shared `_shell` layout route, which keeps one
 * `DashboardMailController` mounted across the dashboard, settings, and organization
 * routes. This route owns the public path and head metadata only.
 */
export const Route = createFileRoute('/_authenticated/_shell/dashboard')({
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Dashboard')
      },
      {
        name: 'description',
        content: `Operate the ${SITE_STRINGS.BRAND_NAME} dashboard and account settings shell.`
      }
    ]
  })
})
