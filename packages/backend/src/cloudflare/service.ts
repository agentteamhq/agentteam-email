import {
  base62UUIDv7ToUUIDv7,
  normalizeMongooseUUIDv7,
  parseBase62UUIDv7,
  publicIdFromUUIDv7
} from '@main/db'
import debug from 'debug'

import { globals } from '../globals'
import { createAgentMailWorkerCredentials } from '../agent-mail/control-client'
import { agentMailSubject } from '../agent-mail/permission-policy'
import {
  createAgentMailArchivePrefix,
  syncAgentMailRuntimeProjection
} from '../agent-mail/runtime-projection'
import { isAgentMailAccessError, requireAgentMailOrganizationContext } from '../agent-mail/service'
import { AUTH_REDIRECT_ERROR_ROUTE } from '../auth/auth-routes'
import { decryptSecretValue, encryptSecretValue } from '../lib/secret-box'
import { PUBLIC_VARS } from '../vars.public'

import {
  applyCloudflareProvisioning,
  listCloudflareAccounts,
  listCloudflareZones,
  sanitizeCloudflareError,
  sendCloudflareRawEmail
} from './client'
import {
  CLOUDFLARE_OAUTH_PROVIDER_ID,
  createCloudflareOAuthRedirectURI,
  getCloudflareRequiredOAuthScopes,
  isCloudflareOAuthConfigured
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
import type {
  AgentMailDomainDocument,
  CloudflareConnectionDocument,
  CloudflareConnectionId,
  CloudflareConnectionPublicId,
  CloudflareOAuthConnectionIntentId,
  CloudflareOAuthConnectionIntentPublicId,
  CloudflareOAuthGrantDocument,
  CloudflareOAuthGrantId,
  CloudflareOAuthGrantPublicId,
  OrganizationId,
  OrganizationPublicId,
  UserId
} from '@main/db'
import type { Database } from '../db/db'

const CLOUDFLARE_OAUTH_INTENT_TTL_MS = 15 * 60 * 1000
const WORKER_CREDENTIAL_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000
const ACTIVE_SEND_DOMAIN_STATUSES = ['active', 'degraded'] as const
const ACTIVE_SEND_CONNECTION_STATUSES = ['active', 'degraded'] as const
const CLOUDFLARE_EMAIL_SEND_SCOPE = 'email-sending.write'
const log = debug('app:cloudflare:provisioning')
export const CloudflareOAuthReturnTargetValues = [
  'dashboard-onboarding',
  'settings-connected-accounts',
  'settings-domains'
] as const
export type CloudflareOAuthReturnTarget = (typeof CloudflareOAuthReturnTargetValues)[number]

const CLOUDFLARE_OAUTH_CALLBACK_PATH_BY_RETURN_TARGET = {
  'dashboard-onboarding': '/dashboard/',
  'settings-connected-accounts': '/settings/connected-accounts/',
  'settings-domains': '/settings/domains/'
} satisfies Record<CloudflareOAuthReturnTarget, string>

export type {
  CloudflareConnectionPublicView,
  CloudflareOAuthConnectionIntentPublicView,
  CloudflareOAuthGrantPublicView
} from './public-views'

export interface CloudflareAccountSummary {
  grantPublicId: CloudflareOAuthGrantPublicId
  id: string
  name: string
  type: 'standard' | 'enterprise'
}

export interface CloudflareZoneSummary {
  accountId: string
  accountName: string | null
  grantPublicId: CloudflareOAuthGrantPublicId
  id: string
  name: string
  status: 'initializing' | 'pending' | 'active' | 'moved' | null
}

export interface StartCloudflareOAuthResult {
  intent: CloudflareOAuthConnectionIntentPublicView
  redirectUrl: string
  responseHeaders: Headers
}

export interface StartCloudflareOAuthInput {
  headers: Headers
  returnTarget: CloudflareOAuthReturnTarget
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
  grantPublicId: CloudflareOAuthGrantPublicId | string
}

export interface CloudflareStatusResult {
  connections: CloudflareConnectionPublicView[]
  grants: CloudflareOAuthGrantPublicView[]
}

export interface CloudflareControlSendRawInput {
  domain: string
  from: string
  mimeMessage: string
  organizationId: OrganizationId | string
  organizationPublicId: OrganizationPublicId | string
  recipients: string[]
  sendId?: string
  zoneMtaQueueId?: string
}

export interface CloudflareControlSendRawResult {
  delivered: string[]
  permanent_bounces: string[]
  queued: string[]
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

export class CloudflareControlSendError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 502
  ) {
    super(message)
    this.name = 'CloudflareControlSendError'
  }
}

export function isCloudflareAccessError(error: unknown): error is CloudflareAccessError {
  return error instanceof CloudflareAccessError
}

export async function startCloudflareOAuth({
  headers,
  returnTarget
}: StartCloudflareOAuthInput): Promise<StartCloudflareOAuthResult> {
  if (!isCloudflareOAuthConfigured()) {
    throw new Error('Cloudflare OAuth is not configured')
  }

  const { auth, db } = await globals()
  const context = await requireCloudflareOrganizationContext(headers)
  await requireCloudflareDomainManagement(headers, context)
  const userId = context.userId
  const organizationId = context.organizationId
  const expiresAt = new Date(Date.now() + CLOUDFLARE_OAUTH_INTENT_TTL_MS)
  const callbackPath = callbackPathForCloudflareOAuthReturnTarget(returnTarget)
  const intent = await db.models.cloudflareOAuthConnectionIntent.create({
    userId,
    organizationId,
    status: 'pending',
    callbackPath,
    expiresAt
  })
  const intentView = cloudflareOAuthConnectionIntentPublicView(intent)
  const callbackURL = createOAuthCallbackURL(intentView.publicId, callbackPath)
  const result = await auth.api.oAuth2LinkAccount({
    body: {
      providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
      callbackURL,
      errorCallbackURL: createOAuthErrorCallbackURL(intentView.publicId, returnTarget)
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
  const grants = await listActiveGrantsForUser(db, context.userId, context.organizationId)
  const accounts: CloudflareAccountSummary[] = []

  for (const grant of grants) {
    const accessToken = await getCloudflareAccessToken(headers, grant)
    const grantPublicId = cloudflareGrantPublicId(grant)
    const grantAccounts = await listCloudflareAccounts(accessToken)
    accounts.push(...grantAccounts.map((account) => ({ ...account, grantPublicId })))
  }

  return accounts
}

export async function sendCloudflareRawEmailForControl({
  domain: inputDomain,
  from,
  mimeMessage,
  organizationId,
  organizationPublicId,
  recipients
}: CloudflareControlSendRawInput): Promise<CloudflareControlSendRawResult> {
  const domain = normalizeDomain(inputDomain)
  const requestedOrganizationId = organizationId as OrganizationId
  const requestedOrganizationPublicId = organizationPublicId as OrganizationPublicId
  const senderDomain = domainFromAddress(from)
  if (senderDomain !== domain) {
    throw new CloudflareControlSendError('Sender domain does not match the active mail domain', 403)
  }
  if (recipients.length === 0) {
    throw new CloudflareControlSendError('At least one recipient is required', 400)
  }
  if (mimeMessage.trim() === '') {
    throw new CloudflareControlSendError('MIME message is required', 400)
  }

  const { db } = await globals()
  const domainRecord = await db.models.agentMailDomain
    .findOne({
      organizationId: requestedOrganizationId,
      domain,
      status: { $in: [...ACTIVE_SEND_DOMAIN_STATUSES] }
    })
    .exec()

  if (!domainRecord || domainRecord.organizationPublicId !== requestedOrganizationPublicId) {
    throw new CloudflareControlSendError('Active Agent Mail domain is not authorized for send', 403)
  }

  const connection = await db.models.cloudflareConnection
    .findOne({
      _id: domainRecord.cloudflareConnectionId,
      organizationId: requestedOrganizationId,
      domain,
      status: { $in: [...ACTIVE_SEND_CONNECTION_STATUSES] },
      provisioningStatus: 'succeeded'
    })
    .exec()

  if (!connection || connection.organizationPublicId !== requestedOrganizationPublicId) {
    throw new CloudflareControlSendError('Active Cloudflare connection is not authorized for send', 403)
  }

  const grant = await db.models.cloudflareOAuthGrant
    .findOne({
      _id: connection.grantId,
      organizationId: requestedOrganizationId,
      status: 'active'
    })
    .exec()

  if (!grant || !grant.grantedScopes.includes(CLOUDFLARE_EMAIL_SEND_SCOPE)) {
    throw new CloudflareControlSendError('Cloudflare OAuth grant is not authorized for email sending', 403)
  }

  try {
    const accessToken = await getStoredCloudflareAccessToken(db, grant)
    const result = await sendCloudflareRawEmail({
      accessToken,
      cloudflareAccountId: connection.cloudflareAccountId,
      from,
      mimeMessage,
      recipients
    })
    return {
      delivered: result.delivered,
      permanent_bounces: result.permanentBounces,
      queued: result.queued
    }
  } catch (error) {
    const sanitized = sanitizeCloudflareError(error)
    await db.models.cloudflareConnection
      .updateOne(
        { _id: connection._id },
        {
          $set: {
            lastErrorCode: sanitized.code,
            lastErrorMessage: sanitized.message,
            status: 'degraded'
          }
        }
      )
      .exec()
    throw new CloudflareControlSendError(sanitized.message, 502)
  }
}

export async function listConnectedCloudflareZones({
  cloudflareAccountId,
  grantPublicId,
  headers
}: {
  cloudflareAccountId?: string
  grantPublicId?: CloudflareOAuthGrantPublicId | string
  headers: Headers
}): Promise<CloudflareZoneSummary[]> {
  const { db } = await globals()
  const context = await requireCloudflareOrganizationContext(headers)
  await requireCloudflareDomainManagement(headers, context)
  const grants = grantPublicId
    ? [await getActiveGrantByPublicIdForUser(db, grantPublicId, context.userId, context.organizationId)]
    : await listActiveGrantsForUser(db, context.userId, context.organizationId)
  const zones: CloudflareZoneSummary[] = []

  for (const grant of grants) {
    const accessToken = await getCloudflareAccessToken(headers, grant)
    const grantZones = await listCloudflareZones({ accessToken, cloudflareAccountId })
    const resolvedGrantPublicId = cloudflareGrantPublicId(grant)
    zones.push(...grantZones.map((zone) => ({ ...zone, grantPublicId: resolvedGrantPublicId })))
  }

  return zones
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
  const grant = await getActiveGrantByPublicIdForUser(db, input.grantPublicId, userId, context.organizationId)
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
      { returnDocument: 'after', upsert: true }
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
      { returnDocument: 'after' }
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
  const connectionView = cloudflareConnectionPublicView(connection)
  const logContext = cloudflareProvisioningLogContext({
    connection,
    connectionPublicId: connectionView.publicId,
    organizationPublicId: context.organizationPublicId
  })
  let stage = 'mark-pending'
  let domainRecord: AgentMailDomainDocument | null = null

  log('Cloudflare domain provisioning started', logContext)

  try {
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
    log('Cloudflare domain provisioning marked pending', { ...logContext, stage })

    stage = 'load-oauth-grant'
    const grant = await getGrantById(db, connection.grantId, userId, context.organizationId)

    stage = 'get-oauth-access-token'
    const accessToken = await getCloudflareAccessToken(headers, grant)

    stage = 'upsert-agent-mail-domain'
    domainRecord = await upsertAgentMailDomain(db, {
      connection,
      context,
      status: 'provisioning'
    })

    stage = 'issue-worker-archive-credentials'
    const workerCredentials = await createWorkerCredentialsForConnection({
      connectionPublicId: connectionView.publicId,
      context,
      workerDomainDeploymentId: publicIdFromUUIDv7(domainRecord._id),
      domain: connection.domain
    })
    log('Cloudflare domain provisioning issued worker archive credentials', {
      ...logContext,
      stage,
      credentialExpiresAt: workerCredentials.expiresAt
    })

    stage = 'load-existing-worker-deployment'
    const existingDeployment = await db.models.agentMailWorkerDeployment
      .findOne({ cloudflareConnectionId: connection._id, organizationId: context.organizationId })
      .exec()
    const existingWebhookSigningSecret = existingDeployment?.encryptedWorkerHmacSecret
      ? await decryptSecretValue(existingDeployment.encryptedWorkerHmacSecret)
      : undefined

    stage = 'apply-cloudflare-resources'
    const result = await applyCloudflareProvisioning({
      accessToken,
      archivePrefix: workerCredentials.archivePrefix,
      cloudflareAccountId: connection.cloudflareAccountId,
      cloudflareZoneId: connection.cloudflareZoneId,
      connectionPublicId: connectionView.publicId,
      domainPublicId: publicIdFromUUIDv7(domainRecord._id),
      domain: connection.domain,
      organizationId: context.organizationId,
      organizationPublicId: context.organizationPublicId,
      webhookSigningSecret: existingWebhookSigningSecret,
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
    log('Cloudflare domain provisioning applied Cloudflare resources', {
      ...logContext,
      stage,
      workerScriptName: result.workerScriptName
    })
    const now = new Date()
    const encryptedWebhookSigningSecret = await encryptSecretValue(result.webhookSigningSecret)
    const credentialRefreshAfter = new Date(now.getTime() + WORKER_CREDENTIAL_REFRESH_AFTER_MS)

    stage = 'persist-worker-deployment'
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
            encryptedWorkerHmacSecret: encryptedWebhookSigningSecret,
            hmacSecretReference: result.webhookSigningSecretReference,
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
        { returnDocument: 'after', upsert: true }
      )
      .exec()

    if (!deployment) {
      throw new Error('Failed to persist Agent Mail Worker deployment')
    }

    stage = 'record-worker-credential-refresh'
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

    stage = 'activate-cloudflare-connection'
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
        { returnDocument: 'after' }
      )
      .exec()

    if (!updatedConnection) {
      throw new Error('Cloudflare connection disappeared after provisioning')
    }

    stage = 'activate-agent-mail-domain'
    await db.models.agentMailDomain
      .updateOne(
        { _id: domainRecord._id },
        {
          $set: {
            archivePrefix: workerCredentials.archivePrefix,
            lastErrorCode: null,
            lastErrorMessage: null,
            status: 'active'
          }
        }
      )
      .exec()

    stage = 'sync-agent-mail-runtime'
    try {
      await syncAgentMailRuntimeProjection(db, { reason: 'cloudflare-provision' })
    } catch (error) {
      const syncFailure = sanitizeCloudflareProvisioningError(stage, error)
      log('Cloudflare domain provisioning runtime sync failed', {
        ...logContext,
        stage,
        error: provisioningErrorLogFields(error, syncFailure)
      })
      await db.models.agentMailDomain
        .updateOne(
          { _id: domainRecord._id },
          {
            $set: {
              lastErrorCode: 'AT_EMAIL_ADMIN_CONTROL_SYNC_FAILED',
              lastErrorMessage: syncFailure.message,
              status: 'degraded'
            }
          }
        )
        .exec()
      const failedSyncConnection = await db.models.cloudflareConnection
        .findByIdAndUpdate(
          updatedConnection._id,
          {
            $set: {
              lastErrorCode: 'AT_EMAIL_ADMIN_CONTROL_SYNC_FAILED',
              lastErrorMessage: syncFailure.message,
              status: 'degraded'
            }
          },
          { returnDocument: 'after' }
        )
        .exec()

      if (failedSyncConnection) {
        return cloudflareConnectionPublicView(failedSyncConnection)
      }
    }

    log('Cloudflare domain provisioning succeeded', {
      ...logContext,
      stage: 'complete',
      workerScriptName: updatedConnection.workerScriptName
    })
    return cloudflareConnectionPublicView(updatedConnection)
  } catch (error) {
    const sanitized = sanitizeCloudflareProvisioningError(stage, error)
    log('Cloudflare domain provisioning failed', {
      ...logContext,
      stage,
      error: provisioningErrorLogFields(error, sanitized)
    })
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
        { returnDocument: 'after' }
      )
      .exec()

    if (!failedConnection) {
      throw error
    }

    if (domainRecord) {
      try {
        await db.models.agentMailDomain
          .updateOne(
            { _id: domainRecord._id },
            {
              $set: {
                lastErrorCode: sanitized.code,
                lastErrorMessage: sanitized.message,
                status: 'degraded'
              }
            }
          )
          .exec()
      } catch (recordDomainError) {
        log('Cloudflare domain provisioning failed to record Agent Mail domain failure state', {
          ...logContext,
          stage,
          error: provisioningErrorLogFields(recordDomainError, {
            code: 'AT_EMAIL_PROVISIONING_STATE_FAILED',
            message: 'Cloudflare domain provisioning state update failed. Try again or contact support.'
          }),
          originalErrorCode: sanitized.code
        })
      }
    }

    log('Cloudflare domain provisioning failure recorded', {
      ...logContext,
      stage,
      errorCode: sanitized.code
    })

    if (isCloudflareAccessError(error)) {
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
  grantPublicId: CloudflareOAuthGrantPublicId | string
  headers: Headers
}): Promise<CloudflareStatusResult> {
  const { auth, db } = await globals()
  const context = await requireCloudflareOrganizationContext(headers)
  await requireCloudflareDomainManagement(headers, context)
  const userId = context.userId
  const requestedGrantPublicId = requireNonEmptyString(grantPublicId, 'Cloudflare grant public id')
  const grant = await getActiveGrantByPublicIdForUser(
    db,
    requestedGrantPublicId,
    userId,
    context.organizationId
  )

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
      await syncAgentMailRuntimeProjection(db, { reason: 'cloudflare-disconnect' })
    } catch {
      await db.models.cloudflareOAuthGrant
        .updateOne(
          { _id: grant._id },
          {
            $set: {
              lastErrorCode: 'AT_EMAIL_ADMIN_CONTROL_SYNC_FAILED',
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
        throw new Error('Worker webhook signing secret is not available for credential refresh')
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
      const existingWebhookSigningSecret = await decryptSecretValue(deployment.encryptedWorkerHmacSecret)
      const result = await applyCloudflareProvisioning({
        accessToken,
        archivePrefix: deployment.archivePrefix,
        cloudflareAccountId: deployment.cloudflareAccountId,
        cloudflareZoneId: deployment.cloudflareZoneId,
        connectionPublicId: deployment.workerConnectionId,
        domainPublicId: publicIdFromUUIDv7(deployment.agentMailDomainId),
        domain: deployment.domain,
        organizationId: deployment.organizationId,
        organizationPublicId: deployment.organizationPublicId,
        webhookSigningSecret: existingWebhookSigningSecret,
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

function cloudflareProvisioningLogContext({
  connection,
  connectionPublicId,
  organizationPublicId
}: {
  connection: CloudflareConnectionDocument
  connectionPublicId: string
  organizationPublicId: OrganizationPublicId | string
}) {
  return {
    cloudflareAccountId: connection.cloudflareAccountId,
    cloudflareZoneId: connection.cloudflareZoneId,
    cloudflareZoneName: connection.cloudflareZoneName,
    connectionPublicId,
    domain: connection.domain,
    organizationPublicId
  }
}

function sanitizeCloudflareProvisioningError(
  stage: string,
  error: unknown
): { code: string; message: string } {
  if (isCloudflareAccessError(error)) {
    return {
      code: `CLOUDFLARE_ACCESS_${error.status}`,
      message: error.message
    }
  }
  if (stage === 'issue-worker-archive-credentials') {
    return {
      code: 'AT_EMAIL_ADMIN_CONTROL_CREDENTIALS_FAILED',
      message: 'Agent Mail worker credential issuance failed. Try again or check runtime health.'
    }
  }
  if (stage === 'sync-agent-mail-runtime') {
    return {
      code: 'AT_EMAIL_ADMIN_CONTROL_SYNC_FAILED',
      message: 'Agent Mail runtime sync failed. Try again or check runtime health.'
    }
  }
  if (
    stage === 'mark-pending' ||
    stage === 'upsert-agent-mail-domain' ||
    stage === 'load-existing-worker-deployment' ||
    stage === 'persist-worker-deployment' ||
    stage === 'record-worker-credential-refresh' ||
    stage === 'activate-cloudflare-connection' ||
    stage === 'activate-agent-mail-domain'
  ) {
    return {
      code: 'AT_EMAIL_PROVISIONING_STATE_FAILED',
      message: 'Cloudflare domain provisioning state update failed. Try again or contact support.'
    }
  }
  if (stage === 'get-oauth-access-token' || stage === 'load-oauth-grant') {
    return {
      code: 'CLOUDFLARE_OAUTH_GRANT_UNAVAILABLE',
      message: 'Cloudflare authorization failed. Reconnect Cloudflare and try again.'
    }
  }

  return sanitizeCloudflareError(error)
}

function provisioningErrorLogFields(
  error: unknown,
  sanitized: { code: string; message: string }
): Record<string, unknown> {
  return {
    code: sanitized.code,
    message: sanitized.message,
    method: readStringProperty(error, 'method'),
    name: error instanceof Error ? error.name : typeof error,
    status: readNumberProperty(error, 'status')
  }
}

function readNumberProperty(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const property = (value as Record<string, unknown>)[key]
  return typeof property === 'number' ? property : undefined
}

function readStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const property = (value as Record<string, unknown>)[key]
  return typeof property === 'string' && property.trim() ? property : undefined
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
  const { auth } = await globals()
  const result = await auth.api.getAccessToken({
    body: {
      accountId: grant.cloudflareUserId,
      providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
      userId: grant.userId
    }
  })

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
        organizationId: input.organizationId,
        cloudflareUserId: input.cloudflareUserId,
        userId: input.userId
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
      { returnDocument: 'after', upsert: true }
    )
    .exec()

  if (!grant) {
    throw new Error('Failed to persist Cloudflare OAuth grant')
  }

  return grant
}

async function listActiveGrantsForUser(
  db: Database,
  userId: UserId,
  organizationId: OrganizationId
): Promise<CloudflareOAuthGrantDocument[]> {
  const grants = await db.models.cloudflareOAuthGrant
    .find({
      organizationId,
      userId,
      status: 'active'
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .exec()

  if (grants.length === 0) {
    throw new Error('Cloudflare OAuth is not connected')
  }

  return grants
}

async function getActiveGrantByPublicIdForUser(
  db: Database,
  grantPublicId: CloudflareOAuthGrantPublicId | string,
  userId: UserId,
  organizationId: OrganizationId
): Promise<CloudflareOAuthGrantDocument> {
  let grantId: CloudflareOAuthGrantId

  try {
    grantId = parseCloudflareGrantPublicId(grantPublicId)
  } catch {
    throw new CloudflareAccessError('Cloudflare OAuth grant is not active', 403)
  }

  return getGrantById(db, grantId, userId, organizationId)
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
    throw new CloudflareAccessError('Cloudflare OAuth grant is not active', 403)
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
      { returnDocument: 'after', upsert: true }
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

function cloudflareGrantPublicId(grant: CloudflareOAuthGrantDocument): CloudflareOAuthGrantPublicId {
  return publicIdFromUUIDv7(grant._id) as CloudflareOAuthGrantPublicId
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

function domainFromAddress(address: string): string {
  const match = /@([^@\s>]+)>?\s*$/u.exec(address.trim())
  if (!match?.[1]) {
    throw new CloudflareControlSendError('Sender address must include a domain', 400)
  }
  return normalizeDomain(match[1])
}

function callbackPathForCloudflareOAuthReturnTarget(returnTarget: CloudflareOAuthReturnTarget): string {
  return CLOUDFLARE_OAUTH_CALLBACK_PATH_BY_RETURN_TARGET[returnTarget]
}

function createOAuthCallbackURL(
  intentPublicId: CloudflareOAuthConnectionIntentPublicId,
  callbackPath: string
): string {
  const url = new URL(callbackPath, PUBLIC_VARS.PUBLIC_HOSTNAME)
  url.searchParams.set('cloudflareIntentId', intentPublicId)

  return url.toString()
}

function createOAuthErrorCallbackURL(
  intentPublicId: CloudflareOAuthConnectionIntentPublicId,
  returnTarget: CloudflareOAuthReturnTarget
): string {
  const url = new URL(AUTH_REDIRECT_ERROR_ROUTE)
  url.searchParams.set('provider', CLOUDFLARE_OAUTH_PROVIDER_ID)
  url.searchParams.set('flow', 'connected-account')
  url.searchParams.set('cloudflareIntentId', intentPublicId)
  url.searchParams.set('returnTarget', returnTarget)
  url.searchParams.set('callbackUri', createCloudflareOAuthRedirectURI())
  return url.toString()
}
