import { randomBytes } from 'node:crypto'
import Cloudflare from 'cloudflare'
import { toFile } from 'cloudflare/uploads'
import { Webhook } from 'standardwebhooks'

import { PUBLIC_VARS } from '../vars.public'

import { getCloudflareApiBaseUrl } from './config'

const WORKER_WEBHOOK_SECRET_PREFIX = 'whsec_'

export interface CloudflareAccountSummary {
  id: string
  name: string
  type: 'standard' | 'enterprise'
}

export interface CloudflareZoneSummary {
  accountId: string
  accountName: string | null
  id: string
  name: string
  status: 'initializing' | 'pending' | 'active' | 'moved' | null
}

export interface CloudflareProvisioningResult {
  r2BucketName: string
  r2Endpoint: string
  r2Region: string
  webhookSigningSecret: string
  webhookSigningSecretReference: string
  workerScriptName: string
}

export interface CloudflareWorkerArchiveCredentials {
  accessKeyId: string
  archivePrefix: string
  bucket: string
  endpoint: string
  expiresAt: Date
  region: string
  secretAccessKey: string
  sessionToken: string
}

export interface CloudflareRawEmailInput {
  accessToken: string
  cloudflareAccountId: string
  from: string
  mimeMessage: string
  recipients: string[]
}

export interface CloudflareEmailSendResult {
  delivered: string[]
  permanentBounces: string[]
  queued: string[]
}

export interface CloudflareProvisioningInput {
  accessToken: string
  archivePrefix: string
  cloudflareAccountId: string
  cloudflareZoneId: string
  connectionPublicId: string
  domainPublicId: string
  domain: string
  organizationId: string
  organizationPublicId: string
  webhookSigningSecret?: string
  workerCredentials: CloudflareWorkerArchiveCredentials
}

export function createCloudflareClient(accessToken: string): Cloudflare {
  return new Cloudflare({
    apiToken: accessToken,
    baseURL: getCloudflareApiBaseUrl(),
    maxRetries: 1
  })
}

export async function listCloudflareAccounts(accessToken: string): Promise<CloudflareAccountSummary[]> {
  const client = createCloudflareClient(accessToken)
  const accounts: CloudflareAccountSummary[] = []

  for await (const account of client.accounts.list()) {
    accounts.push({
      id: account.id,
      name: account.name,
      type: account.type
    })
  }

  return accounts
}

export async function listCloudflareZones({
  accessToken,
  cloudflareAccountId
}: {
  accessToken: string
  cloudflareAccountId?: string
}): Promise<CloudflareZoneSummary[]> {
  const client = createCloudflareClient(accessToken)
  const zones: CloudflareZoneSummary[] = []
  const query = cloudflareAccountId ? { account: { id: cloudflareAccountId } } : undefined

  for await (const zone of client.zones.list(query)) {
    if (!zone.account.id) {
      continue
    }

    zones.push({
      accountId: zone.account.id,
      accountName: zone.account.name ?? null,
      id: zone.id,
      name: zone.name,
      status: zone.status ?? null
    })
  }

  return zones
}

export async function applyCloudflareProvisioning({
  accessToken,
  archivePrefix,
  cloudflareAccountId,
  cloudflareZoneId,
  connectionPublicId,
  domainPublicId,
  domain,
  organizationId,
  organizationPublicId,
  webhookSigningSecret: existingWebhookSigningSecret,
  workerCredentials
}: CloudflareProvisioningInput): Promise<CloudflareProvisioningResult> {
  const client = createCloudflareClient(accessToken)
  const workerScriptName = createWorkerScriptName(domain, cloudflareZoneId)
  const webhookSigningSecret = existingWebhookSigningSecret
    ? requireStandardWebhookSecret(existingWebhookSigningSecret)
    : createStandardWebhookSecret()
  const webhookSigningSecretReference = `cloudflare-worker:${workerScriptName}:AGENTTEAM_WORKER_HMAC_SECRET`

  await upsertEmailWorker({
    archivePrefix,
    client,
    cloudflareAccountId,
    connectionPublicId,
    domainPublicId,
    domain,
    organizationId,
    organizationPublicId,
    webhookSigningSecret,
    workerCredentials,
    workerScriptName
  })
  await client.emailRouting.dns.create({ zone_id: cloudflareZoneId })
  await client.emailRouting.rules.catchAlls.update({
    zone_id: cloudflareZoneId,
    actions: [{ type: 'worker', value: [workerScriptName] }],
    enabled: true,
    matchers: [{ type: 'all' }],
    name: 'AgentTeam Email catch-all'
  })

  return {
    r2Endpoint: workerCredentials.endpoint,
    r2BucketName: workerCredentials.bucket,
    r2Region: workerCredentials.region,
    webhookSigningSecret,
    webhookSigningSecretReference,
    workerScriptName
  }
}

export async function sendCloudflareRawEmail({
  accessToken,
  cloudflareAccountId,
  from,
  mimeMessage,
  recipients
}: CloudflareRawEmailInput): Promise<CloudflareEmailSendResult> {
  const body = JSON.stringify({
    from,
    mime_message: mimeMessage,
    recipients
  })
  const sendURL = new URL(getCloudflareApiBaseUrl())
  sendURL.pathname = joinURLPath(
    sendURL.pathname,
    'accounts',
    cloudflareAccountId,
    'email',
    'sending',
    'send_raw'
  )
  sendURL.search = ''
  sendURL.hash = ''

  const response = await fetch(sendURL, {
    body,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    method: 'POST'
  })
  const payload = (await response.json().catch(() => null)) as unknown
  const parsed = parseCloudflareEmailSendEnvelope(payload)

  if (!response.ok || !parsed.success) {
    const error = new Error('Cloudflare raw email send failed') as Error & { status?: number }
    error.status = response.status
    throw error
  }

  return parsed.result
}

export function sanitizeCloudflareError(error: unknown): { code: string; message: string } {
  const status = readErrorNumber(error, 'status')
  const code = status ? `CLOUDFLARE_${status}` : 'CLOUDFLARE_REQUEST_FAILED'

  return {
    code,
    message: cloudflarePublicErrorMessage(status)
  }
}

function parseCloudflareEmailSendEnvelope(payload: unknown): {
  success: boolean
  result: CloudflareEmailSendResult
} {
  if (!payload || typeof payload !== 'object') {
    return {
      success: false,
      result: { delivered: [], permanentBounces: [], queued: [] }
    }
  }
  const record = payload as Record<string, unknown>
  const result =
    record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>) : {}
  return {
    success: record.success === true,
    result: {
      delivered: stringArray(result.delivered),
      permanentBounces: stringArray(result.permanent_bounces),
      queued: stringArray(result.queued)
    }
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function joinURLPath(basePath: string, ...segments: string[]): string {
  const base = basePath.replace(/\/+$/u, '')
  const suffix = segments.map((segment) => encodeURIComponent(segment)).join('/')
  return `${base}/${suffix}`.replace(/^\/?/u, '/')
}

function cloudflarePublicErrorMessage(status: number | null): string {
  if (status === 401 || status === 403) {
    return 'Cloudflare authorization failed. Reconnect Cloudflare and try again.'
  }
  if (status === 429) {
    return 'Cloudflare is rate limiting requests. Try again shortly.'
  }
  if (status && status >= 500) {
    return 'Cloudflare is temporarily unavailable. Try again shortly.'
  }

  return 'Cloudflare request failed. Check the selected account, zone, and permissions.'
}

async function upsertEmailWorker({
  archivePrefix,
  client,
  cloudflareAccountId,
  connectionPublicId,
  domainPublicId,
  domain,
  organizationId,
  organizationPublicId,
  webhookSigningSecret,
  workerCredentials,
  workerScriptName
}: {
  archivePrefix: string
  client: Cloudflare
  cloudflareAccountId: string
  connectionPublicId: string
  domainPublicId: string
  domain: string
  organizationId: string
  organizationPublicId: string
  webhookSigningSecret: string
  workerCredentials: CloudflareWorkerArchiveCredentials
  workerScriptName: string
}): Promise<void> {
  const emailWorkerScript = await loadEmailWorkerScript()
  const scriptFile = await toFile(new TextEncoder().encode(emailWorkerScript), 'index.js', {
    type: 'application/javascript+module'
  })

  await client.workers.scripts.update(workerScriptName, {
    account_id: cloudflareAccountId,
    files: [scriptFile],
    metadata: {
      main_module: 'index.js',
      compatibility_date: '2026-06-19',
      bindings: [
        { name: 'AGENTTEAM_ORGANIZATION_ID', text: organizationId, type: 'plain_text' },
        { name: 'AGENTTEAM_ORG_PUBLIC_ID', text: organizationPublicId, type: 'plain_text' },
        { name: 'AGENTTEAM_CONNECTION_ID', text: connectionPublicId, type: 'plain_text' },
        { name: 'AGENTTEAM_DOMAIN_ID', text: domainPublicId, type: 'plain_text' },
        { name: 'AGENTTEAM_DOMAIN', text: domain, type: 'plain_text' },
        { name: 'AGENTTEAM_ARCHIVE_PREFIX', text: archivePrefix, type: 'plain_text' },
        { name: 'AGENTTEAM_R2_ENDPOINT', text: workerCredentials.endpoint, type: 'plain_text' },
        { name: 'AGENTTEAM_R2_BUCKET', text: workerCredentials.bucket, type: 'plain_text' },
        { name: 'AGENTTEAM_R2_REGION', text: workerCredentials.region, type: 'plain_text' },
        {
          name: 'AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT',
          text: workerCredentials.expiresAt.toISOString(),
          type: 'plain_text'
        },
        { name: 'AGENTTEAM_R2_ACCESS_KEY_ID', text: workerCredentials.accessKeyId, type: 'secret_text' },
        {
          name: 'AGENTTEAM_R2_SECRET_ACCESS_KEY',
          text: workerCredentials.secretAccessKey,
          type: 'secret_text'
        },
        { name: 'AGENTTEAM_R2_SESSION_TOKEN', text: workerCredentials.sessionToken, type: 'secret_text' },
        { name: 'AGENTTEAM_WORKER_HMAC_SECRET', text: webhookSigningSecret, type: 'secret_text' },
        {
          name: 'AGENTTEAM_INGEST_URL',
          text: publicURL('rpc', 'agent-mail', 'ingest', 'v1', connectionPublicId).toString(),
          type: 'plain_text'
        }
      ],
      tags: ['agentteam-email']
    }
  })
}

async function loadEmailWorkerScript(): Promise<string> {
  // eslint-disable-next-line no-restricted-syntax -- Approved exception: Vite raw import loads the generated Worker build asset.
  const module = await import('@main/cloudflare-email-worker/worker.mjs?raw')
  return module.default
}

function publicURL(...pathSegments: string[]) {
  const url = new URL(PUBLIC_VARS.PUBLIC_HOSTNAME)
  url.pathname = pathSegments.map((segment) => encodeURIComponent(segment)).join('/')
  url.search = ''
  url.hash = ''
  return url
}

function createStandardWebhookSecret(): string {
  return `${WORKER_WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64')}`
}

function requireStandardWebhookSecret(value: string): string {
  if (!value.startsWith(WORKER_WEBHOOK_SECRET_PREFIX)) {
    throw new Error('Worker webhook signing secret must use Standard Webhooks format')
  }
  new Webhook(value)
  return value
}

function createWorkerScriptName(domain: string, cloudflareZoneId: string): string {
  return `agentteam-email-${normalizeResourceName(domain)}-${cloudflareZoneId.slice(0, 8).toLowerCase()}`
}

function normalizeResourceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function readErrorNumber(error: unknown, key: string): number | null {
  if (!error || typeof error !== 'object' || !(key in error)) {
    return null
  }

  const value = error[key as keyof typeof error]
  return typeof value === 'number' ? value : null
}
