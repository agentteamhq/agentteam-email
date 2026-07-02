import { z } from 'zod'

import { PRIVATE_VARS } from '../vars.private'

export interface AgentMailIngestNotification {
  schema: 'agent-mail.inbound.ingest.v1'
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

const jsonRpcResponseSchema = z.looseObject({
  jsonrpc: z.literal('2.0'),
  result: z.unknown().optional()
})

const agentMailIngestEnqueueResultSchema = z.looseObject({
  status: z.literal('enqueued'),
  ingest_id: z.string().min(1)
})

const agentMailRuntimeSyncResultSchema = z.looseObject({
  domains: z.array(
    z.looseObject({
      changed: z.boolean(),
      domain: z.unknown()
    })
  ),
  changed: z.boolean()
})

const agentMailWorkerTemporaryCredentialsSchema = z.looseObject({
  access_key_id: z.string().min(1),
  archive_prefix: z.string().min(1),
  bucket: z.string().min(1),
  endpoint: z.string().min(1),
  expires_at: z.string().min(1),
  region: z.string().min(1),
  secret_access_key: z.string().min(1),
  session_token: z.string().min(1)
})

const agentMailSendSubmitResultSchema = z.looseObject({
  status: z.string().min(1),
  idempotency_key: z.string().min(1).optional()
})

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
  return callControlRPC(
    'agentMail.ingest.enqueue',
    notification,
    parseControlResult(agentMailIngestEnqueueResultSchema)
  )
}

export async function syncAgentMailRuntime(
  domains: AgentMailRuntimeDomainProjection[]
): Promise<AgentMailRuntimeSyncResult> {
  return callControlRPC(
    'agentMail.runtime.sync',
    { domains },
    parseControlResult(agentMailRuntimeSyncResultSchema)
  )
}

export async function createAgentMailWorkerCredentials(
  input: AgentMailWorkerCredentialsInput
): Promise<AgentMailWorkerTemporaryCredentials> {
  return callControlRPC(
    'agentMail.worker.archiveCredentials.issue',
    input,
    parseControlResult(agentMailWorkerTemporaryCredentialsSchema)
  )
}

export async function submitAgentMailSend(
  input: AgentMailSendSubmitInput
): Promise<AgentMailSendSubmitResult> {
  return callControlRPC('agentMail.send.submit', input, parseControlResult(agentMailSendSubmitResultSchema))
}

async function callControlRPC<TResult>(
  method: string,
  params: unknown,
  parseResult: (value: unknown) => TResult | undefined
): Promise<TResult> {
  const { baseUrl } = requireControlAPIConfig()
  const id = crypto.randomUUID()
  const response = await fetch(new URL(`/rpc/${method}`, baseUrl), {
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    }),
    headers: {
      'content-type': 'application/json'
    },
    method: 'POST'
  })
  const payload = (await response.json().catch(() => null)) as unknown
  const result = jsonRpcResult(payload)

  if (!response.ok || result === undefined) {
    throw new AgentMailControlAPIError(method, response.status)
  }

  const parsedResult = parseResult(result)
  if (parsedResult === undefined) {
    throw new AgentMailControlAPIError(method, 502)
  }

  return parsedResult
}

export class AgentMailControlAPIError extends Error {
  readonly method: string
  readonly status: number

  constructor(method: string, status: number) {
    super(`Agent Mail control API request failed with HTTP ${status}`)
    this.name = 'AgentMailControlAPIError'
    this.method = method
    this.status = status
  }
}

function jsonRpcResult(payload: unknown): unknown {
  const parsed = jsonRpcResponseSchema.safeParse(payload)
  if (!parsed.success || !('result' in parsed.data)) {
    return undefined
  }

  return (parsed.data as JsonRpcResponse<unknown>).result
}

function parseControlResult<T>(schema: z.ZodType<T>): (value: unknown) => T | undefined {
  return (value) => {
    const parsed = schema.safeParse(value)
    return parsed.success ? parsed.data : undefined
  }
}

function requireControlAPIConfig(): { baseUrl: URL } {
  const baseUrl = PRIVATE_VARS.AT_EMAIL_ADMIN_CONTROL_API_BASE_URL

  if (!baseUrl) {
    throw new Error('Agent Mail control API is not configured')
  }

  return {
    baseUrl: new URL(baseUrl)
  }
}
