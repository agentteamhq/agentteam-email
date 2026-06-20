import { useSyncExternalStore } from 'react'
import type { AuthProviderProps } from '@better-auth-ui/react'
import type { AuthRouteState } from '@main/backend/routes/webapp'

import { AuthSkeletonLoader } from '../components/auth-skeleton-loader'
import { authReactClient } from '../lib/auth-react-client'
import { BetterAuthPage } from '../partials/webapp/better-auth-page'
import type {
  BetterAuthLastUsedLoginMethod,
  BetterAuthViewTemplateProps
} from '../partials/webapp/better-auth-view-template'
import type { PublicEnv } from '../types'
import { AuthViewScreen } from './auth-view-screen'

const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export interface AuthRoutePageProps {
  authClient?: AuthProviderProps['authClient']
  publicEnv: PublicEnv
  routeState: Pick<AuthRouteState, 'flash' | 'redirectTo' | 'user'>
  lastUsedLoginMethod?: BetterAuthLastUsedLoginMethod | null
  view: BetterAuthViewTemplateProps['view']
}

export function AuthRoutePage({
  authClient,
  publicEnv,
  routeState,
  lastUsedLoginMethod,
  view
}: AuthRoutePageProps) {
  return (
    <AuthViewScreen
      publicEnv={publicEnv}
      routeState={routeState}
    >
      <ClientOnlyAuthPage
        view={view}
        redirectTo={routeState.redirectTo}
        lastUsedLoginMethod={lastUsedLoginMethod}
        authClient={authClient}
        publicEnv={publicEnv}
        flash={routeState.flash}
      />
    </AuthViewScreen>
  )
}

function ClientOnlyAuthPage(
  props: Pick<AuthRoutePageProps, 'authClient' | 'lastUsedLoginMethod' | 'publicEnv' | 'view'> &
    Pick<AuthRouteState, 'flash' | 'redirectTo'>
) {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)

  if (!mounted) {
    return <AuthSkeletonLoader />
  }

  const lastUsedLoginMethod =
    props.lastUsedLoginMethod === undefined ? resolveLastUsedLoginMethod() : props.lastUsedLoginMethod

  return (
    <BetterAuthPage
      view={props.view}
      redirectTo={props.redirectTo}
      lastUsedLoginMethod={lastUsedLoginMethod}
      authClient={props.authClient}
      publicEnv={props.publicEnv}
      flash={props.flash}
    />
  )
}

function resolveLastUsedLoginMethod(): BetterAuthLastUsedLoginMethod | null {
  const method = authReactClient.getLastUsedLoginMethod()

  switch (method) {
    case 'email':
    case 'google':
    case 'linkedin':
    case 'magic-link':
      return method
    default:
      return null
  }
}
