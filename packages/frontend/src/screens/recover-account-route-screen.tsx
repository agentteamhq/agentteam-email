import { useLoaderData, useRouter } from '@tanstack/react-router'

import { AuthRoutePage } from './auth-route-page'

export function RecoverAccountRouteScreen() {
  const routeState = useLoaderData({ from: '/recover-account' })
  const router = useRouter()

  return (
    <AuthRoutePage
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      view='recoverAccount'
    />
  )
}
