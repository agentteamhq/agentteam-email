import { Buffer } from 'node:buffer'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse as parseUUID } from 'uuid'
import { Webhook } from 'standardwebhooks'

const ingestTestState = vi.hoisted(() => ({
  enqueueAgentMailIngest: vi.fn(),
  findDeploymentOne: vi.fn(),
  findOne: vi.fn(),
  globals: vi.fn()
}))
const TEST_CONNECTION_ID = '01960000-0000-7000-8000-000000000000'
const TEST_CONNECTION_PUBLIC_ID = '2zXdRMpXKicecXjRnFg1Y'
const TEST_WEBHOOK_SECRET = standardWebhookSecret('test-secret')
const DEPLOYMENT_WEBHOOK_SECRET = standardWebhookSecret('deployment-secret')
const TEST_ARCHIVE_PREFIX = 'orgs/org_public_test/domains/example.com/mail/inbound'

vi.mock('../globals', () => ({
  globals: ingestTestState.globals
}))

vi.mock('./control-client', () => ({
  enqueueAgentMailIngest: ingestTestState.enqueueAgentMailIngest
}))

describe('Agent Mail web-owned Worker ingest', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    ingestTestState.enqueueAgentMailIngest.mockReset()
    ingestTestState.findDeploymentOne.mockReset()
    ingestTestState.findOne.mockReset()
    ingestTestState.globals.mockReset()
    ingestTestState.globals.mockResolvedValue({
      db: {
        models: {
          cloudflareConnection: {
            findOne: ingestTestState.findOne
          },
          agentMailWorkerDeployment: {
            findOne: ingestTestState.findDeploymentOne
          }
        }
      }
    })
  })

  it('accepts application/json Content-Type parameters before authentication checks', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')

    const response = await handleAgentMailIngestRequest(
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1', {
        body: '{}',
        headers: {
          'content-type': 'application/json; charset=utf-8'
        },
        method: 'POST'
      }),
      ''
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.globals).not.toHaveBeenCalled()
  })

  it('rejects non-json media types before authentication checks', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')

    const response = await handleAgentMailIngestRequest(
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1', {
        body: '{}',
        headers: {
          'content-type': 'application/json-patch+json'
        },
        method: 'POST'
      }),
      ''
    )

    expect(response.status).toBe(415)
    expect(ingestTestState.globals).not.toHaveBeenCalled()
  })

  it('accepts a valid signed Worker notification and calls mail-control enqueue', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const { encryptSecretValue } = await import('../lib/secret-box')
    const notification = testNotification({
      archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
      includeAuthority: true
    })
    const body = JSON.stringify(notification)
    const headers = signedHeaders({ body, secret: TEST_WEBHOOK_SECRET, webhookId: notification.ingest_id })
    const encryptedWorkerSecret = await encryptSecretValue(TEST_WEBHOOK_SECRET)

    ingestTestState.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: TEST_CONNECTION_ID,
          domain: 'example.com',
          status: 'active'
        })
    })
    ingestTestState.findDeploymentOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
          domain: 'example.com',
          encryptedWorkerHmacSecret: encryptedWorkerSecret,
          agentMailDomainId: TEST_CONNECTION_ID,
          organizationId: parseUUID('01960000-0000-7000-8000-000000000001'),
          organizationPublicId: 'org_public_test',
          workerConnectionId: TEST_CONNECTION_PUBLIC_ID
        })
    })
    ingestTestState.enqueueAgentMailIngest.mockResolvedValue({
      status: 'enqueued',
      ingest_id: notification.ingest_id
    })

    const response = await handleAgentMailIngestRequest(
      new Request(`https://mail.example.com/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`, {
        body,
        headers,
        method: 'POST'
      }),
      TEST_CONNECTION_PUBLIC_ID
    )

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toStrictEqual({
      status: 'enqueued',
      ingest_id: notification.ingest_id
    })
    expect(ingestTestState.enqueueAgentMailIngest).toHaveBeenCalledWith({
      ...notification,
      organization_id: '01960000-0000-7000-8000-000000000001',
      organization_public_id: 'org_public_test',
      archive_prefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
      worker_connection_id: TEST_CONNECTION_PUBLIC_ID
    })
  })

  it('accepts an org-prefixed deployment notification and forwards authority fields', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const { encryptSecretValue } = await import('../lib/secret-box')
    const notification = testNotification({
      archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
      includeAuthority: true
    })
    const body = JSON.stringify(notification)
    const headers = signedHeaders({
      body,
      secret: DEPLOYMENT_WEBHOOK_SECRET,
      webhookId: notification.ingest_id
    })
    const encryptedWorkerSecret = await encryptSecretValue(DEPLOYMENT_WEBHOOK_SECRET)

    ingestTestState.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: TEST_CONNECTION_ID,
          domain: 'example.com',
          status: 'active'
        })
    })
    ingestTestState.findDeploymentOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
          domain: 'example.com',
          encryptedWorkerHmacSecret: encryptedWorkerSecret,
          agentMailDomainId: TEST_CONNECTION_ID,
          organizationId: parseUUID('01960000-0000-7000-8000-000000000001'),
          organizationPublicId: 'org_public_test',
          workerConnectionId: TEST_CONNECTION_PUBLIC_ID
        })
    })
    ingestTestState.enqueueAgentMailIngest.mockResolvedValue({
      status: 'enqueued',
      ingest_id: notification.ingest_id
    })

    const response = await handleAgentMailIngestRequest(
      new Request(`https://mail.example.com/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`, {
        body,
        headers,
        method: 'POST'
      }),
      TEST_CONNECTION_PUBLIC_ID
    )

    expect(response.status).toBe(202)
    expect(ingestTestState.enqueueAgentMailIngest).toHaveBeenCalledWith({
      ...notification,
      organization_id: '01960000-0000-7000-8000-000000000001',
      organization_public_id: 'org_public_test',
      archive_prefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
      worker_connection_id: TEST_CONNECTION_PUBLIC_ID
    })
    expect(ingestTestState.findDeploymentOne).toHaveBeenCalledWith({
      cloudflareConnectionId: TEST_CONNECTION_ID,
      workerConnectionId: TEST_CONNECTION_PUBLIC_ID,
      status: { $in: ['active', 'degraded'] }
    })
  })

  it('rejects notifications when deployment-owned webhook signing state is unavailable', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const notification = testNotification({
      archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
      includeAuthority: true
    })
    const body = JSON.stringify(notification)
    const headers = signedHeaders({
      body,
      secret: standardWebhookSecret('connection-secret'),
      webhookId: notification.ingest_id
    })

    ingestTestState.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: { toString: () => 'document-id-object-should-not-be-used-for-deployment-lookup' },
          archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
          domain: 'example.com',
          status: 'active'
        })
    })
    ingestTestState.findDeploymentOne.mockReturnValue({ exec: () => Promise.resolve(null) })

    const response = await handleAgentMailIngestRequest(
      new Request(`https://mail.example.com/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`, {
        body,
        headers,
        method: 'POST'
      }),
      TEST_CONNECTION_PUBLIC_ID
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.findDeploymentOne).toHaveBeenCalledWith({
      cloudflareConnectionId: TEST_CONNECTION_ID,
      workerConnectionId: TEST_CONNECTION_PUBLIC_ID,
      status: { $in: ['active', 'degraded'] }
    })
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })

  it('fails closed when the stored Worker webhook signing secret cannot be decrypted', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const notification = testNotification({
      archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
      includeAuthority: true
    })
    const body = JSON.stringify(notification)
    const headers = signedHeaders({ body, secret: TEST_WEBHOOK_SECRET, webhookId: notification.ingest_id })

    ingestTestState.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: TEST_CONNECTION_ID,
          domain: 'example.com',
          status: 'active'
        })
    })
    ingestTestState.findDeploymentOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
          domain: 'example.com',
          encryptedWorkerHmacSecret: 'v1.AQID.BAQF.BgcI',
          agentMailDomainId: TEST_CONNECTION_ID,
          organizationId: parseUUID('01960000-0000-7000-8000-000000000001'),
          organizationPublicId: 'org_public_test',
          workerConnectionId: TEST_CONNECTION_PUBLIC_ID
        })
    })

    const response = await handleAgentMailIngestRequest(
      new Request(`https://mail.example.com/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`, {
        body,
        headers,
        method: 'POST'
      }),
      TEST_CONNECTION_PUBLIC_ID
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })

  it('rejects an invalid Standard Webhooks signature before enqueue', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const { encryptSecretValue } = await import('../lib/secret-box')
    const encryptedWorkerSecret = await encryptSecretValue(TEST_WEBHOOK_SECRET)

    ingestTestState.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: TEST_CONNECTION_ID,
          domain: 'example.com',
          status: 'active'
        })
    })
    ingestTestState.findDeploymentOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
          domain: 'example.com',
          encryptedWorkerHmacSecret: encryptedWorkerSecret,
          agentMailDomainId: TEST_CONNECTION_ID,
          organizationId: parseUUID('01960000-0000-7000-8000-000000000001'),
          organizationPublicId: 'org_public_test',
          workerConnectionId: TEST_CONNECTION_PUBLIC_ID
        })
    })

    const response = await handleAgentMailIngestRequest(
      new Request(`https://mail.example.com/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`, {
        body: JSON.stringify(testNotification()),
        headers: webhookHeaders(
          testNotification().ingest_id,
          'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
        ),
        method: 'POST'
      }),
      TEST_CONNECTION_PUBLIC_ID
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })

  it('does not parse unauthenticated notification bodies before Standard Webhooks verification', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const { encryptSecretValue } = await import('../lib/secret-box')
    const encryptedWorkerSecret = await encryptSecretValue(TEST_WEBHOOK_SECRET)

    ingestTestState.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: TEST_CONNECTION_ID,
          domain: 'example.com',
          status: 'active'
        })
    })
    ingestTestState.findDeploymentOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
          domain: 'example.com',
          encryptedWorkerHmacSecret: encryptedWorkerSecret,
          agentMailDomainId: TEST_CONNECTION_ID,
          organizationId: parseUUID('01960000-0000-7000-8000-000000000001'),
          organizationPublicId: 'org_public_test',
          workerConnectionId: TEST_CONNECTION_PUBLIC_ID
        })
    })

    const response = await handleAgentMailIngestRequest(
      new Request(`https://mail.example.com/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`, {
        body: '{',
        headers: webhookHeaders(
          testNotification().ingest_id,
          'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
        ),
        method: 'POST'
      }),
      TEST_CONNECTION_PUBLIC_ID
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })

  it('reports signed malformed JSON notifications as validation failures', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const { encryptSecretValue } = await import('../lib/secret-box')
    const body = '{'
    const headers = signedHeaders({ body, secret: TEST_WEBHOOK_SECRET, webhookId: TEST_CONNECTION_ID })
    const encryptedWorkerSecret = await encryptSecretValue(TEST_WEBHOOK_SECRET)

    ingestTestState.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: TEST_CONNECTION_ID,
          domain: 'example.com',
          status: 'active'
        })
    })
    ingestTestState.findDeploymentOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
          domain: 'example.com',
          encryptedWorkerHmacSecret: encryptedWorkerSecret,
          agentMailDomainId: TEST_CONNECTION_ID,
          organizationId: parseUUID('01960000-0000-7000-8000-000000000001'),
          organizationPublicId: 'org_public_test',
          workerConnectionId: TEST_CONNECTION_PUBLIC_ID
        })
    })

    const response = await handleAgentMailIngestRequest(
      new Request(`https://mail.example.com/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`, {
        body,
        headers,
        method: 'POST'
      }),
      TEST_CONNECTION_PUBLIC_ID
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toStrictEqual({ error: 'Invalid notification' })
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })

  it('rejects unknown or inactive Cloudflare connections', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const notification = testNotification()
    const body = JSON.stringify(notification)
    const headers = signedHeaders({ body, secret: TEST_WEBHOOK_SECRET, webhookId: notification.ingest_id })

    ingestTestState.findOne.mockReturnValue({ exec: () => Promise.resolve(null) })
    ingestTestState.findDeploymentOne.mockReturnValue({ exec: () => Promise.resolve(null) })

    const response = await handleAgentMailIngestRequest(
      new Request(`https://mail.example.com/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`, {
        body,
        headers,
        method: 'POST'
      }),
      TEST_CONNECTION_PUBLIC_ID
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })
})

function testNotification({
  archivePrefix = TEST_ARCHIVE_PREFIX,
  includeAuthority = false
}: {
  archivePrefix?: string
  includeAuthority?: boolean
} = {}) {
  const ingestId = TEST_CONNECTION_ID
  const bundlePrefix = `${archivePrefix.replace(/\/+$/u, '')}/2026/06/20/${ingestId}`
  return {
    schema: 'agent-mail.inbound.ingest.v1' as const,
    ingest_id: ingestId,
    ...(includeAuthority
      ? {
          organization_public_id: 'org_public_test',
          archive_prefix: archivePrefix,
          worker_connection_id: TEST_CONNECTION_PUBLIC_ID,
          worker_domain_deployment_id: TEST_CONNECTION_PUBLIC_ID
        }
      : {}),
    recipient_domain: 'example.com',
    raw_key: `${bundlePrefix}/raw.eml`,
    edge_key: `${bundlePrefix}/edge.json`,
    result_key: `${bundlePrefix}/result.json`,
    received_at: '2026-06-20T12:00:00.000Z',
    raw_sha256: 'b'.repeat(64)
  }
}

function signedHeaders({
  body,
  secret,
  webhookId
}: {
  body: string
  secret: string
  webhookId: string
}): Headers {
  const timestamp = new Date()
  const webhook = new Webhook(secret)
  return webhookHeaders(webhookId, webhook.sign(webhookId, timestamp, body), timestamp)
}

function webhookHeaders(webhookId: string, signature: string, timestamp = new Date()): Headers {
  return new Headers({
    'content-type': 'application/json',
    'webhook-id': webhookId,
    'webhook-signature': signature,
    'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000))
  })
}

function standardWebhookSecret(value: string): string {
  return `whsec_${Buffer.from(value, 'utf8').toString('base64')}`
}
