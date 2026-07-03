import emailWorkerScript from '@main/cloudflare-email-worker/worker.mjs?raw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_WORKER_WEBHOOK_SIGNING_SECRET = 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const cloudflareClientTestState = vi.hoisted(() => ({
  catchAllUpdate: vi.fn(),
  dnsCreate: vi.fn(),
  dnsDelete: vi.fn(),
  fetch: vi.fn(),
  sendingSubdomainCreate: vi.fn(),
  sendingSubdomainsList: vi.fn(),
  scriptDelete: vi.fn(),
  scriptUpdate: vi.fn(),
  toFile: vi.fn()
}))

vi.mock('cloudflare', () => ({
  default: vi.fn(function Cloudflare() {
    return {
      emailRouting: {
        dns: {
          create: cloudflareClientTestState.dnsCreate,
          delete: cloudflareClientTestState.dnsDelete
        },
        rules: {
          catchAlls: {
            update: cloudflareClientTestState.catchAllUpdate
          }
        }
      },
      emailSending: {
        subdomains: {
          create: cloudflareClientTestState.sendingSubdomainCreate,
          list: cloudflareClientTestState.sendingSubdomainsList
        }
      },
      workers: {
        scripts: {
          delete: cloudflareClientTestState.scriptDelete,
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
    cloudflareClientTestState.dnsDelete.mockReset()
    cloudflareClientTestState.fetch.mockReset()
    cloudflareClientTestState.sendingSubdomainCreate.mockReset()
    cloudflareClientTestState.sendingSubdomainsList.mockReset()
    cloudflareClientTestState.scriptDelete.mockReset()
    cloudflareClientTestState.scriptUpdate.mockReset()
    cloudflareClientTestState.toFile.mockReset()
    vi.stubGlobal('fetch', cloudflareClientTestState.fetch)
    cloudflareClientTestState.toFile.mockResolvedValue({
      name: 'index.js',
      type: 'application/javascript+module'
    })
    cloudflareClientTestState.sendingSubdomainsList.mockReturnValue([])
    cloudflareClientTestState.sendingSubdomainCreate.mockResolvedValue({
      enabled: true,
      name: 'example.test',
      tag: 'sending-subdomain-1'
    })
    cloudflareClientTestState.dnsDelete.mockReturnValue([])
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
    expect(cloudflareClientTestState.sendingSubdomainsList).toHaveBeenCalledWith({
      zone_id: 'cf-zone-example'
    })
    expect(cloudflareClientTestState.sendingSubdomainCreate).toHaveBeenCalledWith({
      name: 'example.test',
      zone_id: 'cf-zone-example'
    })

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

  it('does not recreate an already enabled Cloudflare Email Sending domain', async () => {
    expect.hasAssertions()
    cloudflareClientTestState.dnsCreate.mockResolvedValue({})
    cloudflareClientTestState.catchAllUpdate.mockResolvedValue({})
    cloudflareClientTestState.scriptUpdate.mockResolvedValue({})
    cloudflareClientTestState.sendingSubdomainsList.mockReturnValue([
      {
        enabled: true,
        name: 'example.test',
        tag: 'sending-subdomain-1'
      }
    ])

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

    expect(cloudflareClientTestState.sendingSubdomainsList).toHaveBeenCalledWith({
      zone_id: 'cf-zone-example'
    })
    expect(cloudflareClientTestState.sendingSubdomainCreate).not.toHaveBeenCalled()
    expect(cloudflareClientTestState.dnsCreate).toHaveBeenCalled()
    expect(cloudflareClientTestState.catchAllUpdate).toHaveBeenCalled()
  })

  it('wraps Cloudflare provisioning operation failures with safe diagnostics', async () => {
    expect.hasAssertions()
    cloudflareClientTestState.scriptUpdate.mockRejectedValue({
      errors: [
        {
          code: 10000,
          message:
            'Cloudflare rejected Bearer cf_secret_token_12345678901234567890 for account_internal_12345678901234567890'
        }
      ],
      status: 403
    })

    const { CloudflareProvisioningOperationError, applyCloudflareProvisioning } = await import('./client')

    try {
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
    } catch (error) {
      expect(error).toBeInstanceOf(CloudflareProvisioningOperationError)
      expect(error).toMatchObject({
        cloudflareProviderErrors: [
          {
            code: 10000,
            message: expect.stringContaining('[redacted]')
          }
        ],
        cloudflareProvisioningOperation: 'workers-script-update',
        status: 403
      })
      expect(JSON.stringify(error)).not.toContain('cf_secret_token')
      expect(JSON.stringify(error)).not.toContain('account_internal')
      return
    }

    throw new Error('Expected Cloudflare provisioning to fail')
  })

  it('removes Cloudflare routing and Worker resources for a domain teardown', async () => {
    expect.hasAssertions()
    cloudflareClientTestState.catchAllUpdate.mockResolvedValue({})
    cloudflareClientTestState.scriptDelete.mockResolvedValue({})
    const { removeCloudflareProvisioning } = await import('./client')

    await expect(
      removeCloudflareProvisioning({
        accessToken: 'fake-cloudflare-access-token',
        cloudflareAccountId: 'cf-account-1',
        cloudflareZoneId: 'cf-zone-example',
        workerScriptName: 'agentteam-email-example-test'
      })
    ).resolves.toBeUndefined()

    expect(cloudflareClientTestState.catchAllUpdate).toHaveBeenCalledWith({
      zone_id: 'cf-zone-example',
      actions: [{ type: 'drop' }],
      enabled: false,
      matchers: [{ type: 'all' }],
      name: 'AgentTeam Email catch-all disabled'
    })
    expect(cloudflareClientTestState.dnsDelete).toHaveBeenCalledWith({
      zone_id: 'cf-zone-example'
    })
    expect(cloudflareClientTestState.scriptDelete).toHaveBeenCalledWith('agentteam-email-example-test', {
      account_id: 'cf-account-1',
      force: true
    })
  })

  it('continues domain teardown when Cloudflare Email Routing DNS disable fails', async () => {
    expect.hasAssertions()
    cloudflareClientTestState.catchAllUpdate.mockResolvedValue({})
    cloudflareClientTestState.scriptDelete.mockResolvedValue({})
    cloudflareClientTestState.dnsDelete.mockImplementation(async () => {
      throw Object.assign(new Error('Cloudflare DNS disable failed for Bearer cf_secret_token_123'), {
        status: 403
      })
    })
    const { removeCloudflareProvisioning } = await import('./client')

    await expect(
      removeCloudflareProvisioning({
        accessToken: 'fake-cloudflare-access-token',
        cloudflareAccountId: 'cf-account-1',
        cloudflareZoneId: 'cf-zone-example',
        workerScriptName: 'agentteam-email-example-test'
      })
    ).resolves.toBeUndefined()

    expect(cloudflareClientTestState.catchAllUpdate).toHaveBeenCalled()
    expect(cloudflareClientTestState.scriptDelete).toHaveBeenCalledWith('agentteam-email-example-test', {
      account_id: 'cf-account-1',
      force: true
    })
    expect(cloudflareClientTestState.dnsDelete).toHaveBeenCalledWith({
      zone_id: 'cf-zone-example'
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
      messageId: null,
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

  it('treats a successful Cloudflare raw-send message id without recipient arrays as queued for every requested recipient', async () => {
    expect.hasAssertions()
    cloudflareClientTestState.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            message_id: '<cloudflare-message-id@example.net>'
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
      delivered: [],
      messageId: '<cloudflare-message-id@example.net>',
      permanentBounces: [],
      queued: ['recipient@example.net']
    })
  })

  it('preserves sanitized Cloudflare raw-send errors without exposing secrets', async () => {
    expect.hasAssertions()
    cloudflareClientTestState.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [
            {
              code: 10001,
              message: 'email.sending.error.invalid_request_schema cf_secret_token_1234567890123456'
            }
          ],
          messages: [],
          result: null,
          success: false
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 400
        }
      )
    )
    const { CloudflareRawEmailSendError, sendCloudflareRawEmail } = await import('./client')

    try {
      await sendCloudflareRawEmail({
        accessToken: 'user-cloudflare-access-token',
        cloudflareAccountId: 'cf-account-1',
        from: 'agent@example.com',
        mimeMessage: 'From: agent@example.com\r\n\r\nbody',
        recipients: ['recipient@example.net']
      })
    } catch (error) {
      expect(error).toBeInstanceOf(CloudflareRawEmailSendError)
      expect(error).toMatchObject({
        cloudflareEmailSendOperation: 'email-sending-send-raw',
        cloudflareProviderErrors: [
          {
            code: 10001,
            message: expect.stringContaining('[redacted]')
          }
        ],
        status: 400
      })
      expect(JSON.stringify(error)).not.toContain('cf_secret_token')
      expect(JSON.stringify(error)).not.toContain('user-cloudflare-access-token')
      return
    }

    throw new Error('Expected Cloudflare raw email send to fail')
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
