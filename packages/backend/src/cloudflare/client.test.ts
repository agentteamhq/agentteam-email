import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT,
  AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT_SHA256
} from './email-worker.generated'

const cloudflareClientTestState = vi.hoisted(() => ({
  catchAllUpdate: vi.fn(),
  dnsCreate: vi.fn(),
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

describe('Cloudflare email Worker generated artifact', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    cloudflareClientTestState.catchAllUpdate.mockReset()
    cloudflareClientTestState.dnsCreate.mockReset()
    cloudflareClientTestState.scriptUpdate.mockReset()
    cloudflareClientTestState.toFile.mockReset()
    cloudflareClientTestState.toFile.mockResolvedValue({
      name: 'index.js',
      type: 'application/javascript+module'
    })
  })

  it('is a checked-in bundled script with the web-owned ingest and runtime binding contract', () => {
    expect(createHash('sha256').update(AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT).digest('hex')).toBe(
      AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT_SHA256
    )
    expect(AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT).toContain('/rpc/agent-mail/ingest/v1')
    expect(AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT).toContain('AGENTTEAM_ARCHIVE_PREFIX')
    expect(AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT).toContain('AGENTTEAM_R2_SESSION_TOKEN')
    expect(AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT).toContain('AGENTTEAM_WORKER_HMAC_SECRET')
  })

  it('uploads the generated artifact as the single production Worker module', async () => {
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
      hmacSecret: 'fake-worker-hmac-secret',
      organizationId: '01960000-0000-7000-8000-000000000001',
      organizationPublicId: 'org_public_test',
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
    expect(new TextDecoder().decode(scriptBytes)).toBe(AGENT_MAIL_CLOUDFLARE_EMAIL_WORKER_SCRIPT)
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
      text: 'https://mail.example.test/rpc/agent-mail/ingest/v1',
      type: 'plain_text'
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
