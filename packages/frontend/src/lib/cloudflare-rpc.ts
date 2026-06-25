import { rpc } from './rpc-api-client'
import type {
  CloudflareAccountSummary,
  CloudflareConnectionInput,
  CloudflareStatusResult,
  CloudflareZoneSummary,
  FinalizeCloudflareOAuthResult
} from '@main/backend'

export class CloudflareRPCError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'CloudflareRPCError'
  }
}

export async function fetchCloudflareStatus(): Promise<CloudflareStatusResult> {
  const result = await rpc.cloudflare.status.get()
  return readCloudflareRpcResult<CloudflareStatusResult>(result)
}

export async function startCloudflareOAuth(): Promise<{ redirectUrl: string }> {
  const result = await rpc.cloudflare.oauth.start.post()
  return readCloudflareRpcResult<{ redirectUrl: string }>(result)
}

export async function finalizeCloudflareOAuth(
  intentPublicId: string
): Promise<FinalizeCloudflareOAuthResult> {
  const result = await rpc.cloudflare.oauth.finalize.post({ intentPublicId })
  return readCloudflareRpcResult<FinalizeCloudflareOAuthResult>(result)
}

export async function fetchCloudflareAccounts(): Promise<readonly CloudflareAccountSummary[]> {
  const result = await rpc.cloudflare.accounts.get()
  return readCloudflareRpcResult<{ accounts: CloudflareAccountSummary[] }>(result).accounts
}

export async function fetchCloudflareZones(accountId?: string): Promise<readonly CloudflareZoneSummary[]> {
  const result = await rpc.cloudflare.zones.get({ query: { accountId } })
  return readCloudflareRpcResult<{ zones: CloudflareZoneSummary[] }>(result).zones
}

export async function connectCloudflareDomain(
  input: CloudflareConnectionInput
): Promise<CloudflareStatusResult> {
  const result = await rpc.cloudflare.connections.post(input)
  readCloudflareRpcResult<{ connection: CloudflareStatusResult['connections'][number] }>(result)
  return fetchCloudflareStatus()
}

export async function provisionCloudflareConnection(
  connectionPublicId: string
): Promise<CloudflareStatusResult> {
  const result = await rpc.cloudflare.connections({ connectionPublicId }).provision.post()
  readCloudflareRpcResult<{ connection: CloudflareStatusResult['connections'][number] }>(result)
  return fetchCloudflareStatus()
}

export async function disconnectCloudflareConnection(
  grantPublicId?: string
): Promise<CloudflareStatusResult> {
  const result = await rpc.cloudflare.disconnect.post({ grantPublicId })
  return readCloudflareRpcResult<CloudflareStatusResult>(result)
}

function readCloudflareRpcResult<TResult>(
  result:
    | {
        data: TResult
        error: null
        status: number
      }
    | {
        data: null
        error: unknown
        status: number
      }
): TResult {
  if (result.error) {
    throw new CloudflareRPCError(
      readRpcErrorMessage(result.error) ?? `Cloudflare request failed with HTTP ${result.status}`,
      result.status
    )
  }

  if (result.data === null) {
    throw new CloudflareRPCError(`Cloudflare request failed with HTTP ${result.status}`, result.status)
  }

  return result.data
}

function readRpcErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  if ('value' in error) {
    const valueMessage = readRpcErrorValueMessage(error.value)
    if (valueMessage) {
      return valueMessage
    }
  }

  return readRpcErrorValueMessage(error)
}

function readRpcErrorValueMessage(value: unknown): string | null {
  if (value instanceof Error && value.message.trim()) {
    return value.message
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const maybeMessage = 'message' in value ? value.message : null
  if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
    return maybeMessage
  }

  const maybeError = 'error' in value ? value.error : null
  if (typeof maybeError === 'string' && maybeError.trim()) {
    return maybeError
  }

  return null
}
