import {
  base62UUIDv7ToUUIDv7,
  normalizeMongooseUUIDv7,
  parseBase62UUIDv7,
  publicIdFromUUIDv7
} from '@main/db'
import { APIError } from 'better-auth'
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
import { createSafeDiagnosticErrorName, createSafeErrorLogDetails } from '../auth/log-redaction'
import { decryptSecretValue, encryptSecretValue } from '../lib/secret-box'
import { PUBLIC_VARS } from '../vars.public'

import {
  applyCloudflareProvisioning,
  listCloudflareAccounts,
  listCloudflareZones,
  removeCloudflareProvisioning,
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
  CLOUDFLARE_REAUTHORIZATION_REQUIRED_ERROR_CODE,
  CLOUDFLARE_REAUTHORIZATION_REQUIRED_MESSAGE
} from './public-errors'
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
  CloudflareConnectionStatus,
  CloudflareOAuthConnectionIntentId,
  CloudflareOAuthConnectionIntentPublicId,
  CloudflareOAuthGrantDocument,
  CloudflareOAuthGrantId,
  CloudflareOAuthGrantPublicId,
  CloudflareProvisioningStatus,
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
const sendLog = debug('app:cloudflare:send')
const tokenLog = debug('app:cloudflare:token')

/**
 * Better Auth account-endpoint error codes that mean the stored Cloudflare OAuth
 * credential can no longer produce a usable access token. These are credential
 * failures, not request-validation failures, so they map to reauthorization.
 * Provider-configuration codes such as `PROVIDER_NOT_SUPPORTED` and
 * `TOKEN_REFRESH_NOT_SUPPORTED` are deliberately excluded: those are deployment
 * defects that must stay visible as unexpected server errors.
 */
const CLOUDFLARE_REAUTHORIZATION_BETTER_AUTH_ERROR_CODES: ReadonlySet<string> = new Set([
  'ACCOUNT_NOT_FOUND',
  'FAILED_TO_GET_ACCESS_TOKEN',
  'FAILED_TO_REFRESH_ACCESS_TOKEN',
  'REFRESH_TOKEN_NOT_FOUND'
])

const CLOUDFLARE_GRANT_REAUTHORIZABLE_STATUSES = ['active', 'degraded'] as const

/** Marks provisioning runs that a Cloudflare reconnect triggered, not a user action. */
const CLOUDFLARE_RECONNECT_REVALIDATION_TRIGGER = 'cloudflare-reconnect'

/**
 * The reconnect sweep runs inside the OAuth finalize request, so it must stay
 * bounded. Each connection costs a token leg plus Cloudflare provisioning calls
 * and can take tens of seconds when Cloudflare is slow; without these bounds a
 * user with many degraded domains could outlive the ingress timeout. Anything
 * skipped keeps its existing state and stays one manual setup press away.
 */
const CLOUDFLARE_RECONNECT_REVALIDATION_MAX_CONNECTIONS = 5
const CLOUDFLARE_RECONNECT_REVALIDATION_BUDGET_MS = 30_000

type CloudflareTokenOperation = 'get_access_token' | 'get_stored_access_token' | 'refresh_stored_access_token'
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
  missingRequiredScopeCount: number
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
  message_id?: string
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

/**
 * Raised when the stored Cloudflare connected-account grant can no longer produce
 * an access token. The caller's own browser session is still valid, so this is an
 * upstream credential failure that the user resolves by reconnecting Cloudflare.
 */
export class CloudflareReauthorizationRequiredError extends CloudflareAccessError {
  public readonly code = CLOUDFLARE_REAUTHORIZATION_REQUIRED_ERROR_CODE

  constructor(message: string = CLOUDFLARE_REAUTHORIZATION_REQUIRED_MESSAGE) {
    super(message, 401)
    this.name = 'CloudflareReauthorizationRequiredError'
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

export function isCloudflareReauthorizationRequiredError(
  error: unknown
): error is CloudflareReauthorizationRequiredError {
  return error instanceof CloudflareReauthorizationRequiredError
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

  // Not yet validated end to end against real Cloudflare: this auto-heal has
  // unit and behavior coverage only, and a reconnect after a real degradation in
  // production is the only true proof.
  await revalidateCloudflareConnectionsAfterReconnect({ context, db, grant, headers })

  return {
    grant: cloudflareOAuthGrantPublicView(grant),
    missingRequiredScopeCount: missingScopes.length
  }
}

/**
 * Heals this grant's domain connections after a Cloudflare reconnect.
 *
 * Reactivating the grant is not enough on its own: a connection that degraded
 * while the grant was stale keeps showing its needs-setup state until someone
 * presses the manual setup button, which succeeds immediately once the grant is
 * active again. This re-runs that same button's owner for each affected
 * connection so the reconnect heals the domain state end to end.
 *
 * `applyCloudflareConnectionProvisioning` is the single owner of provisioning:
 * it re-derives the organization context from the request and applies the
 * domain-scoped Agent Mail CASL check for each connection, so revalidation is
 * authorized exactly like the manual `/connections/:id/provision` route. No
 * authority is re-derived or relaxed here.
 *
 * Only connections that are not already healthy are revalidated. Re-provisioning
 * a healthy connection was proven safe and idempotent in production, but it can
 * only lose here: a transient Cloudflare failure during the sweep would flip a
 * working domain to degraded and turn a successful reconnect into a visibly
 * broken one. Healthy connections are already kept current by the scheduled
 * worker credential refresh.
 *
 * Nothing in the sweep may reject. Finalize has already consumed the OAuth intent
 * and reactivated the grant by this point, and it only accepts pending intents,
 * so any rejection here would hand the user a failed reconnect with no retry path
 * despite the reconnect itself having succeeded.
 */
async function revalidateCloudflareConnectionsAfterReconnect({
  context,
  db,
  grant,
  headers
}: {
  context: CloudflareOrganizationContext
  db: Database
  grant: CloudflareOAuthGrantDocument
  headers: Headers
}): Promise<void> {
  let grantPublicId: CloudflareOAuthGrantPublicId | null = null

  try {
    grantPublicId = cloudflareGrantPublicId(grant)
    await runCloudflareReconnectRevalidationSweep({ context, db, grant, grantPublicId, headers })
  } catch (error) {
    // Covers everything outside the per-connection isolation below: the grant id
    // encode, the connection query, and any unexpected sweep failure.
    log('Cloudflare reconnect connection revalidation sweep failed', {
      error: createSafeErrorLogDetails(error),
      grantPublicId,
      organizationPublicId: context.organizationPublicId,
      trigger: CLOUDFLARE_RECONNECT_REVALIDATION_TRIGGER
    })
  }
}

async function runCloudflareReconnectRevalidationSweep({
  context,
  db,
  grant,
  grantPublicId,
  headers
}: {
  context: CloudflareOrganizationContext
  db: Database
  grant: CloudflareOAuthGrantDocument
  grantPublicId: CloudflareOAuthGrantPublicId
  headers: Headers
}): Promise<void> {
  const connections = await db.models.cloudflareConnection
    .find({
      grantId: grant._id,
      organizationId: context.organizationId,
      status: { $ne: 'disconnected' }
    })
    .exec()
  const staleConnections = connections.filter(cloudflareConnectionNeedsRevalidation)
  const selectedConnections = staleConnections.slice(0, CLOUDFLARE_RECONNECT_REVALIDATION_MAX_CONNECTIONS)
  const skippedConnections = staleConnections
    .slice(CLOUDFLARE_RECONNECT_REVALIDATION_MAX_CONNECTIONS)
    .map((connection) => ({
      connectionPublicId: publicIdFromUUIDv7(connection._id),
      domain: connection.domain,
      reason: 'connection-cap'
    }))
  const deadline = Date.now() + CLOUDFLARE_RECONNECT_REVALIDATION_BUDGET_MS

  log('Cloudflare reconnect connection revalidation evaluated', {
    connectionCount: connections.length,
    grantPublicId,
    organizationPublicId: context.organizationPublicId,
    selectedConnectionCount: selectedConnections.length,
    staleConnectionCount: staleConnections.length,
    trigger: CLOUDFLARE_RECONNECT_REVALIDATION_TRIGGER
  })

  for (const connection of selectedConnections) {
    const connectionLogContext = {
      connectionPublicId: publicIdFromUUIDv7(connection._id),
      domain: connection.domain,
      grantPublicId,
      organizationPublicId: context.organizationPublicId,
      trigger: CLOUDFLARE_RECONNECT_REVALIDATION_TRIGGER
    }

    if (Date.now() >= deadline) {
      skippedConnections.push({
        connectionPublicId: connectionLogContext.connectionPublicId,
        domain: connection.domain,
        reason: 'time-budget'
      })
      continue
    }

    log('Cloudflare reconnect connection revalidation started', {
      ...connectionLogContext,
      provisioningStatus: connection.provisioningStatus,
      status: connection.status
    })

    try {
      const revalidated = await applyCloudflareConnectionProvisioning({
        connectionPublicId: connectionLogContext.connectionPublicId,
        headers
      })

      log('Cloudflare reconnect connection revalidation finished', {
        ...connectionLogContext,
        healed: isHealthyCloudflareConnectionState(revalidated),
        provisioningStatus: revalidated.provisioningStatus,
        status: revalidated.status
      })
    } catch (error) {
      // The reconnect itself succeeded, so a provisioning failure must not fail
      // finalize. The provisioning owner already recorded the sanitized failure on
      // the connection before rethrowing, so this only has to report it.
      log('Cloudflare reconnect connection revalidation failed', {
        ...connectionLogContext,
        error: createSafeErrorLogDetails(error)
      })
    }
  }

  if (skippedConnections.length > 0) {
    // Never truncate silently: skipped connections keep their current state and
    // stay one manual setup press away.
    log('Cloudflare reconnect connection revalidation skipped connections', {
      grantPublicId,
      organizationPublicId: context.organizationPublicId,
      skippedConnectionCount: skippedConnections.length,
      skippedConnections,
      trigger: CLOUDFLARE_RECONNECT_REVALIDATION_TRIGGER
    })
  }
}

function cloudflareConnectionNeedsRevalidation(connection: CloudflareConnectionDocument): boolean {
  return !isHealthyCloudflareConnectionState(connection)
}

function isHealthyCloudflareConnectionState({
  provisioningStatus,
  status
}: {
  provisioningStatus: CloudflareProvisioningStatus
  status: CloudflareConnectionStatus
}): boolean {
  return status === 'active' && provisioningStatus === 'succeeded'
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
  recipients,
  sendId,
  zoneMtaQueueId
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
    const result = await sendCloudflareRawEmailWithStoredGrantRetry({
      cloudflareAccountId: connection.cloudflareAccountId,
      db,
      domain,
      from,
      grant,
      mimeMessage,
      organizationPublicId: requestedOrganizationPublicId,
      recipients,
      sendId,
      zoneMtaQueueId
    })
    await db.models.cloudflareConnection
      .updateOne(
        { _id: connection._id },
        {
          $set: {
            lastErrorCode: null,
            lastErrorMessage: null,
            status: 'active'
          }
        }
      )
      .exec()
    return {
      delivered: result.delivered,
      ...(result.messageId ? { message_id: result.messageId } : {}),
      permanent_bounces: result.permanentBounces,
      queued: result.queued
    }
  } catch (error) {
    const sanitized = sanitizeCloudflareError(error)
    sendLog('Cloudflare raw email send failed', {
      connectionPublicId: publicIdFromUUIDv7(connection._id),
      domain,
      error: provisioningErrorLogFields(error, sanitized),
      organizationPublicId: requestedOrganizationPublicId,
      recipientCount: recipients.length,
      sendId,
      zoneMtaQueueId
    })
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

async function sendCloudflareRawEmailWithStoredGrantRetry({
  cloudflareAccountId,
  db,
  domain,
  from,
  grant,
  mimeMessage,
  organizationPublicId,
  recipients,
  sendId,
  zoneMtaQueueId
}: {
  cloudflareAccountId: string
  db: Database
  domain: string
  from: string
  grant: CloudflareOAuthGrantDocument
  mimeMessage: string
  organizationPublicId: OrganizationPublicId
  recipients: string[]
  sendId?: string
  zoneMtaQueueId?: string
}) {
  const accessToken = await getStoredCloudflareAccessToken(db, grant)

  try {
    return await sendCloudflareRawEmail({
      accessToken,
      cloudflareAccountId,
      from,
      mimeMessage,
      recipients
    })
  } catch (error) {
    if (readNumberProperty(error, 'status') !== 401) {
      throw error
    }

    sendLog('Cloudflare raw email send access token rejected; refreshing and retrying', {
      cloudflareAccountId,
      domain,
      organizationPublicId,
      recipientCount: recipients.length,
      sendId,
      zoneMtaQueueId
    })
    const refreshedAccessToken = await refreshStoredCloudflareAccessToken(db, grant)
    return sendCloudflareRawEmail({
      accessToken: refreshedAccessToken,
      cloudflareAccountId,
      from,
      mimeMessage,
      recipients
    })
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
  const grant = await getReauthorizableGrantByPublicIdForUser(
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

export async function removeCloudflareDomain({
  connectionPublicId,
  headers
}: {
  connectionPublicId: CloudflareConnectionPublicId | string
  headers: Headers
}): Promise<CloudflareStatusResult> {
  const { db } = await globals()
  const context = await requireCloudflareOrganizationContext(headers)
  const userId = context.userId
  const connectionId = parseCloudflareConnectionPublicId(connectionPublicId)
  const connection = await db.models.cloudflareConnection
    .findOne({
      _id: connectionId,
      organizationId: context.organizationId
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
  let stage = 'load-worker-deployment'

  log('Cloudflare domain removal started', logContext)

  try {
    const deployment = await db.models.agentMailWorkerDeployment
      .findOne({ cloudflareConnectionId: connection._id, organizationId: context.organizationId })
      .exec()
    const workerScriptName = connection.workerScriptName ?? deployment?.workerScriptName ?? null
    const hasProviderResources =
      connection.provisioningStatus === 'succeeded' || Boolean(workerScriptName) || Boolean(deployment)

    if (hasProviderResources) {
      stage = 'load-oauth-grant'
      const grant = await getGrantById(db, connection.grantId, userId, context.organizationId)

      stage = 'get-oauth-access-token'
      const accessToken = await getCloudflareAccessToken(headers, grant)

      stage = 'remove-cloudflare-resources'
      await removeCloudflareProvisioning({
        accessToken,
        cloudflareAccountId: connection.cloudflareAccountId,
        cloudflareZoneId: connection.cloudflareZoneId,
        workerScriptName
      })
      log('Cloudflare domain removal removed provider resources', {
        ...logContext,
        stage,
        workerScriptName
      })
    } else if (connection.status === 'disconnected') {
      log('Cloudflare domain removal skipped provider resources for already disconnected domain', {
        ...logContext,
        stage,
        workerScriptName
      })
    }

    stage = 'disconnect-cloudflare-connection'
    await db.models.cloudflareConnection
      .updateOne(
        { _id: connection._id, organizationId: context.organizationId },
        {
          $set: {
            encryptedWorkerHmacSecret: null,
            hmacSecretReference: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            provisioningStatus: 'not_started',
            status: 'disconnected'
          }
        }
      )
      .exec()

    stage = 'disconnect-agent-mail-domain'
    await db.models.agentMailDomain
      .updateMany(
        {
          organizationId: context.organizationId,
          cloudflareConnectionId: connection._id
        },
        {
          $set: {
            lastErrorCode: null,
            lastErrorMessage: null,
            status: 'disconnected'
          }
        }
      )
      .exec()

    stage = 'disconnect-worker-deployment'
    await db.models.agentMailWorkerDeployment
      .updateMany(
        {
          organizationId: context.organizationId,
          cloudflareConnectionId: connection._id
        },
        {
          $set: {
            encryptedWorkerHmacSecret: null,
            hmacSecretReference: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            status: 'disconnected'
          }
        }
      )
      .exec()

    stage = 'sync-agent-mail-runtime'
    await syncAgentMailRuntimeProjection(db, { reason: 'cloudflare-domain-remove' })

    log('Cloudflare domain removal succeeded', {
      ...logContext,
      stage: 'complete',
      workerScriptName
    })
    return await getCloudflareStatus(headers)
  } catch (error) {
    const sanitized = sanitizeCloudflareProvisioningError(stage, error)
    log('Cloudflare domain removal failed', {
      ...logContext,
      stage,
      error: provisioningErrorLogFields(error, sanitized)
    })

    await db.models.cloudflareConnection
      .updateOne(
        { _id: connection._id, organizationId: context.organizationId },
        {
          $set: {
            lastErrorCode: sanitized.code,
            lastErrorMessage: sanitized.message,
            status: 'degraded'
          }
        }
      )
      .exec()

    if (isCloudflareAccessError(error)) {
      throw error
    }

    throw error
  }
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
  if (isCloudflareReauthorizationRequiredError(error)) {
    return {
      code: CLOUDFLARE_REAUTHORIZATION_REQUIRED_ERROR_CODE,
      message: CLOUDFLARE_REAUTHORIZATION_REQUIRED_MESSAGE
    }
  }
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
    cloudflareOperation:
      readStringProperty(error, 'cloudflareProvisioningOperation') ??
      readStringProperty(error, 'cloudflareEmailSendOperation'),
    cloudflareProviderErrorCodes: readCloudflareProviderErrorProperties(error, 'code'),
    cloudflareProviderErrorMessages: readCloudflareProviderErrorProperties(error, 'message'),
    message: sanitized.message,
    method: readStringProperty(error, 'method'),
    name: createSafeDiagnosticErrorName(error),
    status: readNumberProperty(error, 'status')
  }
}

function readCloudflareProviderErrorProperties(
  value: unknown,
  key: 'code' | 'message'
): unknown[] | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const property = (value as Record<string, unknown>).cloudflareProviderErrors
  if (!Array.isArray(property)) {
    return undefined
  }
  const values = property.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }
    const propertyValue = (entry as Record<string, unknown>)[key]
    return typeof propertyValue === 'string' || typeof propertyValue === 'number' ? [propertyValue] : []
  })
  return values.length > 0 ? values : undefined
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

/**
 * Reads the Better Auth API error code for a failed Cloudflare token call.
 * Returns `undefined` for anything that is not a Better Auth API error so that
 * unknown failures keep their unexpected-server-error classification.
 */
function betterAuthApiErrorCode(error: unknown): string | undefined {
  if (!(error instanceof APIError)) {
    return undefined
  }

  const code = error.body?.code

  return typeof code === 'string' ? code : undefined
}

function isCloudflareReauthorizationBetterAuthError(error: unknown): boolean {
  const code = betterAuthApiErrorCode(error)

  return code !== undefined && CLOUDFLARE_REAUTHORIZATION_BETTER_AUTH_ERROR_CODES.has(code)
}

/**
 * Runs a Better Auth Cloudflare token call and owns failure classification for the
 * grant. Credential failures are recorded on the grant as `degraded` and rethrown
 * as a typed reauthorization error; every other failure is rethrown unchanged so it
 * keeps reporting as an unexpected server error.
 */
async function callCloudflareGrantTokenApi<TResult>({
  db,
  grant,
  operation,
  request
}: {
  db: Database
  grant: CloudflareOAuthGrantDocument
  operation: CloudflareTokenOperation
  request: () => Promise<TResult>
}): Promise<TResult> {
  try {
    return await request()
  } catch (error) {
    const betterAuthErrorCode = betterAuthApiErrorCode(error)
    const reauthorizationRequired = isCloudflareReauthorizationBetterAuthError(error)

    tokenLog('cloudflare_grant_token_call_failed %o', {
      betterAuthErrorCode: betterAuthErrorCode ?? null,
      betterAuthStatusCode: error instanceof APIError ? error.statusCode : null,
      cloudflareUserId: grant.cloudflareUserId,
      error: createSafeErrorLogDetails(error),
      grantPublicId: publicIdFromUUIDv7(grant._id),
      grantStatus: grant.status,
      operation,
      organizationId: grant.organizationId ? normalizeMongooseUUIDv7(grant.organizationId) : null,
      reauthorizationRequired,
      userId: normalizeMongooseUUIDv7(grant.userId)
    })

    if (!reauthorizationRequired) {
      throw error
    }

    await recordCloudflareGrantReauthorizationRequired({ db, grant, operation })

    throw new CloudflareReauthorizationRequiredError()
  }
}

async function recordCloudflareGrantReauthorizationRequired({
  db,
  grant,
  now = new Date(),
  operation
}: {
  db: Database
  grant: CloudflareOAuthGrantDocument
  now?: Date
  operation: CloudflareTokenOperation
}): Promise<void> {
  await db.models.cloudflareOAuthGrant
    .updateOne(
      { _id: grant._id },
      {
        $set: {
          lastErrorCode: CLOUDFLARE_REAUTHORIZATION_REQUIRED_ERROR_CODE,
          lastErrorMessage: CLOUDFLARE_REAUTHORIZATION_REQUIRED_MESSAGE,
          lastTokenCheckAt: now,
          status: 'degraded'
        }
      }
    )
    .exec()

  tokenLog('cloudflare_grant_marked_degraded %o', {
    grantPublicId: publicIdFromUUIDv7(grant._id),
    lastErrorCode: CLOUDFLARE_REAUTHORIZATION_REQUIRED_ERROR_CODE,
    operation,
    organizationId: grant.organizationId ? normalizeMongooseUUIDv7(grant.organizationId) : null,
    status: 'degraded',
    userId: normalizeMongooseUUIDv7(grant.userId)
  })
}

async function getCloudflareAccessToken(
  headers: Headers,
  grant: CloudflareOAuthGrantDocument
): Promise<string> {
  const { auth, db } = await globals()
  const result = await callCloudflareGrantTokenApi({
    db,
    grant,
    operation: 'get_access_token',
    request: () =>
      auth.api.getAccessToken({
        body: {
          accountId: grant.cloudflareUserId,
          providerId: CLOUDFLARE_OAUTH_PROVIDER_ID
        },
        headers
      })
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
  const result = await callCloudflareGrantTokenApi({
    db,
    grant,
    operation: 'get_stored_access_token',
    request: () =>
      auth.api.getAccessToken({
        body: {
          accountId: grant.cloudflareUserId,
          providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
          userId: normalizeMongooseUUIDv7(grant.userId)
        }
      })
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

async function refreshStoredCloudflareAccessToken(
  db: Database,
  grant: CloudflareOAuthGrantDocument,
  now = new Date()
): Promise<string> {
  const { auth } = await globals()
  const result = await callCloudflareGrantTokenApi({
    db,
    grant,
    operation: 'refresh_stored_access_token',
    request: () =>
      auth.api.refreshToken({
        body: {
          accountId: grant.cloudflareUserId,
          providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
          userId: normalizeMongooseUUIDv7(grant.userId)
        }
      })
  })
  if (!result.accessToken) {
    await recordCloudflareGrantReauthorizationRequired({
      db,
      grant,
      now,
      operation: 'refresh_stored_access_token'
    })
    throw new CloudflareReauthorizationRequiredError()
  }
  const grantedScopes = parseOAuthScopeString(result.scope)

  await db.models.cloudflareOAuthGrant
    .updateOne(
      { _id: grant._id },
      {
        $set: {
          ...(grantedScopes.length > 0 ? { grantedScopes } : {}),
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
    await throwWhenCloudflareGrantNeedsReauthorization(db, { organizationId, userId })
    throw new Error('Cloudflare OAuth is not connected')
  }

  const usableGrants = grants.filter(hasCurrentRequiredCloudflareScopes)
  if (usableGrants.length === 0) {
    throw new CloudflareAccessError('Cloudflare OAuth grant is missing required scopes', 403)
  }

  return usableGrants
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
    await throwWhenCloudflareGrantNeedsReauthorization(db, { _id: grantId, organizationId, userId })
    throw new CloudflareAccessError('Cloudflare OAuth grant is not active', 403)
  }
  if (!hasCurrentRequiredCloudflareScopes(grant)) {
    throw new CloudflareAccessError('Cloudflare OAuth grant is missing required scopes', 403)
  }

  return grant
}

/**
 * Grant lookup for actions the user must still be able to perform on a Cloudflare
 * account whose token renewal failed, such as disconnecting the degraded account.
 *
 * Removal must stay available for every grant the user can still see, so this
 * lookup intentionally accepts `degraded` grants and, unlike `getGrantById`, does
 * not apply `hasCurrentRequiredCloudflareScopes`. Scope and token checks gate
 * *using* a grant against Cloudflare; they must not strand a user with an
 * unusable connected account they cannot remove. Authority is unchanged: the
 * grant must still match the authenticated `userId` and the active
 * `organizationId`, and revoked grants stay rejected.
 */
async function getReauthorizableGrantByPublicIdForUser(
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

  const grant = await db.models.cloudflareOAuthGrant
    .findOne({
      _id: grantId,
      organizationId,
      userId,
      status: { $in: [...CLOUDFLARE_GRANT_REAUTHORIZABLE_STATUSES] }
    })
    .exec()

  if (!grant) {
    throw new CloudflareAccessError('Cloudflare OAuth grant is not active', 403)
  }

  return grant
}

/**
 * Reports an expired Cloudflare connected account as a reauthorization failure
 * instead of a missing connection, so the browser receives `401` with the
 * reconnect contract rather than an unexpected server error.
 */
async function throwWhenCloudflareGrantNeedsReauthorization(
  db: Database,
  filter: {
    _id?: CloudflareOAuthGrantId
    organizationId: OrganizationId
    userId: UserId
  }
): Promise<void> {
  const degradedGrant = await db.models.cloudflareOAuthGrant.findOne({ ...filter, status: 'degraded' }).exec()

  if (!degradedGrant) {
    return
  }

  tokenLog('cloudflare_grant_reauthorization_required %o', {
    grantPublicId: publicIdFromUUIDv7(degradedGrant._id),
    lastErrorCode: degradedGrant.lastErrorCode ?? null,
    organizationId: normalizeMongooseUUIDv7(filter.organizationId),
    status: degradedGrant.status,
    userId: normalizeMongooseUUIDv7(filter.userId)
  })

  throw new CloudflareReauthorizationRequiredError()
}

function hasCurrentRequiredCloudflareScopes(grant: CloudflareOAuthGrantDocument): boolean {
  const grantedScopes = new Set(grant.grantedScopes)
  return getCloudflareRequiredOAuthScopes().every((scope) => grantedScopes.has(scope))
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
