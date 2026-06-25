import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'

import { PLUGIN_ID } from './constants'
import type { JsonSchema, PluginToolDeclaration, ToolResult, ToolRunContext } from '@paperclipai/plugin-sdk'
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'

export const EMAIL_TOOL_NAME = 'email'
export const PAPERCLIP_TOOL_SCHEMA = 'agentteam-email.paperclip-tool.v1'
export const DEFAULT_AT_EMAIL_CLI_COMMAND = 'at-email'
export const DEFAULT_AT_EMAIL_CLI_TIMEOUT_MS = 30_000
const MAX_CLI_OUTPUT_BYTES = 1024 * 1024

export const EmailToolOperationValues = ['status', 'provision', 'send', 'search', 'read', 'reply'] as const
export type EmailToolOperation = (typeof EmailToolOperationValues)[number]

const knownParameterKeys = [
  'bcc',
  'body',
  'cc',
  'dryRun',
  'limit',
  'mailbox',
  'messageId',
  'name',
  'operation',
  'query',
  'subject',
  'threadId',
  'to'
] as const

const emailParameterSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation'],
  properties: {
    bcc: { type: 'array', items: { type: 'string' } },
    body: { type: 'string' },
    cc: { type: 'array', items: { type: 'string' } },
    dryRun: { type: 'boolean' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
    mailbox: { type: 'string' },
    messageId: { type: 'string' },
    name: { type: 'string', maxLength: 128 },
    operation: {
      type: 'string',
      enum: EmailToolOperationValues
    },
    query: { type: 'string' },
    subject: { type: 'string' },
    threadId: { type: 'string' },
    to: { type: 'array', items: { type: 'string' } }
  }
} satisfies JsonSchema

export const EMAIL_TOOL_DECLARATION = {
  name: EMAIL_TOOL_NAME,
  displayName: 'Email',
  description: 'Use AgentTeam Email for the current agent mailbox.',
  parametersSchema: emailParameterSchema
} satisfies PluginToolDeclaration

export interface EmailToolInput {
  bcc?: string[]
  body?: string
  cc?: string[]
  dryRun?: boolean
  limit?: number
  mailbox?: string
  messageId?: string
  name?: string
  operation: EmailToolOperation
  query?: string
  subject?: string
  threadId?: string
  to?: string[]
}

export interface AgentTeamEmailPaperclipToolEnvelope {
  context: {
    agentId: string
    companyId: string
    pluginId: string
    projectId: string
    runId: string
  }
  operation: EmailToolOperation
  parameters: Omit<EmailToolInput, 'operation'>
  schema: typeof PAPERCLIP_TOOL_SCHEMA
}

export interface AgentTeamEmailCliOptions {
  args?: readonly string[]
  command?: string
  env?: Readonly<Record<string, string | undefined>>
  timeoutMs?: number
}

export type AgentTeamEmailCliExecutor = (
  envelope: AgentTeamEmailPaperclipToolEnvelope,
  options?: AgentTeamEmailCliOptions
) => Promise<ToolResult>

export interface EmailToolHandlerOptions {
  cliOptions?: AgentTeamEmailCliOptions
  runCli?: AgentTeamEmailCliExecutor
}

interface ValidationError {
  error: string
}

type ValidationResult = { error: string; ok: false } | { ok: true; value: EmailToolInput }

interface CliOutputEnvelope {
  content?: string
  data?: unknown
  error?: string
  ok: boolean
}

export function createEmailToolHandler(options: EmailToolHandlerOptions = {}) {
  const runCli = options.runCli ?? runAgentTeamEmailCli
  return async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
    const validation = validateEmailToolInput(params)
    if (!validation.ok) {
      return { error: validation.error }
    }

    const envelope = buildAgentTeamEmailToolEnvelope(validation.value, runCtx)
    return runCli(envelope, options.cliOptions)
  }
}

export function buildAgentTeamEmailToolEnvelope(
  input: EmailToolInput,
  runCtx: ToolRunContext
): AgentTeamEmailPaperclipToolEnvelope {
  const { operation, ...parameters } = input
  return {
    schema: PAPERCLIP_TOOL_SCHEMA,
    operation,
    context: {
      agentId: runCtx.agentId,
      companyId: runCtx.companyId,
      pluginId: PLUGIN_ID,
      projectId: runCtx.projectId,
      runId: runCtx.runId
    },
    parameters
  }
}

export function buildAgentTeamEmailCliCommand(options: AgentTeamEmailCliOptions = {}) {
  return {
    command: options.command ?? DEFAULT_AT_EMAIL_CLI_COMMAND,
    args: [...(options.args ?? []), 'paperclip-tool', '--json']
  }
}

export async function runAgentTeamEmailCli(
  envelope: AgentTeamEmailPaperclipToolEnvelope,
  options: AgentTeamEmailCliOptions = {}
): Promise<ToolResult> {
  const { command, args } = buildAgentTeamEmailCliCommand(options)
  const timeoutMs = options.timeoutMs ?? DEFAULT_AT_EMAIL_CLI_TIMEOUT_MS
  const child = spawn(command, args, {
    env: {
      ...process.env,
      ...options.env
    },
    shell: false
  } satisfies SpawnOptionsWithoutStdio)

  return await runCliProcess(child, JSON.stringify(envelope), timeoutMs)
}

export function mapCliOutputToToolResult(output: unknown): ToolResult {
  if (!isCliOutputEnvelope(output)) {
    return { error: 'AgentTeam Email CLI returned an invalid response.' }
  }

  if (!output.ok) {
    return { error: redactDiagnosticText(output.error ?? 'AgentTeam Email rejected the request.') }
  }

  return {
    content: typeof output.content === 'string' ? output.content : '',
    data: output.data
  }
}

export function redactDiagnosticText(value: string): string {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/giu, '$1[REDACTED]')
    .replace(/(bearer\s+)[^\s,;]+/giu, '$1[REDACTED]')
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[=:]\s*)[^\s,;]+/giu,
      '$1[REDACTED]'
    )
}

function validateEmailToolInput(params: unknown): ValidationResult {
  if (!isPlainObject(params)) {
    return { error: 'Email tool input must be an object.', ok: false }
  }

  const extraKeys = Object.keys(params).filter(
    (key) => !knownParameterKeys.includes(key as (typeof knownParameterKeys)[number])
  )
  if (extraKeys.length > 0) {
    return { error: `Email tool input contains unsupported field: ${extraKeys[0]}.`, ok: false }
  }

  const operation = readOperation(params.operation)
  if (!operation) {
    return { error: 'Email tool operation is required.', ok: false }
  }

  const normalized: EmailToolInput = { operation }

  const optionalStringFields = [
    'body',
    'mailbox',
    'messageId',
    'name',
    'query',
    'subject',
    'threadId'
  ] as const
  for (const key of optionalStringFields) {
    const value = readOptionalString(params[key], key)
    if (isValidationError(value)) {
      return { error: value.error, ok: false }
    }
    if (key === 'name' && value && value.length > 128) {
      return { error: 'Email tool field name must be 128 characters or fewer.', ok: false }
    }
    if (value) {
      normalized[key] = value
    }
  }

  for (const key of ['bcc', 'cc', 'to'] as const) {
    const value = readOptionalEmailList(params[key], key)
    if (isValidationError(value)) {
      return { error: value.error, ok: false }
    }
    if (value) {
      normalized[key] = value
    }
  }

  const limit = readOptionalLimit(params.limit)
  if (isValidationError(limit)) {
    return { error: limit.error, ok: false }
  }
  if (limit) {
    normalized.limit = limit
  }

  const dryRun = readOptionalBoolean(params.dryRun, 'dryRun')
  if (isValidationError(dryRun)) {
    return { error: dryRun.error, ok: false }
  }
  if (dryRun !== undefined) {
    normalized.dryRun = dryRun
  }

  return validateOperationRequirements(normalized)
}

function validateOperationRequirements(input: EmailToolInput): ValidationResult {
  if (input.operation === 'send') {
    if (!input.to?.length) {
      return { error: 'Email send requires at least one recipient in to.', ok: false }
    }
    if (!input.subject) {
      return { error: 'Email send requires subject.', ok: false }
    }
    if (!input.body) {
      return { error: 'Email send requires body.', ok: false }
    }
  }

  if (input.operation === 'search' && !input.query) {
    return { error: 'Email search requires query.', ok: false }
  }

  if (input.operation === 'provision') {
    if (!input.mailbox) {
      return { error: 'Email provision requires mailbox.', ok: false }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.mailbox)) {
      return { error: 'Email provision requires mailbox to be an email address.', ok: false }
    }
  }

  if (input.operation === 'read' && !input.messageId && !input.threadId) {
    return { error: 'Email read requires messageId or threadId.', ok: false }
  }

  if (input.operation === 'reply') {
    if (!input.messageId && !input.threadId) {
      return { error: 'Email reply requires messageId or threadId.', ok: false }
    }
    if (!input.body) {
      return { error: 'Email reply requires body.', ok: false }
    }
  }

  return { ok: true, value: input }
}

function readOperation(value: unknown): EmailToolOperation | null {
  if (typeof value !== 'string') {
    return null
  }
  return EmailToolOperationValues.includes(value as EmailToolOperation) ? (value as EmailToolOperation) : null
}

function readOptionalString(value: unknown, key: string): string | ValidationError | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    return { error: `Email tool field ${key} must be a string.` }
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return { error: `Email tool field ${key} must not be empty.` }
  }
  return trimmed
}

function readOptionalEmailList(value: unknown, key: string): string[] | ValidationError | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    return { error: `Email tool field ${key} must be an array.` }
  }
  const values: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      return { error: `Email tool field ${key} must contain only strings.` }
    }
    const normalized = item.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
      return { error: `Email tool field ${key} contains an invalid email address.` }
    }
    values.push(normalized)
  }
  return values
}

function readOptionalLimit(value: unknown): number | ValidationError | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 50) {
    return { error: 'Email tool field limit must be an integer from 1 to 50.' }
  }
  return value
}

function readOptionalBoolean(value: unknown, key: string): boolean | ValidationError | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'boolean') {
    return { error: `Email tool field ${key} must be a boolean.` }
  }
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function runCliProcess(
  child: ChildProcessWithoutNullStreams,
  stdinPayload: string,
  timeoutMs: number
): Promise<ToolResult> {
  let stdout = ''
  let stderr = ''
  let killedForTimeout = false

  const result = await new Promise<ToolResult>((resolve) => {
    let settled = false
    const finish = (toolResult: ToolResult) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(toolResult)
    }
    const timeout = setTimeout(() => {
      killedForTimeout = true
      child.kill('SIGTERM')
      finish({ error: 'AgentTeam Email CLI timed out.' })
    }, timeoutMs)
    timeout.unref()

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendBoundedOutput(stdout, chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendBoundedOutput(stderr, chunk)
    })
    child.on('error', (error) => {
      finish({ error: redactDiagnosticText(`AgentTeam Email CLI failed to start: ${error.message}`) })
    })
    child.on('close', (code) => {
      if (killedForTimeout) {
        finish({ error: 'AgentTeam Email CLI timed out.' })
        return
      }
      const parsed = parseCliOutput(stdout)
      if (parsed) {
        finish(mapCliOutputToToolResult(parsed))
        return
      }
      if (code === 0) {
        finish({ error: 'AgentTeam Email CLI returned an invalid response.' })
        return
      }
      finish({ error: redactDiagnosticText(`AgentTeam Email CLI failed: ${stderr || 'non-zero exit'}`) })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(`${stdinPayload}\n`)
  })

  return result
}

function appendBoundedOutput(current: string, chunk: Buffer): string {
  if (Buffer.byteLength(current, 'utf8') >= MAX_CLI_OUTPUT_BYTES) {
    return current
  }
  return `${current}${chunk.toString('utf8')}`.slice(0, MAX_CLI_OUTPUT_BYTES)
}

function parseCliOutput(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function isCliOutputEnvelope(value: unknown): value is CliOutputEnvelope {
  return isPlainObject(value) && typeof value.ok === 'boolean'
}

function isValidationError(value: unknown): value is ValidationError {
  return isPlainObject(value) && typeof value.error === 'string'
}
