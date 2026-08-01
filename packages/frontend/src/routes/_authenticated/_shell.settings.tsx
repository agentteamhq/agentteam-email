import { createFileRoute } from '@tanstack/react-router'

import { SITE_STRINGS, formatSiteTitle } from '../../strings'

/**
 * `/settings/` renders through the shared `_shell` layout route, which opens the
 * settings surface on the already-mounted `DashboardMailController`. This route owns
 * the public path and head metadata only.
 */
export const Route = createFileRoute('/_authenticated/_shell/settings')({
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Settings')
      },
      {
        name: 'description',
        content: `Manage ${SITE_STRINGS.BRAND_NAME} account, security, connected account, integration, organization, and domain settings.`
      }
    ]
  })
})
