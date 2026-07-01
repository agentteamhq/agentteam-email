import { useLoaderData, useRouter } from '@tanstack/react-router'

import { AuthRoutePage } from './auth-route-page'

export function VerifyEmailRouteScreen() {
  const routeState = useLoaderData({ from: '/verify-email' })
  const router = useRouter()

  return (
    <AuthRoutePage
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      view='verifyEmail'
    />
  )
}
