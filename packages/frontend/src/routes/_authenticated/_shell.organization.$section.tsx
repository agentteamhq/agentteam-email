import { createFileRoute, notFound } from '@tanstack/react-router'

import {
  readAuthenticatedRouteState,
  type AuthenticatedRouteContext
} from '../../lib/authenticated-app-route'
import { getOrganizationSettingsSectionFromSegment } from '../../partials/authenticated/settings-dialog-sections'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'

export interface OrganizationSettingsRouteLoaderInput {
  context: AuthenticatedRouteContext
  params: {
    section?: string
  }
}

/**
 * `/organization/$section/` renders through the shared `_shell` layout route, which
 * reads this route's `section` param to open the matching organization settings surface
 * on the already-mounted `DashboardMailController`. This route owns the public path, the
 * section segment contract, and head metadata only.
 */
export const Route = createFileRoute('/_authenticated/_shell/organization/$section')({
  loader: loadOrganizationSettingsRouteState,
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Organization')
      },
      {
        name: 'description',
        content: `Manage ${SITE_STRINGS.BRAND_NAME} organization settings, members, invitations, and organization API keys.`
      }
    ]
  })
})

export function loadOrganizationSettingsRouteState({
  context,
  params
}: OrganizationSettingsRouteLoaderInput) {
  requireOrganizationSettingsSection(params.section)

  return readAuthenticatedRouteState(context)
}

function requireOrganizationSettingsSection(section: string | undefined) {
  const settingsSection = getOrganizationSettingsSectionFromSegment(section)
  if (!settingsSection) {
    throwOrganizationSettingsNotFound()
  }

  return settingsSection
}

function throwOrganizationSettingsNotFound(): never {
  notFound({ throw: true })
  throw new Error('TanStack Router did not throw not-found for /organization/$section.')
}
