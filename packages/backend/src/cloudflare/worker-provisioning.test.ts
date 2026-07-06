import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const serviceWorkerScript = 'export default { fetch() { return new Response("ok") } }'

const cloudflareWorkerProvisioningTestState = vi.hoisted(() => {
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
    scriptSubdomainCreate: vi.fn(),
    scriptUpdate: vi.fn(),
    subdomainGet: vi.fn(),
    subdomainUpdate: vi.fn(),
    toFile: vi.fn()
  }
})

vi.mock('debug', () => ({
  default: cloudflareWorkerProvisioningTestState.debugFactory
}))

vi.mock('cloudflare', () => ({
  default: vi.fn(function Cloudflare() {
    return {
      workers: {
        scripts: {
          subdomain: {
            create: cloudflareWorkerProvisioningTestState.scriptSubdomainCreate
          },
          update: cloudflareWorkerProvisioningTestState.scriptUpdate
        },
        subdomains: {
          get: cloudflareWorkerProvisioningTestState.subdomainGet,
          update: cloudflareWorkerProvisioningTestState.subdomainUpdate
        }
      }
    }
  })
}))

vi.mock('cloudflare/uploads', () => ({
  toFile: cloudflareWorkerProvisioningTestState.toFile
}))

vi.mock('@main/cloudflare-service-worker/worker.mjs?raw', () => ({
  default: serviceWorkerScript
}))

describe('Cloudflare Worker provisioning', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')

    cloudflareWorkerProvisioningTestState.debugLog.mockReset()
    cloudflareWorkerProvisioningTestState.scriptSubdomainCreate.mockReset()
    cloudflareWorkerProvisioningTestState.scriptUpdate.mockReset()
    cloudflareWorkerProvisioningTestState.subdomainGet.mockReset()
    cloudflareWorkerProvisioningTestState.subdomainUpdate.mockReset()
    cloudflareWorkerProvisioningTestState.toFile.mockReset()
    cloudflareWorkerProvisioningTestState.toFile.mockResolvedValue({
      name: 'index.js',
      type: 'application/javascript+module'
    })
  })

  it('skips startup provisioning when Worker config is absent', async () => {
    expect.hasAssertions()
    const { provisionCloudflareWorkerOnStartup } = await import('./worker-provisioning')

    await expect(provisionCloudflareWorkerOnStartup()).resolves.toStrictEqual({
      configured: false
    })
    expect(cloudflareWorkerProvisioningTestState.scriptUpdate).not.toHaveBeenCalled()
  })

  it('uploads the configured Worker and binds the Worker password as secret_text', async () => {
    expect.hasAssertions()
    stubWorkerEnv()
    cloudflareWorkerProvisioningTestState.subdomainGet.mockResolvedValue({
      subdomain: 'agentteam-test'
    })
    cloudflareWorkerProvisioningTestState.scriptUpdate.mockResolvedValue({})
    cloudflareWorkerProvisioningTestState.scriptSubdomainCreate.mockResolvedValue({
      enabled: true,
      previews_enabled: false
    })

    const { provisionCloudflareWorkerOnStartup } = await import('./worker-provisioning')

    await expect(provisionCloudflareWorkerOnStartup()).resolves.toMatchObject({
      configured: true,
      subdomain: 'agentteam-test',
      workerName: 'agentteam-service-worker',
      workerUrl: 'https://agentteam-service-worker.agentteam-test.workers.dev'
    })

    expect(cloudflareWorkerProvisioningTestState.subdomainUpdate).not.toHaveBeenCalled()
    expect(cloudflareWorkerProvisioningTestState.toFile).toHaveBeenCalledTimes(1)
    const [scriptBytes] = cloudflareWorkerProvisioningTestState.toFile.mock.calls[0] as [Uint8Array]
    const uploadedWorkerScript = new TextDecoder().decode(scriptBytes)
    expect(uploadedWorkerScript).toBe(serviceWorkerScript)
    expect(uploadedWorkerScript).not.toContain('worker-password')

    expect(cloudflareWorkerProvisioningTestState.scriptUpdate).toHaveBeenCalledWith(
      'agentteam-service-worker',
      expect.objectContaining({
        account_id: 'cf-account-1',
        files: [{ name: 'index.js', type: 'application/javascript+module' }],
        metadata: expect.objectContaining({
          bindings: [
            {
              name: 'AGENTTEAM_WORKER_PASSWORD',
              text: 'worker-password',
              type: 'secret_text'
            }
          ],
          main_module: 'index.js',
          tags: ['agentteam-email', 'cloudflare-service-worker']
        })
      })
    )
    expect(cloudflareWorkerProvisioningTestState.scriptSubdomainCreate).toHaveBeenCalledWith(
      'agentteam-service-worker',
      {
        account_id: 'cf-account-1',
        enabled: true,
        previews_enabled: false
      }
    )
  })

  it('creates the account Workers subdomain when Cloudflare reports none exists', async () => {
    expect.hasAssertions()
    stubWorkerEnv()
    const notFound = Object.assign(new Error('not found'), { status: 404 })
    cloudflareWorkerProvisioningTestState.subdomainGet.mockRejectedValue(notFound)
    cloudflareWorkerProvisioningTestState.scriptUpdate.mockResolvedValue({})
    cloudflareWorkerProvisioningTestState.scriptSubdomainCreate.mockResolvedValue({})

    const { provisionCloudflareWorkerOnStartup } = await import('./worker-provisioning')

    await expect(provisionCloudflareWorkerOnStartup()).resolves.toMatchObject({
      configured: true
    })
    expect(cloudflareWorkerProvisioningTestState.subdomainUpdate).toHaveBeenCalledWith({
      account_id: 'cf-account-1',
      subdomain: 'agentteam-test'
    })
  })
})

function stubWorkerEnv() {
  vi.stubEnv('CLOUDFLARE_WORKER_ACCOUNT_ID', 'cf-account-1')
  vi.stubEnv('CLOUDFLARE_WORKER_API_TOKEN', 'cf-worker-api-token')
  vi.stubEnv('CLOUDFLARE_WORKER_PASSWORD', 'worker-password')
  vi.stubEnv('CLOUDFLARE_WORKER_NAME', 'agentteam-service-worker')
  vi.stubEnv('CLOUDFLARE_WORKER_SUBDOMAIN', 'agentteam-test')
}
