import { PRIVATE_VARS } from '../vars.private'

export interface AgentMailIngestNotification {
  schema: 'agent-mail.inbound.fastpath.v1'
  ingest_id: string
  organization_id?: string
  organization_public_id?: string
  archive_prefix?: string
  worker_connection_id?: string
  worker_domain_deployment_id?: string
  recipient_domain: string
  raw_key: string
  edge_key: string
  result_key: string
  received_at: string
  raw_sha256: string
}

interface JsonRpcResponse<TResult> extends Record<string, unknown> {
  jsonrpc: '2.0'
  id?: string
  result?: TResult
  error?: unknown
}

export interface AgentMailIngestEnqueueResult {
  status: 'enqueued'
  ingest_id: string
}

export interface AgentMailRuntimeDomainProjection {
  organization_id: string
  organization_public_id: string
  archive_prefix: string
  worker_connection_id: string
  worker_domain_deployment_id: string
  domain: string
  enabled: boolean
  cloudflare_zone_name: string
  mail_from_domain: string
}

export interface AgentMailRuntimeSyncResult {
  domains: Array<{
    changed: boolean
    domain: unknown
  }>
  changed: boolean
}

export interface AgentMailWorkerCredentialsInput {
  organization_id: string
  organization_public_id: string
  domain: string
  archive_prefix: string
  worker_connection_id: string
  worker_domain_deployment_id: string
}

export interface AgentMailWorkerTemporaryCredentials {
  access_key_id: string
  archive_prefix: string
  bucket: string
  endpoint: string
  expires_at: string
  region: string
  secret_access_key: string
  session_token: string
}

export interface AgentMailSendSubmitInput {
  idempotency_key: string
  domain: string
  from: string
  to: string
  raw: string
}

export interface AgentMailSendSubmitResult {
  status: string
  idempotency_key?: string
}

export async function enqueueAgentMailIngest(
  notification: AgentMailIngestNotification
): Promise<AgentMailIngestEnqueueResult> {
  return callControlRPC<AgentMailIngestEnqueueResult>('agentMail.ingest.enqueue', notification)
}

export async function getAgentMailControlStatus(): Promise<unknown> {
  return callControlRPC('agentMail.status.get', { include_source_files: false })
}

export async function syncAgentMailRuntime(
  domains: AgentMailRuntimeDomainProjection[]
): Promise<AgentMailRuntimeSyncResult> {
  return callControlRPC<AgentMailRuntimeSyncResult>('agentMail.runtime.sync', { domains })
}

export async function createAgentMailWorkerCredentials(
  input: AgentMailWorkerCredentialsInput
): Promise<AgentMailWorkerTemporaryCredentials> {
  return callControlRPC<AgentMailWorkerTemporaryCredentials>(
    'agentMail.worker.archiveCredentials.issue',
    input
  )
}

export async function submitAgentMailSend(
  input: AgentMailSendSubmitInput
): Promise<AgentMailSendSubmitResult> {
  return callControlRPC<AgentMailSendSubmitResult>('agentMail.send.submit', input)
}

async function callControlRPC<TResult>(method: string, params: unknown): Promise<TResult> {
  const { baseUrl, token } = requireControlAPIConfig()
  const id = crypto.randomUUID()
  const response = await fetch(new URL(`/rpc/${method}`, baseUrl), {
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    }),
    headers: {
      'content-type': 'application/json',
      'x-agent-mail-control-token': token
    },
    method: 'POST'
  })
  const payload = (await response.json().catch(() => null)) as unknown
  const result = jsonRpcResult<TResult>(payload)

  if (!response.ok || result === undefined) {
    const detail = controlAPIErrorDetail(payload)
    throw new Error(
      `Agent Mail control API ${method} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`
    )
  }

  return result
}

function jsonRpcResult<TResult>(payload: unknown): TResult | undefined {
  if (!isRecord(payload) || !('result' in payload)) {
    return undefined
  }

  return (payload as JsonRpcResponse<TResult>).result
}

function controlAPIErrorDetail(payload: unknown): string {
  if (!isRecord(payload)) {
    return ''
  }

  const values = [
    stringValue(payload.title),
    stringValue(payload.detail),
    stringValue(payload.message),
    jsonRpcErrorMessage(payload.error)
  ].filter(Boolean)

  return sanitizeControlErrorDetail(values.join(': '))
}

function jsonRpcErrorMessage(value: unknown): string {
  if (!isRecord(value)) {
    return typeof value === 'string' ? value : ''
  }

  return stringValue(value.message) || stringValue(value.detail) || stringValue(value.title)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function sanitizeControlErrorDetail(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, 240)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function requireControlAPIConfig(): { baseUrl: URL; token: string } {
  const baseUrl = PRIVATE_VARS.AGENT_MAIL_CONTROL_API_BASE_URL
  const token = PRIVATE_VARS.AGENT_MAIL_CONTROL_API_TOKEN

  if (!baseUrl || !token) {
    throw new Error('Agent Mail control API is not configured')
  }

  return {
    baseUrl: new URL(baseUrl),
    token
  }
}
