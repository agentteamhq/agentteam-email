import { useLoaderData, useRouter } from '@tanstack/react-router'

import { AuthRoutePage } from './auth-route-page'

export function SignInRouteScreen() {
  const routeState = useLoaderData({ from: '/signin' })
  const router = useRouter()

  return (
    <AuthRoutePage
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      view='signIn'
    />
  )
}
