import { storyPublicEnv } from './screen-fixtures'
import type { AuthRoutePageProps } from '../screens/auth-route-page'

export const defaultAuthRouteArgs = {
  publicEnv: storyPublicEnv,
  sessionCleanupEnabled: false
} satisfies Pick<AuthRoutePageProps, 'publicEnv' | 'sessionCleanupEnabled'>
