import {
  base62UUIDv7ToUUIDv7,
  type CloudflareConnectionDocument,
  type CloudflareConnectionId,
  type CloudflareConnectionPublicId,
  type CloudflareConnectionPublicView,
  type CloudflareOAuthConnectionIntentId,
  type CloudflareOAuthConnectionIntentPublicId,
  type CloudflareOAuthConnectionIntentPublicView,
  type CloudflareOAuthGrantDocument,
  type CloudflareOAuthGrantId,
  type CloudflareOAuthGrantPublicView,
  type OrganizationId,
  parseBase62UUIDv7,
  type UserId
} from '@main/db'

import type { Database } from '../db/db'
import { globals } from '../globals'
import { PUBLIC_VARS } from '../vars.public'

import {
  applyCloudflareProvisioning,
  listCloudflareAccounts,
  listCloudflareZones,
  sanitizeCloudflareError,
  type CloudflareAccountSummary,
  type CloudflareZoneSummary
} from './client'
import {
  CLOUDFLARE_OAUTH_PROVIDER_ID,
  getCloudflareRequiredOAuthScopes,
  isCloudflareOAuthConfigured
} from './config'
import {
  cloudflareConnectionPublicView,
  cloudflareOAuthConnectionIntentPublicView,
  cloudflareOAuthGrantPublicView
} from './public-views'

const CLOUDFLARE_OAUTH_INTENT_TTL_MS = 15 * 60 * 1000

export type { CloudflareAccountSummary, CloudflareZoneSummary } from './client'

export interface StartCloudflareOAuthResult {
  intent: CloudflareOAuthConnectionIntentPublicView
  redirectUrl: string
}

export interface FinalizeCloudflareOAuthResult {
  grant: CloudflareOAuthGrantPublicView
  missingScopes: string[]
}

export interface CloudflareConnectionInput {
  cloudflareAccountId: string
  cloudflareAccountName?: string | null
  cloudflareZoneId: string
  cloudflareZoneName?: string | null
  domain: string
}

export interface CloudflareStatusResult {
  connections: CloudflareConnectionPublicView[]
  grants: CloudflareOAuthGrantPublicView[]
}

export async function startCloudflareOAuth(headers: Headers): Promise<StartCloudflareOAuthResult> {
  if (!isCloudflareOAuthConfigured()) {
    throw new Error('Cloudflare OAuth is not configured')
  }

  const { auth, db } = await globals()
  const session = await requireCloudflareSession(headers)
  const userId = session.user.id as UserId
  const organizationId = sessionOrganizationId(session)
  const expiresAt = new Date(Date.now() + CLOUDFLARE_OAUTH_INTENT_TTL_MS)
  const intent = await db.models.cloudflareOAuthConnectionIntent.create({
    userId,
    organizationId,
    status: 'pending',
    callbackPath: '/dashboard/',
    expiresAt
  })
  const intentView = cloudflareOAuthConnectionIntentPublicView(intent)
  const callbackURL = createOAuthCallbackURL(intentView.publicId)
  const result = await auth.api.oAuth2LinkAccount({
    body: {
      providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
      callbackURL,
      errorCallbackURL: createOAuthCallbackURL(intentView.publicId, '1'),
      scopes: getCloudflareRequiredOAuthScopes()
    },
    headers
  })

  return {
    intent: intentView,
    redirectUrl: result.url
  }
}

export async function finalizeCloudflareOAuth({
  headers,
  intentPublicId
}: {
  headers: Headers
  intentPublicId: CloudflareOAuthConnectionIntentPublicId | string
}): Promise<FinalizeCloudflareOAuthResult> {
  const { db } = await globals()
  const session = await requireCloudflareSession(headers)
  const userId = session.user.id as UserId
  const intentId = parseCloudflareIntentPublicId(intentPublicId)
  const intent = await db.models.cloudflareOAuthConnectionIntent
    .findOne({
      _id: intentId,
      userId,
      status: 'pending'
    })
    .exec()

  if (!intent) {
    throw new Error('Cloudflare OAuth intent was not found or is no longer pending')
  }

  if (intent.expiresAt.getTime() <= Date.now()) {
    await db.models.cloudflareOAuthConnectionIntent
      .updateOne({ _id: intent._id }, { $set: { status: 'expired' } })
      .exec()
    throw new Error('Cloudflare OAuth intent has expired')
  }

  const account = await db.models.account
    .findOne({
      providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
      userId
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .exec()

  if (!account) {
    await db.models.cloudflareOAuthConnectionIntent
      .updateOne(
        { _id: intent._id },
        {
          $set: {
            status: 'failed',
            errorCode: 'CLOUDFLARE_ACCOUNT_NOT_LINKED',
            errorMessage: 'Cloudflare OAuth callback completed but no linked account was found.'
          }
        }
      )
      .exec()
    throw new Error('Cloudflare account was not linked')
  }

  const grantedScopes = parseOAuthScopeString(account.scope)
  const requiredScopes = getCloudflareRequiredOAuthScopes()
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
  const organizationId = sessionOrganizationId(session)
  const grant = await upsertCloudflareGrant(db, {
    betterAuthAccountId: account._id,
    cloudflareEmail: null,
    cloudflareUserId: account.accountId,
    grantedScopes,
    organizationId,
    requiredScopes,
    userId
  })

  await db.models.cloudflareOAuthConnectionIntent
    .updateOne({ _id: intent._id }, { $set: { status: 'completed' } })
    .exec()

  return {
    grant: cloudflareOAuthGrantPublicView(grant),
    missingScopes
  }
}

export async function listConnectedCloudflareAccounts(
  headers: Headers
): Promise<CloudflareAccountSummary[]> {
  const { db } = await globals()
  const session = await requireCloudflareSession(headers)
  const grant = await getActiveGrantForUser(db, session.user.id as UserId)
  const accessToken = await getCloudflareAccessToken(headers, grant)

  return listCloudflareAccounts(accessToken)
}

export async function listConnectedCloudflareZones({
  cloudflareAccountId,
  headers
}: {
  cloudflareAccountId?: string
  headers: Headers
}): Promise<CloudflareZoneSummary[]> {
  const { db } = await globals()
  const session = await requireCloudflareSession(headers)
  const grant = await getActiveGrantForUser(db, session.user.id as UserId)
  const accessToken = await getCloudflareAccessToken(headers, grant)

  return listCloudflareZones({ accessToken, cloudflareAccountId })
}

export async function connectCloudflareDomain({
  headers,
  input
}: {
  headers: Headers
  input: CloudflareConnectionInput
}): Promise<CloudflareConnectionPublicView> {
  const { db } = await globals()
  const session = await requireCloudflareSession(headers)
  const userId = session.user.id as UserId
  const grant = await getActiveGrantForUser(db, userId)
  const domain = normalizeDomain(input.domain)
  const organizationId = sessionOrganizationId(session)

  const connection = await db.models.cloudflareConnection
    .findOneAndUpdate(
      {
        userId,
        cloudflareAccountId: input.cloudflareAccountId,
        cloudflareZoneId: input.cloudflareZoneId,
        domain
      },
      {
        $set: {
          cloudflareAccountName: input.cloudflareAccountName ?? null,
          cloudflareZoneName: input.cloudflareZoneName ?? null,
          grantId: grant._id,
          organizationId,
          status: 'connected',
          provisioningStatus: 'not_started',
          lastErrorCode: null,
          lastErrorMessage: null
        },
        $setOnInsert: {
          userId,
          cloudflareAccountId: input.cloudflareAccountId,
          cloudflareZoneId: input.cloudflareZoneId,
          domain
        }
      },
      { new: true, upsert: true }
    )
    .exec()

  if (!connection) {
    throw new Error('Failed to create Cloudflare connection')
  }

  return cloudflareConnectionPublicView(connection)
}

export async function applyCloudflareConnectionProvisioning({
  connectionPublicId,
  headers
}: {
  connectionPublicId: CloudflareConnectionPublicId | string
  headers: Headers
}): Promise<CloudflareConnectionPublicView> {
  const { db } = await globals()
  const session = await requireCloudflareSession(headers)
  const userId = session.user.id as UserId
  const connectionId = parseCloudflareConnectionPublicId(connectionPublicId)
  const connection = await db.models.cloudflareConnection
    .findOne({ _id: connectionId, userId, status: { $ne: 'disconnected' } })
    .exec()

  if (!connection) {
    throw new Error('Cloudflare connection was not found')
  }

  await db.models.cloudflareConnection
    .updateOne(
      { _id: connection._id },
      {
        $set: {
          status: 'provisioning',
          provisioningStatus: 'pending',
          lastErrorCode: null,
          lastErrorMessage: null
        }
      }
    )
    .exec()

  const grant = await getGrantById(db, connection.grantId, userId)
  const accessToken = await getCloudflareAccessToken(headers, grant)

  try {
    const result = await applyCloudflareProvisioning({
      accessToken,
      cloudflareAccountId: connection.cloudflareAccountId,
      cloudflareZoneId: connection.cloudflareZoneId,
      connectionPublicId: cloudflareConnectionPublicView(connection).publicId,
      domain: connection.domain,
      organizationId: connection.organizationId ?? null
    })

    const updatedConnection = await db.models.cloudflareConnection
      .findByIdAndUpdate(
        connection._id,
        {
          $set: {
            hmacSecretReference: result.hmacSecretReference,
            lastProvisionedAt: new Date(),
            provisioningStatus: 'succeeded',
            r2BucketName: result.r2BucketName,
            status: 'active',
            workerScriptName: result.workerScriptName
          }
        },
        { new: true }
      )
      .exec()

    if (!updatedConnection) {
      throw new Error('Cloudflare connection disappeared after provisioning')
    }

    return cloudflareConnectionPublicView(updatedConnection)
  } catch (error) {
    const sanitized = sanitizeCloudflareError(error)
    const failedConnection = await db.models.cloudflareConnection
      .findByIdAndUpdate(
        connection._id,
        {
          $set: {
            lastErrorCode: sanitized.code,
            lastErrorMessage: sanitized.message,
            provisioningStatus: 'failed',
            status: 'degraded'
          }
        },
        { new: true }
      )
      .exec()

    if (!failedConnection) {
      throw error
    }

    return cloudflareConnectionPublicView(failedConnection)
  }
}

export async function getCloudflareStatus(headers: Headers): Promise<CloudflareStatusResult> {
  const { db } = await globals()
  const session = await requireCloudflareSession(headers)
  const userId = session.user.id as UserId
  const [grants, connections] = await Promise.all([
    db.models.cloudflareOAuthGrant.find({ userId }).sort({ updatedAt: -1 }).exec(),
    db.models.cloudflareConnection.find({ userId }).sort({ updatedAt: -1 }).exec()
  ])

  return {
    connections: connections.map(cloudflareConnectionPublicView),
    grants: grants.map(cloudflareOAuthGrantPublicView)
  }
}

export async function disconnectCloudflare({
  headers,
  grantPublicId
}: {
  grantPublicId?: string
  headers: Headers
}): Promise<CloudflareStatusResult> {
  const { auth, db } = await globals()
  const session = await requireCloudflareSession(headers)
  const userId = session.user.id as UserId
  const grant =
    grantPublicId ?
      await db.models.cloudflareOAuthGrant
        .findOne({
          _id: parseCloudflareGrantPublicId(grantPublicId),
          userId
        })
        .exec()
    : await getActiveGrantForUser(db, userId)

  if (!grant) {
    throw new Error('Cloudflare grant was not found')
  }

  await db.models.cloudflareOAuthGrant
    .updateOne(
      { _id: grant._id },
      {
        $set: {
          status: 'revoked',
          lastErrorCode: null,
          lastErrorMessage: null
        }
      }
    )
    .exec()
  await db.models.cloudflareConnection
    .updateMany(
      { grantId: grant._id, userId },
      {
        $set: {
          status: 'disconnected'
        }
      }
    )
    .exec()

  try {
    await auth.api.unlinkAccount({
      body: {
        providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
        accountId: grant.cloudflareUserId
      },
      headers
    })
  } catch {
    await db.models.cloudflareOAuthGrant
      .updateOne(
        { _id: grant._id },
        {
          $set: {
            lastErrorCode: 'BETTER_AUTH_UNLINK_FAILED',
            lastErrorMessage: 'Cloudflare local connection was revoked, but Better Auth unlink failed.'
          }
        }
      )
      .exec()
  }

  return getCloudflareStatus(headers)
}

async function requireCloudflareSession(headers: Headers) {
  const { auth } = await globals()
  const session = await auth.api.getSession({ headers })

  if (!session?.user) {
    throw new Error('Authentication required')
  }

  return session
}

async function getCloudflareAccessToken(
  headers: Headers,
  grant: CloudflareOAuthGrantDocument
): Promise<string> {
  const { auth, db } = await globals()
  const result = await auth.api.getAccessToken({
    body: {
      accountId: grant.cloudflareUserId,
      providerId: CLOUDFLARE_OAUTH_PROVIDER_ID
    },
    headers
  })

  await db.models.cloudflareOAuthGrant
    .updateOne(
      { _id: grant._id },
      {
        $set: {
          lastTokenCheckAt: new Date(),
          status: 'active',
          lastErrorCode: null,
          lastErrorMessage: null
        }
      }
    )
    .exec()

  return result.accessToken
}

async function upsertCloudflareGrant(
  db: Database,
  input: {
    betterAuthAccountId: CloudflareOAuthGrantDocument['betterAuthAccountId']
    cloudflareEmail: string | null
    cloudflareUserId: string
    grantedScopes: string[]
    organizationId: OrganizationId | null
    requiredScopes: string[]
    userId: UserId
  }
): Promise<CloudflareOAuthGrantDocument> {
  const grant = await db.models.cloudflareOAuthGrant
    .findOneAndUpdate(
      {
        userId: input.userId,
        cloudflareUserId: input.cloudflareUserId
      },
      {
        $set: {
          betterAuthAccountId: input.betterAuthAccountId,
          cloudflareEmail: input.cloudflareEmail,
          grantedScopes: input.grantedScopes,
          organizationId: input.organizationId,
          requiredScopes: input.requiredScopes,
          status: 'active',
          lastErrorCode: null,
          lastErrorMessage: null
        },
        $setOnInsert: {
          userId: input.userId,
          cloudflareUserId: input.cloudflareUserId
        }
      },
      { new: true, upsert: true }
    )
    .exec()

  if (!grant) {
    throw new Error('Failed to persist Cloudflare OAuth grant')
  }

  return grant
}

async function getActiveGrantForUser(
  db: Database,
  userId: UserId
): Promise<CloudflareOAuthGrantDocument> {
  const grant = await db.models.cloudflareOAuthGrant
    .findOne({
      userId,
      status: 'active'
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .exec()

  if (!grant) {
    throw new Error('Cloudflare OAuth is not connected')
  }

  return grant
}

async function getGrantById(
  db: Database,
  grantId: CloudflareOAuthGrantId,
  userId: UserId
): Promise<CloudflareOAuthGrantDocument> {
  const grant = await db.models.cloudflareOAuthGrant
    .findOne({ _id: grantId, userId, status: 'active' })
    .exec()

  if (!grant) {
    throw new Error('Cloudflare OAuth grant is not active')
  }

  return grant
}

function parseCloudflareIntentPublicId(
  value: CloudflareOAuthConnectionIntentPublicId | string
): CloudflareOAuthConnectionIntentId {
  return base62UUIDv7ToUUIDv7(parseBase62UUIDv7(value)) as CloudflareOAuthConnectionIntentId
}

function parseCloudflareGrantPublicId(value: string): CloudflareOAuthGrantId {
  return base62UUIDv7ToUUIDv7(parseBase62UUIDv7(value)) as CloudflareOAuthGrantId
}

function parseCloudflareConnectionPublicId(
  value: CloudflareConnectionPublicId | string
): CloudflareConnectionId {
  return base62UUIDv7ToUUIDv7(parseBase62UUIDv7(value)) as CloudflareConnectionId
}

function parseOAuthScopeString(scope: string | null | undefined): string[] {
  if (!scope) {
    return []
  }

  return scope
    .split(/[,\s]+/u)
    .map((value) => value.trim())
    .filter(Boolean)
}

function sessionOrganizationId(session: Awaited<ReturnType<typeof requireCloudflareSession>>): OrganizationId | null {
  const activeOrganizationId = session.session.activeOrganizationId
  return typeof activeOrganizationId === 'string' && activeOrganizationId ? (activeOrganizationId as OrganizationId) : null
}

function normalizeDomain(domain: string): string {
  const normalized = domain.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(normalized)) {
    throw new Error('Domain must be a valid hostname')
  }
  return normalized
}

function createOAuthCallbackURL(
  intentPublicId: CloudflareOAuthConnectionIntentPublicId,
  error?: string
): string {
  const url = new URL('/dashboard/', PUBLIC_VARS.PUBLIC_HOSTNAME)
  url.searchParams.set('settings', 'connectedAccounts')
  url.searchParams.set('cloudflareIntentId', intentPublicId)

  if (error) {
    url.searchParams.set('cloudflareOAuthError', error)
  }

  return url.toString()
}
