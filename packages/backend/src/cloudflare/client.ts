import { randomBytes } from 'node:crypto'
import Cloudflare from 'cloudflare'
import { toFile } from 'cloudflare/uploads'

import { PUBLIC_VARS } from '../vars.public'

import { getCloudflareApiBaseUrl } from './config'
import { AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT } from './email-worker.generated'

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
  hmacSecret: string
  r2Endpoint: string
  r2Region: string
  r2BucketName: string
  workerScriptName: string
  hmacSecretReference: string
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

export interface CloudflareProvisioningInput {
  accessToken: string
  archivePrefix: string
  cloudflareAccountId: string
  cloudflareZoneId: string
  connectionPublicId: string
  domainPublicId: string
  domain: string
  hmacSecret?: string
  organizationId: string
  organizationPublicId: string
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
  hmacSecret: existingHmacSecret,
  organizationId,
  organizationPublicId,
  workerCredentials
}: CloudflareProvisioningInput): Promise<CloudflareProvisioningResult> {
  const client = createCloudflareClient(accessToken)
  const workerScriptName = createWorkerScriptName(domain, cloudflareZoneId)
  const hmacSecret = existingHmacSecret ?? randomBytes(32).toString('base64url')
  const hmacSecretReference = `cloudflare-worker:${workerScriptName}:AGENTTEAM_WORKER_HMAC_SECRET`

  await upsertEmailWorker({
    archivePrefix,
    client,
    cloudflareAccountId,
    connectionPublicId,
    domainPublicId,
    domain,
    hmacSecret,
    organizationId,
    organizationPublicId,
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
    hmacSecret,
    r2BucketName: workerCredentials.bucket,
    r2Endpoint: workerCredentials.endpoint,
    r2Region: workerCredentials.region,
    hmacSecretReference,
    workerScriptName
  }
}

export function sanitizeCloudflareError(error: unknown): { code: string; message: string } {
  const status = readErrorNumber(error, 'status')
  const code = status ? `CLOUDFLARE_${status}` : 'CLOUDFLARE_REQUEST_FAILED'

  return {
    code,
    message: cloudflarePublicErrorMessage(status)
  }
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
  hmacSecret,
  organizationId,
  organizationPublicId,
  workerCredentials,
  workerScriptName
}: {
  archivePrefix: string
  client: Cloudflare
  cloudflareAccountId: string
  connectionPublicId: string
  domainPublicId: string
  domain: string
  hmacSecret: string
  organizationId: string
  organizationPublicId: string
  workerCredentials: CloudflareWorkerArchiveCredentials
  workerScriptName: string
}): Promise<void> {
  const scriptFile = await toFile(
    new TextEncoder().encode(AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT),
    'index.js',
    {
      type: 'application/javascript+module'
    }
  )

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
        { name: 'AGENTTEAM_WORKER_HMAC_SECRET', text: hmacSecret, type: 'secret_text' },
        {
          name: 'AGENTTEAM_INGEST_URL',
          text: new URL('/rpc/agent-mail/ingest/v1', PUBLIC_VARS.PUBLIC_HOSTNAME).toString(),
          type: 'plain_text'
        }
      ],
      tags: ['agentteam-email']
    }
  })
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
