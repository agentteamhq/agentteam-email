import { fn } from 'storybook/test'

import { authenticatedSettingsRouteState } from './screen-fixtures'
import type {
  OAuthConsentAuthClient,
  OAuthConsentRouteScreenProps,
  OAuthConsentSearch
} from '../screens/oauth-consent-route-screen'
import type { OAuthClient } from '@better-auth/oauth-provider'

export const paperclipOAuthClient = {
  client_id: 'paperclip-oauth-client-story',
  client_name: 'Paperclip',
  client_uri: 'https://paperclip.example.test',
  contacts: ['security@paperclip.example.test'],
  policy_uri: 'https://paperclip.example.test/privacy',
  tos_uri: 'https://paperclip.example.test/terms'
} satisfies Partial<OAuthClient>

export const unknownOAuthClient = {
  client_id: 'unknown-client-story',
  client_name: 'Unknown App'
} satisfies Partial<OAuthClient>

export const paperclipOAuthConsentSearch = {
  client_id: paperclipOAuthClient.client_id,
  code: 'story-consent-code',
  scope: 'openid profile email offline_access email.full_access'
} satisfies OAuthConsentSearch

export const unsupportedScopeOAuthConsentSearch = {
  ...paperclipOAuthConsentSearch,
  scope: 'openid email.full_access mail.admin'
} satisfies OAuthConsentSearch

export const missingCodeOAuthConsentSearch = {
  client_id: paperclipOAuthClient.client_id,
  scope: paperclipOAuthConsentSearch.scope
} satisfies OAuthConsentSearch

export const oauthConsentRedirectUrl =
  'https://paperclip.example.test/oauth/callback?code=authorized-story-code&state=paperclip-state'

export const oauthConsentDeniedRedirectUrl =
  'https://paperclip.example.test/oauth/callback?error=access_denied&state=paperclip-state'

export const oauthConsentRouteState = authenticatedSettingsRouteState

export const redirectOAuthConsent = fn<(href: string) => void>()

export function createOAuthConsentAuthClient({
  client = paperclipOAuthClient,
  consentRedirectUrl = oauthConsentRedirectUrl,
  publicClientError = null
}: {
  client?: Partial<OAuthClient>
  consentRedirectUrl?: string
  publicClientError?: Error | null
} = {}): OAuthConsentAuthClient {
  return {
    oauth2: {
      publicClient: fn(async () => {
        if (publicClientError) {
          throw publicClientError
        }
        return { data: client }
      }),
      consent: fn(async ({ accept }: { accept: boolean }) => ({
        data: {
          redirect_uri: accept ? consentRedirectUrl : oauthConsentDeniedRedirectUrl
        }
      }))
    }
  } as unknown as OAuthConsentAuthClient
}

export function loadingOAuthConsentAuthClient(): OAuthConsentAuthClient {
  return {
    oauth2: {
      publicClient: fn(() => new Promise(() => undefined)),
      consent: fn(async () => ({
        data: {
          redirect_uri: oauthConsentRedirectUrl
        }
      }))
    }
  } as unknown as OAuthConsentAuthClient
}

export function buildOAuthConsentStoryArgs(
  args: Partial<OAuthConsentRouteScreenProps> = {}
): OAuthConsentRouteScreenProps {
  return {
    authClient: createOAuthConsentAuthClient(),
    onRedirect: redirectOAuthConsent,
    routeState: oauthConsentRouteState,
    search: paperclipOAuthConsentSearch,
    ...args
  }
}
