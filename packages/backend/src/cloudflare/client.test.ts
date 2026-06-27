import emailWorkerScript from '@main/cloudflare-email-worker/worker.mjs?raw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_WORKER_WEBHOOK_SIGNING_SECRET = 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const cloudflareClientTestState = vi.hoisted(() => ({
  catchAllUpdate: vi.fn(),
  dnsCreate: vi.fn(),
  fetch: vi.fn(),
  scriptUpdate: vi.fn(),
  toFile: vi.fn()
}))

vi.mock('cloudflare', () => ({
  default: vi.fn(function Cloudflare() {
    return {
      emailRouting: {
        dns: {
          create: cloudflareClientTestState.dnsCreate
        },
        rules: {
          catchAlls: {
            update: cloudflareClientTestState.catchAllUpdate
          }
        }
      },
      workers: {
        scripts: {
          update: cloudflareClientTestState.scriptUpdate
        }
      }
    }
  })
}))

vi.mock('cloudflare/uploads', () => ({
  toFile: cloudflareClientTestState.toFile
}))

describe('Cloudflare email Worker provisioning', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    cloudflareClientTestState.catchAllUpdate.mockReset()
    cloudflareClientTestState.dnsCreate.mockReset()
    cloudflareClientTestState.fetch.mockReset()
    cloudflareClientTestState.scriptUpdate.mockReset()
    cloudflareClientTestState.toFile.mockReset()
    vi.stubGlobal('fetch', cloudflareClientTestState.fetch)
    cloudflareClientTestState.toFile.mockResolvedValue({
      name: 'index.js',
      type: 'application/javascript+module'
    })
  })

  it('uploads the packaged Worker bundle as the single production Worker module', async () => {
    expect.hasAssertions()
    cloudflareClientTestState.dnsCreate.mockResolvedValue({})
    cloudflareClientTestState.catchAllUpdate.mockResolvedValue({})
    cloudflareClientTestState.scriptUpdate.mockResolvedValue({})

    const { applyCloudflareProvisioning } = await import('./client')

    await applyCloudflareProvisioning({
      accessToken: 'fake-cloudflare-access-token',
      archivePrefix: 'orgs/org_public_test/domains/example.test/mail/inbound',
      cloudflareAccountId: 'cf-account-1',
      cloudflareZoneId: 'cf-zone-example',
      connectionPublicId: 'conn_public_test',
      domainPublicId: 'domain_public_test',
      domain: 'example.test',
      organizationId: '01960000-0000-7000-8000-000000000001',
      organizationPublicId: 'org_public_test',
      webhookSigningSecret: TEST_WORKER_WEBHOOK_SIGNING_SECRET,
      workerCredentials: {
        accessKeyId: 'fake-r2-access-key',
        archivePrefix: 'orgs/org_public_test/domains/example.test/mail/inbound',
        bucket: 'agent-mail-archive',
        endpoint: 'https://example.r2.cloudflarestorage.com',
        expiresAt: new Date('2026-06-21T00:00:00.000Z'),
        region: 'auto',
        secretAccessKey: 'fake-r2-secret-access-key',
        sessionToken: 'fake-r2-session-token'
      }
    })

    expect(cloudflareClientTestState.toFile).toHaveBeenCalledTimes(1)
    const [scriptBytes, filename, fileOptions] = cloudflareClientTestState.toFile.mock.calls[0]
    expect(scriptBytes).toBeInstanceOf(Uint8Array)
    if (!(scriptBytes instanceof Uint8Array)) {
      throw new TypeError('Cloudflare worker upload must receive encoded script bytes')
    }
    const uploadedWorkerScript = new TextDecoder().decode(scriptBytes)
    expect(uploadedWorkerScript).toBe(emailWorkerScript)
    expect(uploadedWorkerScript).not.toContain(TEST_WORKER_WEBHOOK_SIGNING_SECRET)
    expect(uploadedWorkerScript).not.toContain('fake-r2-access-key')
    expect(uploadedWorkerScript).not.toContain('fake-r2-secret-access-key')
    expect(uploadedWorkerScript).not.toContain('fake-r2-session-token')
    expect(filename).toBe('index.js')
    expect(fileOptions).toStrictEqual({ type: 'application/javascript+module' })
    expect(cloudflareClientTestState.scriptUpdate).toHaveBeenCalledTimes(1)

    const [scriptName, update] = cloudflareClientTestState.scriptUpdate.mock.calls[0]
    expect(scriptName).toMatch(/^agentteam-email-example-test-cf-zone-/u)
    expect(update.account_id).toBe('cf-account-1')
    expect(update.files).toStrictEqual([{ name: 'index.js', type: 'application/javascript+module' }])
    expect(update.metadata.main_module).toBe('index.js')
    expect(update.metadata.bindings).toContainEqual({
      name: 'AGENTTEAM_ORGANIZATION_ID',
      text: '01960000-0000-7000-8000-000000000001',
      type: 'plain_text'
    })
    expect(update.metadata.bindings).toContainEqual({
      name: 'AGENTTEAM_INGEST_URL',
      text: 'https://mail.example.test/rpc/agent-mail/ingest/v1/conn_public_test',
      type: 'plain_text'
    })
    expect(update.metadata.bindings).toContainEqual({
      name: 'AGENTTEAM_R2_ACCESS_KEY_ID',
      text: 'fake-r2-access-key',
      type: 'secret_text'
    })
    expect(update.metadata.bindings).toContainEqual({
      name: 'AGENTTEAM_R2_SECRET_ACCESS_KEY',
      text: 'fake-r2-secret-access-key',
      type: 'secret_text'
    })
    expect(update.metadata.bindings).toContainEqual({
      name: 'AGENTTEAM_R2_SESSION_TOKEN',
      text: 'fake-r2-session-token',
      type: 'secret_text'
    })
    expect(update.metadata.bindings).toContainEqual({
      name: 'AGENTTEAM_WORKER_HMAC_SECRET',
      text: TEST_WORKER_WEBHOOK_SIGNING_SECRET,
      type: 'secret_text'
    })
  })

  it('sends raw email through Cloudflare Email Sending with the user OAuth access token', async () => {
    expect.hasAssertions()
    cloudflareClientTestState.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            delivered: ['recipient@example.net'],
            permanent_bounces: [],
            queued: []
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    )
    const { sendCloudflareRawEmail } = await import('./client')

    await expect(
      sendCloudflareRawEmail({
        accessToken: 'user-cloudflare-access-token',
        cloudflareAccountId: 'cf-account-1',
        from: 'agent@example.com',
        mimeMessage: 'From: agent@example.com\r\n\r\nbody',
        recipients: ['recipient@example.net']
      })
    ).resolves.toStrictEqual({
      delivered: ['recipient@example.net'],
      permanentBounces: [],
      queued: []
    })

    expect(cloudflareClientTestState.fetch).toHaveBeenCalledTimes(1)
    const [requestURL, requestInit] = cloudflareClientTestState.fetch.mock.calls[0] as [
      URL,
      RequestInit & { body: string; headers: Record<string, string> }
    ]
    expect(requestURL.toString()).toBe(
      'https://api.cloudflare.com/client/v4/accounts/cf-account-1/email/sending/send_raw'
    )
    expect(requestInit).toMatchObject({
      headers: expect.objectContaining({
        authorization: 'Bearer user-cloudflare-access-token',
        'content-type': 'application/json'
      }),
      method: 'POST'
    })
    expect(JSON.parse(requestInit.body as string)).toStrictEqual({
      from: 'agent@example.com',
      mime_message: 'From: agent@example.com\r\n\r\nbody',
      recipients: ['recipient@example.net']
    })
  })

  it('normalizes provider error messages before they can be returned to public surfaces', async () => {
    expect.hasAssertions()
    const { sanitizeCloudflareError } = await import('./client')

    const sanitized = sanitizeCloudflareError({
      status: 403,
      message: 'Cloudflare rejected bearer token cf_secret_123 for account account_internal_456'
    })

    expect(sanitized).toStrictEqual({
      code: 'CLOUDFLARE_403',
      message: 'Cloudflare authorization failed. Reconnect Cloudflare and try again.'
    })
    expect(JSON.stringify(sanitized)).not.toContain('cf_secret_123')
    expect(JSON.stringify(sanitized)).not.toContain('account_internal_456')
  })
})
