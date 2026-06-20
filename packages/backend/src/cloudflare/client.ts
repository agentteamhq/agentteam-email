import Cloudflare from 'cloudflare'
import { toFile } from 'cloudflare/uploads'
import { randomBytes } from 'node:crypto'

import { PUBLIC_VARS } from '../vars.public'

import { getCloudflareApiBaseUrl } from './config'

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
  workerScriptName: string
  hmacSecretReference: string
}

export interface CloudflareProvisioningInput {
  accessToken: string
  cloudflareAccountId: string
  cloudflareZoneId: string
  connectionPublicId: string
  domain: string
  organizationId: string | null
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
  cloudflareAccountId,
  cloudflareZoneId,
  connectionPublicId,
  domain,
  organizationId
}: CloudflareProvisioningInput): Promise<CloudflareProvisioningResult> {
  const client = createCloudflareClient(accessToken)
  const r2BucketName = createBucketName(domain, cloudflareZoneId)
  const workerScriptName = createWorkerScriptName(domain, cloudflareZoneId)
  const hmacSecret = randomBytes(32).toString('base64url')
  const hmacSecretReference = `cloudflare-worker:${workerScriptName}:AGENTTEAM_HMAC_SECRET`

  await ensureR2Bucket(client, cloudflareAccountId, r2BucketName)
  await upsertEmailWorker({
    client,
    cloudflareAccountId,
    connectionPublicId,
    domain,
    hmacSecret,
    organizationId,
    r2BucketName,
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
    hmacSecretReference,
    r2BucketName,
    workerScriptName
  }
}

export function sanitizeCloudflareError(error: unknown): { code: string; message: string } {
  const status = readErrorNumber(error, 'status')
  const code = status ? `CLOUDFLARE_${status}` : 'CLOUDFLARE_REQUEST_FAILED'
  const message = readErrorString(error, 'message') ?? 'Cloudflare request failed'

  return {
    code,
    message
  }
}

async function ensureR2Bucket(
  client: Cloudflare,
  cloudflareAccountId: string,
  r2BucketName: string
): Promise<void> {
  try {
    await client.r2.buckets.get(r2BucketName, { account_id: cloudflareAccountId })
    return
  } catch (error) {
    if (readErrorNumber(error, 'status') !== 404) {
      throw error
    }
  }

  await client.r2.buckets.create({
    account_id: cloudflareAccountId,
    name: r2BucketName,
    storageClass: 'Standard'
  })
}

async function upsertEmailWorker({
  client,
  cloudflareAccountId,
  connectionPublicId,
  domain,
  hmacSecret,
  organizationId,
  r2BucketName,
  workerScriptName
}: {
  client: Cloudflare
  cloudflareAccountId: string
  connectionPublicId: string
  domain: string
  hmacSecret: string
  organizationId: string | null
  r2BucketName: string
  workerScriptName: string
}): Promise<void> {
  const script = createEmailWorkerScript()
  const scriptFile = await toFile(new TextEncoder().encode(script), 'index.js', {
    type: 'application/javascript+module'
  })

  await client.workers.scripts.update(workerScriptName, {
    account_id: cloudflareAccountId,
    files: [scriptFile],
    metadata: {
      main_module: 'index.js',
      compatibility_date: '2026-06-19',
      bindings: [
        { bucket_name: r2BucketName, name: 'ARCHIVE_BUCKET', type: 'r2_bucket' },
        { name: 'AGENTTEAM_CONNECTION_ID', text: connectionPublicId, type: 'plain_text' },
        { name: 'AGENTTEAM_DOMAIN', text: domain, type: 'plain_text' },
        { name: 'AGENTTEAM_HMAC_SECRET', text: hmacSecret, type: 'secret_text' },
        {
          name: 'AGENTTEAM_INGEST_URL',
          text: `${PUBLIC_VARS.PUBLIC_HOSTNAME}/api/cloudflare/email-ingest`,
          type: 'plain_text'
        },
        { name: 'AGENTTEAM_TENANT_ID', text: organizationId ?? '', type: 'plain_text' }
      ],
      tags: ['agentteam-email']
    }
  })
}

function createBucketName(domain: string, cloudflareZoneId: string): string {
  return `agentteam-email-${normalizeResourceName(domain)}-${cloudflareZoneId.slice(0, 8).toLowerCase()}`
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

function createEmailWorkerScript(): string {
  return `
export default {
  async email(message, env) {
    const receivedAt = new Date().toISOString()
    const ingestId = crypto.randomUUID()
    const domain = env.AGENTTEAM_DOMAIN
    const prefix = \`mail/inbound/\${domain}/\${receivedAt.slice(0, 10).replaceAll('-', '/')}/\${ingestId}\`
    const raw = await new Response(message.raw).arrayBuffer()
    const edge = {
      from: message.from,
      to: message.to,
      headers: Object.fromEntries(message.headers),
      received_at: receivedAt
    }

    await env.ARCHIVE_BUCKET.put(\`\${prefix}/raw.eml\`, raw)
    await env.ARCHIVE_BUCKET.put(\`\${prefix}/edge.json\`, JSON.stringify(edge))
  }
}
`.trimStart()
}

function readErrorNumber(error: unknown, key: string): number | null {
  if (!error || typeof error !== 'object' || !(key in error)) {
    return null
  }

  const value = error[key as keyof typeof error]
  return typeof value === 'number' ? value : null
}

function readErrorString(error: unknown, key: string): string | null {
  if (!error || typeof error !== 'object' || !(key in error)) {
    return null
  }

  const value = error[key as keyof typeof error]
  return typeof value === 'string' ? value : null
}
