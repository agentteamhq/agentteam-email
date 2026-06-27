import { strictParse } from '@main/common'
import { getWebAppManifestIconUrl } from '../public-assets'
import type { AuthRouteState, BillingRouteState, SettingsRouteState } from '@main/backend/routes/webapp'

import type { PublicEnv } from '../types'

const storyDateReference = new Date(0)
type StoryAuthenticatedUser = NonNullable<SettingsRouteState['user']>
const storyAuthenticatedUserId = 'storybook-user-id' as StoryAuthenticatedUser['id']

export const storyPublicEnv: PublicEnv = {
  NODE_ENV: 'development',
  PUBLIC_HOSTNAME: 'http://localhost:6007',
  PUBLIC_GOOGLE_CLIENT_ID: 'storybook-google-client-id',
  PUBLIC_LINKEDIN_CLIENT_ID: 'storybook-linkedin-client-id',
  DEV: true,
  PROD: false,
  TEST: false,
  PUBLIC_HTTPS_PROTO: false
}

export function getStoryPublicEnv(): PublicEnv {
  return {
    ...storyPublicEnv,
    PUBLIC_HOSTNAME: getStoryPublicHostname()
  }
}

export function getStoryWebAppManifestIconUrl(size: 192 | 512) {
  return getWebAppManifestIconUrl(getStoryPublicHostname(), size)
}

function getStoryPublicHostname() {
  return globalThis.location?.origin ?? storyPublicEnv.PUBLIC_HOSTNAME
}

export const storyAuthenticatedUser = {
  id: storyAuthenticatedUserId,
  name: 'Marin Patel',
  email: 'marin.patel@northstar-ops.example.test',
  emailVerified: true,
  image: null,
  createdAt: strictParse('2026-03-18 16:20:00', 'yyyy-MM-dd HH:mm:ss', storyDateReference),
  updatedAt: strictParse('2026-05-25 11:37:55', 'yyyy-MM-dd HH:mm:ss', storyDateReference),
  lastLoginMethod: 'email',
  role: 'admin',
  banned: false,
  banReason: null,
  banExpires: null
} as StoryAuthenticatedUser

export const authenticatedSettingsRouteState = {
  flash: null,
  redirectTo: '/signin/',
  setCookieHeaders: [],
  shouldRedirectToSignIn: false,
  shouldRedirectToSetup: false,
  user: storyAuthenticatedUser
} satisfies SettingsRouteState

export const activeBillingRouteState = {
  ...authenticatedSettingsRouteState,
  customerStatus: {
    stripeSubscriptionId: 'sub_email_team_01',
    stripeSubscriptionStatus: 'active',
    stripePriceLookupKey: 'email_team',
    stripeLastUpdatedISO8604: '2026-05-24T18:42:00Z',
    label: {
      plan: 'Email Team',
      status: 'Active'
    }
  },
  shouldRedirectToSignIn: false
} satisfies BillingRouteState

export const billingNeedsCheckoutRouteState = {
  ...authenticatedSettingsRouteState,
  customerStatus: {
    stripeSubscriptionId: null,
    stripeSubscriptionStatus: null,
    stripePriceLookupKey: null,
    stripeLastUpdatedISO8604: null,
    label: {
      plan: 'None',
      status: 'Inactive'
    }
  },
  shouldRedirectToSignIn: false
} satisfies BillingRouteState

export const protectedRouteSignInState = {
  flash: null,
  redirectTo: '/',
  shouldRedirectToDashboard: false,
  shouldRedirectToSetup: false,
  user: null
} satisfies AuthRouteState

export const publicAuthRouteState = {
  flash: null,
  redirectTo: '/',
  shouldRedirectToDashboard: false,
  shouldRedirectToSetup: false,
  user: null
} satisfies AuthRouteState

export const resetSuccessAuthRouteState = {
  ...publicAuthRouteState,
  flash: 'Your password has been reset. Please sign in with your new password.'
} satisfies AuthRouteState
