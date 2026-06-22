import { useLoaderData, useRouter, useSearch } from '@tanstack/react-router'

import { AuthRoutePage } from './auth-route-page'

export function ResetPasswordRouteScreen() {
  const routeState = useLoaderData({ from: '/reset-password' })
  const search = useSearch({ from: '/reset-password' })
  const router = useRouter()

  return (
    <AuthRoutePage
      publicEnv={router.options.context.publicEnv}
      routeState={routeState}
      resetPasswordToken={search.token}
      view='resetPassword'
    />
  )
}
