import { useLoaderData, useRouter } from '@tanstack/react-router'

import { AuthRoutePage } from './auth-route-page'

export function ForgotPasswordRouteScreen() {
  const routeState = useLoaderData({ from: '/forgot-password' })
  const router = useRouter()

  return (
    <AuthRoutePage
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      view='forgotPassword'
    />
  )
}
