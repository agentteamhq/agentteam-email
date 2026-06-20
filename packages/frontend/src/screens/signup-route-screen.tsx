import { useLoaderData, useRouter } from '@tanstack/react-router'

import { AuthRoutePage } from './auth-route-page'

export function SignUpRouteScreen() {
  const routeState = useLoaderData({ from: '/signup' })
  const router = useRouter()

  return (
    <AuthRoutePage
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      view='signUp'
    />
  )
}
