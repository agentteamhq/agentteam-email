import type { AuthProviderProps } from '@better-auth-ui/react'

import { storyAuthenticatedUser } from './screen-fixtures'

export type StoryAuthClient = AuthProviderProps['authClient']

const storySession = {
  id: 'session_storybook_agentteam_email_admin',
  userId: storyAuthenticatedUser.id,
  token: 'storybook-session-token',
  expiresAt: storyAuthenticatedUser.updatedAt,
  createdAt: storyAuthenticatedUser.createdAt,
  updatedAt: storyAuthenticatedUser.updatedAt,
  ipAddress: '203.0.113.17',
  userAgent: 'Storybook Chromium'
}

const storySessionData = {
  session: storySession,
  user: storyAuthenticatedUser
}

const credentialAccount = {
  id: 'account_storybook_credential',
  accountId: storyAuthenticatedUser.email,
  providerId: 'credential',
  userId: storyAuthenticatedUser.id,
  createdAt: storyAuthenticatedUser.createdAt,
  updatedAt: storyAuthenticatedUser.updatedAt
}

const storyApiKey = {
  id: 'key_storybook_agent_cli',
  name: 'Agent CLI',
  start: 'ck_live',
  prefix: 'ck_live_story',
  createdAt: storyAuthenticatedUser.createdAt,
  updatedAt: storyAuthenticatedUser.updatedAt,
  expiresAt: null,
  enabled: true,
  metadata: null,
  userId: storyAuthenticatedUser.id,
  lastRefillAt: null,
  lastRequest: storyAuthenticatedUser.updatedAt,
  rateLimitEnabled: false,
  rateLimitTimeWindow: null,
  rateLimitMax: null,
  requestCount: 12,
  remaining: null,
  refillAmount: null,
  refillInterval: null,
  permissions: null
}

export function createAuthStoryClient(options: { signedIn?: boolean } = {}): StoryAuthClient {
  const signedIn = options.signedIn ?? false

  return {
    getSession: async () => (signedIn ? storySessionData : null),
    listAccounts: async () => [credentialAccount],
    listSessions: async () => [storySession],
    revokeSession: async () => ({ success: true }),
    changeEmail: async () => ({ success: true }),
    changePassword: async () => ({ success: true }),
    updateUser: async () => storySessionData,
    deleteUser: async () => ({ success: true }),
    sendVerificationEmail: async () => ({ success: true }),
    requestPasswordReset: async () => ({ success: true }),
    resetPassword: async () => ({ success: true }),
    signOut: async () => ({ success: true }),
    signIn: {
      email: async () => storySessionData,
      magicLink: async () => ({ success: true }),
      social: async () => ({ url: '/callback/' })
    },
    signUp: {
      email: async () => storySessionData
    },
    apiKey: {
      create: async () => ({
        key: 'ck_live_storybook_created_secret'
      }),
      delete: async () => ({
        success: true
      }),
      list: async () => ({
        apiKeys: [storyApiKey]
      })
    }
  } as unknown as StoryAuthClient
}
