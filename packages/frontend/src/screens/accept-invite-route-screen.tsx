import { useLoaderData, useRouter } from '@tanstack/react-router'

import { AuthRoutePage } from './auth-route-page'

export function AcceptInviteRouteScreen() {
  const routeState = useLoaderData({ from: '/accept-invite' })
  const router = useRouter()

  return (
    <AuthRoutePage
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      view='acceptInvitation'
    />
  )
}
