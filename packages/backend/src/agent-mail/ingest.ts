import { Buffer } from 'node:buffer'

import { parse as parseContentType } from 'content-type'
import {
  base62UUIDv7ToUUIDv7,
  normalizeMongooseUUIDv7,
  parseBase62UUIDv7,
  publicIdFromUUIDv7
} from '@main/db'
import { Webhook } from 'standardwebhooks'
import { z } from 'zod'

import { globals } from '../globals'
import { decryptSecretValue } from '../lib/secret-box'

import { enqueueAgentMailIngest } from './control-client'
import type { AgentMailIngestNotification } from './control-client'
import type { CloudflareConnectionId } from '@main/db'

const INGEST_NOTIFICATION_SCHEMA = 'agent-mail.inbound.ingest.v1'
const MAX_BODY_BYTES = 32 * 1024
const INGEST_PATH_PREFIX = '/rpc/agent-mail/ingest/v1/'

const nonEmptyStringSchema = z.string().trim().min(1)
const ingestNotificationSchema = z.object({
  schema: z.literal(INGEST_NOTIFICATION_SCHEMA),
  ingest_id: nonEmptyStringSchema,
  organization_id: nonEmptyStringSchema.optional(),
  organization_public_id: nonEmptyStringSchema.optional(),
  archive_prefix: nonEmptyStringSchema.optional(),
  worker_connection_id: nonEmptyStringSchema.optional(),
  worker_domain_deployment_id: nonEmptyStringSchema.optional(),
  recipient_domain: nonEmptyStringSchema,
  raw_key: nonEmptyStringSchema,
  edge_key: nonEmptyStringSchema,
  result_key: nonEmptyStringSchema,
  received_at: nonEmptyStringSchema,
  raw_sha256: z.hash('sha256')
}) satisfies z.ZodType<AgentMailIngestNotification>

type WebhookVerificationResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: 'invalid-payload' | 'invalid-signature' }

export function isAgentMailIngestRequestPath(pathname: string): boolean {
  const suffix = pathname.startsWith(INGEST_PATH_PREFIX) ? pathname.slice(INGEST_PATH_PREFIX.length) : ''
  return suffix !== '' && !suffix.includes('/')
}

export async function handleAgentMailIngestRequest(
  request: Request,
  connectionPublicId: string
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!isJsonContentType(request.headers)) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 415)
  }

  const normalizedConnectionPublicId = connectionPublicId.trim()
  if (!normalizedConnectionPublicId) {
    return unauthorized()
  }

  const bodyBytes = new Uint8Array(await request.arrayBuffer())
  if (bodyBytes.byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Request body too large' }, 413)
  }

  let connectionId: CloudflareConnectionId
  try {
    connectionId = base62UUIDv7ToUUIDv7(
      parseBase62UUIDv7(normalizedConnectionPublicId)
    ) as CloudflareConnectionId
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
          workerConnectionId: normalizedConnectionPublicId,
          status: { $in: ['active', 'degraded'] }
        })
        .exec()
    : null
  if (!connection || !deployment?.encryptedWorkerHmacSecret) {
    return unauthorized()
  }

  let secret: string
  try {
    secret = await decryptSecretValue(deployment.encryptedWorkerHmacSecret)
  } catch {
    return unauthorized()
  }

  const verifiedPayload = verifyWebhook({ bodyBytes, headers: request.headers, secret })
  if (!verifiedPayload.ok) {
    if (verifiedPayload.reason === 'invalid-payload') {
      return jsonResponse({ error: 'Invalid notification' }, 400)
    }
    return unauthorized()
  }

  const notification = parseNotification(verifiedPayload.payload)
  if (!notification) {
    return jsonResponse({ error: 'Invalid notification' }, 400)
  }

  if (notification.ingest_id !== request.headers.get('webhook-id')?.trim()) {
    return jsonResponse({ error: 'Notification webhook id does not match payload' }, 400)
  }

  if (normalizeDomain(notification.recipient_domain) !== normalizeDomain(connection.domain)) {
    return jsonResponse({ error: 'Notification domain does not match connection' }, 400)
  }

  const validatedNotification = validateNotificationAuthority({
    connectionPublicId: normalizedConnectionPublicId,
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
        worker_connection_id: normalizedConnectionPublicId,
        error: sanitizeLogMessage(error)
      })
    )
    return jsonResponse({ error: 'Agent Mail control API unavailable' }, 503)
  }
}

function parseNotification(value: unknown): AgentMailIngestNotification | null {
  const parsed = ingestNotificationSchema.safeParse(value)
  return parsed.success ? parsed.data : null
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

function verifyWebhook({
  bodyBytes,
  headers,
  secret
}: {
  bodyBytes: Uint8Array
  headers: Headers
  secret: string
}): WebhookVerificationResult {
  try {
    return {
      ok: true,
      payload: new Webhook(secret).verify(Buffer.from(bodyBytes), Object.fromEntries(headers.entries()))
    }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof SyntaxError ? 'invalid-payload' : 'invalid-signature'
    }
  }
}

function isJsonContentType(headers: Headers): boolean {
  const header = headers.get('content-type')
  if (!header) {
    return false
  }
  try {
    return parseContentType(header).type === 'application/json'
  } catch {
    return false
  }
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
