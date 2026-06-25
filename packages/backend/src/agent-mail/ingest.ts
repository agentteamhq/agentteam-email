import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

import {
  base62UUIDv7ToUUIDv7,
  normalizeMongooseUUIDv7,
  parseBase62UUIDv7,
  publicIdFromUUIDv7
} from '@main/db'

import { globals } from '../globals'
import { decryptSecretValue } from '../lib/secret-box'

import { enqueueAgentMailIngest } from './control-client'
import type { AgentMailIngestNotification } from './control-client'
import type { CloudflareConnectionId } from '@main/db'

const HEADER_CONNECTION_ID = 'x-agent-mail-connection-id'
const HEADER_TIMESTAMP = 'x-agent-mail-timestamp'
const HEADER_SIGNATURE = 'x-agent-mail-signature'
const INGEST_NOTIFICATION_SCHEMA = 'agent-mail.inbound.ingest.v1'
const MAX_BODY_BYTES = 32 * 1024
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

export function isAgentMailIngestRequestPath(pathname: string): boolean {
  return pathname === '/rpc/agent-mail/ingest/v1' || pathname === '/rpc/agent-mail/ingest/v1/'
}

export async function handleAgentMailIngestRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.toLowerCase().split(';', 1)[0]?.trim() !== 'application/json') {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 415)
  }

  const connectionPublicId = request.headers.get(HEADER_CONNECTION_ID)?.trim() ?? ''
  const timestamp = request.headers.get(HEADER_TIMESTAMP)?.trim() ?? ''
  const signature = request.headers.get(HEADER_SIGNATURE)?.trim() ?? ''
  if (!connectionPublicId || !timestamp || !signature) {
    return unauthorized()
  }

  const bodyBytes = new Uint8Array(await request.arrayBuffer())
  if (bodyBytes.byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Request body too large' }, 413)
  }

  const timestampDate = new Date(timestamp)
  if (!Number.isFinite(timestampDate.getTime())) {
    return unauthorized()
  }
  if (Math.abs(Date.now() - timestampDate.getTime()) > MAX_CLOCK_SKEW_MS) {
    return unauthorized()
  }

  let connectionId: CloudflareConnectionId
  try {
    connectionId = base62UUIDv7ToUUIDv7(parseBase62UUIDv7(connectionPublicId)) as CloudflareConnectionId
  } catch {
    return unauthorized()
  }

  const { db } = await globals()
  const connection = await db.models.cloudflareConnection
    .findOne({
      _id: connectionId,
      status: 'active'
    })
    .exec()

  const deployment = connection
    ? await db.models.agentMailWorkerDeployment
        .findOne({
          cloudflareConnectionId: connectionId,
          workerConnectionId: connectionPublicId,
          status: { $in: ['active', 'degraded'] }
        })
        .exec()
    : null
  if (!connection || !deployment?.encryptedWorkerHmacSecret) {
    return unauthorized()
  }

  const secret = decryptSecretValue(deployment.encryptedWorkerHmacSecret)
  if (!verifySignature({ bodyBytes, connectionPublicId, secret, signature, timestamp })) {
    return unauthorized()
  }

  const body = new TextDecoder().decode(bodyBytes)
  const notification = parseNotification(body)
  if (!notification) {
    return jsonResponse({ error: 'Invalid notification' }, 400)
  }

  if (normalizeDomain(notification.recipient_domain) !== normalizeDomain(connection.domain)) {
    return jsonResponse({ error: 'Notification domain does not match connection' }, 400)
  }

  const validatedNotification = validateNotificationAuthority({
    connectionPublicId,
    deployment,
    notification
  })
  if (!validatedNotification) {
    return jsonResponse({ error: 'Notification archive scope does not match connection' }, 400)
  }

  try {
    const result = await enqueueAgentMailIngest(validatedNotification)
    return jsonResponse(result, 202)
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'agent_mail_ingest_control_enqueue_failed',
        ingest_id: validatedNotification.ingest_id,
        recipient_domain: validatedNotification.recipient_domain,
        worker_connection_id: connectionPublicId,
        error: sanitizeLogMessage(error)
      })
    )
    return jsonResponse({ error: 'Agent Mail control API unavailable' }, 503)
  }
}

function parseNotification(body: string): AgentMailIngestNotification | null {
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return null
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const notification = value as Record<string, unknown>
  const rawSha256 = readOptionalString(notification.raw_sha256)
  if (
    notification.schema !== INGEST_NOTIFICATION_SCHEMA ||
    !isNonEmptyString(notification.ingest_id) ||
    !isNonEmptyString(notification.recipient_domain) ||
    !isNonEmptyString(notification.raw_key) ||
    !isNonEmptyString(notification.edge_key) ||
    !isNonEmptyString(notification.result_key) ||
    !isNonEmptyString(notification.received_at) ||
    !rawSha256 ||
    !/^[0-9a-f]{64}$/u.test(rawSha256)
  ) {
    return null
  }

  return {
    schema: INGEST_NOTIFICATION_SCHEMA,
    ingest_id: notification.ingest_id,
    organization_id: readOptionalString(notification.organization_id),
    organization_public_id: readOptionalString(notification.organization_public_id),
    archive_prefix: readOptionalString(notification.archive_prefix),
    worker_connection_id: readOptionalString(notification.worker_connection_id),
    worker_domain_deployment_id: readOptionalString(notification.worker_domain_deployment_id),
    recipient_domain: notification.recipient_domain,
    raw_key: notification.raw_key,
    edge_key: notification.edge_key,
    result_key: notification.result_key,
    received_at: notification.received_at,
    raw_sha256: rawSha256
  }
}

function validateNotificationAuthority({
  connectionPublicId,
  deployment,
  notification
}: {
  connectionPublicId: string
  deployment: {
    archivePrefix: string
    domain: string
    organizationId: string | { toString: () => string }
    organizationPublicId: string
    agentMailDomainId: string | { toString: () => string }
    workerConnectionId: string
  }
  notification: AgentMailIngestNotification
}): AgentMailIngestNotification | null {
  if (
    notification.worker_connection_id !== connectionPublicId ||
    notification.organization_public_id !== deployment.organizationPublicId ||
    notification.archive_prefix !== deployment.archivePrefix ||
    notification.worker_domain_deployment_id !== publicIdFromUUIDv7(deployment.agentMailDomainId) ||
    normalizeDomain(notification.recipient_domain) !== normalizeDomain(deployment.domain) ||
    !archiveKeysMatch(notification, deployment.archivePrefix)
  ) {
    return null
  }

  return {
    ...notification,
    organization_id: normalizeMongooseUUIDv7(deployment.organizationId),
    organization_public_id: deployment.organizationPublicId,
    archive_prefix: deployment.archivePrefix,
    worker_connection_id: deployment.workerConnectionId,
    worker_domain_deployment_id: publicIdFromUUIDv7(deployment.agentMailDomainId)
  }
}

function archiveKeysMatch(notification: AgentMailIngestNotification, archivePrefix: string): boolean {
  const prefix = `${archivePrefix.replace(/\/+$/u, '')}/`
  const ingestId = escapeRegExp(notification.ingest_id)
  const bundlePattern = new RegExp(`^${escapeRegExp(prefix)}\\d{4}/\\d{2}/\\d{2}/${ingestId}/`, 'u')

  return (
    bundlePattern.test(notification.raw_key) &&
    bundlePattern.test(notification.edge_key) &&
    bundlePattern.test(notification.result_key) &&
    notification.raw_key.endsWith('/raw.eml') &&
    notification.edge_key.endsWith('/edge.json') &&
    notification.result_key.endsWith('/result.json')
  )
}

function verifySignature({
  bodyBytes,
  connectionPublicId,
  secret,
  signature,
  timestamp
}: {
  bodyBytes: Uint8Array
  connectionPublicId: string
  secret: string
  signature: string
  timestamp: string
}): boolean {
  if (!/^[0-9a-f]{64}$/.test(signature)) {
    return false
  }

  const expected = createHmac('sha256', secret)
    .update(timestamp)
    .update('\n')
    .update(connectionPublicId)
    .update('\n')
    .update(bodyBytes)
    .digest()
  const actual = Buffer.from(signature, 'hex')

  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function sanitizeLogMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/gu, ' ').trim().slice(0, 240)
}

function unauthorized(): Response {
  return jsonResponse({ error: 'Unauthorized' }, 401)
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    status
  })
}
