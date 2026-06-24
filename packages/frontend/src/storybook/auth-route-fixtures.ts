import { storyPublicEnv } from './screen-fixtures'
import { storyAuthClient } from './auth-client-fixtures'
import type { AuthRoutePageProps } from '../screens/auth-route-page'

export const defaultAuthRouteArgs = {
  authClient: storyAuthClient,
  publicEnv: storyPublicEnv,
  sessionCleanupEnabled: false
} satisfies Pick<AuthRoutePageProps, 'authClient' | 'publicEnv' | 'sessionCleanupEnabled'>
