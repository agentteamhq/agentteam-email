import { useSyncExternalStore } from 'react'
import { AuthSkeletonLoader } from '../components/auth-skeleton-loader'
import { authReactClient } from '../lib/auth-react-client'
import { BetterAuthPage } from '../partials/webapp/better-auth-page'
import { AuthViewScreen } from './auth-view-screen'
import type { AuthProviderProps } from '@better-auth-ui/react'
import type { AuthRouteState } from '@main/backend/routes/webapp'

import type {
  BetterAuthLastUsedLoginMethod,
  BetterAuthViewTemplateProps
} from '../partials/webapp/better-auth-view-template'
import type { PublicEnv } from '../types'

const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export interface AuthRoutePageProps {
  authClient?: AuthProviderProps['authClient']
  publicEnv: PublicEnv
  routeState: Pick<AuthRouteState, 'flash' | 'redirectTo' | 'user'>
  sessionCleanupEnabled?: boolean
  lastUsedLoginMethod?: BetterAuthLastUsedLoginMethod | null
  resetPasswordToken?: string
  view: BetterAuthViewTemplateProps['view']
}

export function AuthRoutePage({
  authClient,
  publicEnv,
  routeState,
  sessionCleanupEnabled,
  lastUsedLoginMethod,
  resetPasswordToken,
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
        resetPasswordToken={resetPasswordToken}
        sessionCleanupEnabled={sessionCleanupEnabled}
        authClient={authClient}
        publicEnv={publicEnv}
        flash={routeState.flash}
      />
    </AuthViewScreen>
  )
}

function ClientOnlyAuthPage(
  props: Pick<
    AuthRoutePageProps,
    | 'authClient'
    | 'lastUsedLoginMethod'
    | 'publicEnv'
    | 'resetPasswordToken'
    | 'sessionCleanupEnabled'
    | 'view'
  > &
    Pick<AuthRouteState, 'flash' | 'redirectTo'>
) {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)

  if (!mounted) {
    return <AuthSkeletonLoader />
  }

  const lastUsedLoginMethod =
    props.view === 'signIn'
      ? props.lastUsedLoginMethod === undefined
        ? resolveLastUsedLoginMethod()
        : props.lastUsedLoginMethod
      : null

  return (
    <BetterAuthPage
      view={props.view}
      redirectTo={props.redirectTo}
      lastUsedLoginMethod={lastUsedLoginMethod}
      resetPasswordToken={props.resetPasswordToken}
      sessionCleanupEnabled={props.sessionCleanupEnabled}
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
