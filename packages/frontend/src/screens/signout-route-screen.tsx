import { useLoaderData, useRouter } from '@tanstack/react-router'

import { AuthRoutePage } from './auth-route-page'

export function SignOutRouteScreen() {
  const routeState = useLoaderData({ from: '/signout' })
  const router = useRouter()

  return (
    <AuthRoutePage
      publicEnv={router.options.context.publicEnv}
      routeState={{
        flash: null,
        redirectTo: routeState.redirectTo,
        user: null
      }}
      view='signOut'
    />
  )
}
