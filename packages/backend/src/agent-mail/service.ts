import { createHash, randomUUID } from 'node:crypto'
import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client'
import { AgentMailCapability } from '@main/db'
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose'
import { UUID } from 'mongodb'

import { apiKeyConfigurations } from '../auth/api-key-config'
import {
  AGENTTEAM_API_OAUTH_AUDIENCE,
  AGENTTEAM_MAIL_API_OAUTH_SCOPE,
  AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS,
  hasAgentTeamApiOAuthScope
} from '../auth/oauth-provider-config'
import { PAPERCLIP_EMAIL_PLUGIN_ID, readPaperclipOAuthClientMetadata } from '../agent-access/paperclip'
import { globals } from '../globals'

import { getAgentMailControlStatus, submitAgentMailSend } from './control-client'
import {
  agentMailCapabilityGrantOrganizationId,
  agentMailMailboxGrantOrganizationId,
  agentMailSubject,
  agentMailSystemGrantOrganizationId,
  buildAgentMailAbility
} from './permission-policy'
import type { AgentMailAbility, AgentMailPrincipal } from './permission-policy'
import type { AgentMailSendSubmitResult } from './control-client'
import type {
  AgentCapabilityGrantDocument,
  AgentDocument,
  AgentHostDocument,
  AgentId,
  AgentMailCapability as AgentMailCapabilityValue,
  AgentMailMailboxGrantDocument,
  AgentMailSystemGrantDocument,
  AgentMailTrialDocument,
  OAuthClientDocument,
  OrganizationId,
  UserId
} from '@main/db'
import type { GlobalAuth } from '../auth/auth'
import type { Auth } from 'better-auth/types'
import type { JWK, JWTPayload } from 'jose'
import type { QueryFilter } from 'mongoose'

export class AgentMailAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403
  ) {
    super(message)
    this.name = 'AgentMailAccessError'
  }
}

export function isAgentMailAccessError(error: unknown): error is AgentMailAccessError {
  return error instanceof AgentMailAccessError
}

export interface AgentMailOrganizationContext {
  ability: AgentMailAbility
  capabilityGrants: ReadonlyArray<AgentCapabilityGrantDocument>
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>
  organizationId: OrganizationId
  paperclipContext: AgentMailPaperclipContext | null
  principal: AgentMailPrincipal
  systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
  userId: UserId | null
}

export interface AgentMailPaperclipContext {
  agentId: string
  companyId: string
  operation: AgentMailPaperclipOperation
  pluginId: typeof PAPERCLIP_EMAIL_PLUGIN_ID
  projectId: string
  runId: string
}

export const AgentMailPaperclipOperationValues = [
  'status',
  'provision',
  'send',
  'search',
  'read',
  'reply'
] as const
export type AgentMailPaperclipOperation = (typeof AgentMailPaperclipOperationValues)[number]

const AGENT_AUTH_JWT_MAX_AGE_SECONDS = 60
const AGENT_AUTH_JWT_CLOCK_TOLERANCE_SECONDS = 30
const TRIAL_DAILY_SEND_WINDOW_MS = 24 * 60 * 60 * 1000
const PAPERCLIP_CONTEXT_VALUE_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/u
const AGENT_MAIL_PAPERCLIP_OPERATIONS = new Set<string>(AgentMailPaperclipOperationValues)

export interface AgentMailPublicStatus {
  controlState?: {
    configured?: boolean
    domainsActive?: number
    domainsDisabled?: number
    domainsTotal?: number
    exists?: boolean
    issues: string[]
    ok?: boolean
    schema?: string
    updatedAt?: string
  }
  dependencies: Record<
    string,
    {
      configured?: boolean
      issues: string[]
      ok?: boolean
    }
  >
  domains: Array<{
    cloudflare?: {
      catchAllConfigured?: boolean
      catchAllEnabled?: boolean
      issues: string[]
      lastProvisionAt?: string
      lastProvisionStatus?: string
      ok?: boolean
    }
    domain: string
    feedback?: {
      configured?: boolean
      ok?: boolean
      wildDuckExists?: boolean
    }
    inbound?: {
      dsnConfigured?: boolean
      provider?: string
      sweepConfigured?: boolean
    }
    issues: string[]
    outbound?: {
      configured?: boolean
      provider?: string
    }
    status: string
  }>
  generatedAt?: string
  issues: string[]
  modules: Record<
    string,
    {
      activeDomains?: number
      configured?: boolean
      issues: string[]
      lastSweepAt?: string
      maxMessageBytes?: number
      ok?: boolean
      provider?: string
      queue?: {
        blocked?: number
        completed?: number
        delivered?: number
        leased?: number
        pending?: number
        retryWait?: number
      }
    }
  >
  ok?: boolean
  provisioning?: {
    domainsApplied?: number
    domainsFailed?: number
    domainsPending?: number
    issues: string[]
    lastApplyAt?: string
    status?: string
  }
  selectedProvider?: string
  status: string
  tunnel?: {
    configured?: boolean
    issues: string[]
    ok?: boolean
  }
}

export async function getAgentMailStatusForWeb(headers: Headers): Promise<AgentMailPublicStatus> {
  const context = await requireAgentMailOrganizationContext(headers)
  requireAgentMailPaperclipOperation(context, 'status')
  if (
    context.ability.cannot(
      'status',
      agentMailSubject('Organization', { organizationId: context.organizationId })
    )
  ) {
    throw new AgentMailAccessError('Agent mail status access is not authorized', 403)
  }
  return toAgentMailPublicStatus(await getAgentMailControlStatus())
}

function toAgentMailPublicStatus(value: unknown): AgentMailPublicStatus {
  const snapshot = recordValue(value, 'Agent mail control status')
  return {
    controlState: publicControlStateStatus(snapshot.control_state),
    dependencies: publicDependencyStatuses(snapshot.dependencies),
    domains: publicDomainStatuses(snapshot.domains),
    generatedAt: dateStringValue(snapshot.generated_at),
    issues: stringArrayValue(snapshot.issues),
    modules: publicModuleStatuses(snapshot.modules),
    ok: booleanValue(snapshot.ok),
    provisioning: publicProvisioningStatus(snapshot.provisioning),
    selectedProvider: stringValue(snapshot.selected_provider),
    status: stringValue(snapshot.status) ?? 'unknown',
    tunnel: publicTunnelStatus(snapshot.tunnel)
  }
}

function publicControlStateStatus(value: unknown): AgentMailPublicStatus['controlState'] {
  if (!isRecord(value)) {
    return undefined
  }

  return compactObject({
    configured: booleanValue(value.configured),
    domainsActive: numberValue(value.domains_active),
    domainsDisabled: numberValue(value.domains_disabled),
    domainsTotal: numberValue(value.domains_total),
    exists: booleanValue(value.exists),
    issues: stringArrayValue(value.issues),
    ok: booleanValue(value.ok),
    schema: stringValue(value.schema),
    updatedAt: dateStringValue(value.updated_at)
  })
}

function publicModuleStatuses(value: unknown): AgentMailPublicStatus['modules'] {
  const modules: AgentMailPublicStatus['modules'] = {}
  if (!isRecord(value)) {
    return modules
  }

  for (const [name, moduleStatus] of Object.entries(value)) {
    if (!isRecord(moduleStatus)) {
      continue
    }
    modules[name] = compactObject({
      activeDomains: numberValue(moduleStatus.active_domains),
      configured: booleanValue(moduleStatus.configured),
      issues: stringArrayValue(moduleStatus.issues),
      lastSweepAt: dateStringValue(moduleStatus.last_sweep_at),
      maxMessageBytes: numberValue(moduleStatus.max_message_bytes),
      ok: booleanValue(moduleStatus.ok),
      provider: stringValue(moduleStatus.provider),
      queue: publicQueueStatus(moduleStatus.queue)
    })
  }

  return modules
}

function publicQueueStatus(value: unknown): AgentMailPublicStatus['modules'][string]['queue'] {
  if (!isRecord(value)) {
    return undefined
  }

  return compactObject({
    blocked: numberValue(value.blocked),
    completed: numberValue(value.completed),
    delivered: numberValue(value.delivered),
    leased: numberValue(value.leased),
    pending: numberValue(value.pending),
    retryWait: numberValue(value.retry_wait)
  })
}

function publicDependencyStatuses(value: unknown): AgentMailPublicStatus['dependencies'] {
  const dependencies: AgentMailPublicStatus['dependencies'] = {}
  if (!isRecord(value)) {
    return dependencies
  }

  for (const [name, dependencyStatus] of Object.entries(value)) {
    if (!isRecord(dependencyStatus)) {
      continue
    }
    dependencies[name] = compactObject({
      configured: booleanValue(dependencyStatus.configured),
      issues: stringArrayValue(dependencyStatus.issues),
      ok: booleanValue(dependencyStatus.ok)
    })
  }

  return dependencies
}

function publicProvisioningStatus(value: unknown): AgentMailPublicStatus['provisioning'] {
  if (!isRecord(value)) {
    return undefined
  }

  return compactObject({
    domainsApplied: numberValue(value.domains_applied),
    domainsFailed: numberValue(value.domains_failed),
    domainsPending: numberValue(value.domains_pending),
    issues: stringArrayValue(value.issues),
    lastApplyAt: dateStringValue(value.last_apply_at),
    status: stringValue(value.status)
  })
}

function publicTunnelStatus(value: unknown): AgentMailPublicStatus['tunnel'] {
  if (!isRecord(value)) {
    return undefined
  }

  return compactObject({
    configured: booleanValue(value.configured),
    issues: stringArrayValue(value.issues),
    ok: booleanValue(value.ok)
  })
}

function publicDomainStatuses(value: unknown): AgentMailPublicStatus['domains'] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((domainStatus) => {
    if (!isRecord(domainStatus)) {
      return []
    }
    const domain = stringValue(domainStatus.domain)
    if (!domain) {
      return []
    }

    return [
      {
        cloudflare: publicCloudflareStatus(domainStatus.cloudflare),
        domain,
        feedback: publicFeedbackStatus(domainStatus.feedback),
        inbound: publicInboundStatus(domainStatus.inbound),
        issues: stringArrayValue(domainStatus.issues),
        outbound: publicOutboundStatus(domainStatus.outbound),
        status: stringValue(domainStatus.status) ?? 'unknown'
      }
    ]
  })
}

function publicCloudflareStatus(value: unknown): AgentMailPublicStatus['domains'][number]['cloudflare'] {
  if (!isRecord(value)) {
    return undefined
  }

  return compactObject({
    catchAllConfigured: booleanValue(value.catch_all_configured),
    catchAllEnabled: booleanValue(value.catch_all_enabled),
    issues: stringArrayValue(value.issues),
    lastProvisionAt: dateStringValue(value.last_provision_at),
    lastProvisionStatus: stringValue(value.last_provision_status),
    ok: booleanValue(value.ok)
  })
}

function publicFeedbackStatus(value: unknown): AgentMailPublicStatus['domains'][number]['feedback'] {
  if (!isRecord(value)) {
    return undefined
  }

  return compactObject({
    configured: booleanValue(value.configured),
    ok: booleanValue(value.ok),
    wildDuckExists: booleanValue(value.wildduck_exists)
  })
}

function publicInboundStatus(value: unknown): AgentMailPublicStatus['domains'][number]['inbound'] {
  if (!isRecord(value)) {
    return undefined
  }

  return compactObject({
    dsnConfigured: booleanValue(value.dsn_configured),
    provider: stringValue(value.provider),
    sweepConfigured: booleanValue(value.sweep_configured)
  })
}

function publicOutboundStatus(value: unknown): AgentMailPublicStatus['domains'][number]['outbound'] {
  if (!isRecord(value)) {
    return undefined
  }

  return compactObject({
    configured: booleanValue(value.configured),
    provider: stringValue(value.provider)
  })
}

function compactObject<TValue extends Record<string, unknown>>(value: TValue): TValue {
  const compacted: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      compacted[key] = entry
    }
  }
  return compacted as TValue
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} response is invalid`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 240) : undefined
}

function dateStringValue(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return stringValue(value)
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    const text = publicIssueStringValue(item)
    return text ? [text] : []
  })
}

function publicIssueStringValue(value: unknown): string | undefined {
  const text = stringValue(value)
  if (!text) {
    return undefined
  }

  if (containsSensitiveOperationalDetail(text)) {
    return 'Runtime issue detected. Check server logs for details.'
  }

  return text
}

function containsSensitiveOperationalDetail(value: string) {
  return (
    /https?:\/\//iu.test(value) ||
    /mongodb(?:\+srv)?:\/\//iu.test(value) ||
    /\b(?:bearer|token|secret|password|credential|session|authorization|access[_-]?key)\b/iu.test(value) ||
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/u.test(value) ||
    /(?:^|\s)\/(?:var|etc|home|tmp|private|run|mnt|opt)\//u.test(value) ||
    /\b(?:[a-z0-9][a-z0-9-]*\.)+(?:internal|local|test|example)\b/iu.test(value) ||
    /\b(?:raw|edge|result|archive|bucket|zone|rule|configmap|namespace)[_-]?(?:key|id|uri|url|name|prefix)\b/iu.test(
      value
    )
  )
}

export async function submitAgentMailOutboundFromWeb({
  headers,
  input
}: {
  headers: Headers
  input: {
    from: string
    subject: string
    text: string
    to: string[]
  }
}): Promise<AgentMailSendSubmitResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAgentMailPaperclipOperation(context, 'send')
  const from = normalizeMailbox(input.from, 'from')
  const recipients = input.to.map((recipient) => normalizeMailbox(recipient, 'to'))
  if (recipients.length !== 1) {
    throw new Error('Exactly one recipient is currently supported')
  }
  const senderDomain = domainPart(from)
  if (
    context.ability.cannot(
      'send',
      agentMailSubject('Mailbox', {
        mailboxAddress: from,
        organizationId: context.organizationId
      })
    )
  ) {
    throw new AgentMailAccessError('Mailbox send is not authorized', 403)
  }
  if (
    context.ability.cannot(
      'send',
      agentMailSubject('Message', {
        mailboxAddress: from,
        organizationId: context.organizationId,
        recipientAddresses: recipients
      })
    )
  ) {
    throw new AgentMailAccessError('Mailbox send is not authorized', 403)
  }
  await consumeAgentMailTrialSendQuota(context, from)
  const connection = await db.models.cloudflareConnection
    .findOne({
      organizationId: context.organizationId,
      domain: senderDomain,
      status: 'active'
    })
    .exec()

  if (!connection) {
    throw new Error('Sender domain is not active')
  }

  const idempotencyKey = randomUUID()
  return submitAgentMailSend({
    idempotency_key: idempotencyKey,
    domain: senderDomain,
    from,
    to: recipients[0],
    raw: buildSimpleTextMessage({
      from,
      subject: input.subject,
      text: input.text,
      to: recipients[0]
    })
  })
}

export async function consumeAgentMailTrialSendQuota(
  context: AgentMailOrganizationContext,
  mailboxAddress: string
) {
  if (context.principal.principalType !== 'agent') {
    return
  }

  const { db } = await globals()
  const now = new Date()
  const trialFilter: QueryFilter<AgentMailTrialDocument> = {
    agentId: context.principal.principalId as AgentMailTrialDocument['agentId'],
    expiresAt: { $gt: now },
    mailboxAddress,
    status: { $in: ['active', 'claimed'] }
  }
  const trial = await db.models.agentMailTrial.findOne(trialFilter).sort({ createdAt: -1 }).exec()

  if (!trial) {
    return
  }

  const dailyWindowStartedAt = trial.dailyWindowStartedAt instanceof Date ? trial.dailyWindowStartedAt : now
  const resetDailyWindow = dailyWindowStartedAt.getTime() + TRIAL_DAILY_SEND_WINDOW_MS <= now.getTime()

  if (resetDailyWindow) {
    await db.models.agentMailTrial
      .updateOne(
        {
          _id: trial._id,
          dailyWindowStartedAt: trial.dailyWindowStartedAt
        },
        {
          $set: {
            dailySentCount: 0,
            dailyWindowStartedAt: now,
            updatedAt: now
          }
        }
      )
      .exec()
  }

  if (
    (!resetDailyWindow && trial.dailySentCount >= trial.dailySendLimit) ||
    trial.totalSentCount >= trial.totalSendLimit
  ) {
    throw new AgentMailAccessError('Agent Mail trial send quota is exhausted', 403)
  }

  const result = await db.models.agentMailTrial
    .updateOne(
      {
        _id: trial._id,
        dailySentCount: { $lt: trial.dailySendLimit },
        expiresAt: { $gt: now },
        status: { $in: ['active', 'claimed'] },
        totalSentCount: { $lt: trial.totalSendLimit }
      },
      {
        $inc: {
          dailySentCount: 1,
          totalSentCount: 1
        },
        $set: {
          updatedAt: now
        }
      }
    )
    .exec()

  if (!updateMatched(result)) {
    throw new AgentMailAccessError('Agent Mail trial send quota is exhausted', 403)
  }
}

export function requireAgentMailPaperclipOperation(
  context: AgentMailOrganizationContext,
  operation: AgentMailPaperclipOperation | ReadonlyArray<AgentMailPaperclipOperation>
) {
  const paperclipOperation = context.paperclipContext?.operation
  if (!paperclipOperation) {
    return
  }

  const allowed = typeof operation === 'string' ? [operation] : operation
  if (!allowed.includes(paperclipOperation)) {
    throw new AgentMailAccessError('Paperclip operation is not authorized', 403)
  }
}

function updateMatched(result: unknown) {
  if (!result || typeof result !== 'object') {
    return false
  }
  const record = result as {
    matchedCount?: unknown
    modifiedCount?: unknown
    n?: unknown
    nModified?: unknown
  }
  return [record.modifiedCount, record.matchedCount, record.nModified, record.n].some(
    (value) => typeof value === 'number' && value > 0
  )
}

export async function requireAgentMailOrganizationContext(
  headers: Headers
): Promise<AgentMailOrganizationContext> {
  const { auth, db } = await globals()
  const resourceBoundAgentSession = await resolveResourceBoundAgentSession({ db, headers })
  if (resourceBoundAgentSession) {
    return resourceBoundAgentSession
  }

  const nonSessionContext = await resolveNonSessionAgentMailOrganizationContext({ auth, db, headers })
  if (nonSessionContext) {
    return nonSessionContext
  }

  const agentSession = await auth.api.getAgentSession({ headers })
  if (agentSession) {
    const agentId = agentSession.agentId
    const now = new Date()
    const agent = await db.models.agent.findById(agentId).exec()
    assertActiveAgentAuthAgent(agent, now)
    const agentHost = await db.models.agentHost.findById(agent.hostId).exec()
    assertActiveAgentAuthHost(agentHost, now)

    const [mailboxGrants, systemGrants, capabilityGrants] = await Promise.all([
      db.models.agentMailMailboxGrant.find({ principalId: agentId, principalType: 'agent' }).exec(),
      db.models.agentMailSystemGrant.find({ principalId: agentId, principalType: 'agent' }).exec(),
      findAgentCapabilityGrantsForAgent(db, agentId)
    ])

    return buildAgentMailOrganizationContextForAgent({
      agent,
      capabilityGrants,
      headers,
      mailboxGrants,
      systemGrants,
      userId:
        (agentSession.userId ? (agentSession.userId as UserId) : null) ??
        (agentSession.user.id as UserId) ??
        agent.userId ??
        agentHost.userId ??
        null
    })
  }

  const session = await auth.api.getSession({ headers })
  if (!session?.user) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  return buildAgentMailOrganizationContextForUserSession({ db, headers, session })
}

async function resolveResourceBoundAgentSession({
  db,
  headers
}: {
  db: Awaited<ReturnType<typeof globals>>['db']
  headers: Headers
}): Promise<AgentMailOrganizationContext | null> {
  const token = bearerTokenFromHeaders(headers)
  if (!token) {
    return null
  }

  const decoded = decodeAgentAuthJWT(token)
  if (!decoded) {
    return null
  }

  const { payload, protectedHeader } = decoded
  if (protectedHeader.typ !== 'agent+jwt') {
    return null
  }

  const requestUrl = headers.get('x-agentteam-request-url')?.trim()
  const requestMethod = headers.get('x-agentteam-request-method')?.trim()
  if (!requestUrl || !requestMethod) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  const agentId = stringClaim(payload.sub)
  const hostId = stringClaim(payload.iss)
  if (!agentId || !hostId) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  const agent = await db.models.agent.findById(agentId).exec()
  if (!agent) {
    throw new AgentMailAccessError('Authentication required', 401)
  }
  if (String(agent.hostId) !== hostId) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  const publicKey = parseAgentAuthPublicKey(agent.publicKey)
  const verificationKey = await importJWK(publicKey, 'EdDSA')
  let verifiedPayload: JWTPayload
  try {
    const verified = await jwtVerify(token, verificationKey, {
      audience: expectedAgentAuthAudience(requestUrl),
      clockTolerance: AGENT_AUTH_JWT_CLOCK_TOLERANCE_SECONDS,
      issuer: hostId,
      maxTokenAge: `${AGENT_AUTH_JWT_MAX_AGE_SECONDS}s`,
      subject: agentId
    })
    verifiedPayload = verified.payload
  } catch {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  assertAgentJWTRequestBinding(verifiedPayload, requestMethod, requestUrl)
  await assertAgentJWTNotReplayed(db, agentId, verifiedPayload)

  const now = new Date()
  assertActiveAgentAuthAgent(agent, now)
  const agentHost = await db.models.agentHost.findById(agent.hostId).exec()
  assertActiveAgentAuthHost(agentHost, now)
  await updateAgentAuthLastUsed(db, agent._id, agent.hostId, now)

  return buildAgentMailOrganizationContextForAgent({
    agent,
    capabilityGrants: await findAgentCapabilityGrantsForAgent(db, agentId),
    headers,
    mailboxGrants: await db.models.agentMailMailboxGrant
      .find({ principalId: agentId, principalType: 'agent' })
      .exec(),
    systemGrants: await db.models.agentMailSystemGrant
      .find({ principalId: agentId, principalType: 'agent' })
      .exec(),
    userId: agent.userId ?? agentHost.userId ?? null
  })
}

async function buildAgentMailOrganizationContextForUserSession({
  db,
  headers,
  session
}: {
  db: Awaited<ReturnType<typeof globals>>['db']
  headers: Headers
  session: NonNullable<Awaited<ReturnType<GlobalAuth['api']['getSession']>>>
}): Promise<AgentMailOrganizationContext> {
  const userId = session.user.id as UserId
  const activeOrganizationId = session.session.activeOrganizationId
  const organizationId =
    typeof activeOrganizationId === 'string' && activeOrganizationId
      ? (activeOrganizationId as OrganizationId)
      : null

  if (!organizationId) {
    throw new AgentMailAccessError('An active organization is required', 403)
  }

  const member = await db.models.member.findOne({ organizationId, userId }).exec()
  if (!member) {
    throw new AgentMailAccessError('Organization access is required', 403)
  }

  const principal: AgentMailPrincipal = {
    credentialId: session.session.id,
    organizationId,
    organizationRole: member.role,
    principalId: userId,
    principalType: 'user_session',
    userId
  }
  const [mailboxGrants, systemGrants] = await Promise.all([
    db.models.agentMailMailboxGrant
      .find({ organizationId, principalId: principal.principalId, principalType: principal.principalType })
      .exec(),
    db.models.agentMailSystemGrant
      .find({ organizationId, principalId: principal.principalId, principalType: principal.principalType })
      .exec()
  ])

  return {
    ability: buildAgentMailAbility({ mailboxGrants, principal, systemGrants }),
    capabilityGrants: [],
    mailboxGrants,
    organizationId,
    paperclipContext: parseAgentMailPaperclipContext(headers),
    principal,
    systemGrants,
    userId
  }
}

function buildAgentMailOrganizationContextForAgent({
  agent,
  capabilityGrants,
  headers,
  mailboxGrants,
  systemGrants,
  userId
}: {
  agent: AgentDocument
  capabilityGrants: ReadonlyArray<AgentCapabilityGrantDocument>
  headers: Headers
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>
  systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
  userId: UserId | null
}): AgentMailOrganizationContext {
  const principal: AgentMailPrincipal = {
    credentialId: String(agent._id),
    principalId: String(agent._id),
    principalType: 'agent',
    userId
  }
  const organizationId = resolveAgentOrganization(headers, mailboxGrants, systemGrants, capabilityGrants)
  const scopedPrincipal = {
    ...principal,
    capabilities: agentCapabilityNamesForOrganization(capabilityGrants, organizationId),
    organizationId
  }

  return {
    ability: buildAgentMailAbility({
      capabilityGrants,
      mailboxGrants,
      principal: scopedPrincipal,
      systemGrants
    }),
    capabilityGrants,
    mailboxGrants,
    organizationId,
    paperclipContext: parseAgentMailPaperclipContext(headers),
    principal: scopedPrincipal,
    systemGrants,
    userId
  }
}

async function updateAgentAuthLastUsed(
  db: Awaited<ReturnType<typeof globals>>['db'],
  agentId: AgentId,
  hostId: AgentDocument['hostId'],
  now: Date
) {
  await Promise.all([
    db.models.agent
      .updateOne(
        { _id: agentId },
        {
          $set: {
            lastUsedAt: now,
            updatedAt: now
          }
        }
      )
      .exec(),
    db.models.agentHost
      .updateOne(
        { _id: hostId },
        {
          $set: {
            lastUsedAt: now,
            updatedAt: now
          }
        }
      )
      .exec()
  ])
}

function decodeAgentAuthJWT(token: string) {
  try {
    const payload = decodeJwt(token)
    const protectedHeader = decodeProtectedHeader(token)
    if (!payload || typeof payload !== 'object' || !protectedHeader || typeof protectedHeader !== 'object') {
      return null
    }
    return {
      payload,
      protectedHeader
    }
  } catch {
    return null
  }
}

function parseAgentAuthPublicKey(value: unknown): JWK {
  if (typeof value !== 'string') {
    throw new AgentMailAccessError('Authentication required', 401)
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('invalid Agent Auth public key')
    }
    return parsed
  } catch {
    throw new AgentMailAccessError('Authentication required', 401)
  }
}

async function findAgentCapabilityGrantsForAgent(
  db: Awaited<ReturnType<typeof globals>>['db'],
  agentId: string
): Promise<AgentCapabilityGrantDocument[]> {
  const model = db.models.agentCapabilityGrant
  const mongooseGrants = await model.find(agentCapabilityGrantFilter(agentId)).exec()
  const nativeFind = model.collection?.find?.bind(model.collection)
  if (!nativeFind) {
    return mongooseGrants
  }

  const nativeAgentIds: unknown[] = [agentId]
  const nativeUUID = nativeUUIDFromString(agentId)
  if (nativeUUID) {
    nativeAgentIds.push(nativeUUID)
  }

  const nativeGrants = await nativeFind({ agentId: { $in: nativeAgentIds } }).toArray()
  if (!nativeGrants.length) {
    return mongooseGrants
  }

  const grants = new Map<string, AgentCapabilityGrantDocument>()
  for (const grant of mongooseGrants) {
    grants.set(agentCapabilityGrantMapKey(grant), grant)
  }
  for (const grant of nativeGrants) {
    const hydratedGrant = model.hydrate(grant)
    grants.set(agentCapabilityGrantMapKey(hydratedGrant), hydratedGrant)
  }

  return [...grants.values()]
}

function agentCapabilityGrantFilter(agentId: string): QueryFilter<AgentCapabilityGrantDocument> {
  return {
    agentId: agentId as AgentCapabilityGrantDocument['agentId']
  }
}

function nativeUUIDFromString(value: string): UUID | null {
  try {
    return new UUID(value)
  } catch {
    return null
  }
}

function agentCapabilityGrantMapKey(
  grant: Pick<AgentCapabilityGrantDocument, '_id' | 'agentId' | 'capability'>
) {
  const documentId = grant._id ? String(grant._id) : null
  return documentId ?? `${String(grant.agentId)}:${grant.capability}`
}

function expectedAgentAuthAudience(requestUrl: string) {
  return new URL(requestUrl).origin
}

function expectedAgentAuthRequestUrl(requestUrl: string) {
  const url = new URL(requestUrl)
  return `${url.origin}${url.pathname}${url.search}`
}

function assertAgentJWTRequestBinding(payload: JWTPayload, requestMethod: string, requestUrl: string) {
  const method = typeof payload.htm === 'string' ? payload.htm : ''
  if (!method || method.toUpperCase() !== requestMethod.toUpperCase()) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  const htu = typeof payload.htu === 'string' ? payload.htu : ''
  if (!htu || htu !== expectedAgentAuthRequestUrl(requestUrl)) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  if (payload.ath) {
    throw new AgentMailAccessError('Authentication required', 401)
  }
}

async function assertAgentJWTNotReplayed(
  db: Awaited<ReturnType<typeof globals>>['db'],
  agentId: string,
  payload: JWTPayload
) {
  const jti = stringClaim(payload.jti)
  if (!jti) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  try {
    await db.models.agentJwtReplay.create({
      agentId: agentId as AgentId,
      expiresAt: agentJWTReplayExpiresAt(payload),
      jtiHash: hashAgentJWTReplayValue(jti),
      replayKey: hashAgentJWTReplayValue(`${agentId}:${jti}`)
    })
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AgentMailAccessError('Authentication required', 401)
    }
    throw error
  }
}

function agentJWTReplayExpiresAt(payload: JWTPayload): Date {
  const fallbackExpirationSeconds =
    Math.floor(Date.now() / 1000) + AGENT_AUTH_JWT_MAX_AGE_SECONDS + AGENT_AUTH_JWT_CLOCK_TOLERANCE_SECONDS
  const expirationSeconds =
    typeof payload.exp === 'number'
      ? payload.exp + AGENT_AUTH_JWT_CLOCK_TOLERANCE_SECONDS
      : fallbackExpirationSeconds
  return new Date(expirationSeconds * 1000)
}

function hashAgentJWTReplayValue(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  )
}

async function resolveNonSessionAgentMailOrganizationContext({
  auth,
  db,
  headers
}: {
  auth: GlobalAuth
  db: Awaited<ReturnType<typeof globals>>['db']
  headers: Headers
}): Promise<AgentMailOrganizationContext | null> {
  const apiKeyContext = await resolveApiKeyAgentMailOrganizationContext({ auth, db, headers })
  if (apiKeyContext) {
    return apiKeyContext
  }
  return resolveOAuthAgentMailOrganizationContext({ auth, db, headers })
}

async function resolveApiKeyAgentMailOrganizationContext({
  auth,
  db,
  headers
}: {
  auth: GlobalAuth
  db: Awaited<ReturnType<typeof globals>>['db']
  headers: Headers
}): Promise<AgentMailOrganizationContext | null> {
  const key = headers.get('x-api-key')?.trim()
  if (!key) {
    return null
  }

  const verifiedApiKey = await verifyAgentMailApiKey({ auth, headers, key })
  if (!verifiedApiKey?.valid || !verifiedApiKey.key) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  const boundOrganizationId =
    verifiedApiKey.key.configId === 'organization' ? toOrganizationId(verifiedApiKey.key.referenceId) : null
  if (verifiedApiKey.key.configId === 'organization' && !boundOrganizationId) {
    throw new AgentMailAccessError('Organization access is required', 403)
  }
  const principalId = verifiedApiKeyStoragePrincipalId(verifiedApiKey.key)

  return buildGrantBackedAgentMailOrganizationContext({
    boundOrganizationId,
    db,
    headers,
    principal: {
      credentialId: principalId,
      principalId,
      principalType: 'api_key',
      userId: null
    }
  })
}

function verifiedApiKeyStoragePrincipalId(key: { id?: unknown }): string {
  const id = stringClaim(key.id)
  if (!id) {
    throw new AgentMailAccessError('Authentication required', 401)
  }
  return id
}

async function verifyAgentMailApiKey({
  auth,
  headers,
  key
}: {
  auth: GlobalAuth
  headers: Headers
  key: string
}): Promise<Awaited<ReturnType<GlobalAuth['api']['verifyApiKey']>> | null> {
  for (const configuration of apiKeyConfigurations) {
    const verifiedApiKey = await auth.api
      .verifyApiKey({
        body: {
          configId: configuration.configId,
          key
        },
        headers
      })
      .catch(() => null)

    if (verifiedApiKey?.valid && verifiedApiKey.key) {
      return verifiedApiKey
    }
  }

  return null
}

async function resolveOAuthAgentMailOrganizationContext({
  auth,
  db,
  headers
}: {
  auth: GlobalAuth
  db: Awaited<ReturnType<typeof globals>>['db']
  headers: Headers
}): Promise<AgentMailOrganizationContext | null> {
  const token = bearerTokenFromHeaders(headers)
  if (!token) {
    return null
  }

  const claims = await oauthProviderResourceClient(auth as unknown as Auth)
    .getActions()
    .verifyAccessToken(token, {
      verifyOptions: {
        audience: AGENTTEAM_API_OAUTH_AUDIENCE
      }
    })
    .catch(() => null)
  if (!claims) {
    throw new AgentMailAccessError('Authentication required', 401)
  }
  const scopes = requireOAuthMailApiScopes(claims)

  const clientId = stringClaim(claims.azp) ?? stringClaim(claims.client_id)
  if (!clientId) {
    throw new AgentMailAccessError('Authentication required', 401)
  }
  const client = await db.models.oauthClient.findOne({ clientId }).exec()
  if (!client || client.disabled) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  const boundOrganizationId = toOrganizationId(claims[AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId])
  if (!boundOrganizationId) {
    throw new AgentMailAccessError('Organization access is required', 403)
  }
  const paperclipContext = parseAgentMailPaperclipContext(headers)
  requirePaperclipOAuthClientConnection({ client, organizationId: boundOrganizationId, paperclipContext })

  const userId = stringClaim(claims.sub)
  return buildGrantBackedAgentMailOrganizationContext({
    boundOrganizationId,
    db,
    headers,
    paperclipContext,
    principal: {
      credentialId: clientId,
      principalId: clientId,
      principalType: 'oauth_client',
      scopes,
      userId: userId ? (userId as UserId) : null
    }
  })
}

async function buildGrantBackedAgentMailOrganizationContext({
  boundOrganizationId,
  db,
  headers,
  paperclipContext,
  principal
}: {
  boundOrganizationId?: OrganizationId | null
  db: Awaited<ReturnType<typeof globals>>['db']
  headers: Headers
  paperclipContext?: AgentMailPaperclipContext | null
  principal: AgentMailPrincipal
}): Promise<AgentMailOrganizationContext> {
  const [mailboxGrants, systemGrants] = await Promise.all([
    db.models.agentMailMailboxGrant
      .find({ principalId: principal.principalId, principalType: principal.principalType })
      .exec(),
    db.models.agentMailSystemGrant
      .find({ principalId: principal.principalId, principalType: principal.principalType })
      .exec()
  ])
  const organizationId = resolveAgentOrganization(headers, mailboxGrants, systemGrants, [], {
    allowHeaderOverride: !boundOrganizationId,
    preferredOrganizationId: boundOrganizationId
  })
  const scopedPrincipal = { ...principal, organizationId }
  const scopedMailboxGrants = grantsForOrganization(mailboxGrants, organizationId)
  const scopedSystemGrants = grantsForOrganization(systemGrants, organizationId)

  return {
    ability: buildAgentMailAbility({
      mailboxGrants: scopedMailboxGrants,
      principal: scopedPrincipal,
      systemGrants: scopedSystemGrants
    }),
    capabilityGrants: [],
    mailboxGrants: scopedMailboxGrants,
    organizationId,
    paperclipContext: paperclipContext ?? parseAgentMailPaperclipContext(headers),
    principal: scopedPrincipal,
    systemGrants: scopedSystemGrants,
    userId: scopedPrincipal.userId ?? null
  }
}

function requirePaperclipOAuthClientConnection({
  client,
  organizationId,
  paperclipContext
}: {
  client: Pick<OAuthClientDocument, 'metadata' | 'referenceId' | 'softwareId'>
  organizationId: OrganizationId
  paperclipContext: AgentMailPaperclipContext | null
}) {
  const metadata = readPaperclipOAuthClientMetadata(client.metadata)
  const isPaperclipClient = metadata !== null || client.softwareId === PAPERCLIP_EMAIL_PLUGIN_ID
  if (!paperclipContext && !isPaperclipClient) {
    return
  }

  if (
    !paperclipContext ||
    !metadata ||
    metadata.companyId !== paperclipContext.companyId ||
    metadata.pluginId !== paperclipContext.pluginId ||
    client.softwareId !== paperclipContext.pluginId ||
    String(client.referenceId) !== String(organizationId)
  ) {
    throw new AgentMailAccessError('Paperclip OAuth connection is not authorized', 403)
  }
}

function parseAgentMailPaperclipContext(headers: Headers): AgentMailPaperclipContext | null {
  const agentId = paperclipContextHeaderValue(headers, 'x-agentteam-paperclip-agent-id')
  const companyId = paperclipContextHeaderValue(headers, 'x-agentteam-paperclip-company-id')
  const operation = paperclipContextHeaderValue(headers, 'x-agentteam-paperclip-operation')
  const pluginId = paperclipContextHeaderValue(headers, 'x-agentteam-paperclip-plugin-id')
  const projectId = paperclipContextHeaderValue(headers, 'x-agentteam-paperclip-project-id')
  const runId = paperclipContextHeaderValue(headers, 'x-agentteam-paperclip-run-id')

  if (
    !agentId ||
    !companyId ||
    !isAgentMailPaperclipOperation(operation) ||
    pluginId !== PAPERCLIP_EMAIL_PLUGIN_ID ||
    !projectId ||
    !runId
  ) {
    return null
  }

  return {
    agentId,
    companyId,
    operation,
    pluginId,
    projectId,
    runId
  }
}

function isAgentMailPaperclipOperation(value: string | null): value is AgentMailPaperclipOperation {
  return value !== null && AGENT_MAIL_PAPERCLIP_OPERATIONS.has(value)
}

function paperclipContextHeaderValue(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.trim()
  return value && PAPERCLIP_CONTEXT_VALUE_PATTERN.test(value) ? value : null
}

function assertActiveAgentAuthAgent(agent: AgentDocument | null, now: Date): asserts agent is AgentDocument {
  if (!agent || agent.status !== 'active' || isExpiredAt(agent.expiresAt, now)) {
    throw new AgentMailAccessError('Agent access is not active', 401)
  }
}

function assertActiveAgentAuthHost(
  agentHost: AgentHostDocument | null,
  now: Date
): asserts agentHost is AgentHostDocument {
  if (!agentHost || agentHost.status !== 'active' || isExpiredAt(agentHost.expiresAt, now)) {
    throw new AgentMailAccessError('Agent host access is not active', 401)
  }
}

function isExpiredAt(expiresAt: Date | null | undefined, now: Date) {
  return expiresAt instanceof Date && expiresAt.getTime() <= now.getTime()
}

function bearerTokenFromHeaders(headers: Headers): string | null {
  const authorization = headers.get('authorization')?.trim()
  const match = authorization?.match(/^bearer\s+(.+)$/iu)
  if (!match) {
    return null
  }
  return match[1]?.trim() || null
}

function stringClaim(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requireOAuthMailApiScopes(claims: JWTPayload): string[] {
  const scopes = [...oauthScopeValues(claims.scope)].sort()
  if (!hasAgentTeamApiOAuthScope(scopes, AGENTTEAM_MAIL_API_OAUTH_SCOPE)) {
    throw new AgentMailAccessError('OAuth token is not authorized for mail API access', 403)
  }
  return scopes
}

function oauthScopeValues(value: unknown): Set<string> {
  if (typeof value === 'string') {
    return new Set(value.split(/\s+/u).filter(Boolean))
  }

  if (Array.isArray(value)) {
    return new Set(
      value
        .filter((scope): scope is string => typeof scope === 'string' && scope.trim().length > 0)
        .map((scope) => scope.trim())
    )
  }

  return new Set()
}

function toOrganizationId(value: unknown): OrganizationId | null {
  const organizationId = stringClaim(value)
  return organizationId ? (organizationId as OrganizationId) : null
}

function resolveAgentOrganization(
  headers: Headers,
  mailboxGrants: ReadonlyArray<
    Pick<AgentMailMailboxGrantDocument, 'constraints' | 'expiresAt' | 'organizationId' | 'status'>
  >,
  systemGrants: ReadonlyArray<
    Pick<AgentMailSystemGrantDocument, 'constraints' | 'expiresAt' | 'organizationId' | 'status'>
  >,
  capabilityGrants: ReadonlyArray<
    Pick<AgentCapabilityGrantDocument, 'capability' | 'constraints' | 'expiresAt' | 'status'>
  >,
  {
    allowHeaderOverride = true,
    preferredOrganizationId = null
  }: {
    allowHeaderOverride?: boolean
    preferredOrganizationId?: OrganizationId | null
  } = {}
): OrganizationId {
  const headerOrganizationId = headers.get('x-agentteam-organization-id')?.trim() || null
  const preferredOrganizationIdString = stringClaim(preferredOrganizationId)
  if (
    !allowHeaderOverride &&
    headerOrganizationId &&
    preferredOrganizationIdString &&
    headerOrganizationId !== preferredOrganizationIdString
  ) {
    throw new AgentMailAccessError('Organization access is required', 403)
  }
  const requestedOrganizationId = allowHeaderOverride
    ? (headerOrganizationId ?? preferredOrganizationIdString)
    : preferredOrganizationIdString
  const organizationIds = new Map<string, OrganizationId>()
  const now = new Date()

  for (const grant of mailboxGrants) {
    const organizationId = agentMailMailboxGrantOrganizationId(grant, now)
    if (organizationId) {
      organizationIds.set(String(organizationId), organizationId)
    }
  }

  for (const grant of systemGrants) {
    const organizationId = agentMailSystemGrantOrganizationId(grant, now)
    if (organizationId) {
      organizationIds.set(String(organizationId), organizationId)
    }
  }

  for (const grant of capabilityGrants) {
    const organizationId = agentMailCapabilityGrantOrganizationId(grant, now)
    if (organizationId) {
      organizationIds.set(String(organizationId), organizationId)
    }
  }

  if (requestedOrganizationId) {
    const matchedOrganizationId = organizationIds.get(requestedOrganizationId)
    if (!matchedOrganizationId) {
      throw new AgentMailAccessError('Organization access is required', 403)
    }
    return matchedOrganizationId
  }

  if (organizationIds.size !== 1) {
    throw new AgentMailAccessError('A granted organization is required', 403)
  }

  const [organizationId] = organizationIds.values()
  if (!organizationId) {
    throw new AgentMailAccessError('A granted organization is required', 403)
  }
  return organizationId
}

function grantsForOrganization<TGrant extends { organizationId: OrganizationId }>(
  grants: ReadonlyArray<TGrant>,
  organizationId: OrganizationId
): TGrant[] {
  return grants.filter((grant) => String(grant.organizationId) === String(organizationId))
}

function agentCapabilityNamesForOrganization(
  capabilityGrants: ReadonlyArray<
    Pick<AgentCapabilityGrantDocument, 'capability' | 'constraints' | 'expiresAt' | 'status'>
  >,
  organizationId: OrganizationId
): AgentMailCapabilityValue[] {
  const capabilities = new Set<AgentMailCapabilityValue>()
  const now = new Date()
  for (const grant of capabilityGrants) {
    if (String(agentMailCapabilityGrantOrganizationId(grant, now)) !== String(organizationId)) {
      continue
    }
    const capability = AgentMailCapability.safeParse(grant.capability)
    if (capability.success) {
      capabilities.add(capability.data)
    }
  }
  return [...capabilities].sort()
}

function buildSimpleTextMessage({
  from,
  subject,
  text,
  to
}: {
  from: string
  subject: string
  text: string
  to: string
}): string {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${sanitizeHeaderValue(subject, 'subject')}`,
    `Message-ID: <${randomUUID()}@agentteam.email>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalizeTextBody(text)
  ].join('\r\n')
}

function normalizeMailbox(value: string, label: string): string {
  const normalized = value.trim().toLowerCase()
  if (/[<>\r\n]/u.test(normalized) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(normalized)) {
    throw new Error(`${label} must be a valid mailbox`)
  }
  return normalized
}

function domainPart(mailbox: string): string {
  const at = mailbox.lastIndexOf('@')
  if (at < 0 || at === mailbox.length - 1) {
    throw new Error('Mailbox is missing a domain')
  }
  return mailbox.slice(at + 1).toLowerCase()
}

function sanitizeHeaderValue(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized || /[\r\n]/u.test(normalized)) {
    throw new Error(`${label} must be a non-empty single-line value`)
  }
  return normalized
}

function normalizeTextBody(value: string): string {
  const normalized = value.replace(/\r?\n/gu, '\r\n')
  if (!normalized.trim()) {
    throw new Error('text must be non-empty')
  }
  return normalized
}
