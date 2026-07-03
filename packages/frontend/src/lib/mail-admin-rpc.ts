import { rpc } from './rpc-api-client'
import type {
  AgentMailAdminCreateAgentResult,
  AgentMailAdminDeleteAccountResult,
  AgentMailAdminDeleteForwardingGroupResult,
  AgentMailAdminGrantPrincipalTargetInput,
  AgentMailAdminNavigation,
  AgentMailAdminRevokeAgentEnrollmentResult,
  AgentMailAdminRevokeAgentResult,
  AgentMailAdminSaveAccountResult,
  AgentMailAdminSaveAgentMailboxGrantsResult,
  AgentMailAdminSaveAgentPermissionsResult,
  AgentMailAdminSaveAgentResult,
  AgentMailAdminSaveForwardingGroupResult,
  AgentMailAdminSavePrincipalMailboxGrantsResult,
  AgentMailAdminSavePrincipalSystemPermissionsResult,
  AgentMailAdminStatusFilter,
  AgentMailAdminView
} from '@main/backend'
import type {
  MailboxAdminAccountInput,
  MailboxAdminAgentInput,
  MailboxAdminAgentMailboxGrantsInput,
  MailboxAdminAgentSystemPermissionsInput,
  MailboxAdminGroupInput
} from '../partials/authenticated/mailbox-admin-models'

export class MailAdminRPCError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'MailAdminRPCError'
  }
}

export interface MailboxAdminViewQuery {
  page?: number
  pageSize?: number
  searchQuery?: string
  section?: AgentMailAdminView['section']
  statusFilter?: AgentMailAdminStatusFilter
}

export async function fetchMailboxAdminView(query: MailboxAdminViewQuery): Promise<AgentMailAdminView> {
  const result = await rpc.mail.admin.get({ query })
  return normalizeMailboxAdminView(readMailAdminRpcResult<AgentMailAdminView>(result))
}

export async function fetchMailboxAdminNavigation(): Promise<AgentMailAdminNavigation> {
  const result = await rpc.mail.admin.navigation.get()
  return readMailAdminRpcResult<AgentMailAdminNavigation>(result)
}

export async function revokeMailboxAdminAgent(agentId: string): Promise<AgentMailAdminRevokeAgentResult> {
  const result = await rpc.mail.admin.agents({ agentId }).revoke.post()
  return readMailAdminRpcResult<AgentMailAdminRevokeAgentResult>(result)
}

export async function revokeMailboxAdminAgentEnrollment(
  enrollmentId: string
): Promise<AgentMailAdminRevokeAgentEnrollmentResult> {
  const result = await rpc.mail.admin['agent-enrollments']({ enrollmentId }).revoke.post()
  return readMailAdminRpcResult<AgentMailAdminRevokeAgentEnrollmentResult>(result)
}

export async function createMailboxAdminAccount(
  input: MailboxAdminAccountInput
): Promise<AgentMailAdminSaveAccountResult> {
  const result = await rpc.mail.admin.accounts.post(mailboxAdminAccountCreateBody(input))
  return readMailAdminRpcResult<AgentMailAdminSaveAccountResult>(result)
}

export async function updateMailboxAdminAccount({
  accountId,
  input
}: {
  accountId: string
  input: MailboxAdminAccountInput
}): Promise<AgentMailAdminSaveAccountResult> {
  const result = await rpc.mail.admin.accounts({ accountId }).patch(mailboxAdminAccountUpdateBody(input))
  return readMailAdminRpcResult<AgentMailAdminSaveAccountResult>(result)
}

export async function disableMailboxAdminAccount(
  accountId: string
): Promise<AgentMailAdminSaveAccountResult> {
  const result = await rpc.mail.admin.accounts({ accountId }).disable.post()
  return readMailAdminRpcResult<AgentMailAdminSaveAccountResult>(result)
}

export async function deleteMailboxAdminAccount(
  accountId: string
): Promise<AgentMailAdminDeleteAccountResult> {
  const result = await rpc.mail.admin.accounts({ accountId }).delete()
  return readMailAdminRpcResult<AgentMailAdminDeleteAccountResult>(result)
}

export async function createMailboxAdminAgentEnrollment(
  input: MailboxAdminAgentInput
): Promise<AgentMailAdminCreateAgentResult> {
  const result = await rpc.mail.admin.agents.post(mailboxAdminAgentBody(input))
  return normalizeMailboxAdminCreateAgentResult(readMailAdminRpcResult<AgentMailAdminCreateAgentResult>(result))
}

export async function updateMailboxAdminAgent({
  agentId,
  input
}: {
  agentId: string
  input: MailboxAdminAgentInput
}): Promise<AgentMailAdminSaveAgentResult> {
  const result = await rpc.mail.admin.agents({ agentId }).patch(mailboxAdminAgentBody(input))
  return normalizeMailboxAdminSaveAgentResult(readMailAdminRpcResult<AgentMailAdminSaveAgentResult>(result))
}

export async function updateMailboxAdminAgentSystemPermissions({
  agentId,
  input
}: {
  agentId: string
  input: MailboxAdminAgentSystemPermissionsInput
}): Promise<AgentMailAdminSaveAgentPermissionsResult> {
  const result = await rpc.mail.admin.agents({ agentId }).permissions.post({
    permissions: [...input.permissions]
  })
  return readMailAdminRpcResult<AgentMailAdminSaveAgentPermissionsResult>(result)
}

export async function updateMailboxAdminAgentMailboxGrants({
  agentId,
  input
}: {
  agentId: string
  input: MailboxAdminAgentMailboxGrantsInput
}): Promise<AgentMailAdminSaveAgentMailboxGrantsResult> {
  const result = await rpc.mail.admin.agents({ agentId })['mailbox-grants'].post({
    grants: input.grants.map((grant) => ({
      accountId: grant.accountId,
      capabilities: [...grant.capabilities]
    }))
  })
  return readMailAdminRpcResult<AgentMailAdminSaveAgentMailboxGrantsResult>(result)
}

export async function updateMailboxAdminPrincipalMailboxGrants({
  input,
  principal
}: {
  input: MailboxAdminAgentMailboxGrantsInput
  principal: AgentMailAdminGrantPrincipalTargetInput
}): Promise<AgentMailAdminSavePrincipalMailboxGrantsResult> {
  const principalRoute = rpc.mail.admin.principals({
    principalType: principal.principalType
  })({
    principalId: principal.principalId
  })
  const result = await principalRoute['mailbox-grants'].post({
    grants: input.grants.map((grant) => ({
      accountId: grant.accountId,
      capabilities: [...grant.capabilities]
    }))
  })
  return readMailAdminRpcResult<AgentMailAdminSavePrincipalMailboxGrantsResult>(result)
}

export async function updateMailboxAdminPrincipalSystemPermissions({
  input,
  principal
}: {
  input: MailboxAdminAgentSystemPermissionsInput
  principal: AgentMailAdminGrantPrincipalTargetInput
}): Promise<AgentMailAdminSavePrincipalSystemPermissionsResult> {
  const principalRoute = rpc.mail.admin.principals({
    principalType: principal.principalType
  })({
    principalId: principal.principalId
  })
  const result = await principalRoute.permissions.post({
    permissions: [...input.permissions]
  })
  return readMailAdminRpcResult<AgentMailAdminSavePrincipalSystemPermissionsResult>(result)
}

export async function createMailboxAdminGroup(
  input: MailboxAdminGroupInput
): Promise<AgentMailAdminSaveForwardingGroupResult> {
  const result = await rpc.mail.admin.groups.post(mailboxAdminGroupBody(input))
  return normalizeMailboxAdminSaveForwardingGroupResult(
    readMailAdminRpcResult<AgentMailAdminSaveForwardingGroupResult>(result)
  )
}

export async function updateMailboxAdminGroup({
  groupId,
  input
}: {
  groupId: string
  input: MailboxAdminGroupInput
}): Promise<AgentMailAdminSaveForwardingGroupResult> {
  const result = await rpc.mail.admin.groups({ groupId }).patch(mailboxAdminGroupBody(input))
  return normalizeMailboxAdminSaveForwardingGroupResult(
    readMailAdminRpcResult<AgentMailAdminSaveForwardingGroupResult>(result)
  )
}

export async function disableMailboxAdminGroup(
  groupId: string
): Promise<AgentMailAdminSaveForwardingGroupResult> {
  const result = await rpc.mail.admin.groups({ groupId }).disable.post()
  return readMailAdminRpcResult<AgentMailAdminSaveForwardingGroupResult>(result)
}

export async function deleteMailboxAdminGroup(
  groupId: string
): Promise<AgentMailAdminDeleteForwardingGroupResult> {
  const result = await rpc.mail.admin.groups({ groupId }).delete()
  return readMailAdminRpcResult<AgentMailAdminDeleteForwardingGroupResult>(result)
}

function mailboxAdminAccountCreateBody(input: MailboxAdminAccountInput) {
  return {
    address: input.address,
    agentId: input.agentId,
    grants: input.grants ? [...input.grants] : undefined,
    name: input.name,
    type: input.type
  }
}

function mailboxAdminAccountUpdateBody(input: MailboxAdminAccountInput) {
  return {
    address: input.address,
    name: input.name,
    status: input.status
  }
}

function mailboxAdminAgentBody(input: MailboxAdminAgentInput) {
  return {
    grantExpiresAt: input.grantExpiresAt ?? undefined,
    mailboxGrants: input.mailboxGrants
      ? input.mailboxGrants.map((grant) => ({
          accountId: grant.accountId,
          capabilities: [...grant.capabilities]
        }))
      : undefined,
    name: input.name,
    systemPermissions: input.systemPermissions ? [...input.systemPermissions] : undefined
  }
}

function mailboxAdminGroupBody(input: MailboxAdminGroupInput) {
  return {
    address: input.address,
    description: input.description,
    recipients: input.recipients ? [...input.recipients] : undefined,
    status: input.status
  }
}

function normalizeMailboxAdminView(view: AgentMailAdminView): AgentMailAdminView {
  const normalized = { ...view }

  if (Array.isArray(view.accounts)) {
    normalized.accounts = view.accounts.map((account) => ({
      ...account,
      lastActivity: normalizeDateLabelString(account.lastActivity)
    }))
  }
  if (Array.isArray(view.agents)) {
    normalized.agents = view.agents.map(normalizeMailboxAdminAgent)
  }
  if (Array.isArray(view.groups)) {
    normalized.groups = view.groups.map(normalizeMailboxAdminGroup)
  }
  if (Array.isArray(view.pendingEnrollments)) {
    normalized.pendingEnrollments = view.pendingEnrollments.map((enrollment) => ({
      ...enrollment,
      createdAt: normalizeDateLabelString(enrollment.createdAt),
      grantExpiresAt: normalizeNullableISOString(enrollment.grantExpiresAt),
      lastUpdated: normalizeDateLabelString(enrollment.lastUpdated),
      tokenExpiresAt: normalizeNullableISOString(enrollment.tokenExpiresAt)
    }))
  }
  if (Array.isArray(view.principals)) {
    normalized.principals = view.principals.map((principal) => ({
      ...principal,
      lastUsed: normalizeDateLabelString(principal.lastUsed)
    }))
  }

  return normalized
}

function normalizeMailboxAdminSaveAgentResult(
  result: AgentMailAdminSaveAgentResult
): AgentMailAdminSaveAgentResult {
  if (!result.agent) {
    return result
  }
  return {
    ...result,
    agent: normalizeMailboxAdminAgent(result.agent)
  }
}

function normalizeMailboxAdminCreateAgentResult(
  result: AgentMailAdminCreateAgentResult
): AgentMailAdminCreateAgentResult {
  if (!result.enrollment) {
    return result
  }
  return {
    ...result,
    enrollment: {
      ...result.enrollment,
      enrollmentTokenExpiresAt: normalizeNullableISOString(result.enrollment.enrollmentTokenExpiresAt),
      grantExpiresAt: normalizeNullableISOString(result.enrollment.grantExpiresAt)
    }
  }
}

function normalizeMailboxAdminSaveForwardingGroupResult(
  result: AgentMailAdminSaveForwardingGroupResult
): AgentMailAdminSaveForwardingGroupResult {
  if (!result.group) {
    return result
  }
  return {
    ...result,
    group: normalizeMailboxAdminGroup(result.group)
  }
}

function normalizeMailboxAdminAgent(
  agent: AgentMailAdminView['agents'][number]
): AgentMailAdminView['agents'][number] {
  return {
    ...agent,
    lastSeen: normalizeDateLabelString(agent.lastSeen)
  }
}

function normalizeMailboxAdminGroup(
  group: AgentMailAdminView['groups'][number]
): AgentMailAdminView['groups'][number] {
  return {
    ...group,
    lastDelivered: normalizeDateLabelString(group.lastDelivered),
    lastUpdated: normalizeDateLabelString(group.lastUpdated)
  }
}

function normalizeDateLabelString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    return value
  }
  return value == null ? '' : String(value)
}

function normalizeNullableISOString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return value == null ? null : String(value)
}

function readMailAdminRpcResult<TResult>(
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
    throw createMailAdminRpcError(result.error, result.status)
  }

  if (result.data === null) {
    throw createMailAdminRpcError(null, result.status)
  }

  return result.data
}

function createMailAdminRpcError(error: unknown, status: number): MailAdminRPCError {
  return new MailAdminRPCError(
    readRpcErrorMessage(error) ?? `Mailbox admin request failed with HTTP ${status}`,
    status
  )
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
