import { createHmac } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse as parseUUID } from 'uuid'

const ingestTestState = vi.hoisted(() => ({
  enqueueAgentMailIngest: vi.fn(),
  findDeploymentOne: vi.fn(),
  findOne: vi.fn(),
  globals: vi.fn()
}))
const TEST_CONNECTION_ID = '01960000-0000-7000-8000-000000000000'
const TEST_CONNECTION_PUBLIC_ID = '2zXdRMpXKicecXjRnFg1Y'

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

  it('accepts a valid signed Worker notification and calls mail-control enqueue', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const { encryptSecretValue } = await import('../lib/secret-box')
    const notification = testNotification({
      archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
      includeAuthority: true
    })
    const body = JSON.stringify(notification)
    const timestamp = new Date().toISOString()
    const signature = sign({
      body,
      connectionPublicId: TEST_CONNECTION_PUBLIC_ID,
      secret: 'test-secret',
      timestamp
    })

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
          encryptedWorkerHmacSecret: encryptSecretValue('test-secret'),
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
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1', {
        body,
        headers: signedHeaders({ connectionPublicId: TEST_CONNECTION_PUBLIC_ID, signature, timestamp }),
        method: 'POST'
      })
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
    const timestamp = new Date().toISOString()
    const signature = sign({
      body,
      connectionPublicId: TEST_CONNECTION_PUBLIC_ID,
      secret: 'deployment-secret',
      timestamp
    })

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
          encryptedWorkerHmacSecret: encryptSecretValue('deployment-secret'),
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
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1', {
        body,
        headers: signedHeaders({ connectionPublicId: TEST_CONNECTION_PUBLIC_ID, signature, timestamp }),
        method: 'POST'
      })
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

  it('rejects notifications when deployment-owned HMAC state is unavailable', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const notification = testNotification({
      archivePrefix: 'orgs/org_public_test/domains/example.com/mail/inbound',
      includeAuthority: true
    })
    const body = JSON.stringify(notification)
    const timestamp = new Date().toISOString()
    const signature = sign({
      body,
      connectionPublicId: TEST_CONNECTION_PUBLIC_ID,
      secret: 'connection-secret',
      timestamp
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
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1', {
        body,
        headers: signedHeaders({ connectionPublicId: TEST_CONNECTION_PUBLIC_ID, signature, timestamp }),
        method: 'POST'
      })
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.findDeploymentOne).toHaveBeenCalledWith({
      cloudflareConnectionId: TEST_CONNECTION_ID,
      workerConnectionId: TEST_CONNECTION_PUBLIC_ID,
      status: { $in: ['active', 'degraded'] }
    })
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })

  it('rejects an invalid HMAC before enqueue', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const { encryptSecretValue } = await import('../lib/secret-box')
    const timestamp = new Date().toISOString()

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
          encryptedWorkerHmacSecret: encryptSecretValue('test-secret'),
          agentMailDomainId: TEST_CONNECTION_ID,
          organizationId: parseUUID('01960000-0000-7000-8000-000000000001'),
          organizationPublicId: 'org_public_test',
          workerConnectionId: TEST_CONNECTION_PUBLIC_ID
        })
    })

    const response = await handleAgentMailIngestRequest(
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1', {
        body: JSON.stringify(testNotification()),
        headers: signedHeaders({
          connectionPublicId: TEST_CONNECTION_PUBLIC_ID,
          signature: 'a'.repeat(64),
          timestamp
        }),
        method: 'POST'
      })
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })

  it('does not parse unauthenticated notification bodies before HMAC verification', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const { encryptSecretValue } = await import('../lib/secret-box')
    const timestamp = new Date().toISOString()

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
          encryptedWorkerHmacSecret: encryptSecretValue('test-secret'),
          agentMailDomainId: TEST_CONNECTION_ID,
          organizationId: parseUUID('01960000-0000-7000-8000-000000000001'),
          organizationPublicId: 'org_public_test',
          workerConnectionId: TEST_CONNECTION_PUBLIC_ID
        })
    })

    const response = await handleAgentMailIngestRequest(
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1', {
        body: '{',
        headers: signedHeaders({
          connectionPublicId: TEST_CONNECTION_PUBLIC_ID,
          signature: 'a'.repeat(64),
          timestamp
        }),
        method: 'POST'
      })
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })

  it('rejects unknown or inactive Cloudflare connections', async () => {
    expect.hasAssertions()
    const { handleAgentMailIngestRequest } = await import('./ingest')
    const notification = testNotification()
    const body = JSON.stringify(notification)
    const timestamp = new Date().toISOString()
    const signature = sign({
      body,
      connectionPublicId: TEST_CONNECTION_PUBLIC_ID,
      secret: 'test-secret',
      timestamp
    })

    ingestTestState.findOne.mockReturnValue({ exec: () => Promise.resolve(null) })
    ingestTestState.findDeploymentOne.mockReturnValue({ exec: () => Promise.resolve(null) })

    const response = await handleAgentMailIngestRequest(
      new Request('https://mail.example.com/rpc/agent-mail/ingest/v1', {
        body,
        headers: signedHeaders({ connectionPublicId: TEST_CONNECTION_PUBLIC_ID, signature, timestamp }),
        method: 'POST'
      })
    )

    expect(response.status).toBe(401)
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
  })
})

function testNotification({
  archivePrefix,
  includeAuthority = false
}: {
  archivePrefix?: string
  includeAuthority?: boolean
} = {}) {
  const ingestId = TEST_CONNECTION_ID
  const bundlePrefix = archivePrefix
    ? `${archivePrefix.replace(/\/+$/u, '')}/2026/06/20/${ingestId}`
    : `mail/inbound/example.com/2026/06/20/${ingestId}`
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
  connectionPublicId,
  signature,
  timestamp
}: {
  connectionPublicId: string
  signature: string
  timestamp: string
}): Headers {
  return new Headers({
    'content-type': 'application/json',
    'x-agent-mail-connection-id': connectionPublicId,
    'x-agent-mail-signature': signature,
    'x-agent-mail-timestamp': timestamp
  })
}

function sign({
  body,
  connectionPublicId,
  secret,
  timestamp
}: {
  body: string
  connectionPublicId: string
  secret: string
  timestamp: string
}): string {
  return createHmac('sha256', secret)
    .update(timestamp)
    .update('\n')
    .update(connectionPublicId)
    .update('\n')
    .update(body)
    .digest('hex')
}
