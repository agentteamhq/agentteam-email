import { apiKeyClient } from '@better-auth/api-key/client'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import {
  adminClient,
  deviceAuthorizationClient,
  jwtClient,
  lastLoginMethodClient,
  magicLinkClient,
  organizationClient
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

function getAuthBaseUrl() {
  if (typeof globalThis.window === 'undefined') {
    return 'http://localhost'
  }

  return `${globalThis.window.location.protocol}//${globalThis.window.location.host}`
}

type LastLoginMethodActions = ReturnType<ReturnType<typeof lastLoginMethodClient>['getActions']>
type AuthReactClient = ReturnType<typeof createAuthClient> & LastLoginMethodActions

const authReactClientOptions = {
  baseURL: getAuthBaseUrl(),
  basePath: '/rpc/auth/api',
  plugins: [
    organizationClient(),
    magicLinkClient(),
    adminClient(),
    apiKeyClient(),
    oauthProviderClient(),
    jwtClient(),
    deviceAuthorizationClient(),
    lastLoginMethodClient()
  ]
}

export const authReactClient = createAuthClient(authReactClientOptions) as AuthReactClient
