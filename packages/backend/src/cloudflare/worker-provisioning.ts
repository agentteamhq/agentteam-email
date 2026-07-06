import { toFile } from 'cloudflare/uploads'
import debug from 'debug'

import { createSafeDiagnosticErrorName } from '../auth/log-redaction'

import { createCloudflareClient } from './client'
import { getCloudflareWorkerConfig } from './config'
import type Cloudflare from 'cloudflare'
import type { CloudflareWorkerConfig } from './config'

const log = debug('app:cloudflare:worker')
const CLOUDFLARE_WORKER_COMPATIBILITY_DATE = '2026-06-19'
const MAX_PROVISION_ATTEMPTS = 3

type WorkerProvisioningOperation =
  | 'workers-subdomain-get'
  | 'workers-subdomain-update'
  | 'workers-script-update'
  | 'workers-script-subdomain-enable'

export interface CloudflareWorkerProvisioningResult {
  configured: boolean
  subdomain?: string
  workerName?: string
  workerUrl?: string
}

class CloudflareWorkerProvisioningOperationError extends Error {
  readonly cause: unknown
  readonly operation: WorkerProvisioningOperation

  constructor(operation: WorkerProvisioningOperation, cause: unknown) {
    super(`Cloudflare Worker provisioning failed: ${operation}`)
    this.name = 'CloudflareWorkerProvisioningOperationError'
    this.operation = operation
    Object.defineProperty(this, 'cause', {
      configurable: true,
      enumerable: false,
      value: cause
    })
  }
}

export async function provisionCloudflareWorkerOnStartup(): Promise<CloudflareWorkerProvisioningResult> {
  const config = getCloudflareWorkerConfig()

  if (!config) {
    log('Cloudflare Worker provisioning skipped; no Worker configuration present')
    return { configured: false }
  }

  for (let attempt = 1; attempt <= MAX_PROVISION_ATTEMPTS; attempt += 1) {
    try {
      const result = await provisionCloudflareWorker(config)
      log('Cloudflare Worker provisioning completed', {
        attempt,
        subdomain: result.subdomain,
        workerName: result.workerName,
        workerUrl: result.workerUrl
      })
      return result
    } catch (error) {
      log('Cloudflare Worker provisioning attempt failed %o', {
        attempt,
        error: cloudflareWorkerProvisioningErrorLogFields(error),
        maxAttempts: MAX_PROVISION_ATTEMPTS,
        subdomain: config.subdomain,
        workerName: config.workerName
      })

      if (attempt === MAX_PROVISION_ATTEMPTS) {
        throw error
      }
      await wait(attempt * 1000)
    }
  }

  throw new Error('Cloudflare Worker provisioning did not complete')
}

async function provisionCloudflareWorker(
  config: CloudflareWorkerConfig
): Promise<CloudflareWorkerProvisioningResult> {
  const client = createCloudflareClient(config.apiToken)

  await ensureWorkersSubdomain({
    client,
    config
  })
  await upsertCloudflareWorker({
    client,
    config
  })
  await runWorkerProvisioningOperation('workers-script-subdomain-enable', () =>
    client.workers.scripts.subdomain.create(config.workerName, {
      account_id: config.accountId,
      enabled: true,
      previews_enabled: false
    })
  )

  return {
    configured: true,
    subdomain: config.subdomain,
    workerName: config.workerName,
    workerUrl: config.workerUrl
  }
}

async function ensureWorkersSubdomain({
  client,
  config
}: {
  client: Cloudflare
  config: CloudflareWorkerConfig
}): Promise<void> {
  let existingSubdomain: string | null = null
  try {
    const existing = await runWorkerProvisioningOperation('workers-subdomain-get', () =>
      client.workers.subdomains.get({
        account_id: config.accountId
      })
    )
    existingSubdomain = existing.subdomain.trim().toLowerCase()
  } catch (error) {
    if (readCloudflareWorkerOperationStatus(error) !== 404) {
      throw error
    }
  }

  if (!existingSubdomain) {
    await runWorkerProvisioningOperation('workers-subdomain-update', () =>
      client.workers.subdomains.update({
        account_id: config.accountId,
        subdomain: config.subdomain
      })
    )
    return
  }

  if (existingSubdomain !== config.subdomain) {
    throw new Error(
      `Cloudflare account Workers subdomain is ${existingSubdomain}, expected ${config.subdomain}`
    )
  }
}

async function upsertCloudflareWorker({
  client,
  config
}: {
  client: Cloudflare
  config: CloudflareWorkerConfig
}): Promise<void> {
  const workerScript = await loadCloudflareWorkerScript()
  const scriptFile = await toFile(new TextEncoder().encode(workerScript), 'index.js', {
    type: 'application/javascript+module'
  })

  await runWorkerProvisioningOperation('workers-script-update', () =>
    client.workers.scripts.update(config.workerName, {
      account_id: config.accountId,
      files: [scriptFile],
      metadata: {
        main_module: 'index.js',
        compatibility_date: CLOUDFLARE_WORKER_COMPATIBILITY_DATE,
        bindings: [
          {
            name: 'AGENTTEAM_WORKER_PASSWORD',
            text: config.password,
            type: 'secret_text'
          }
        ],
        tags: ['agentteam-email', 'cloudflare-service-worker']
      }
    })
  )
}

async function loadCloudflareWorkerScript(): Promise<string> {
  // eslint-disable-next-line no-restricted-syntax -- Approved exception: Vite raw import loads the generated Worker build asset.
  const module = await import('@main/cloudflare-service-worker/worker.mjs?raw')
  return module.default
}

async function runWorkerProvisioningOperation<TResult>(
  operation: WorkerProvisioningOperation,
  action: () => Promise<TResult>
): Promise<TResult> {
  try {
    return await action()
  } catch (error) {
    throw new CloudflareWorkerProvisioningOperationError(operation, error)
  }
}

function cloudflareWorkerProvisioningErrorLogFields(error: unknown) {
  if (error instanceof CloudflareWorkerProvisioningOperationError) {
    return {
      causeName: createSafeDiagnosticErrorName(error.cause),
      name: createSafeDiagnosticErrorName(error),
      operation: error.operation,
      providerErrorCodes: readCloudflareProviderErrors(error.cause).flatMap((entry) =>
        entry.code === undefined ? [] : [entry.code]
      ),
      providerErrorMessages: readCloudflareProviderErrors(error.cause).flatMap((entry) =>
        entry.message === undefined ? [] : [entry.message]
      ),
      status: readErrorNumber(error.cause, 'status')
    }
  }

  return {
    message: error instanceof Error ? safeProviderErrorMessage(error.message) : undefined,
    name: createSafeDiagnosticErrorName(error),
    status: readErrorNumber(error, 'status')
  }
}

function readCloudflareProviderErrors(error: unknown): Array<{ code?: number | string; message?: string }> {
  if (!error || typeof error !== 'object') {
    return []
  }
  const errors = (error as Record<string, unknown>).errors
  if (!Array.isArray(errors)) {
    return []
  }

  return errors.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }
    const record = entry as Record<string, unknown>
    const code = typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined
    const message = typeof record.message === 'string' ? safeProviderErrorMessage(record.message) : undefined
    return code === undefined && message === undefined ? [] : [{ code, message }]
  })
}

function readErrorNumber(error: unknown, key: string): number | null {
  if (!error || typeof error !== 'object' || !(key in error)) {
    return null
  }

  const value = error[key as keyof typeof error]
  return typeof value === 'number' ? value : null
}

function readCloudflareWorkerOperationStatus(error: unknown): number | null {
  if (error instanceof CloudflareWorkerProvisioningOperationError) {
    return readErrorNumber(error.cause, 'status')
  }
  return readErrorNumber(error, 'status')
}

function safeProviderErrorMessage(message: string): string {
  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [redacted]')
    .replace(/\b(cf[a-z0-9_-]{16,}|[A-Za-z0-9+/=_-]{32,})\b/gu, '[redacted]')
    .slice(0, 240)
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}
