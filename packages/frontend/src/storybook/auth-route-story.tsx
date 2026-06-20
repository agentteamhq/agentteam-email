import type { AuthProviderProps } from '@better-auth-ui/react'
import type { AuthRouteState } from '@main/backend/routes/webapp'
import { useLayoutEffect } from 'react'

import type {
  BetterAuthLastUsedLoginMethod,
  BetterAuthViewTemplateProps
} from '../partials/webapp/better-auth-view-template'
import { AuthRoutePage } from '../screens/auth-route-page'
import type { PublicEnv } from '../types'
import { createAuthStoryClient } from './auth-story-client'

export interface AuthRouteStoryProps {
  authClient?: AuthProviderProps['authClient']
  publicEnv: PublicEnv
  routeState: Pick<AuthRouteState, 'flash' | 'redirectTo' | 'user'>
  lastUsedLoginMethod?: BetterAuthLastUsedLoginMethod | null
  search?: string
  signedIn?: boolean
  view: BetterAuthViewTemplateProps['view']
}

const publicAuthClient = createAuthStoryClient()
const signedInAuthClient = createAuthStoryClient({ signedIn: true })

export function AuthRouteStory({
  authClient,
  publicEnv,
  routeState,
  lastUsedLoginMethod,
  search = '',
  signedIn = false,
  view
}: AuthRouteStoryProps) {
  useLayoutEffect(() => {
    const url = new URL(globalThis.window.location.href)
    url.search = search
    globalThis.window.history.replaceState({}, '', url)
  }, [search])

  return (
    <AuthRoutePage
      authClient={authClient ?? (signedIn ? signedInAuthClient : publicAuthClient)}
      publicEnv={publicEnv}
      routeState={routeState}
      lastUsedLoginMethod={lastUsedLoginMethod}
      view={view}
    />
  )
}
