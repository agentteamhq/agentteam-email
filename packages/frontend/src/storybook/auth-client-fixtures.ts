import { authReactClient } from '../lib/auth-react-client'
import { storyAuthenticatedUser } from './screen-fixtures'
import type { AuthProviderProps } from '@better-auth-ui/react'

type StoryAuthMethodInput = {
  body?: {
    organizationId?: string | null
    [key: string]: unknown
  }
  query?: {
    accountId?: string
    organizationId?: string | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

const storyNow = new Date('2026-06-01T12:00:00.000Z')
const storySessionExpiresAt = new Date('2026-12-01T12:00:00.000Z')

const storyUser = {
  ...storyAuthenticatedUser,
  displayUsername: 'Marin Patel',
  email: storyAuthenticatedUser.email ?? 'marin.patel@northstar-ops.example.test',
  emailVerified: storyAuthenticatedUser.emailVerified ?? true,
  name: storyAuthenticatedUser.name ?? 'Marin Patel',
  username: 'marin.patel'
}

const storySession = {
  id: 'story-session-current',
  activeOrganizationId: 'story-organization-northstar',
  createdAt: storyNow,
  expiresAt: storySessionExpiresAt,
  ipAddress: '127.0.0.1',
  token: 'story-session-current-value',
  updatedAt: storyNow,
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  userId: storyUser.id
}

const storyOrganization = {
  id: 'story-organization-northstar',
  name: 'Northstar Ops',
  slug: 'northstar-ops',
  logo: null,
  createdAt: storyNow,
  updatedAt: storyNow
}

const storyMembers = [
  {
    id: 'story-member-owner',
    organizationId: storyOrganization.id,
    role: 'owner',
    userId: storyUser.id,
    createdAt: storyNow,
    user: {
      email: storyUser.email,
      image: storyUser.image,
      name: storyUser.name
    }
  },
  {
    id: 'story-member-admin',
    organizationId: storyOrganization.id,
    role: 'admin',
    userId: 'story-user-teammate',
    createdAt: storyNow,
    user: {
      email: 'lee.chen@northstar-ops.example.test',
      image: null,
      name: 'Lee Chen'
    }
  }
]

const storyInvitations = [
  {
    id: 'story-invitation-pending',
    email: 'taylor.nguyen@northstar-ops.example.test',
    organizationId: storyOrganization.id,
    role: 'member',
    status: 'pending',
    createdAt: storyNow,
    expiresAt: storySessionExpiresAt
  }
]

const storyFullOrganization = {
  ...storyOrganization,
  members: storyMembers,
  invitations: storyInvitations
}

const storyAccounts = [
  {
    id: 'story-account-credential',
    accountId: storyUser.email,
    providerId: 'credential',
    createdAt: storyNow,
    updatedAt: storyNow
  },
  {
    id: 'story-account-google',
    accountId: 'story-google-account',
    providerId: 'google',
    createdAt: storyNow,
    updatedAt: storyNow
  }
]

const storyApiKeys = [
  {
    id: 'story-api-key-ci',
    configId: 'default',
    name: 'CI mailbox client',
    start: 'agent_story',
    prefix: 'agent_',
    createdAt: storyNow,
    updatedAt: storyNow,
    enabled: true,
    expiresAt: null
  }
]

const storyOrganizationApiKeys = [
  {
    ...storyApiKeys[0],
    id: 'story-api-key-org-worker',
    configId: 'organization',
    name: 'Cloudflare worker bridge'
  }
]

function selectApiKeys(input?: StoryAuthMethodInput) {
  return input?.query?.configId === 'organization' || input?.body?.organizationId
    ? storyOrganizationApiKeys
    : storyApiKeys
}

const storyAuthClientOverrides = {
  toJSON: () => ({ id: 'storybook-auth-client' }),
  getSession: async () => ({
    session: storySession,
    user: storyUser
  }),
  updateUser: async () => ({ status: true }),
  changeEmail: async () => ({ status: true }),
  changePassword: async () => ({ status: true }),
  requestPasswordReset: async () => ({ status: true }),
  deleteUser: async () => ({ status: true }),
  listAccounts: async () => storyAccounts,
  accountInfo: async (input?: StoryAuthMethodInput) => {
    const account = storyAccounts.find((item) => item.id === input?.query?.accountId) ?? storyAccounts[0]

    return {
      data: {
        login: account.accountId ?? storyUser.email,
        username: account.accountId ?? storyUser.email
      },
      user: {
        emailVerified: storyUser.emailVerified,
        email: storyUser.email,
        id: storyUser.id,
        name: storyUser.name
      }
    }
  },
  listSessions: async () => [
    storySession,
    {
      ...storySession,
      id: 'story-session-secondary',
      token: 'story-session-secondary-value',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    }
  ],
  revokeSession: async () => ({ status: true }),
  linkSocial: async () => ({ status: true }),
  unlinkAccount: async () => ({ status: true }),
  signIn: {
    passkey: async () => ({ status: true })
  },
  isUsernameAvailable: async () => ({ available: true }),
  organization: {
    list: async () => [storyOrganization],
    getFullOrganization: async () => storyFullOrganization,
    listMembers: async () => ({ members: storyMembers, total: storyMembers.length }),
    listInvitations: async () => storyInvitations,
    listUserInvitations: async () => [
      {
        id: 'story-user-invitation',
        organizationName: 'Partner Mail Ops',
        role: 'member',
        status: 'pending',
        createdAt: storyNow
      }
    ],
    hasPermission: async () => ({ success: true }),
    setActive: async () => ({ status: true }),
    create: async () => ({ organization: storyOrganization }),
    update: async () => ({ organization: storyOrganization }),
    checkSlug: async () => ({ status: true }),
    inviteMember: async () => ({ invitation: storyInvitations[0] }),
    cancelInvitation: async () => ({ status: true }),
    acceptInvitation: async () => ({ status: true }),
    rejectInvitation: async () => ({ status: true }),
    updateMemberRole: async () => ({ status: true }),
    removeMember: async () => ({ status: true }),
    leave: async () => ({ status: true }),
    delete: async () => ({ status: true })
  },
  apiKey: {
    list: async (input?: StoryAuthMethodInput) => ({
      apiKeys: selectApiKeys(input),
      total: selectApiKeys(input).length
    }),
    create: async () => ({
      key: 'story-created-api-key-value',
      apiKey: storyApiKeys[0]
    }),
    delete: async () => ({ success: true })
  },
  passkey: {
    listUserPasskeys: async () => [
      {
        id: 'story-passkey-platform',
        name: 'Platform authenticator',
        createdAt: storyNow
      }
    ],
    addPasskey: async () => ({ status: true }),
    deletePasskey: async () => ({ status: true }),
    updatePasskey: async () => ({ passkey: { id: 'story-passkey-platform', name: 'Platform authenticator' } })
  },
  multiSession: {
    listDeviceSessions: async () => [
      {
        session: storySession,
        user: storyUser
      },
      {
        session: {
          ...storySession,
          id: 'story-session-secondary',
          token: 'story-session-secondary-value'
        },
        user: {
          ...storyUser,
          email: 'marin.secondary@northstar-ops.example.test'
        }
      }
    ],
    setActive: async () => ({ session: storySession, user: storyUser }),
    revoke: async () => ({ status: true })
  }
}

export const storyAuthClient = Object.assign(
  Object.create(authReactClient),
  storyAuthClientOverrides
) as AuthProviderProps['authClient']
