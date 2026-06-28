import { authQueryKeys } from '@better-auth-ui/core'
import { useLoaderData, useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { authReactClient } from '../lib/auth-react-client'
import { clearPersistedStore } from '../store/use-store'
import { AuthRoutePage } from './auth-route-page'

export function SignOutRouteScreen() {
  const routeState = useLoaderData({ from: '/signout' })
  const router = useRouter()
  const hasStartedSignOutRef = useRef(false)

  useEffect(() => {
    if (hasStartedSignOutRef.current) {
      return
    }

    hasStartedSignOutRef.current = true

    let cancelled = false

    const finishSignOut = () => {
      router.options.context.queryClient.removeQueries({ queryKey: authQueryKeys.all })
      clearPersistedStore()

      if (cancelled) {
        return
      }

      router.navigate({ href: routeState.redirectTo, replace: true }).catch(() => {})
    }

    authReactClient.signOut({ fetchOptions: { throw: true } }).then(finishSignOut, finishSignOut)

    return () => {
      cancelled = true
    }
  }, [routeState.redirectTo, router])

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
