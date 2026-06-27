import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'

import { Webhook } from 'standardwebhooks'
import {
  archiveDatePath,
  archiveInboundMessage,
  buildR2ObjectURL,
  buildCloudflareEdgeEvidence,
  buildIngestRequest,
  generateUUIDv7,
  inboundBundleKeys,
  normalizeAddress,
  normalizeArchivePrefix,
  normalizeIngestURL,
  sha256Hex
} from '../src/lib.ts'
import worker from '../src/index.ts'

const TEST_WORKER_WEBHOOK_SECRET = standardWebhookSecret('test-worker-webhook-secret')

class MockR2Fetch {
  constructor() {
    this.requests = []
  }

  fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input)
    this.requests.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      bytes: Buffer.from(await request.arrayBuffer())
    })
    return new Response('', { status: 200 })
  }

  byKey(key) {
    return this.requests.find((request) => request.url.endsWith(`/${key}`))
  }
}

function fixturePath(name) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  return path.join(currentDir, 'fixtures', name)
}

async function fixtureBytes(name) {
  return new Uint8Array(await fs.readFile(fixturePath(name)))
}

async function rootFixtureJSON(name) {
  return JSON.parse(await fs.readFile(fixturePath(name), 'utf8'))
}

async function buildMessage(rawBytes) {
  return {
    from: 'sender@example.net',
    to: 'Agent@Example.com',
    rawSize: rawBytes.byteLength,
    headers: new Headers({
      'Authentication-Results': 'mx.cloudflare.test; spf=pass smtp.mailfrom=example.net',
      'ARC-Authentication-Results': 'i=1; mx.google.com; arc=none',
      'DKIM-Signature': 'v=1; d=example.net; s=test; b=abc',
      'Message-ID': '<fixture-message-id@example.net>',
      'Received-SPF': 'pass client-ip=203.0.113.7',
      'X-CF-Spamh-Score': '2',
      Subject: 'Worker Fixture'
    }),
    raw: new Response(rawBytes).body
  }
}

function workerEnv(overrides = {}) {
  return {
    AGENTTEAM_ORGANIZATION_ID: '01960000-0000-7000-8000-000000000001',
    AGENTTEAM_ORG_PUBLIC_ID: 'org_public_test',
    AGENTTEAM_CONNECTION_ID: 'conn-public-id',
    AGENTTEAM_DOMAIN_ID: 'domain-public-id',
    AGENTTEAM_DOMAIN: 'example.com',
    AGENTTEAM_ARCHIVE_PREFIX: 'orgs/org_public_test/domains/example.com/mail/inbound',
    AGENTTEAM_R2_ENDPOINT: 'https://r2.example.test',
    AGENTTEAM_R2_BUCKET: 'agent-mail-archive',
    AGENTTEAM_R2_ACCESS_KEY_ID: 'test-access-key',
    AGENTTEAM_R2_SECRET_ACCESS_KEY: 'test-secret-key',
    AGENTTEAM_R2_SESSION_TOKEN: 'test-session-token',
    AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT: '2030-04-25T12:34:56.000Z',
    ...overrides
  }
}

function installFetch(fetchImpl) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  return () => {
    globalThis.fetch = originalFetch
  }
}

function captureConsole() {
  const originalLog = console.log
  const originalError = console.error
  const entries = []

  console.log = (...args) => {
    entries.push({ level: 'log', text: args.map(String).join(' ') })
  }
  console.error = (...args) => {
    entries.push({ level: 'error', text: args.map(String).join(' ') })
  }

  return {
    entries,
    restore() {
      console.log = originalLog
      console.error = originalError
    }
  }
}

function standardWebhookSecret(value) {
  return `whsec_${Buffer.from(value, 'utf8').toString('base64')}`
}

test('normalizeAddress lowercases and trims addresses', () => {
  assert.equal(normalizeAddress('  Agent@Example.com '), 'agent@example.com')
})

test('generateUUIDv7 returns canonical UUIDv7 values', () => {
  const ingestID = generateUUIDv7(new Date('2026-04-18T12:34:56.000Z'))
  assert.match(ingestID, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('inboundBundleKeys matches the shared R2 layout fixture', async () => {
  const fixture = await rootFixtureJSON('r2-key-layout.json')
  const inbound = fixture.inbound
  const timestamp = new Date(inbound.timestamp)

  assert.equal(archiveDatePath(timestamp), '2026/04/18')
  assert.equal(
    normalizeArchivePrefix(inbound.archive_prefix, {
      orgPublicId: inbound.org_public_id,
      domain: inbound.recipient_domain
    }),
    'orgs/org_public_test/domains/example.com/mail/inbound'
  )
  assert.deepEqual(inboundBundleKeys(inbound.archive_prefix, timestamp, inbound.ingest_id), {
    bundlePrefix: inbound.bundle_prefix,
    rawKey: inbound.raw_key,
    edgeKey: inbound.edge_key,
    resultKey: inbound.result_key
  })
})

test('archiveInboundMessage writes raw archive and edge metadata with temporary R2 credentials', async () => {
  const rawBytes = await fixtureBytes('inbound.eml')
  const r2 = new MockR2Fetch()
  const now = new Date('2026-04-18T12:34:56.000Z')
  const env = workerEnv()

  const result = await archiveInboundMessage(await buildMessage(rawBytes), env, now, r2.fetch)

  assert.match(result.ingestId, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const keys = inboundBundleKeys(
    'orgs/org_public_test/domains/example.com/mail/inbound',
    now,
    result.ingestId
  )
  assert.equal(result.rawKey, keys.rawKey)
  assert.equal(result.edgeKey, keys.edgeKey)
  assert.equal(result.resultKey, keys.resultKey)

  const rawObject = r2.byKey(result.rawKey)
  assert.ok(rawObject, 'raw archive request missing')
  assert.equal(rawObject.method, 'PUT')
  assert.equal(rawObject.url, `https://r2.example.test/agent-mail-archive/${result.rawKey}`)
  assert.equal(rawObject.headers['content-type'], 'message/rfc822')
  assert.equal(rawObject.headers['x-amz-security-token'], 'test-session-token')
  assert.match(rawObject.headers.authorization, /^AWS4-HMAC-SHA256 /)
  assert.deepEqual(new Uint8Array(rawObject.bytes), rawBytes)

  const manifestObject = r2.byKey(result.edgeKey)
  assert.ok(manifestObject, 'edge metadata request missing')
  assert.equal(manifestObject.method, 'PUT')
  assert.equal(manifestObject.headers['content-type'], 'application/json')

  const manifest = JSON.parse(manifestObject.bytes.toString('utf8'))
  assert.equal(manifest.schema, 'agent-mail.inbound.edge.v1')
  assert.equal(manifest.ingest_id, result.ingestId)
  assert.equal(manifest.organization_id, '01960000-0000-7000-8000-000000000001')
  assert.equal(manifest.org_public_id, 'org_public_test')
  assert.equal(manifest.archive_prefix, 'orgs/org_public_test/domains/example.com/mail/inbound')
  assert.equal(manifest.connection_id, 'conn-public-id')
  assert.equal(manifest.domain_id, 'domain-public-id')
  assert.equal(manifest.domain, 'example.com')
  assert.equal(manifest.raw_key, result.rawKey)
  assert.equal(manifest.edge_key, result.edgeKey)
  assert.equal(manifest.mailbox, 'agent@example.com')
  assert.equal(manifest.envelope_to, 'Agent@Example.com')
  assert.equal(manifest.envelope_from, 'sender@example.net')
  assert.equal(manifest.recipient_domain, 'example.com')
  assert.equal(manifest.cloudflare_zone_name, 'example.com')
  assert.equal(manifest.worker_name, 'agent-mail-ingress')
  assert.equal(manifest.received_at, '2026-04-18T12:34:56.000Z')
  assert.equal(manifest.message_id, '<fixture-message-id@example.net>')
  assert.equal(manifest.atmcf_headers['X-ATMCF-Edge-Message-ID'], '<fixture-message-id@example.net>')
  assert.equal(manifest.atmcf_headers['X-ATMCF-Edge-Action'], 'worker')
  assert.equal(manifest.atmcf_headers['X-ATMCF-Edge-Status'], 'received')
  assert.equal(manifest.atmcf_headers['X-ATMCF-Edge-Envelope-To'], 'Agent@Example.com')
  assert.equal(manifest.raw_sha256, await sha256Hex(rawBytes))

  assert.equal(manifest.cloudflare_edge_evidence.schema, 'agent-mail.cloudflare-edge-evidence.v1')
  assert.equal(manifest.cloudflare_edge_evidence.worker_message_fields.envelope_from, 'sender@example.net')
  assert.equal(manifest.cloudflare_edge_evidence.worker_message_fields.envelope_to, 'Agent@Example.com')
  assert.equal(manifest.cloudflare_edge_evidence.worker_message_fields.raw_size, rawBytes.byteLength)
  assert.equal(manifest.cloudflare_edge_evidence.unavailable, undefined)
  assert.equal(manifest.cloudflare_routing_activity, undefined)
  assert.ok(
    manifest.cloudflare_edge_evidence.headers.entries.some(
      (entry) => entry.name === 'authentication-results' && entry.value.includes('spf=pass')
    )
  )
  assert.ok(
    manifest.cloudflare_edge_evidence.observed_auth_provenance_headers.some(
      (entry) => entry.name === 'x-cf-spamh-score' && entry.value === '2'
    )
  )
})

test('archiveInboundMessage preserves DSN null envelope sender', async () => {
  const rawBytes = await fixtureBytes('inbound.eml')
  const r2 = new MockR2Fetch()
  const now = new Date('2026-04-18T12:34:56.000Z')
  const env = workerEnv()
  const message = await buildMessage(rawBytes)
  message.from = ''

  const result = await archiveInboundMessage(message, env, now, r2.fetch)
  const manifestObject = r2.byKey(result.edgeKey)
  const manifest = JSON.parse(manifestObject.bytes.toString('utf8'))

  assert.equal(manifest.envelope_from, '')
  assert.equal(manifest.atmcf_headers['X-ATMCF-Edge-Envelope-From'], '<>')
  assert.equal(manifest.cloudflare_edge_evidence.worker_message_fields.envelope_from, '')
})

test('buildCloudflareEdgeEvidence records only Worker-observed edge facts', async () => {
  const rawBytes = await fixtureBytes('inbound.eml')
  const message = await buildMessage(rawBytes)
  const evidence = buildCloudflareEdgeEvidence({
    message,
    receivedAt: new Date('2026-04-18T12:34:56.000Z'),
    cloudflareZoneName: 'example.com'
  })

  assert.equal(evidence.source, 'cloudflare-worker-forwardable-email-message')
  assert.deepEqual(
    evidence.observed_auth_provenance_headers.map((entry) => entry.name),
    [
      'arc-authentication-results',
      'authentication-results',
      'dkim-signature',
      'received-spf',
      'x-cf-spamh-score'
    ]
  )
  assert.equal(evidence.unavailable, undefined)
})

test('archiveInboundMessage ignores stale Analytics bindings and does not fetch routing activity', async () => {
  const rawBytes = await fixtureBytes('inbound.eml')
  const r2 = new MockR2Fetch()
  const now = new Date('2026-04-18T12:34:56.000Z')
  const originalFetch = globalThis.fetch
  let globalFetchCalled = false

  globalThis.fetch = async () => {
    globalFetchCalled = true
    throw new Error('archiveInboundMessage must not call global fetch')
  }

  try {
    const result = await archiveInboundMessage(
      await buildMessage(rawBytes),
      workerEnv({
        AT_EMAIL_ADMIN_CF_ANALYTICS_TOKEN: 'stale-token',
        AT_EMAIL_ADMIN_CF_ZONE_ID: 'stale-zone',
        AT_EMAIL_ADMIN_CF_GRAPHQL_URL: 'https://example.invalid/graphql'
      }),
      now,
      r2.fetch
    )

    const manifest = JSON.parse(r2.byKey(result.edgeKey).bytes.toString('utf8'))
    assert.equal(globalFetchCalled, false)
    assert.equal(r2.requests.length, 2)
    assert.equal(manifest.cloudflare_routing_activity, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('buildIngestRequest posts the archived bundle through the worker ingest endpoint', async () => {
  const rawBytes = await fixtureBytes('inbound.eml')
  const r2 = new MockR2Fetch()
  const now = new Date('2026-04-18T12:34:56.000Z')
  const archived = await archiveInboundMessage(await buildMessage(rawBytes), workerEnv(), now, r2.fetch)
  const requestTime = new Date('2026-04-18T12:34:58.000Z')

  const request = await buildIngestRequest(
    archived,
    {
      AGENTTEAM_INGEST_URL: 'mail-ingress.example.com',
      AGENTTEAM_WORKER_HMAC_SECRET: TEST_WORKER_WEBHOOK_SECRET,
      AGENTTEAM_CONNECTION_ID: 'conn-public-id'
    },
    requestTime
  )

  assert.equal(request.url.href, 'https://mail-ingress.example.com/rpc/agent-mail/ingest/v1/conn-public-id')
  assert.equal(request.init.method, 'POST')
  assert.equal(request.init.headers['content-type'], 'application/json')
  assert.equal(request.init.headers['webhook-id'], archived.ingestId)
  assert.equal(request.init.headers['webhook-timestamp'], String(Math.floor(requestTime.getTime() / 1000)))

  const payload = JSON.parse(request.init.body)
  assert.equal(payload.schema, 'agent-mail.inbound.ingest.v1')
  assert.equal(payload.ingest_id, archived.ingestId)
  assert.equal(payload.organization_id, '01960000-0000-7000-8000-000000000001')
  assert.equal(payload.organization_public_id, 'org_public_test')
  assert.equal(payload.archive_prefix, 'orgs/org_public_test/domains/example.com/mail/inbound')
  assert.equal(payload.worker_connection_id, 'conn-public-id')
  assert.equal(payload.worker_domain_deployment_id, 'domain-public-id')
  assert.equal(payload.domain_id, 'domain-public-id')
  assert.equal(payload.domain, 'example.com')
  assert.equal(payload.recipient_domain, 'example.com')
  assert.equal(payload.raw_key, archived.rawKey)
  assert.equal(payload.edge_key, archived.edgeKey)
  assert.equal(payload.result_key, archived.resultKey)
  assert.equal(payload.received_at, '2026-04-18T12:34:56.000Z')
  assert.equal(payload.raw_sha256, await sha256Hex(rawBytes))

  assert.equal(
    request.init.headers['webhook-signature'],
    new Webhook(TEST_WORKER_WEBHOOK_SECRET).sign(archived.ingestId, requestTime, request.init.body)
  )
})

test('worker email logs only safe receive and archive fields', async () => {
  const rawBytes = await fixtureBytes('inbound.eml')
  const restoreFetch = installFetch(async () => new Response('', { status: 200 }))
  const consoleCapture = captureConsole()

  try {
    await worker.email(
      await buildMessage(rawBytes),
      workerEnv({
        AGENTTEAM_INGEST_URL: 'https://mail-ingress.example.com/rpc/agent-mail/ingest/v1/conn-public-id',
        AGENTTEAM_WORKER_HMAC_SECRET: TEST_WORKER_WEBHOOK_SECRET
      })
    )
  } finally {
    restoreFetch()
    consoleCapture.restore()
  }

  const logs = consoleCapture.entries.map((entry) => entry.text).join('\n')
  assert.match(logs, /agent-mail-ingress receive raw_size=\d+/)
  assert.match(
    logs,
    /agent-mail-ingress archived ingest_id=[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/
  )
  assert.doesNotMatch(logs, /sender@example\.net/i)
  assert.doesNotMatch(logs, /Agent@Example\.com/i)
  assert.doesNotMatch(logs, /raw\.eml|edge\.json|result\.json/)
  assert.doesNotMatch(logs, /orgs\/org_public_test/)
  assert.equal(logs.includes(TEST_WORKER_WEBHOOK_SECRET), false)
  assert.doesNotMatch(logs, /test-secret-key|test-session-token|test-access-key/)
})

test('worker email failure logs only safe error metadata', async () => {
  const rawBytes = await fixtureBytes('inbound.eml')
  const restoreFetch = installFetch(async () => new Response('', { status: 200 }))
  const consoleCapture = captureConsole()

  try {
    await assert.rejects(
      worker.email(
        await buildMessage(rawBytes),
        workerEnv({
          AGENTTEAM_DOMAIN: 'other.example',
          AGENTTEAM_ARCHIVE_PREFIX: 'orgs/org_public_test/domains/other.example/mail/inbound',
          AGENTTEAM_WORKER_HMAC_SECRET: TEST_WORKER_WEBHOOK_SECRET
        })
      ),
      (error) => {
        const text = String(error?.stack ?? error)
        assert.match(text, /AgentMailIngressError: agent mail ingress failed/)
        assert.doesNotMatch(text, /message recipient domain/i)
        assert.doesNotMatch(text, /example\.com|other\.example/i)
        assert.doesNotMatch(text, /sender@example\.net/i)
        return true
      }
    )
  } finally {
    restoreFetch()
    consoleCapture.restore()
  }

  const logs = consoleCapture.entries.map((entry) => entry.text).join('\n')
  assert.match(logs, /agent-mail-ingress receive raw_size=\d+/)
  assert.match(logs, /agent-mail-ingress failure raw_size=\d+ error_type=Error/)
  assert.doesNotMatch(logs, /sender@example\.net/i)
  assert.doesNotMatch(logs, /Agent@Example\.com/i)
  assert.doesNotMatch(logs, /message recipient domain/i)
  assert.doesNotMatch(logs, /example\.com|other\.example/i)
  assert.doesNotMatch(logs, /\n\s*at\s/)
  assert.equal(logs.includes(TEST_WORKER_WEBHOOK_SECRET), false)
  assert.doesNotMatch(logs, /test-secret-key|test-session-token|test-access-key/)
})

test('normalizeIngestURL defaults to the RPC ingest path and rejects unrelated paths', () => {
  assert.equal(
    normalizeIngestURL('mail-ingress.example.com', 'conn-public-id').href,
    'https://mail-ingress.example.com/rpc/agent-mail/ingest/v1/conn-public-id'
  )
  assert.equal(
    normalizeIngestURL(
      'https://mail-ingress.example.com/rpc/agent-mail/ingest/v1/conn-public-id',
      'conn-public-id'
    ).href,
    'https://mail-ingress.example.com/rpc/agent-mail/ingest/v1/conn-public-id'
  )
  assert.throws(
    () => normalizeIngestURL('https://mail-ingress.example.com/other', 'conn-public-id'),
    /path must be/
  )
})

test('buildIngestRequest requires the provisioned Worker webhook signing binding', async () => {
  const rawBytes = await fixtureBytes('inbound.eml')
  const r2 = new MockR2Fetch()
  const now = new Date('2026-04-18T12:34:56.000Z')
  const archived = await archiveInboundMessage(await buildMessage(rawBytes), workerEnv(), now, r2.fetch)

  await assert.rejects(
    buildIngestRequest(
      archived,
      {
        AGENTTEAM_INGEST_URL: 'mail-ingress.example.com',
        AGENTTEAM_CONNECTION_ID: 'conn-public-id'
      },
      new Date('2026-04-18T12:34:58.000Z')
    ),
    /missing Worker webhook signing secret/
  )
})

test('archiveInboundMessage fails when temporary R2 credentials are expired', async () => {
  const rawBytes = await fixtureBytes('inbound.eml')
  const r2 = new MockR2Fetch()
  await assert.rejects(
    archiveInboundMessage(
      await buildMessage(rawBytes),
      workerEnv({ AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT: '2026-04-18T12:34:55.000Z' }),
      new Date('2026-04-18T12:34:56.000Z'),
      r2.fetch
    ),
    /R2 temporary credentials are expired/
  )
  assert.equal(r2.requests.length, 0)
})

test('archive prefix must stay under the configured org and domain', () => {
  assert.throws(
    () =>
      normalizeArchivePrefix('orgs/other/domains/example.com', {
        orgPublicId: 'org_public_test',
        domain: 'example.com'
      }),
    /archive prefix must be under orgs\/org_public_test/
  )
  assert.throws(
    () =>
      normalizeArchivePrefix('orgs/org_public_test/domains/other.example', {
        orgPublicId: 'org_public_test',
        domain: 'example.com'
      }),
    /archive prefix must include domains\/example.com/
  )
  assert.throws(
    () =>
      normalizeArchivePrefix('orgs/org_public_test/domains/example.com', {
        orgPublicId: 'org_public_test',
        domain: 'example.com'
      }),
    /archive prefix must end with mail\/inbound/
  )
})

test('buildR2ObjectURL uses path-style bucket URLs and encodes key segments', () => {
  const url = buildR2ObjectURL(
    {
      endpoint: 'https://r2.example.test/base/',
      bucket: 'agent-mail-archive',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      sessionToken: 'test-session-token',
      expiresAt: new Date('2026-04-25T12:34:56.000Z')
    },
    'orgs/org public/domains/example.com/mail/inbound/raw.eml'
  )

  assert.equal(
    url.href,
    'https://r2.example.test/base/agent-mail-archive/orgs/org%20public/domains/example.com/mail/inbound/raw.eml'
  )
})
