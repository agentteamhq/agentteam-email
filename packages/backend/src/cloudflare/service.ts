import { Buffer } from 'node:buffer'

import {
  base62UUIDv7ToUUIDv7,
  normalizeMongooseUUIDv7,
  parseBase62UUIDv7,
  publicIdFromUUIDv7
} from '@main/db'

import { globals } from '../globals'
import { createAgentMailWorkerCredentials, syncAgentMailRuntime } from '../agent-mail/control-client'
import { agentMailSubject } from '../agent-mail/permission-policy'
import { isAgentMailAccessError, requireAgentMailOrganizationContext } from '../agent-mail/service'
import { decryptSecretValue, encryptSecretValue } from '../lib/secret-box'
import { PUBLIC_VARS } from '../vars.public'

import {
  applyCloudflareProvisioning,
  listCloudflareAccounts,
  listCloudflareZones,
  sanitizeCloudflareError
} from './client'
import {
  CLOUDFLARE_OAUTH_PROVIDER_ID,
  getCloudflareOAuthTokenUrl,
  getCloudflareRequiredOAuthScopes,
  isCloudflareOAuthConfigured,
  requireCloudflareOAuthClientCredentials
} from './config'
import {
  cloudflareConnectionPublicView,
  cloudflareOAuthConnectionIntentPublicView,
  cloudflareOAuthGrantPublicView
} from './public-views'
import type {
  CloudflareConnectionPublicView,
  CloudflareOAuthConnectionIntentPublicView,
  CloudflareOAuthGrantPublicView
} from './public-views'
import type { CloudflareAccountSummary, CloudflareZoneSummary } from './client'
import type {
  AccountDocument,
  AgentMailDomainDocument,
  CloudflareConnectionDocument,
  CloudflareConnectionId,
  CloudflareConnectionPublicId,
  CloudflareOAuthConnectionIntentId,
  CloudflareOAuthConnectionIntentPublicId,
  CloudflareOAuthGrantDocument,
  CloudflareOAuthGrantId,
  OrganizationId,
  OrganizationPublicId,
  UserId
} from '@main/db'
import type { Database } from '../db/db'

const CLOUDFLARE_OAUTH_INTENT_TTL_MS = 15 * 60 * 1000
const WORKER_CREDENTIAL_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000
const OAUTH_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000

export type { CloudflareAccountSummary, CloudflareZoneSummary } from './client'
export type {
  CloudflareConnectionPublicView,
  CloudflareOAuthConnectionIntentPublicView,
  CloudflareOAuthGrantPublicView
} from './public-views'

export interface StartCloudflareOAuthResult {
  intent: CloudflareOAuthConnectionIntentPublicView
  redirectUrl: string
  responseHeaders: Headers
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

export class CloudflareAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403
  ) {
    super(message)
    this.name = 'CloudflareAccessError'
  }
}

export function isCloudflareAccessError(error: unknown): error is CloudflareAccessError {
  return error instanceof CloudflareAccessError
}

export async function startCloudflareOAuth(headers: Headers): Promise<StartCloudflareOAuthResult> {
  if (!isCloudflareOAuthConfigured()) {
    throw new Error('Cloudflare OAuth is not configured')
  }

  const { auth, db } = await globals()
  const context = await requireCloudflareOrganizationContext(headers)
  await requireCloudflareDomainManagement(headers, context)
  const userId = context.userId
  const organizationId = context.organizationId
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
    headers,
    returnHeaders: true
  })

  return {
    intent: intentView,
    redirectUrl: result.response.url,
    responseHeaders: result.headers
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
  const context = await requireCloudflareOrganizationContext(headers)
  await requireCloudflareDomainManagement(headers, context)
  const userId = context.userId
  const intentId = parseCloudflareIntentPublicId(intentPublicId)
  const intent = await db.models.cloudflareOAuthConnectionIntent
    .findOne({
      _id: intentId,
      organizationId: context.organizationId,
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
  const grant = await upsertCloudflareGrant(db, {
    betterAuthAccountId: account._id,
    cloudflareEmail: null,
    cloudflareUserId: account.accountId,
    grantedScopes,
    organizationId: context.organizationId,
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

export async function listConnectedCloudflareAccounts(headers: Headers): Promise<CloudflareAccountSummary[]> {
  const { db } = await globals()
  const context = await requireCloudflareOrganizationContext(headers)
  await requireCloudflareDomainManagement(headers, context)
  const grant = await getActiveGrantForUser(db, context.userId, context.organizationId)
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
  const context = await requireCloudflareOrganizationContext(headers)
  await requireCloudflareDomainManagement(headers, context)
  const grant = await getActiveGrantForUser(db, context.userId, context.organizationId)
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
  const context = await requireCloudflareOrganizationContext(headers)
  const userId = context.userId
  const domain = normalizeDomain(input.domain)
  await requireCloudflareDomainManagement(headers, context, domain)
  const grant = await getActiveGrantForUser(db, userId, context.organizationId)
  const archivePrefix = createAgentMailArchivePrefix(context.organizationPublicId, domain)

  const connection = await db.models.cloudflareConnection
    .findOneAndUpdate(
      {
        organizationId: context.organizationId,
        cloudflareAccountId: input.cloudflareAccountId,
        cloudflareZoneId: input.cloudflareZoneId,
        domain
      },
      {
        $set: {
          cloudflareAccountName: input.cloudflareAccountName ?? null,
          cloudflareZoneName: input.cloudflareZoneName ?? null,
          grantId: grant._id,
          organizationId: context.organizationId,
          organizationPublicId: context.organizationPublicId,
          archivePrefix,
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

  const domainRecord = await upsertAgentMailDomain(db, {
    connection,
    context,
    status: 'connected'
  })
  const connectionWithDomain = await db.models.cloudflareConnection
    .findByIdAndUpdate(
      connection._id,
      {
        $set: {
          agentMailDomainId: domainRecord._id
        }
      },
      { new: true }
    )
    .exec()

  return cloudflareConnectionPublicView(connectionWithDomain ?? connection)
}

export async function applyCloudflareConnectionProvisioning({
  connectionPublicId,
  headers
}: {
  connectionPublicId: CloudflareConnectionPublicId | string
  headers: Headers
}): Promise<CloudflareConnectionPublicView> {
  const { db } = await globals()
  const context = await requireCloudflareOrganizationContext(headers)
  const userId = context.userId
  const connectionId = parseCloudflareConnectionPublicId(connectionPublicId)
  const connection = await db.models.cloudflareConnection
    .findOne({
      _id: connectionId,
      organizationId: context.organizationId,
      status: { $ne: 'disconnected' }
    })
    .exec()

  if (!connection) {
    throw new Error('Cloudflare connection was not found')
  }
  await requireCloudflareDomainManagement(headers, context, connection.domain)

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

  const grant = await getGrantById(db, connection.grantId, userId, context.organizationId)
  const accessToken = await getCloudflareAccessToken(headers, grant)
  const domainRecord = await upsertAgentMailDomain(db, {
    connection,
    context,
    status: 'provisioning'
  })
  const connectionView = cloudflareConnectionPublicView(connection)
  const workerCredentials = await createWorkerCredentialsForConnection({
    connectionPublicId: connectionView.publicId,
    context,
    workerDomainDeploymentId: publicIdFromUUIDv7(domainRecord._id),
    domain: connection.domain
  })
  const existingDeployment = await db.models.agentMailWorkerDeployment
    .findOne({ cloudflareConnectionId: connection._id, organizationId: context.organizationId })
    .exec()
  const existingHmacSecret = existingDeployment?.encryptedWorkerHmacSecret
    ? decryptSecretValue(existingDeployment.encryptedWorkerHmacSecret)
    : undefined

  try {
    const result = await applyCloudflareProvisioning({
      accessToken,
      archivePrefix: workerCredentials.archivePrefix,
      cloudflareAccountId: connection.cloudflareAccountId,
      cloudflareZoneId: connection.cloudflareZoneId,
      connectionPublicId: connectionView.publicId,
      domainPublicId: publicIdFromUUIDv7(domainRecord._id),
      domain: connection.domain,
      hmacSecret: existingHmacSecret,
      organizationId: context.organizationId,
      organizationPublicId: context.organizationPublicId,
      workerCredentials: {
        accessKeyId: workerCredentials.accessKeyId,
        archivePrefix: workerCredentials.archivePrefix,
        bucket: workerCredentials.bucket,
        endpoint: workerCredentials.endpoint,
        expiresAt: workerCredentials.expiresAt,
        region: workerCredentials.region,
        secretAccessKey: workerCredentials.secretAccessKey,
        sessionToken: workerCredentials.sessionToken
      }
    })
    const now = new Date()
    const encryptedHmacSecret = encryptSecretValue(result.hmacSecret)
    const credentialRefreshAfter = new Date(now.getTime() + WORKER_CREDENTIAL_REFRESH_AFTER_MS)
    const deployment = await db.models.agentMailWorkerDeployment
      .findOneAndUpdate(
        {
          organizationId: context.organizationId,
          cloudflareConnectionId: connection._id
        },
        {
          $set: {
            userId,
            organizationPublicId: context.organizationPublicId,
            agentMailDomainId: domainRecord._id,
            workerConnectionId: connectionView.publicId,
            cloudflareAccountId: connection.cloudflareAccountId,
            cloudflareZoneId: connection.cloudflareZoneId,
            domain: connection.domain,
            archivePrefix: workerCredentials.archivePrefix,
            r2BucketName: result.r2BucketName,
            r2Endpoint: result.r2Endpoint,
            r2Region: result.r2Region,
            workerScriptName: result.workerScriptName,
            encryptedWorkerHmacSecret: encryptedHmacSecret,
            hmacSecretReference: result.hmacSecretReference,
            credentialIssuedAt: now,
            credentialRefreshAfter,
            credentialExpiresAt: workerCredentials.expiresAt,
            status: 'active',
            provisioningStatus: 'succeeded',
            lastDeployedAt: now,
            lastErrorCode: null,
            lastErrorMessage: null
          },
          $setOnInsert: {
            organizationId: context.organizationId,
            cloudflareConnectionId: connection._id
          }
        },
        { new: true, upsert: true }
      )
      .exec()

    if (!deployment) {
      throw new Error('Failed to persist Agent Mail Worker deployment')
    }

    await db.models.agentMailWorkerCredentialRefresh.create({
      userId,
      organizationId: context.organizationId,
      agentMailDomainId: domainRecord._id,
      agentMailWorkerDeploymentId: deployment._id,
      cloudflareConnectionId: connection._id,
      status: 'succeeded',
      startedAt: now,
      completedAt: now,
      credentialIssuedAt: now,
      credentialRefreshAfter,
      credentialExpiresAt: workerCredentials.expiresAt
    })

    const updatedConnection = await db.models.cloudflareConnection
      .findByIdAndUpdate(
        connection._id,
        {
          $set: {
            agentMailDomainId: domainRecord._id,
            agentMailWorkerDeploymentId: deployment._id,
            archivePrefix: workerCredentials.archivePrefix,
            lastProvisionedAt: new Date(),
            provisioningStatus: 'succeeded',
            r2BucketName: result.r2BucketName,
            r2Endpoint: result.r2Endpoint,
            r2Region: result.r2Region,
            status: 'active',
            workerCredentialIssuedAt: now,
            workerCredentialRefreshAfter: credentialRefreshAfter,
            workerCredentialExpiresAt: workerCredentials.expiresAt,
            workerScriptName: result.workerScriptName
          }
        },
        { new: true }
      )
      .exec()

    if (!updatedConnection) {
      throw new Error('Cloudflare connection disappeared after provisioning')
    }

    try {
      await syncAgentMailRuntime([
        {
          organization_id: controlOrganizationId(context),
          organization_public_id: context.organizationPublicId,
          archive_prefix: workerCredentials.archivePrefix,
          worker_connection_id: connectionView.publicId,
          worker_domain_deployment_id: publicIdFromUUIDv7(domainRecord._id),
          cloudflare_zone_name: updatedConnection.cloudflareZoneName ?? updatedConnection.domain,
          domain: updatedConnection.domain,
          enabled: true,
          mail_from_domain: updatedConnection.domain
        }
      ])
    } catch (error) {
      const failedSyncConnection = await db.models.cloudflareConnection
        .findByIdAndUpdate(
          updatedConnection._id,
          {
            $set: {
              lastErrorCode: 'AGENT_MAIL_CONTROL_SYNC_FAILED',
              lastErrorMessage:
                error instanceof Error ? error.message : 'Agent Mail control runtime sync failed.',
              status: 'degraded'
            }
          },
          { new: true }
        )
        .exec()

      if (failedSyncConnection) {
        return cloudflareConnectionPublicView(failedSyncConnection)
      }
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
  const context = await requireCloudflareOrganizationContext(headers)
  await requireCloudflareDomainManagement(headers, context)
  const [grants, connections] = await Promise.all([
    db.models.cloudflareOAuthGrant
      .find({ userId: context.userId, organizationId: context.organizationId })
      .sort({ updatedAt: -1 })
      .exec(),
    db.models.cloudflareConnection
      .find({ organizationId: context.organizationId })
      .sort({ updatedAt: -1 })
      .exec()
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
  const context = await requireCloudflareOrganizationContext(headers)
  await requireCloudflareDomainManagement(headers, context)
  const userId = context.userId
  const grant = grantPublicId
    ? await db.models.cloudflareOAuthGrant
        .findOne({
          _id: parseCloudflareGrantPublicId(grantPublicId),
          organizationId: context.organizationId,
          userId
        })
        .exec()
    : await getActiveGrantForUser(db, userId, context.organizationId)

  if (!grant) {
    throw new Error('Cloudflare grant was not found')
  }

  const connectionsToDisconnect = await db.models.cloudflareConnection
    .find({ grantId: grant._id, organizationId: context.organizationId })
    .exec()

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
      { grantId: grant._id, organizationId: context.organizationId },
      {
        $set: {
          encryptedWorkerHmacSecret: null,
          hmacSecretReference: null,
          status: 'disconnected'
        }
      }
    )
    .exec()
  await db.models.agentMailDomain
    .updateMany(
      {
        organizationId: context.organizationId,
        cloudflareConnectionId: { $in: connectionsToDisconnect.map((connection) => connection._id) }
      },
      { $set: { status: 'disconnected' } }
    )
    .exec()
  await db.models.agentMailWorkerDeployment
    .updateMany(
      {
        organizationId: context.organizationId,
        cloudflareConnectionId: { $in: connectionsToDisconnect.map((connection) => connection._id) }
      },
      {
        $set: {
          encryptedWorkerHmacSecret: null,
          hmacSecretReference: null,
          status: 'disconnected'
        }
      }
    )
    .exec()

  if (connectionsToDisconnect.length > 0) {
    try {
      await syncAgentMailRuntime(
        connectionsToDisconnect.map((connection) => ({
          organization_id: controlOrganizationId(context),
          organization_public_id: context.organizationPublicId,
          archive_prefix:
            connection.archivePrefix ??
            createAgentMailArchivePrefix(context.organizationPublicId, connection.domain),
          worker_connection_id: cloudflareConnectionPublicView(connection).publicId,
          worker_domain_deployment_id: connection.agentMailDomainId
            ? publicIdFromUUIDv7(connection.agentMailDomainId)
            : cloudflareConnectionPublicView(connection).publicId,
          cloudflare_zone_name: connection.cloudflareZoneName ?? connection.domain,
          domain: connection.domain,
          enabled: false,
          mail_from_domain: connection.domain
        }))
      )
    } catch {
      await db.models.cloudflareOAuthGrant
        .updateOne(
          { _id: grant._id },
          {
            $set: {
              lastErrorCode: 'AGENT_MAIL_CONTROL_SYNC_FAILED',
              lastErrorMessage: 'Cloudflare local connection was revoked, but Agent Mail runtime sync failed.'
            }
          }
        )
        .exec()
    }
  }

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

export async function refreshDueAgentMailWorkerCredentials(
  db: Database,
  now = new Date(),
  limit = 25
): Promise<{ failed: number; refreshed: number }> {
  const deployments = await db.models.agentMailWorkerDeployment
    .find({
      status: { $in: ['active', 'degraded'] },
      credentialRefreshAfter: { $lte: now }
    })
    .sort({ credentialRefreshAfter: 1, updatedAt: 1 })
    .limit(limit)
    .exec()
  let refreshed = 0
  let failed = 0

  for (const deployment of deployments) {
    const refresh = await db.models.agentMailWorkerCredentialRefresh.create({
      userId: deployment.userId,
      organizationId: deployment.organizationId,
      agentMailDomainId: deployment.agentMailDomainId,
      agentMailWorkerDeploymentId: deployment._id,
      cloudflareConnectionId: deployment.cloudflareConnectionId,
      status: 'pending',
      startedAt: now
    })

    try {
      const connection = await db.models.cloudflareConnection
        .findOne({
          _id: deployment.cloudflareConnectionId,
          organizationId: deployment.organizationId,
          status: { $ne: 'disconnected' }
        })
        .exec()
      if (!connection) {
        throw new Error('Cloudflare connection for Worker deployment was not found')
      }
      if (!deployment.encryptedWorkerHmacSecret) {
        throw new Error('Worker HMAC secret is not available for credential refresh')
      }

      const grant = await getGrantById(db, connection.grantId, deployment.userId, deployment.organizationId)
      const accessToken = await getStoredCloudflareAccessToken(db, grant, now)
      const workerCredentials = await createWorkerCredentialsForConnection({
        connectionPublicId: deployment.workerConnectionId,
        context: {
          organizationId: deployment.organizationId,
          organizationPublicId: deployment.organizationPublicId as OrganizationPublicId,
          role: 'owner',
          userId: deployment.userId
        },
        workerDomainDeploymentId: publicIdFromUUIDv7(deployment.agentMailDomainId),
        domain: deployment.domain
      })
      const existingHmacSecret = decryptSecretValue(deployment.encryptedWorkerHmacSecret)
      const result = await applyCloudflareProvisioning({
        accessToken,
        archivePrefix: deployment.archivePrefix,
        cloudflareAccountId: deployment.cloudflareAccountId,
        cloudflareZoneId: deployment.cloudflareZoneId,
        connectionPublicId: deployment.workerConnectionId,
        domainPublicId: publicIdFromUUIDv7(deployment.agentMailDomainId),
        domain: deployment.domain,
        hmacSecret: existingHmacSecret,
        organizationId: deployment.organizationId,
        organizationPublicId: deployment.organizationPublicId,
        workerCredentials: {
          accessKeyId: workerCredentials.accessKeyId,
          archivePrefix: workerCredentials.archivePrefix,
          bucket: workerCredentials.bucket,
          endpoint: workerCredentials.endpoint,
          expiresAt: workerCredentials.expiresAt,
          region: workerCredentials.region,
          secretAccessKey: workerCredentials.secretAccessKey,
          sessionToken: workerCredentials.sessionToken
        }
      })
      const refreshedAt = new Date()
      const credentialRefreshAfter = new Date(refreshedAt.getTime() + WORKER_CREDENTIAL_REFRESH_AFTER_MS)

      await db.models.agentMailWorkerDeployment
        .updateOne(
          { _id: deployment._id },
          {
            $set: {
              credentialIssuedAt: refreshedAt,
              credentialRefreshAfter,
              credentialExpiresAt: workerCredentials.expiresAt,
              lastDeployedAt: refreshedAt,
              lastErrorCode: null,
              lastErrorMessage: null,
              provisioningStatus: 'succeeded',
              r2BucketName: result.r2BucketName,
              r2Endpoint: result.r2Endpoint,
              r2Region: result.r2Region,
              status: 'active',
              workerScriptName: result.workerScriptName
            }
          }
        )
        .exec()
      await db.models.cloudflareConnection
        .updateOne(
          { _id: connection._id },
          {
            $set: {
              lastErrorCode: null,
              lastErrorMessage: null,
              provisioningStatus: 'succeeded',
              r2BucketName: result.r2BucketName,
              r2Endpoint: result.r2Endpoint,
              r2Region: result.r2Region,
              status: 'active',
              workerCredentialIssuedAt: refreshedAt,
              workerCredentialRefreshAfter: credentialRefreshAfter,
              workerCredentialExpiresAt: workerCredentials.expiresAt,
              workerScriptName: result.workerScriptName
            }
          }
        )
        .exec()
      await db.models.agentMailWorkerCredentialRefresh
        .updateOne(
          { _id: refresh._id },
          {
            $set: {
              status: 'succeeded',
              completedAt: refreshedAt,
              credentialIssuedAt: refreshedAt,
              credentialRefreshAfter,
              credentialExpiresAt: workerCredentials.expiresAt
            }
          }
        )
        .exec()
      refreshed += 1
    } catch (error) {
      const sanitized = sanitizeCloudflareError(error)
      const completedAt = new Date()
      await db.models.agentMailWorkerDeployment
        .updateOne(
          { _id: deployment._id },
          {
            $set: {
              status: 'degraded',
              lastErrorCode: sanitized.code,
              lastErrorMessage: sanitized.message
            }
          }
        )
        .exec()
      await db.models.agentMailWorkerCredentialRefresh
        .updateOne(
          { _id: refresh._id },
          {
            $set: {
              status: 'failed',
              completedAt,
              lastErrorCode: sanitized.code,
              lastErrorMessage: sanitized.message
            }
          }
        )
        .exec()
      failed += 1
    }
  }

  return { failed, refreshed }
}

async function requireCloudflareSession(headers: Headers) {
  const { auth } = await globals()
  const session = await auth.api.getSession({ headers })

  if (!session?.user) {
    throw new CloudflareAccessError('Authentication required', 401)
  }

  return session
}

interface CloudflareOrganizationContext {
  organizationId: OrganizationId
  organizationPublicId: OrganizationPublicId
  role: 'owner' | 'admin' | 'member'
  userId: UserId
}

async function requireCloudflareOrganizationContext(
  headers: Headers,
  options: { requireAdmin?: boolean } = {}
): Promise<CloudflareOrganizationContext> {
  const { db } = await globals()
  const session = await requireCloudflareSession(headers)
  const userId = session.user.id as UserId
  const organizationId = sessionOrganizationId(session)

  if (!organizationId) {
    throw new CloudflareAccessError('An active organization is required', 403)
  }

  const [organization, member] = await Promise.all([
    db.models.organization.findById(organizationId).exec(),
    db.models.member.findOne({ organizationId, userId }).exec()
  ])

  if (!organization || !member) {
    throw new CloudflareAccessError('Organization access is required', 403)
  }
  if (options.requireAdmin && member.role !== 'owner' && member.role !== 'admin') {
    throw new CloudflareAccessError('Organization administrator access is required', 403)
  }

  return {
    organizationId,
    organizationPublicId: publicIdFromUUIDv7(organization._id) as OrganizationPublicId,
    role: member.role,
    userId
  }
}

async function requireCloudflareDomainManagement(
  headers: Headers,
  context: CloudflareOrganizationContext,
  domain?: string
) {
  const mailContext = await requireAgentMailOrganizationContext(headers).catch((error: unknown) => {
    if (isAgentMailAccessError(error)) {
      throw new CloudflareAccessError(error.message, error.status)
    }
    throw error
  })

  if (String(mailContext.organizationId) !== String(context.organizationId)) {
    throw new CloudflareAccessError('Organization access is required', 403)
  }
  if (
    mailContext.ability.cannot(
      'manage',
      agentMailSubject('Domain', {
        domain: domain ?? null,
        organizationId: context.organizationId
      })
    )
  ) {
    throw new CloudflareAccessError('Cloudflare domain management is not authorized', 403)
  }
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

async function getStoredCloudflareAccessToken(
  db: Database,
  grant: CloudflareOAuthGrantDocument,
  now = new Date()
): Promise<string> {
  const account = await db.models.account
    .findOne({
      _id: grant.betterAuthAccountId,
      userId: grant.userId,
      providerId: CLOUDFLARE_OAUTH_PROVIDER_ID
    })
    .exec()

  if (!account) {
    throw new Error('Cloudflare Better Auth account was not found')
  }

  if (
    account.accessToken &&
    (!account.accessTokenExpiresAt ||
      account.accessTokenExpiresAt.getTime() > now.getTime() + OAUTH_TOKEN_REFRESH_SKEW_MS)
  ) {
    await db.models.cloudflareOAuthGrant
      .updateOne(
        { _id: grant._id },
        {
          $set: {
            lastTokenCheckAt: now,
            status: 'active',
            lastErrorCode: null,
            lastErrorMessage: null
          }
        }
      )
      .exec()
    return account.accessToken
  }

  return refreshStoredCloudflareAccessToken(db, grant, account)
}

async function refreshStoredCloudflareAccessToken(
  db: Database,
  grant: CloudflareOAuthGrantDocument,
  account: AccountDocument
): Promise<string> {
  if (!account.refreshToken) {
    throw new Error('Cloudflare OAuth refresh token is not available')
  }

  const { clientId, clientSecret } = requireCloudflareOAuthClientCredentials()
  const response = await fetch(getCloudflareOAuthTokenUrl(), {
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken
    }),
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    method: 'POST'
  })
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null

  if (!response.ok || typeof payload?.access_token !== 'string' || !payload.access_token) {
    throw new Error(`Cloudflare OAuth token refresh failed with HTTP ${response.status}`)
  }

  const now = new Date()
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : null
  const refreshToken =
    typeof payload.refresh_token === 'string' && payload.refresh_token
      ? payload.refresh_token
      : account.refreshToken
  const scope = typeof payload.scope === 'string' ? payload.scope : account.scope

  await db.models.account
    .updateOne(
      { _id: account._id },
      {
        $set: {
          accessToken: payload.access_token,
          accessTokenExpiresAt: expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null,
          refreshToken,
          scope
        }
      }
    )
    .exec()
  await db.models.cloudflareOAuthGrant
    .updateOne(
      { _id: grant._id },
      {
        $set: {
          lastRefreshAt: now,
          lastTokenCheckAt: now,
          status: 'active',
          lastErrorCode: null,
          lastErrorMessage: null
        }
      }
    )
    .exec()

  return payload.access_token
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
        organizationId: input.organizationId,
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
  userId: UserId,
  organizationId: OrganizationId
): Promise<CloudflareOAuthGrantDocument> {
  const grant = await db.models.cloudflareOAuthGrant
    .findOne({
      organizationId,
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
  userId: UserId,
  organizationId: OrganizationId
): Promise<CloudflareOAuthGrantDocument> {
  const grant = await db.models.cloudflareOAuthGrant
    .findOne({ _id: grantId, organizationId, userId, status: 'active' })
    .exec()

  if (!grant) {
    throw new Error('Cloudflare OAuth grant is not active')
  }

  return grant
}

async function upsertAgentMailDomain(
  db: Database,
  {
    connection,
    context,
    status
  }: {
    connection: CloudflareConnectionDocument
    context: CloudflareOrganizationContext
    status: AgentMailDomainDocument['status']
  }
): Promise<AgentMailDomainDocument> {
  const archivePrefix =
    connection.archivePrefix ?? createAgentMailArchivePrefix(context.organizationPublicId, connection.domain)
  const domain = await db.models.agentMailDomain
    .findOneAndUpdate(
      {
        organizationId: context.organizationId,
        domain: connection.domain
      },
      {
        $set: {
          userId: connection.userId,
          organizationPublicId: context.organizationPublicId,
          cloudflareConnectionId: connection._id,
          cloudflareAccountId: connection.cloudflareAccountId,
          cloudflareAccountName: connection.cloudflareAccountName,
          cloudflareZoneId: connection.cloudflareZoneId,
          cloudflareZoneName: connection.cloudflareZoneName,
          domain: connection.domain,
          archivePrefix,
          status,
          lastErrorCode: null,
          lastErrorMessage: null
        },
        $setOnInsert: {
          organizationId: context.organizationId
        }
      },
      { new: true, upsert: true }
    )
    .exec()

  if (!domain) {
    throw new Error('Failed to persist Agent Mail domain')
  }

  return domain
}

async function createWorkerCredentialsForConnection({
  connectionPublicId,
  context,
  workerDomainDeploymentId,
  domain
}: {
  connectionPublicId: string
  context: CloudflareOrganizationContext
  workerDomainDeploymentId: string
  domain: string
}) {
  const archivePrefix = createAgentMailArchivePrefix(context.organizationPublicId, domain)
  const credentials = await createAgentMailWorkerCredentials({
    organization_id: controlOrganizationId(context),
    organization_public_id: context.organizationPublicId,
    domain,
    archive_prefix: archivePrefix,
    worker_connection_id: connectionPublicId,
    worker_domain_deployment_id: workerDomainDeploymentId
  })

  if (credentials.archive_prefix !== archivePrefix) {
    throw new Error('Agent Mail control API returned credentials for the wrong archive prefix')
  }

  const expiresAt = new Date(credentials.expires_at)
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error('Agent Mail control API returned an invalid Worker credential expiration')
  }

  return {
    accessKeyId: requireNonEmptyString(credentials.access_key_id, 'Worker R2 access key id'),
    archivePrefix,
    bucket: requireNonEmptyString(credentials.bucket, 'Worker R2 bucket'),
    endpoint: requireNonEmptyString(credentials.endpoint, 'Worker R2 endpoint'),
    expiresAt,
    region: requireNonEmptyString(credentials.region, 'Worker R2 region'),
    secretAccessKey: requireNonEmptyString(credentials.secret_access_key, 'Worker R2 secret access key'),
    sessionToken: requireNonEmptyString(credentials.session_token, 'Worker R2 session token')
  }
}

function controlOrganizationId(context: CloudflareOrganizationContext): string {
  return normalizeMongooseUUIDv7(context.organizationId)
}

function createAgentMailArchivePrefix(
  organizationPublicId: OrganizationPublicId | string,
  domain: string
): string {
  return `orgs/${organizationPublicId}/domains/${normalizeDomain(domain)}/mail/inbound`
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`)
  }

  return value
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

function sessionOrganizationId(
  session: Awaited<ReturnType<typeof requireCloudflareSession>>
): OrganizationId | null {
  const activeOrganizationId = session.session.activeOrganizationId
  return typeof activeOrganizationId === 'string' && activeOrganizationId
    ? (activeOrganizationId as OrganizationId)
    : null
}

function normalizeDomain(domain: string): string {
  const normalized = domain.trim().toLowerCase()
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(normalized)
  ) {
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
