import { Buffer } from 'node:buffer'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse as parseUUID } from 'uuid'
import { Webhook } from 'standardwebhooks'

const ingestTestState = vi.hoisted(() => {
  const debugLog = vi.fn()
  return {
    debugFactory: Object.assign(
      vi.fn(() => debugLog),
      {
        disable: vi.fn(),
        enable: vi.fn(),
        enabled: vi.fn()
      }
    ),
    debugLog,
    enqueueAgentMailIngest: vi.fn(),
    findDeploymentOne: vi.fn(),
    findOne: vi.fn(),
    globals: vi.fn()
  }
})
const TEST_CONNECTION_ID = '01960000-0000-7000-8000-000000000000'
const TEST_CONNECTION_PUBLIC_ID = '2zXdRMpXKicecXjRnFg1Y'
const TEST_WEBHOOK_SECRET = standardWebhookSecret('test-secret')
const DEPLOYMENT_WEBHOOK_SECRET = standardWebhookSecret('deployment-secret')
const TEST_ARCHIVE_PREFIX = 'orgs/org_public_test/domains/example.com/mail/inbound'

vi.mock('../globals', () => ({
  globals: ingestTestState.globals
}))

vi.mock('debug', () => ({
  default: ingestTestState.debugFactory
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
    ingestTestState.debugFactory.mockClear()
    ingestTestState.debugFactory.mockImplementation(() => ingestTestState.debugLog)
    ingestTestState.debugLog.mockReset()
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
    await expect(response.json()).resolves.toStrictEqual({
      code: 'UNAUTHORIZED',
      error: 'Authentication is required.'
    })
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
    await expect(response.json()).resolves.toStrictEqual({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      error: 'Unsupported media type.'
    })
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

  it('logs mail-control enqueue failures without exposing secret-bearing error details', async () => {
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
    ingestTestState.enqueueAgentMailIngest.mockRejectedValue(
      Object.assign(
        new Error(
          'mail-control failed at https://control.example.test/ingest?access_token=raw-secret-token with Authorization: Bearer raw-bearer-token Cookie: session=raw-cookie'
        ),
        {
          code: 'ECONNRESET',
          response: {
            rawMime: 'Subject: secret payload',
            url: 'https://control.example.test/ingest?access_token=raw-secret-token'
          },
          status: 502,
          statusCode: 503
        }
      )
    )

    const response = await handleAgentMailIngestRequest(
      new Request(`https://mail.example.com/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`, {
        body,
        headers,
        method: 'POST'
      }),
      TEST_CONNECTION_PUBLIC_ID
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toStrictEqual({
      code: 'SERVICE_UNAVAILABLE',
      error: 'Service unavailable.'
    })
    expect(ingestTestState.debugFactory).toHaveBeenCalledWith('app:agent-mail:ingest')
    expect(ingestTestState.debugLog).toHaveBeenCalledWith('agent_mail_ingest_handled_error %o', {
      error: {
        code: 'ECONNRESET',
        message:
          'mail-control failed at  url_redacted  with Authorization=secret_redacted  Cookie=secret_redacted',
        name: 'Error',
        status: '502',
        statusCode: 503,
        type: 'object'
      },
      errorCode: 'ECONNRESET',
      event: 'agent_mail_ingest_handled_error',
      ingestId: notification.ingest_id,
      method: 'POST',
      operation: 'agent_mail_worker_ingest',
      organizationId: '01960000-0000-7000-8000-000000000001',
      organizationPublicId: 'org_public_test',
      path: `/rpc/agent-mail/ingest/v1/${TEST_CONNECTION_PUBLIC_ID}`,
      publicError: {
        code: 'SERVICE_UNAVAILABLE',
        status: 503
      },
      reason: 'control_enqueue_failed',
      recipientDomain: 'example.com',
      workerConnectionId: TEST_CONNECTION_PUBLIC_ID
    })

    const serializedLogCalls = JSON.stringify(ingestTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('raw-secret-token')
    expect(serializedLogCalls).not.toContain('raw-bearer-token')
    expect(serializedLogCalls).not.toContain('raw-cookie')
    expect(serializedLogCalls).not.toContain('Subject: secret payload')
    expect(serializedLogCalls).not.toContain('access_token')
    expect(serializedLogCalls).toContain('mail-control failed')
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
    const body = '{"token":"raw-ingest-token"'
    const headers = signedHeaders({ body, secret: TEST_WEBHOOK_SECRET, webhookId: TEST_CONNECTION_ID })
    headers.set('x-request-id', 'ingest-invalid-json-1')
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
    await expect(response.json()).resolves.toStrictEqual({
      code: 'BAD_REQUEST',
      error: 'Invalid request.',
      supportReference: 'request-id:ingest-invalid-json-1'
    })
    expect(ingestTestState.enqueueAgentMailIngest).not.toHaveBeenCalled()
    expect(JSON.stringify(ingestTestState.debugLog.mock.calls)).not.toContain('raw-ingest-token')
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
