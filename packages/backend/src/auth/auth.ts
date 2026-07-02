import { createUUIDv7, nowait } from '@main/common'
import { createBetterAuthMongoAdapterFromMongooseConnection } from '@main/db'
import { agentAuth } from '@better-auth/agent-auth'
import { apiKey } from '@better-auth/api-key'
import { oauthProvider } from '@better-auth/oauth-provider'
import { passkey } from '@better-auth/passkey'
import { APIError } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { betterAuth } from 'better-auth/minimal'
import {
  admin,
  bearer,
  createAccessControl,
  customSession,
  deviceAuthorization,
  genericOAuth,
  jwt,
  lastLoginMethod,
  magicLink,
  multiSession,
  organization
} from 'better-auth/plugins'
import { auditLog } from 'better-auth-audit-logs'
import debug from 'debug'
import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator'

import {
  CLOUDFLARE_OAUTH_PROVIDER_ID,
  createCloudflareGenericOAuthConfig,
  isCloudflareOAuthConfigured
} from '../cloudflare/config'
import { sendEmail } from '../lib/email'
import { STRINGS } from '../strings'
import { PRIVATE_VARS } from '../vars.private'
import { PUBLIC_VARS } from '../vars.public'
import { sendUserVerificationEmail } from '../user/send-user-verification-email'

import { WEBAPP_JWT_SIGNING_OPTIONS } from './jwt-config'
import { AGENT_AUTH_PUBLIC_RATE_LIMIT_RULES, createAgentAuthOptions } from './agent-auth-config'
import {
  AUTH_REDIRECT_ERROR_ROUTE,
  BETTER_AUTH_BASE_PATH,
  BETTER_AUTH_MANUAL_BASE_PATH,
  BETTER_AUTH_ROUTE
} from './auth-routes'
import { createAuthUrlComparisonLogDetails } from './auth-url-logging'
import {
  AGENTTEAM_API_OAUTH_AUDIENCE,
  AGENTTEAM_API_OAUTH_SCOPES,
  AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS,
  AGENTTEAM_OAUTH_CLIENT_REGISTRATION_SCOPES,
  AGENTTEAM_OAUTH_SCOPES
} from './oauth-provider-config'
import { apiKeyConfigurations } from './api-key-config'
import { canManageOAuthClientsForSession } from './oauth-client-privileges'
import { createMongoSecondaryStorage } from './secondary-storage'
import type { AgentSession } from '@better-auth/agent-auth'
import type { BetterAuthOptions } from 'better-auth/minimal'
import type { OrganizationId, UserId } from '@main/db'
import type { Database } from '../db/db'

export { apiKeyConfigurationDefaults, apiKeyConfigurations } from './api-key-config'

const log = debug('app:auth')

export const BETTER_AUTH_SESSION_EXPIRES_IN = 60 * 60 * 24 * 180 // 180 days

const DEFAULT_ORGANIZATION_SLUG_MAX_ATTEMPTS = 16
const AT_EMAIL_CLI_DEVICE_CLIENT_ID = 'at-email-cli'
export const AGENTTEAM_OAUTH_PROVIDER_POST_LOGIN_PAGE = '/settings/agent-access/'

const atEmailCliDeviceAuthorizationOptions = {
  schema: {},
  verificationUri: '/device',
  validateClient: (clientId) => clientId === AT_EMAIL_CLI_DEVICE_CLIENT_ID
} satisfies NonNullable<Parameters<typeof deviceAuthorization>[0]>

export const organizationAccessControl = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  apiKey: ['create', 'read', 'update', 'delete']
} as const)

export const organizationRoles = {
  admin: organizationAccessControl.newRole({
    organization: ['update'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
    ac: ['create', 'read', 'update', 'delete'],
    apiKey: ['create', 'read', 'update', 'delete']
  }),
  owner: organizationAccessControl.newRole({
    organization: ['update', 'delete'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
    ac: ['create', 'read', 'update', 'delete'],
    apiKey: ['create', 'read', 'update', 'delete']
  }),
  member: organizationAccessControl.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: ['read'],
    apiKey: []
  })
} as const

const AUTH_AUDIT_LOG_PATHS = [
  '/sign-in/email',
  '/sign-in/oauth2',
  '/sign-in/social',
  '/sign-in/magic-link',
  '/magic-link/verify',
  '/sign-up/email',
  '/sign-out',
  '/callback/:id',
  '/request-password-reset',
  '/reset-password',
  '/reset-password/:token',
  '/change-password',
  '/change-email',
  '/send-verification-email',
  '/verify-email',
  '/delete-user',
  '/delete-user/callback',
  '/device',
  '/device/approve',
  '/device/code',
  '/device/deny',
  '/device/token',
  '/agent-configuration',
  '/agent/register',
  '/agent/update',
  '/agent/revoke',
  '/agent/rotate-key',
  '/agent/reactivate',
  '/agent/request-capability',
  '/agent/approve-capability',
  '/agent/grant-capability',
  '/agent/revoke-capability',
  '/agent/device/code',
  '/host/create',
  '/host/enroll',
  '/host/revoke',
  '/host/update',
  '/host/rotate-key',
  '/host/switch-account',
  '/capability/execute',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/multi-session/list-device-sessions',
  '/multi-session/set-active',
  '/multi-session/revoke',
  '/link-social',
  '/unlink-account',
  '/get-access-token',
  '/refresh-token',
  '/passkey/generate-register-options',
  '/passkey/generate-authenticate-options',
  '/passkey/verify-registration',
  '/passkey/verify-authentication',
  '/passkey/list-user-passkeys',
  '/passkey/delete-passkey',
  '/passkey/update-passkey',
  '/api-key/create',
  '/api-key/get',
  '/api-key/list',
  '/api-key/update',
  '/api-key/delete',
  '/oauth2/authorize',
  '/oauth2/callback/:providerId',
  '/oauth2/client/rotate-secret',
  '/oauth2/consent',
  '/oauth2/continue',
  '/oauth2/create-client',
  '/oauth2/delete-client',
  '/oauth2/end-session',
  '/oauth2/get-client',
  '/oauth2/get-clients',
  '/oauth2/get-consent',
  '/oauth2/get-consents',
  '/oauth2/introspect',
  '/oauth2/link',
  '/oauth2/public-client',
  '/oauth2/public-client-prelogin',
  '/oauth2/register',
  '/oauth2/revoke',
  '/oauth2/token',
  '/oauth2/update-client',
  '/oauth2/update-consent',
  '/oauth2/delete-consent',
  '/oauth2/userinfo',
  '/admin/oauth2/create-client',
  '/admin/oauth2/update-client',
  '/organization/create',
  '/organization/update',
  '/organization/delete',
  '/organization/invite-member',
  '/organization/accept-invitation',
  '/organization/reject-invitation',
  '/organization/cancel-invitation',
  '/organization/remove-member',
  '/organization/update-member-role',
  '/organization/leave',
  '/organization/create-team',
  '/organization/update-team',
  '/organization/remove-team',
  '/organization/add-team-member',
  '/organization/remove-team-member',
  '/admin/set-role',
  '/admin/create-user',
  '/admin/update-user',
  '/admin/unban-user',
  '/admin/ban-user',
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/remove-user',
  '/admin/set-user-password'
] as const

export type GlobalAuthSessionUser = {
  banExpires?: Date | string | null
  banReason?: string | null
  banned?: boolean | null
  createdAt?: Date | string | null
  email?: string | null
  emailVerified?: boolean | null
  id: string
  image?: string | null
  lastLoginMethod?: string | null
  name?: string | null
  role?: string | null
  updatedAt?: Date | string | null
}

export type GlobalAuthSession = {
  session: {
    activeOrganizationId?: string | null
    createdAt?: Date | string | null
    expiresAt?: Date | string | null
    id: string
    updatedAt?: Date | string | null
    userAgent?: string | null
  }
  user: GlobalAuthSessionUser
}

export type OAuthProviderEndpoints = ReturnType<typeof oauthProvider>['endpoints']
export type GenericOAuthEndpoints = ReturnType<typeof genericOAuth>['endpoints']
export type ApiKeyEndpoints = ReturnType<typeof apiKey>['endpoints']
export type AgentAuthEndpoints = ReturnType<typeof agentAuth>['endpoints']

export interface OAuthAccessTokenResult {
  accessToken: string
  accessTokenExpiresAt?: Date | string
  idToken?: string
  scopes?: string[]
}

export type GlobalAuth = {
  api: {
    getAccessToken: (input: {
      body: {
        accountId?: string
        providerId: string
        userId?: string
      }
      headers?: Headers
    }) => Promise<OAuthAccessTokenResult>
    approveCapability: AgentAuthEndpoints['approveCapability']
    createHost: AgentAuthEndpoints['createHost']
    adminCreateOAuthClient: OAuthProviderEndpoints['adminCreateOAuthClient']
    getAgentConfiguration: () => Promise<Record<string, unknown>>
    getAgentSession: (input: { headers: Headers }) => Promise<AgentSession | null>
    getOAuthServerConfig: OAuthProviderEndpoints['getOAuthServerConfig']
    getOpenIdConfig: OAuthProviderEndpoints['getOpenIdConfig']
    getSession: (input: { headers: Headers }) => Promise<GlobalAuthSession | null>
    oAuth2LinkAccount: GenericOAuthEndpoints['oAuth2LinkAccount']
    sendVerificationEmail: (input: {
      body: {
        callbackURL?: string
        email: string
      }
      headers?: Headers
    }) => Promise<unknown>
    signUpEmail: (input: {
      body: {
        email: string
        name: string
        password: string
        rememberMe?: boolean
      }
      headers?: Headers
    }) => Promise<unknown>
    unlinkAccount: (input: {
      body: {
        accountId?: string
        providerId: string
      }
      headers?: Headers
    }) => Promise<{ status: boolean }>
    revokeAgent: AgentAuthEndpoints['revokeAgent']
    revokeCapability: AgentAuthEndpoints['revokeCapability']
    verifyApiKey: ApiKeyEndpoints['verifyApiKey']
  }
  handler: (request: Request) => Promise<Response>
}

function compareAuthUrls(betterAuthUrl: string, manualUrl: string) {
  log(
    'compareAuthUrls:',
    createAuthUrlComparisonLogDetails({
      betterAuthBasePath: BETTER_AUTH_BASE_PATH,
      betterAuthUrl,
      manualBasePath: BETTER_AUTH_MANUAL_BASE_PATH,
      manualUrl
    })
  )
}

export function createGlobalAuth(db: Database): GlobalAuth {
  const cloudflareOAuthConfig = createCloudflareGenericOAuthConfig()
  const plugins = [
    organization({
      ac: organizationAccessControl,
      roles: organizationRoles
    }),
    bearer(),
    createAtEmailCliDeviceAuthorizationPlugin(),
    agentAuth(createAgentAuthOptions(db)),
    auditLog({
      nonBlocking: true,
      paths: [...AUTH_AUDIT_LOG_PATHS],
      capture: {
        ipAddress: true,
        userAgent: true,
        requestBody: false
      },
      piiRedaction: {
        enabled: true,
        strategy: 'hash'
      }
    }),
    ...(cloudflareOAuthConfig ? [genericOAuth({ config: [cloudflareOAuthConfig] })] : []),
    passkey(),
    multiSession(),
    jwt({
      ...WEBAPP_JWT_SIGNING_OPTIONS,
      disableSettingJwtHeader: true,
      jwt: {
        ...WEBAPP_JWT_SIGNING_OPTIONS.jwt,
        definePayload: ({ user, session }) => ({
          user_id: user.id,
          session_id: session.id,
          active_organization_id: session.activeOrganizationId ?? null,
          role: user.role ?? null
        })
      }
    }),
    oauthProvider({
      loginPage: '/signin/',
      consentPage: '/oauth/consent/',
      scopes: [...AGENTTEAM_OAUTH_SCOPES, ...AGENTTEAM_API_OAUTH_SCOPES],
      advertisedMetadata: {
        scopes_supported: [...AGENTTEAM_OAUTH_SCOPES, ...AGENTTEAM_API_OAUTH_SCOPES]
      },
      clientRegistrationAllowedScopes: [...AGENTTEAM_OAUTH_CLIENT_REGISTRATION_SCOPES],
      clientRegistrationDefaultScopes: [...AGENTTEAM_OAUTH_CLIENT_REGISTRATION_SCOPES],
      validAudiences: [AGENTTEAM_API_OAUTH_AUDIENCE],
      accessTokenExpiresIn: 900,
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      silenceWarnings: {
        oauthAuthServerConfig: true,
        openidConfig: true
      },
      clientReference: ({ session }) => {
        const activeOrganizationId = (session as { activeOrganizationId?: string | null })
          .activeOrganizationId
        return activeOrganizationId ?? undefined
      },
      postLogin: {
        page: AGENTTEAM_OAUTH_PROVIDER_POST_LOGIN_PAGE,
        consentReferenceId: ({ session }) => {
          const activeOrganizationId = (session as { activeOrganizationId?: string | null })
            .activeOrganizationId
          return activeOrganizationId ?? undefined
        },
        shouldRedirect: () => false
      },
      customAccessTokenClaims: ({ referenceId, scopes, user }) => ({
        [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.credentialKind]: 'oauth_access_token',
        [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: referenceId ?? null,
        ...(user && scopes.includes('email')
          ? {
              email: user.email ?? null,
              email_verified: user.emailVerified ?? false
            }
          : {}),
        ...(user && scopes.includes('profile')
          ? {
              name: user.name ?? null,
              picture: user.image ?? null
            }
          : {})
      }),
      clientPrivileges: async ({ session }) => {
        return canManageOAuthClientsForSession({ db, session })
      },
      prefix: {
        clientSecret: '_secret_oauth_client_',
        opaqueAccessToken: '_secret_oauth_access_',
        refreshToken: '_secret_oauth_refresh_'
      }
    }),

    lastLoginMethod({
      // Custom method resolution
      customResolveMethod: (ctx) => {
        // Custom logic to determine the login method
        // console.log('ctx.path', ctx.path)
        if (ctx.path === '/magic-link/verify') {
          return 'magic-link'
        }

        // if (ctx.request?.url) {
        //   try {
        //     const url = new URL(ctx.request?.url)
        //     console.log('url path', url.pathname)
        //   } catch (e) {
        //     log('better-auth url parse error ', e)
        //   }
        // }

        // if (ctx.path === '/oauth/callback/custom-provider') {
        //   return 'custom-provider'
        // }
        // Return null to use default resolution
        return null
      },
      storeInDatabase: true,
      maxAge: 60 * 60 * 24 * 365 // 365 days in seconds
    }),
    magicLink({
      sendMagicLink: async ({ email, token, url }, request) => {
        const magicUrl = `${BETTER_AUTH_ROUTE}/magic-link/verify?token=${token}&callbackURL=${encodeURIComponent('/settings/')}`
        compareAuthUrls(url, magicUrl)
        nowait(
          sendEmail(email, 'Your Magic Sign-In Link', 'email-magic-link', {
            public_brand_name: STRINGS.BRAND_NAME,
            magic_link_url: magicUrl
          })
        )
      }
    }),
    apiKey(apiKeyConfigurations),
    admin()
  ] satisfies BetterAuthOptions['plugins']

  const auth = betterAuth({
    appName: STRINGS.BRAND_NAME,
    baseURL: PUBLIC_VARS.PUBLIC_HOSTNAME,

    // Better Auth sees /api/* as its logical base path. The first-party web app
    // still mounts that handler at /rpc/auth/api/* for same-origin UI auth
    // compatibility, while public OAuth/OIDC clients use the explicit
    // /api/auth/* bridge. Keep this logical basePath distinct from both mounts.
    // Manual redirect URLs use BETTER_AUTH_ROUTE and compareAuthUrls verifies
    // they still match the Better Auth-generated path after stripping each
    // mount prefix.
    basePath: BETTER_AUTH_BASE_PATH,
    onAPIError: {
      errorURL: AUTH_REDIRECT_ERROR_ROUTE
    },
    secret: PRIVATE_VARS.BETTER_AUTH_SECRET,
    secondaryStorage: createMongoSecondaryStorage(db),
    rateLimit: {
      enabled: PUBLIC_VARS.PROD,
      storage: 'secondary-storage',
      customRules: AGENT_AUTH_PUBLIC_RATE_LIMIT_RULES
    },
    database: createBetterAuthMongoAdapterFromMongooseConnection(db.connection, {
      transaction: false,
      usePlural: false
    }),
    // Each Better Auth session starts with the user's last active organization
    // when available. First signup creates an app-owned default organization.
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const typedSession = session as typeof session & {
              activeOrganizationId?: string | null
            }
            let activeOrganizationId = (typedSession.activeOrganizationId ?? null) as OrganizationId | null
            const userId = session.userId as UserId

            // Later sign-ins inherit the org the user most recently used on a
            // prior session, but only if the user still has membership there.
            if (!activeOrganizationId) {
              const recentSession = await db.models.session
                .findOne({
                  activeOrganizationId: { $ne: null },
                  userId
                })
                .sort({ createdAt: -1, updatedAt: -1 })
                .exec()
              if (recentSession?.activeOrganizationId) {
                const recentActiveOrganizationId = recentSession.activeOrganizationId
                const recentMember = await db.models.member
                  .findOne({
                    organizationId: recentActiveOrganizationId,
                    userId
                  })
                  .exec()
                activeOrganizationId = recentMember?.organizationId ?? null
              }
            }

            // If there is no prior active org, reuse the user's first existing
            // membership. That keeps legacy/dev accounts working until the app
            // owns an explicit persisted default-org preference.
            if (!activeOrganizationId) {
              const member = await db.models.member.findOne({ userId }).sort({ createdAt: 1 }).exec()
              activeOrganizationId = member?.organizationId ?? null
            }

            // First signup creates a hidden default workspace. Slug is Better
            // Auth's required unique handle, so use a user-renameable default
            // that is not derived from user identity.
            if (!activeOrganizationId) {
              const createdOrganization = await createDefaultOrganization(db)
              activeOrganizationId = createdOrganization._id
            }

            // The selected org must have a membership for this user. This inserts
            // the owner membership for first signup and repairs partial dev data.
            const defaultMember = await db.models.member
              .findOne({
                organizationId: activeOrganizationId,
                userId
              })
              .exec()
            if (!defaultMember) {
              await db.models.member.create({
                organizationId: activeOrganizationId,
                role: 'owner',
                userId
              })
            }

            // Returning the org on the session-create payload lets Better Auth
            // write the DB row, secondary storage entry, and cookie cache in sync.
            const sessionActiveOrganizationId: string = activeOrganizationId
            return {
              data: {
                ...session,
                activeOrganizationId: sessionActiveOrganizationId
              }
            }
          }
        }
      }
    },
    plugins: [
      ...plugins,
      customSession(
        async ({ user, session }) => {
          // const userId = user.id as UserId
          // const sessionId = session.id as SessionId
          // return {
          //   user: {
          //     ...user,
          //     id: userId
          //   },
          //   session: {
          //     ...session,
          //     id: sessionId
          //   }
          // }
          return {
            user,
            session
          }
        },
        {
          plugins
        }
      )
    ],
    account: {
      encryptOAuthTokens: true,
      storeAccountCookie: false,
      storeStateStrategy: 'database',
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
        trustedProviders: [
          ...(typeof PRIVATE_VARS.GOOGLE_CLIENT_SECRET === 'string' ? ['google'] : []),
          ...(typeof PRIVATE_VARS.LINKEDIN_CLIENT_SECRET === 'string' ? ['linkedin'] : []),
          ...(isCloudflareOAuthConfigured() ? [CLOUDFLARE_OAUTH_PROVIDER_ID] : [])
        ]
      }
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-in/oauth2' && readAuthProviderId(ctx.body) === CLOUDFLARE_OAUTH_PROVIDER_ID) {
          throw APIError.from('BAD_REQUEST', {
            code: 'CLOUDFLARE_SIGN_IN_DISABLED',
            message: 'Cloudflare is a connected account provider, not an app sign-in provider.'
          })
        }

        return ctx
      }),
      after: createAuthMiddleware(async (ctx) => {
        // log({
        //   name: 'after - auth middleware',
        //   path: ctx.path,
        //   params: ctx.params,
        //   method: ctx.method,
        //   query: ctx.query,
        //   newSession: ctx.context.newSession,
        //   body: ctx.body,
        //   returned: ctx.context.returned
        // })

        const newSession = ctx.context.newSession
        try {
          // setup user actor
          if (newSession) {
            const user = newSession.user
            const userId = user.id as UserId
            const actor = await db.models.actor.findOne({ userId }).exec()
            if (!actor) {
              await db.models.actor.create({
                type: 'user',
                userId
              })
            }
            // if (!actor) {
            //   return c.json({message: 'Permissions invalid'}, 400)
            // }
          }
        } catch (error) {
          log('Failed to provision user session:', error)
        }

        const error = ctx.context.returned
        if (
          error instanceof APIError &&
          error.statusCode === 403 &&
          error.status === 'FORBIDDEN' &&
          error.body?.code === 'EMAIL_NOT_VERIFIED'
        ) {
          if (ctx.body.email) {
            const errorMessage = await sendUserVerificationEmail(ctx.body.email as string)
            if (errorMessage) {
              return ctx.error('FORBIDDEN', {
                code: error.body.code,
                message: errorMessage
              })
            }
          }
        }

        return ctx.context.returned
      })
    },
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async (data, request) => {
        const resetUrl = `${BETTER_AUTH_ROUTE}/reset-password/${data.token}?callbackURL=${encodeURIComponent('/reset-password/')}`
        compareAuthUrls(data.url, resetUrl)
        nowait(
          sendEmail(data.user.email, 'Reset Password', 'reset-password-instructions', {
            public_brand_name: STRINGS.BRAND_NAME,
            reset_password_url: resetUrl
          })
        )
      },
      requireEmailVerification: true
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: true,
      sendVerificationEmail: async (data, request) => {
        const verifyUrl = `${BETTER_AUTH_ROUTE}/verify-email?token=${data.token}&callbackURL=${encodeURIComponent('/redirect/email-verified/')}`
        compareAuthUrls(data.url, verifyUrl)
        // if (data.user.emailVerified) {
        //   data.user.
        // }
        nowait(
          sendEmail(data.user.email, 'Verify Email', 'confirmation-instructions', {
            public_brand_name: STRINGS.BRAND_NAME,
            confirmation_url: verifyUrl
          })
        )
      }
    },
    socialProviders: {
      ...(typeof PUBLIC_VARS.PUBLIC_GOOGLE_CLIENT_ID === 'string' &&
      typeof PRIVATE_VARS.GOOGLE_CLIENT_SECRET === 'string'
        ? {
            google: {
              enabled: true,
              clientId: PUBLIC_VARS.PUBLIC_GOOGLE_CLIENT_ID,
              clientSecret: PRIVATE_VARS.GOOGLE_CLIENT_SECRET,
              redirectURI: `${BETTER_AUTH_ROUTE}/callback/google`
            }
          }
        : {}),
      ...(typeof PUBLIC_VARS.PUBLIC_LINKEDIN_CLIENT_ID === 'string' &&
      typeof PRIVATE_VARS.LINKEDIN_CLIENT_SECRET === 'string'
        ? {
            linkedin: {
              enabled: true,
              clientId: PUBLIC_VARS.PUBLIC_LINKEDIN_CLIENT_ID,
              clientSecret: PRIVATE_VARS.LINKEDIN_CLIENT_SECRET,
              redirectURI: `${BETTER_AUTH_ROUTE}/callback/linkedin`
            }
          }
        : {})
    },
    user: {
      deleteUser: {
        enabled: false,
        sendDeleteAccountVerification: async (data) => {
          const deleteUrl = `${BETTER_AUTH_ROUTE}/delete-user/callback?token=${data.token}&callbackURL=${encodeURIComponent('/signout/')}`
          log('sending delete user verification')
          compareAuthUrls(data.url, deleteUrl)
          nowait(
            sendEmail(data.user.email, 'Confirm account deletion', 'delete-account-confirmation', {
              public_brand_name: STRINGS.BRAND_NAME,
              delete_account_url: deleteUrl
            })
          )
        }
      },
      changeEmail: {
        enabled: true
        // sendChangeEmailVerification: async (data, request) => {
        //   log('sending change email verification ', data.url)
        //   nowait(
        //     sendEmail(data.user.email, 'Change Email Requested', 'new-email-instructions', {
        //       public_brand_name: STRINGS.BRAND_NAME,
        //       confirmation_url: data.url
        //     })
        //   )
        // }
      }
    },
    session: {
      expiresIn: BETTER_AUTH_SESSION_EXPIRES_IN,
      updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated),
      cookieCache: {
        maxAge: 60,
        enabled: true,
        strategy: 'compact'
      },
      storeSessionInDatabase: true,
      preserveSessionInDatabase: true
    },
    advanced: {
      generateId: () => createUUIDv7(),
      defaultCookieAttributes: {
        path: '/',
        httpOnly: true,
        secure: PUBLIC_VARS.PUBLIC_HTTPS_PROTO,
        sameSite: 'lax'
      },
      database: {
        generateId: 'uuid'
      }
    },
    logger: {
      disabled: false,
      level: 'debug'
    }
  })
  return auth
}

export function createAtEmailCliDeviceAuthorizationPlugin() {
  return deviceAuthorization(atEmailCliDeviceAuthorizationOptions)
}

async function createDefaultOrganization(db: Database) {
  for (let attempt = 0; attempt < DEFAULT_ORGANIZATION_SLUG_MAX_ATTEMPTS; attempt += 1) {
    const slug = createDefaultOrganizationSlug()
    const existingOrganization = await db.models.organization.exists({ slug }).exec()
    if (existingOrganization) {
      continue
    }

    try {
      return await db.models.organization.create({
        name: 'Default workspace',
        slug
      })
    } catch (error) {
      if (getMongoErrorCode(error) === 11000) {
        continue
      }

      throw error
    }
  }

  throw new Error('Failed to create default organization with a unique slug')
}

function createDefaultOrganizationSlug(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    length: 3,
    separator: '-',
    style: 'lowerCase'
  })
}

function getMongoErrorCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }

  const { code } = error
  return typeof code === 'number' ? code : null
}

function readAuthProviderId(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('providerId' in body)) {
    return null
  }

  const providerId = body.providerId
  return typeof providerId === 'string' ? providerId : null
}
