import { useLoaderData, useRouter } from '@tanstack/react-router'

import { AuthRoutePage } from './auth-route-page'

export function MagicLinkRouteScreen() {
  const routeState = useLoaderData({ from: '/magic-link' })
  const router = useRouter()

  return (
    <AuthRoutePage
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      view='magicLink'
    />
  )
}
