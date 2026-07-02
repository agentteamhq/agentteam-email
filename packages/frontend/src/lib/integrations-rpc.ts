import { rpc } from './rpc-api-client'
import type { IntegrationsView, RevokePaperclipIntegrationResult } from '@main/backend'

export class IntegrationsRPCError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'IntegrationsRPCError'
  }
}

export async function fetchIntegrationsView(): Promise<IntegrationsView> {
  const result = await rpc.integrations.get()
  return readIntegrationsRpcResult<IntegrationsView>(result)
}

export async function revokePaperclipIntegration(
  clientId: string
): Promise<RevokePaperclipIntegrationResult> {
  const result = await rpc.integrations.paperclip.revoke.post({ clientId })
  return readIntegrationsRpcResult<RevokePaperclipIntegrationResult>(result)
}

function readIntegrationsRpcResult<TResult>(
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
    throw new IntegrationsRPCError(
      readRpcErrorMessage(result.error) ?? `Integrations request failed with HTTP ${result.status}`,
      result.status
    )
  }

  if (result.data === null) {
    throw new IntegrationsRPCError(`Integrations request failed with HTTP ${result.status}`, result.status)
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
