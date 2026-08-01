import { createFileRoute, notFound } from '@tanstack/react-router'

import { resolveSettingsRouteSegment } from '../../partials/authenticated/settings-dialog-sections'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'

/**
 * `/settings/$section/` renders through the shared `_shell` layout route, which reads
 * this route's `section` param to open the matching settings surface on the
 * already-mounted `DashboardMailController`. This route owns the public path, the
 * section segment contract, and head metadata only.
 */
export const Route = createFileRoute('/_authenticated/_shell/settings/$section')({
  loader: ({ params }) => {
    requireSettingsRouteSection(params.section)
  },
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

function requireSettingsRouteSection(section: string | undefined) {
  const sectionRoute = resolveSettingsRouteSegment(section)

  if (sectionRoute.type === 'notFound') {
    notFound({ throw: true })
  }
}
