import { apiKeyClient } from '@better-auth/api-key/client'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { passkeyClient } from '@better-auth/passkey/client'
import {
  adminClient,
  deviceAuthorizationClient,
  jwtClient,
  lastLoginMethodClient,
  magicLinkClient,
  multiSessionClient,
  organizationClient,
  usernameClient
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

function getAuthBaseUrl() {
  if (typeof globalThis.window === 'undefined') {
    return 'http://localhost'
  }

  return `${globalThis.window.location.protocol}//${globalThis.window.location.host}`
}

type LastLoginMethodActions = ReturnType<ReturnType<typeof lastLoginMethodClient>['getActions']>

const authReactClientOptions = {
  baseURL: getAuthBaseUrl(),
  basePath: '/rpc/auth/api',
  plugins: [
    organizationClient(),
    usernameClient(),
    magicLinkClient(),
    passkeyClient(),
    multiSessionClient(),
    adminClient(),
    apiKeyClient(),
    oauthProviderClient(),
    jwtClient(),
    deviceAuthorizationClient(),
    lastLoginMethodClient()
  ]
}

const baseAuthReactClient = createAuthClient(authReactClientOptions)

export const authReactClient = baseAuthReactClient as typeof baseAuthReactClient & LastLoginMethodActions
