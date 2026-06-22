import { createFileRoute } from '@tanstack/react-router'

import { OnboardingRouteScreen } from '../screens/onboarding/onboarding-route-screen'
import { SITE_STRINGS, formatSiteTitle } from '../strings'

export const Route = createFileRoute('/onboarding')({
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Onboarding')
      },
      {
        name: 'description',
        content: `Set up the first admin account for ${SITE_STRINGS.BRAND_NAME}.`
      }
    ]
  }),
  component: OnboardingRouteScreen
})
