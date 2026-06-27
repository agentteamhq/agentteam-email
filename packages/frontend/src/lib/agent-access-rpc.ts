import { rpc } from './rpc-api-client'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser'
import type {
  AgentAccessApprovalPreview,
  AgentAccessMutationResult,
  AgentAccessPaperclipConnectResult,
  AgentAccessView,
  AgentMailTrialClaimDecisionResult,
  AgentMailTrialClaimTargetOrganization,
  AgentMailTrialClaimView
} from '@main/backend'
import type { AgentMailCapability } from '@main/db/agent-mail-permission-schema'

export type AgentMailTrialClaim = AgentMailTrialClaimView
export type AgentMailTrialClaimDecision = AgentMailTrialClaimDecisionResult
export type AgentMailTrialClaimTarget = AgentMailTrialClaimTargetOrganization

export class AgentAccessRPCError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: AgentAccessRPCErrorCode,
    public readonly webauthnOptions?: PublicKeyCredentialRequestOptionsJSON
  ) {
    super(message)
    this.name = 'AgentAccessRPCError'
  }
}

export type AgentAccessRPCErrorCode =
  | 'webauthn_not_enrolled'
  | 'webauthn_required'
  | 'webauthn_verification_failed'

export async function fetchAgentAccessView(): Promise<AgentAccessView> {
  const result = await rpc['agent-access'].get()
  return readAgentAccessRpcResult<AgentAccessView>(result)
}

export async function fetchAgentAccessApprovalPreview(input: {
  agentId?: string
  approvalId?: string
  userCode: string
}): Promise<AgentAccessApprovalPreview> {
  const result = await rpc['agent-access'].approvals.lookup.post(input)
  return readAgentAccessRpcResult<AgentAccessApprovalPreview>(result)
}

export async function decideAgentAccessApproval(input: {
  action: 'approve' | 'deny'
  agentId?: string
  approvalId?: string
  reason?: string
  userCode?: string
  webauthnResponse?: AuthenticationResponseJSON
}): Promise<AgentAccessMutationResult> {
  const result = await rpc['agent-access'].approvals.decision.post(input)
  return readAgentAccessRpcResult<AgentAccessMutationResult>(result)
}

export async function revokeAgentAccessAgent(agentId: string): Promise<AgentAccessMutationResult> {
  const result = await rpc['agent-access'].agents({ agentId }).revoke.post()
  return readAgentAccessRpcResult<AgentAccessMutationResult>(result)
}

export async function revokeAgentAccessCapability(input: {
  agentId: string
  capability: AgentMailCapability
  grantId?: string
}): Promise<AgentAccessMutationResult> {
  const result = await rpc['agent-access'].agents({ agentId: input.agentId }).capabilities.revoke.post({
    capabilities: [input.capability],
    grantId: input.grantId
  })
  return readAgentAccessRpcResult<AgentAccessMutationResult>(result)
}

export async function connectPaperclipAgentAccess(input: {
  companyId: string
  pluginId: 'agentteam.paperclip-email-plugin'
}): Promise<AgentAccessPaperclipConnectResult> {
  const result = await rpc['agent-access'].paperclip.connect.post(input)
  return readAgentAccessRpcResult<AgentAccessPaperclipConnectResult>(result)
}

export async function fetchAgentMailTrialClaim(token: string): Promise<AgentMailTrialClaimView> {
  const result = await rpc['agent-access'].trials.claim({ token }).get()
  return readAgentAccessRpcResult<AgentMailTrialClaimView>(result)
}

export async function decideAgentMailTrialClaim(input: {
  action: 'approve' | 'deny'
  targetOrganizationId?: string
  token: string
}): Promise<AgentMailTrialClaimDecisionResult> {
  const result = await rpc['agent-access'].trials.claim({ token: input.token }).decision.post({
    action: input.action,
    target_organization_id: input.targetOrganizationId
  })
  return readAgentAccessRpcResult<AgentMailTrialClaimDecisionResult>(result)
}

function readAgentAccessRpcResult<TResult>(
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
    throw createAgentAccessRpcError(result.error, result.status)
  }

  if (result.data === null) {
    throw createAgentAccessRpcError(null, result.status)
  }

  return result.data
}

function createAgentAccessRpcError(error: unknown, status: number): AgentAccessRPCError {
  const value = readRpcErrorValue(error)
  return new AgentAccessRPCError(
    readRpcErrorMessage(value) ?? `Agent Access request failed with HTTP ${status}`,
    status,
    readRpcErrorCode(value) ?? undefined,
    readRpcWebAuthnOptions(value) ?? undefined
  )
}

function readRpcErrorValue(error: unknown): unknown {
  if (error && typeof error === 'object' && 'value' in error) {
    return error.value
  }
  return error
}

function readRpcErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  return readRpcErrorValueMessage(error)
}

function readRpcErrorCode(error: unknown): AgentAccessRPCErrorCode | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }
  return isAgentAccessRPCErrorCode(error.code) ? error.code : null
}

function readRpcWebAuthnOptions(error: unknown): PublicKeyCredentialRequestOptionsJSON | null {
  if (!error || typeof error !== 'object' || !('webauthnOptions' in error)) {
    return null
  }
  const options = error.webauthnOptions
  return options && typeof options === 'object' && !Array.isArray(options)
    ? (options as PublicKeyCredentialRequestOptionsJSON)
    : null
}

function isAgentAccessRPCErrorCode(value: unknown): value is AgentAccessRPCErrorCode {
  return (
    value === 'webauthn_not_enrolled' ||
    value === 'webauthn_required' ||
    value === 'webauthn_verification_failed'
  )
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
