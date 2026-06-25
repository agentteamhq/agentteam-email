import parseAddress from 'email-addresses'
import { format } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { AwsClient } from 'aws4fetch'
import { v7 as uuidv7 } from 'uuid'

export const WORKER_NAME = 'agent-mail-ingress'
export const INBOUND_EDGE_SCHEMA = 'agent-mail.inbound.edge.v1'
export const CLOUDFLARE_EDGE_EVIDENCE_SCHEMA = 'agent-mail.cloudflare-edge-evidence.v1'
export const INBOUND_INGEST_NOTIFICATION_SCHEMA = 'agent-mail.inbound.ingest.v1'
export const INBOUND_RPC_PATH = '/rpc/agent-mail/ingest/v1'

const OBSERVED_AUTH_PROVENANCE_HEADERS = new Set([
  'authentication-results',
  'arc-authentication-results',
  'received-spf',
  'dkim-signature',
  'arc-seal',
  'arc-message-signature',
  'return-path',
  'received'
])

export function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`missing ${label}`)
  }
  return value.trim()
}

export function requireFiniteNumber(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    throw new Error(`missing ${label}`)
  }
  return number
}

export function normalizeDomain(value) {
  return requireString(value, 'domain').toLowerCase()
}

export function normalizeAddress(value) {
  const parsed = parseSingleMailbox(value)
  return `${parsed.local.toLowerCase()}@${parsed.domain.toLowerCase()}`
}

export function canonicalDomainFromAddress(value) {
  return parseSingleMailbox(value).domain.toLowerCase()
}

function parseSingleMailbox(value) {
  const rawValue = requireString(value, 'email address')
  const parsed = parseAddress({ input: rawValue, rfc6532: true })
  if (!parsed || !Array.isArray(parsed.addresses) || parsed.addresses.length !== 1) {
    throw new Error(`invalid email address for ${value}`)
  }
  const mailbox = parsed.addresses[0]
  if (mailbox.type !== 'mailbox' || !mailbox.local || !mailbox.domain) {
    throw new Error(`invalid email address for ${value}`)
  }
  return mailbox
}

export function getHeader(headers, name) {
  const value = headers.get(name)
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

export async function readRawMessage(message) {
  const buffer = await new Response(message.raw).arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (bytes.byteLength === 0) {
    throw new Error('incoming email raw message is empty')
  }
  return bytes
}

export async function sha256Hex(value) {
  const buffer = value instanceof Uint8Array ? value : new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hmacSha256Hex(secret, value) {
  const encodedSecret = new TextEncoder().encode(requireString(secret, 'HMAC secret'))
  const key = await crypto.subtle.importKey(
    'raw',
    encodedSecret,
    {
      name: 'HMAC',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function generateUUIDv7(now = new Date()) {
  return uuidv7({ msecs: now.getTime() })
}

export function archiveDatePath(date) {
  return format(new TZDate(date, 'UTC'), 'yyyy/MM/dd')
}

export function normalizeArchivePrefix(value, { orgPublicId, domain } = {}) {
  const prefix = requireString(value, 'archive prefix').replace(/^\/+|\/+$/g, '')
  if (prefix === '') {
    throw new Error('missing archive prefix')
  }

  const segments = prefix.split('/')
  if (segments.some((segment) => segment === '')) {
    throw new Error('archive prefix must not contain empty path segments')
  }

  if (typeof orgPublicId === 'string' && orgPublicId.trim() !== '') {
    if (segments[0] !== 'orgs' || segments[1] !== orgPublicId.trim()) {
      const orgPrefix = `orgs/${orgPublicId.trim()}`
      throw new Error(`archive prefix must be under ${orgPrefix}`)
    }
  }

  if (typeof domain === 'string' && domain.trim() !== '') {
    const normalizedDomain = normalizeDomain(domain)
    if (segments[2] !== 'domains' || segments[3] !== normalizedDomain) {
      const expectedDomainPrefix = `domains/${normalizedDomain}`
      throw new Error(`archive prefix must include ${expectedDomainPrefix}`)
    }
  }

  if (segments[4] !== 'mail' || segments[5] !== 'inbound' || segments.length !== 6) {
    throw new Error('archive prefix must end with mail/inbound')
  }

  return prefix
}

export function inboundBundleKeys(archivePrefix, date, ingestId) {
  const prefix = normalizeArchivePrefix(archivePrefix)
  const bundlePrefix = `${prefix}/${archiveDatePath(date)}/${requireString(ingestId, 'ingest id')}`
  return {
    bundlePrefix,
    rawKey: `${bundlePrefix}/raw.eml`,
    edgeKey: `${bundlePrefix}/edge.json`,
    resultKey: `${bundlePrefix}/result.json`
  }
}

export function normalizeIngestURL(value) {
  const rawValue = requireString(value, 'ingest URL')
  let url
  try {
    url = new URL(rawValue)
  } catch {
    url = new URL(`https://${rawValue}`)
  }
  if (url.protocol !== 'https:') {
    throw new Error('ingest URL must use https')
  }
  if (url.pathname === '/') {
    url.pathname = INBOUND_RPC_PATH
  } else if (url.pathname !== INBOUND_RPC_PATH) {
    throw new Error(`ingest URL path must be ${INBOUND_RPC_PATH}`)
  }
  url.search = ''
  url.hash = ''
  return url
}

export function buildIngestNotification(archived) {
  const manifest = archived?.manifest
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('missing archived inbound manifest')
  }
  return {
    schema: INBOUND_INGEST_NOTIFICATION_SCHEMA,
    ingest_id: requireString(archived.ingestId, 'ingest id'),
    organization_id: requireString(manifest.organization_id, 'organization id'),
    organization_public_id: requireString(manifest.org_public_id, 'org public id'),
    archive_prefix: requireString(manifest.archive_prefix, 'archive prefix'),
    worker_connection_id: requireString(manifest.connection_id, 'connection id'),
    worker_domain_deployment_id: requireString(manifest.domain_id, 'domain id'),
    domain_id: requireString(manifest.domain_id, 'domain id'),
    domain: requireString(manifest.domain, 'domain'),
    recipient_domain: requireString(manifest.recipient_domain, 'recipient domain'),
    raw_key: requireString(archived.rawKey, 'raw key'),
    edge_key: requireString(archived.edgeKey, 'edge key'),
    result_key: requireString(archived.resultKey, 'result key'),
    received_at: requireString(manifest.received_at, 'received_at'),
    raw_sha256: requireString(manifest.raw_sha256, 'raw_sha256')
  }
}

export async function buildIngestRequest(archived, env, now = new Date()) {
  if (!env || typeof env !== 'object') {
    throw new Error('missing worker environment')
  }
  const url = normalizeIngestURL(env.AGENTTEAM_INGEST_URL)
  const timestamp = now.toISOString()
  const body = JSON.stringify(buildIngestNotification(archived))
  const connectionId = requireString(env.AGENTTEAM_CONNECTION_ID, 'connection id')
  const hmacSecret = requireString(env.AGENTTEAM_WORKER_HMAC_SECRET, 'Worker HMAC secret')
  const signature = await hmacSha256Hex(hmacSecret, `${timestamp}\n${connectionId}\n${body}`)
  return {
    url,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Agent-Mail-Connection-Id': connectionId,
        'X-Agent-Mail-Timestamp': timestamp,
        'X-Agent-Mail-Signature': signature
      },
      body
    }
  }
}

export async function sendIngestNotification(archived, env, fetchImpl = fetch) {
  const request = await buildIngestRequest(archived, env)
  const response = await fetchImpl(request.url, request.init)
  if (!response.ok) {
    throw new Error(`ingest notification failed with HTTP ${response.status}`)
  }
}

export function buildATMCFHeaders(message, receivedAt) {
  const envelopeFrom =
    typeof message.from === 'string' && message.from.trim() !== '' ? message.from.trim() : '<>'
  const headers = {
    'X-ATMCF-Edge-Action': 'worker',
    'X-ATMCF-Edge-Status': 'received',
    'X-ATMCF-Edge-Envelope-From': envelopeFrom,
    'X-ATMCF-Edge-Envelope-To': requireString(message.to ?? '', 'message.to'),
    'X-ATMCF-Edge-Raw-Size': String(requireFiniteNumber(message.rawSize, 'message.rawSize')),
    'X-ATMCF-Edge-Received-At': receivedAt.toISOString()
  }

  const messageId = getHeader(message.headers, 'message-id')
  if (messageId !== '') {
    headers['X-ATMCF-Edge-Message-ID'] = messageId
  }

  return headers
}

export function snapshotMessageHeaders(headers) {
  if (!headers || typeof headers.entries !== 'function') {
    throw new Error('missing message.headers')
  }

  const entries = []
  let index = 0
  for (const [name, value] of headers.entries()) {
    const headerName = requireString(name, 'header name')
    entries.push({
      index,
      name: headerName,
      name_lower: headerName.toLowerCase(),
      value: typeof value === 'string' ? value : String(value ?? '')
    })
    index += 1
  }
  return entries
}

function observedAuthProvenanceHeaders(headerEntries) {
  return headerEntries.filter(
    (entry) => OBSERVED_AUTH_PROVENANCE_HEADERS.has(entry.name_lower) || entry.name_lower.startsWith('x-cf-')
  )
}

export function buildCloudflareEdgeEvidence({
  message,
  receivedAt,
  cloudflareZoneName,
  headerEntries = snapshotMessageHeaders(message.headers)
}) {
  return {
    schema: CLOUDFLARE_EDGE_EVIDENCE_SCHEMA,
    source: 'cloudflare-worker-forwardable-email-message',
    captured_at: receivedAt.toISOString(),
    worker_message_fields: {
      envelope_from: typeof message.from === 'string' ? message.from.trim() : '',
      envelope_to: requireString(message.to ?? '', 'message.to'),
      raw_size: requireFiniteNumber(message.rawSize, 'message.rawSize'),
      received_at: receivedAt.toISOString(),
      worker_name: WORKER_NAME,
      cloudflare_zone_name: requireString(cloudflareZoneName, 'cloudflare zone name')
    },
    headers: {
      api: 'ForwardableEmailMessage.headers.entries',
      entries: headerEntries
    },
    observed_auth_provenance_headers: observedAuthProvenanceHeaders(headerEntries)
  }
}

export function buildManifest({
  ingestId,
  organizationId,
  orgPublicId,
  archivePrefix,
  connectionId,
  domainId,
  domain,
  rawKey,
  edgeKey,
  mailbox,
  envelopeFrom,
  envelopeTo,
  recipientDomain,
  cloudflareZoneName,
  receivedAt,
  rawSha256,
  messageId,
  atmcfHeaders,
  cloudflareEdgeEvidence
}) {
  const manifest = {
    schema: INBOUND_EDGE_SCHEMA,
    ingest_id: requireString(ingestId, 'ingest id'),
    organization_id: requireString(organizationId, 'organization id'),
    org_public_id: requireString(orgPublicId, 'org public id'),
    archive_prefix: requireString(archivePrefix, 'archive prefix'),
    connection_id: requireString(connectionId, 'connection id'),
    domain_id: requireString(domainId, 'domain id'),
    domain: normalizeDomain(domain),
    raw_key: requireString(rawKey, 'raw key'),
    edge_key: requireString(edgeKey, 'edge key'),
    mailbox: normalizeAddress(mailbox),
    envelope_from: typeof envelopeFrom === 'string' ? envelopeFrom.trim() : '',
    envelope_to: requireString(envelopeTo, 'envelope recipient'),
    recipient_domain: requireString(recipientDomain, 'recipient domain'),
    cloudflare_zone_name: requireString(cloudflareZoneName, 'cloudflare zone name'),
    worker_name: WORKER_NAME,
    received_at: receivedAt.toISOString(),
    raw_sha256: requireString(rawSha256, 'raw sha256'),
    atmcf_headers: atmcfHeaders,
    cloudflare_edge_evidence: cloudflareEdgeEvidence
  }

  if (typeof messageId === 'string' && messageId.trim() !== '') {
    manifest.message_id = messageId.trim()
  }

  return manifest
}

export function temporaryR2CredentialsFromEnv(env, now = new Date()) {
  if (!env || typeof env !== 'object') {
    throw new Error('missing worker environment')
  }

  const expiresAt = new Date(
    requireString(env.AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT, 'R2 credential expiration')
  )
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error('R2 credential expiration must be an ISO timestamp')
  }
  if (expiresAt.getTime() <= now.getTime()) {
    throw new Error('R2 temporary credentials are expired')
  }

  return {
    endpoint: requireString(env.AGENTTEAM_R2_ENDPOINT, 'R2 endpoint'),
    bucket: requireString(env.AGENTTEAM_R2_BUCKET, 'R2 bucket'),
    accessKeyId: requireString(env.AGENTTEAM_R2_ACCESS_KEY_ID, 'R2 access key id'),
    secretAccessKey: requireString(env.AGENTTEAM_R2_SECRET_ACCESS_KEY, 'R2 secret access key'),
    sessionToken: requireString(env.AGENTTEAM_R2_SESSION_TOKEN, 'R2 session token'),
    expiresAt
  }
}

export function buildR2ObjectURL(credentials, key) {
  const url = new URL(requireString(credentials.endpoint, 'R2 endpoint'))
  if (url.protocol !== 'https:') {
    throw new Error('R2 endpoint must use https')
  }
  const endpointPath = url.pathname.replace(/\/+$/g, '')
  const encodedBucket = encodeURIComponent(requireString(credentials.bucket, 'R2 bucket'))
  const encodedKey = requireString(key, 'R2 object key')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  url.pathname = `${endpointPath}/${encodedBucket}/${encodedKey}`
  url.search = ''
  url.hash = ''
  return url
}

export async function putR2Object(credentials, key, value, contentType, fetchImpl = fetch) {
  const aws = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    service: 's3',
    region: 'auto'
  })
  const signedRequest = await aws.sign(buildR2ObjectURL(credentials, key), {
    method: 'PUT',
    headers: {
      'content-type': requireString(contentType, 'content type')
    },
    body: value
  })
  const response = await fetchImpl(signedRequest)
  if (!response.ok) {
    throw new Error(`R2 archive write failed for ${key} with HTTP ${response.status}`)
  }
}

export async function archiveInboundMessage(message, env, now = new Date(), fetchImpl = fetch) {
  if (!env || typeof env !== 'object') {
    throw new Error('missing worker environment')
  }

  const orgPublicId = requireString(env.AGENTTEAM_ORG_PUBLIC_ID, 'org public id')
  const organizationId = requireString(env.AGENTTEAM_ORGANIZATION_ID, 'organization id')
  const connectionId = requireString(env.AGENTTEAM_CONNECTION_ID, 'connection id')
  const domainId = requireString(env.AGENTTEAM_DOMAIN_ID, 'domain id')
  const domain = normalizeDomain(env.AGENTTEAM_DOMAIN)
  const archivePrefix = normalizeArchivePrefix(env.AGENTTEAM_ARCHIVE_PREFIX, {
    orgPublicId,
    domain
  })
  const r2Credentials = temporaryR2CredentialsFromEnv(env, now)
  const mailbox = normalizeAddress(message.to)
  const receivedAt = new Date(now.toISOString())
  const rawBytes = await readRawMessage(message)
  const rawSha256 = await sha256Hex(rawBytes)
  const envelopeRecipientDomain = canonicalDomainFromAddress(mailbox)
  if (envelopeRecipientDomain !== domain) {
    throw new Error(
      `message recipient domain ${envelopeRecipientDomain} does not match configured domain ${domain}`
    )
  }
  const recipientDomain = domain
  const cloudflareZoneName = recipientDomain
  const ingestId = generateUUIDv7(receivedAt)
  const { rawKey, edgeKey, resultKey } = inboundBundleKeys(archivePrefix, receivedAt, ingestId)
  const messageId = getHeader(message.headers, 'message-id')
  const atmcfHeaders = buildATMCFHeaders(message, receivedAt)
  const cloudflareEdgeEvidence = buildCloudflareEdgeEvidence({
    message,
    receivedAt,
    cloudflareZoneName
  })

  await putR2Object(r2Credentials, rawKey, rawBytes, 'message/rfc822', fetchImpl)

  const manifest = buildManifest({
    ingestId,
    organizationId,
    orgPublicId,
    archivePrefix,
    connectionId,
    domainId,
    domain,
    rawKey,
    edgeKey,
    mailbox,
    envelopeFrom: message.from,
    envelopeTo: message.to,
    recipientDomain,
    cloudflareZoneName,
    receivedAt,
    rawSha256,
    messageId,
    atmcfHeaders,
    cloudflareEdgeEvidence
  })

  await putR2Object(
    r2Credentials,
    edgeKey,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'application/json',
    fetchImpl
  )

  return {
    ingestId,
    rawKey,
    edgeKey,
    resultKey,
    manifest
  }
}
