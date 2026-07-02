import { createHash } from 'node:crypto'
import {
  AgentMailCapabilityByMailboxGrant,
  AgentMailCapabilityBySystemPermission,
  AgentMailCapability as AgentMailCapabilitySchema,
  AgentMailMailboxCapabilityGrantConstraints,
  AgentMailMailboxCapabilityRequestConstraints,
  AgentMailOrganizationCapabilityGrantConstraints,
  AgentMailOrganizationCapabilityRequestConstraints,
  agentMailCapabilityCatalog,
  base62UUIDv7ToUUIDv7,
  normalizeMongooseUUIDv7,
  parseBase62UUIDv7,
  publicIdFromUUIDv7
} from '@main/db'
import { parseUUIDv7 } from '@main/common'
import { z } from 'zod'

import { globals } from '../globals'
import { agentMailSubject, buildAgentMailAbility } from '../agent-mail/permission-policy'
import { AGENT_AUTH_CAPABILITIES } from '../auth/agent-auth-config'
import type { AgentMailPrincipal } from '../agent-mail/permission-policy'
import type {
  AgentAuthAgentStatus,
  AgentAuthApprovalMethod,
  AgentAuthApprovalStatus,
  AgentAuthGrantStatus,
  AgentAuthHostStatus,
  AgentAuthMode,
  AgentCapabilityGrantDocument,
  AgentCapabilityGrantId,
  AgentDocument,
  AgentHostDocument,
  AgentId,
  AgentMailCapability,
  AgentMailCapabilityCatalog,
  AgentMailMailboxGrantDocument,
  AgentMailSystemGrantDocument,
  ApprovalRequestDocument,
  ApprovalRequestId,
  OrganizationId,
  UserId
} from '@main/db'
import type { Database } from '../db/db'
import type { GlobalAuth } from '../auth/auth'
import type { ApprovalStrength } from '@better-auth/agent-auth'
import type { ClientSession } from 'mongoose'

export class AgentAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 412 | 502,
    public readonly details: AgentAccessErrorDetails = {}
  ) {
    super(message)
    this.name = 'AgentAccessError'
  }
}

export interface AgentAccessErrorDetails {
  code?: AgentAccessPublicErrorCode
  webauthnOptions?: Record<string, unknown>
}

export type AgentAccessPublicErrorCode =
  | 'webauthn_not_enrolled'
  | 'webauthn_required'
  | 'webauthn_verification_failed'

export function isAgentAccessError(error: unknown): error is AgentAccessError {
  return error instanceof AgentAccessError
}

export interface AgentAccessHost {
  activatedAt: string | null
  agentCount: number
  createdAt: string | null
  defaultCapabilities: ReadonlyArray<AgentMailCapability>
  expiresAt: string | null
  id: string
  lastUsedAt: string | null
  name: string
  organizationId: string
  status: AgentAuthHostStatus
}

export interface AgentAccessAgent {
  activatedAt: string | null
  activeCapabilityCount: number
  canRevoke: boolean
  createdAt: string | null
  expiresAt: string | null
  hostId: string
  id: string
  lastUsedAt: string | null
  mode: AgentAuthMode
  name: string
  organizationId: string
  pendingCapabilityCount: number
  status: AgentAuthAgentStatus
}

export interface AgentAccessUserActor {
  id: string
  type: 'user'
}

export interface AgentAccessGrant {
  agentId: string
  canRevoke: boolean
  capability: AgentMailCapability
  constraints: Record<string, unknown> | null
  createdAt: string | null
  deniedBy: AgentAccessUserActor | null
  deniedByUser: boolean
  expiresAt: string | null
  grantedBy: AgentAccessUserActor | null
  grantedByUser: boolean
  id: string
  organizationId: string | null
  reason: string | null
  status: AgentAuthGrantStatus
}

export interface AgentAccessApprovalCapability {
  approvalStrength: ApprovalStrength
  capability: AgentMailCapability
  constraints: Record<string, unknown> | null
  reason: string | null
}

export interface AgentAccessApproval {
  agentId: string | null
  bindingMessage: string | null
  canDeny: boolean
  canReview: boolean
  capabilityRequests: ReadonlyArray<AgentAccessApprovalCapability>
  capabilities: ReadonlyArray<AgentMailCapability>
  createdAt: string | null
  expiresAt: string | null
  hostId: string | null
  id: string
  method: AgentAuthApprovalMethod
  status: AgentAuthApprovalStatus
}

export interface AgentAccessAllowedActions {
  denyApproval: boolean
  reviewApproval: boolean
  revokeAgent: boolean
  revokeCapabilityGrant: boolean
}

export interface AgentAccessView {
  agents: ReadonlyArray<AgentAccessAgent>
  allowedActions: AgentAccessAllowedActions
  approvals: ReadonlyArray<AgentAccessApproval>
  capabilityCatalog: AgentMailCapabilityCatalog
  grants: ReadonlyArray<AgentAccessGrant>
  hosts: ReadonlyArray<AgentAccessHost>
  organizationId: string
  state: 'empty' | 'ready'
}

export interface AgentAccessApprovalPreview {
  approval: AgentAccessApproval
  capabilityCatalog: AgentMailCapabilityCatalog
  organizationId: string
}

export interface AgentAccessMutationResult {
  status: string | null
  success: true
  view: AgentAccessView
}

export const AgentAccessApprovalLookupInput = z
  .object({
    agentId: z.string().min(1).optional(),
    approvalId: z.string().min(1).optional(),
    userCode: z.string().min(1).max(128)
  })
  .strict()
export type AgentAccessApprovalLookupInput = Readonly<z.infer<typeof AgentAccessApprovalLookupInput>>

export const AgentAccessApprovalDecisionInput = z
  .object({
    action: z.enum(['approve', 'deny']),
    agentId: z.string().min(1).optional(),
    approvalId: z.string().min(1).optional(),
    capabilities: z.array(AgentMailCapabilitySchema).min(1).optional(),
    reason: z.string().max(512).optional(),
    ttl: z
      .number()
      .int()
      .positive()
      .max(60 * 60 * 24 * 30)
      .optional(),
    userCode: z.string().min(1).max(128).optional(),
    webauthnResponse: z.record(z.string(), z.unknown()).optional()
  })
  .strict()
  .refine(
    (input) => input.agentId !== undefined || input.approvalId !== undefined || input.userCode !== undefined,
    {
      message: 'Agent ID, approval ID, or user code is required'
    }
  )
export type AgentAccessApprovalDecisionInput = Readonly<z.infer<typeof AgentAccessApprovalDecisionInput>>

export const AgentAccessAgentRevokeInput = z
  .object({
    agentId: z.string().min(1)
  })
  .strict()
export type AgentAccessAgentRevokeInput = Readonly<z.infer<typeof AgentAccessAgentRevokeInput>>

export const AgentAccessCapabilityRevokeInput = z
  .object({
    agentId: z.string().min(1),
    capabilities: z.array(AgentMailCapabilitySchema).min(1).optional(),
    grantId: z.string().min(1).optional()
  })
  .strict()
  .refine((input) => input.grantId !== undefined || input.capabilities !== undefined, {
    message: 'Grant ID or capabilities are required'
  })
export type AgentAccessCapabilityRevokeInput = Readonly<z.infer<typeof AgentAccessCapabilityRevokeInput>>

interface AgentAccessAgentMailGrants {
  mailboxGrants: AgentMailMailboxGrantDocument[]
  systemGrants: AgentMailSystemGrantDocument[]
}

export async function getAgentAccessViewForWeb({ headers }: { headers: Headers }): Promise<AgentAccessView> {
  const { db } = await globals()
  const context = await requireAgentAccessUserContext(headers)
  const now = new Date()
  const hosts = await db.models.agentHost.find({ userId: context.userId }).exec()
  const hostIds = hosts.map((host) => host._id)
  const ownedAgents = await db.models.agent
    .find({
      $or: [{ userId: context.userId }, ...(hostIds.length ? [{ hostId: { $in: hostIds } }] : [])]
    })
    .exec()
  const manageableGrantAgents = canAgentAccessManage(context)
    ? await listOrganizationScopedAgentAccessAgents({
        context,
        db,
        knownAgentIds: ownedAgents.map((agent) => agent._id)
      })
    : []
  const agents = uniqueDocumentsById([...ownedAgents, ...manageableGrantAgents])
  const agentIds = agents.map((agent) => agent._id)
  const visibleHostIdsForAgents = new Set(agents.map((agent) => String(agent.hostId)))
  const missingHostIds = [...visibleHostIdsForAgents].filter(
    (hostIdForAgent) => !hosts.some((host) => String(host._id) === hostIdForAgent)
  )
  const additionalHosts = missingHostIds.length
    ? (
        await Promise.all(
          missingHostIds.map((hostIdForAgent) => db.models.agentHost.findById(hostIdForAgent).exec())
        )
      ).filter((host): host is AgentHostDocument => host !== null)
    : []
  const allHosts = uniqueDocumentsById([...hosts, ...additionalHosts])
  const [grants, approvals] = await Promise.all([
    agentIds.length
      ? db.models.agentCapabilityGrant.find({ agentId: { $in: agentIds } }).exec()
      : Promise.resolve([]),
    db.models.approvalRequest
      .find({
        $or: [{ userId: context.userId }, ...(agentIds.length ? [{ agentId: { $in: agentIds } }] : [])]
      })
      .exec()
  ])
  const scopedGrants = grants.filter(
    (grant) => String(agentAccessGrantOrganizationId(grant)) === String(context.organizationId)
  )
  const agentPublicIds = new Map(agents.map((agent) => [String(agent._id), publicIdFromUUIDv7(agent._id)]))
  const scopedGrantAgentIds = new Set(scopedGrants.map((grant) => String(grant.agentId)))
  const visibleApprovals = approvals.filter((approval) => {
    return approval.agentId
      ? agentPublicIds.has(String(approval.agentId)) && hasScopedApprovalGrant(approval, scopedGrants)
      : false
  })
  const visibleApprovalAgentIds = new Set(
    visibleApprovals.flatMap((approval) => (approval.agentId ? [String(approval.agentId)] : []))
  )
  const visibleAgents = agents.filter((agent) => {
    const agentId = String(agent._id)
    return scopedGrantAgentIds.has(agentId) || visibleApprovalAgentIds.has(agentId)
  })
  const visibleHostIds = new Set(visibleAgents.map((agent) => String(agent.hostId)))
  const visibleHosts = allHosts.filter((host) => visibleHostIds.has(String(host._id)))
  const visibleAgentMailGrantsByAgentId = await listAgentAccessMailGrantsForAgents({
    agentIds: visibleAgents.map((agent) => agent._id),
    context,
    db
  })
  const allowedActions = agentAccessAllowedActions({
    context,
    now,
    scopedGrants,
    visibleAgentMailGrantsByAgentId,
    visibleAgents,
    visibleApprovals
  })
  return {
    agents: visibleAgents
      .map((agent) =>
        toAgentView({
          agent,
          context,
          grants: scopedGrants,
          mailGrants: agentAccessMailGrantsForAgent(visibleAgentMailGrantsByAgentId, agent._id)
        })
      )
      .sort((left, right) => left.name.localeCompare(right.name)),
    allowedActions,
    approvals: visibleApprovals
      .map((approval) => toApprovalView({ approval, context, grants: scopedGrants, now }))
      .sort((left, right) => nullLast(left.expiresAt).localeCompare(nullLast(right.expiresAt))),
    capabilityCatalog: agentMailCapabilityCatalog,
    grants: scopedGrants
      .map((grant) => toGrantView(context, grant))
      .sort((left, right) => left.capability.localeCompare(right.capability)),
    hosts: visibleHosts
      .map((host) => toHostView(host, context.organizationId, visibleAgents))
      .sort((left, right) => left.name.localeCompare(right.name)),
    organizationId: String(context.organizationId),
    state: visibleAgents.length + visibleHosts.length + visibleApprovals.length === 0 ? 'empty' : 'ready'
  }
}

export async function getAgentAccessApprovalForWeb({
  headers,
  input
}: {
  headers: Headers
  input: unknown
}): Promise<AgentAccessApprovalPreview> {
  const { db } = await globals()
  const context = await requireAgentAccessUserContext(headers)
  const parsedInput = parseInput(AgentAccessApprovalLookupInput, input)
  const parsedAgentId = parsedInput.agentId ? parseAgentAccessAgentId(parsedInput.agentId) : null
  const parsedApprovalId = parsedInput.approvalId
    ? parseAgentAccessApprovalRequestId(parsedInput.approvalId)
    : null
  const parsedUserCode = normalizeAgentAccessApprovalUserCode(parsedInput.userCode)
  const approval = await findAgentAccessApprovalByUserCode({ db, userCode: parsedUserCode })
  const now = new Date()

  if (!approval) {
    throw new AgentAccessError('Approval request was not found', 404)
  }
  if (parsedApprovalId && String(approval._id) !== String(parsedApprovalId)) {
    throw new AgentAccessError('Approval request does not match the supplied approval', 400)
  }
  if (approval.userId && String(approval.userId) !== String(context.userId)) {
    throw new AgentAccessError('Approval request access is forbidden', 403)
  }

  const agentId = approval.agentId
  if (!agentId) {
    throw new AgentAccessError('Approval request is not linked to an agent', 400)
  }
  if (parsedAgentId && String(agentId) !== String(parsedAgentId)) {
    throw new AgentAccessError('Approval request does not match the supplied agent', 400)
  }

  const agent = await requireVisibleAgentForApproval({
    agentId,
    approval,
    context,
    db,
    userCodeMatchesApproval: true
  })
  requireAgentAccessManageAbility(context)
  const relevantGrants = await assertAgentAuthOperationScopedToOrganization({
    agent,
    allowPendingOrganizationBinding: true,
    context,
    db,
    statuses: ['active', 'pending']
  })
  const approvalGrants = selectAgentAccessApprovalGrants({
    allowPendingOrganizationBinding: true,
    approval,
    context,
    grants: relevantGrants
  })
  for (const grant of approvalGrants) {
    requireAgentAccessGrantManageAbility(context, grant)
  }

  return {
    approval: toApprovalView({ approval, context, grants: relevantGrants, now }),
    capabilityCatalog: agentMailCapabilityCatalog,
    organizationId: String(context.organizationId)
  }
}

export async function decideAgentAccessApprovalForWeb({
  headers,
  input
}: {
  headers: Headers
  input: unknown
}): Promise<AgentAccessMutationResult> {
  const { auth, db } = await globals()
  const context = await requireAgentAccessUserContext(headers)
  const parsedInput = parseInput(AgentAccessApprovalDecisionInput, input)
  const parsedAgentId = parsedInput.agentId ? parseAgentAccessAgentId(parsedInput.agentId) : null
  const parsedApprovalId = parsedInput.approvalId
    ? parseAgentAccessApprovalRequestId(parsedInput.approvalId)
    : null
  const parsedUserCode = parsedInput.userCode
    ? normalizeAgentAccessApprovalUserCode(parsedInput.userCode)
    : null
  const approval = parsedApprovalId
    ? await db.models.approvalRequest.findById(parsedApprovalId).exec()
    : parsedUserCode
      ? await findAgentAccessApprovalByUserCode({ db, userCode: parsedUserCode })
      : null

  if (parsedApprovalId && !approval) {
    throw new AgentAccessError('Approval request was not found', 404)
  }
  if (parsedUserCode && !approval && !parsedAgentId) {
    throw new AgentAccessError('Approval request was not found', 404)
  }
  if (approval?.userId && String(approval.userId) !== String(context.userId)) {
    throw new AgentAccessError('Approval request access is forbidden', 403)
  }
  const userCodeMatchesApproval = Boolean(
    parsedUserCode && approval && approvalMatchesUserCode(approval, parsedUserCode)
  )
  if (parsedApprovalId && parsedUserCode && approval && !userCodeMatchesApproval) {
    throw new AgentAccessError('Approval request does not match the supplied user code', 400)
  }

  const agentId = approval?.agentId ?? parsedAgentId
  if (!agentId) {
    throw new AgentAccessError('Approval request is not linked to an agent', 400)
  }
  if (parsedAgentId && String(agentId) !== String(parsedAgentId)) {
    throw new AgentAccessError('Approval request does not match the supplied agent', 400)
  }

  const agent = await requireVisibleAgentForApproval({
    agentId,
    approval,
    context,
    db,
    userCodeMatchesApproval
  })
  requireAgentAccessManageAbility(context)
  const relevantGrants = await assertAgentAuthOperationScopedToOrganization({
    agent,
    allowPendingOrganizationBinding: userCodeMatchesApproval,
    context,
    db,
    statuses: ['active', 'pending']
  })
  const approvalGrants = selectAgentAccessApprovalGrants({
    allowPendingOrganizationBinding: userCodeMatchesApproval,
    approval,
    capabilities: parsedInput.capabilities,
    context,
    grants: relevantGrants
  })
  for (const grant of approvalGrants) {
    requireAgentAccessGrantManageAbility(context, grant)
  }

  const result = await readAgentAccessAuthResult(
    await auth.api.approveCapability({
      body: {
        action: parsedInput.action,
        ...(parsedAgentId ? { agent_id: parsedAgentId } : {}),
        ...(parsedApprovalId
          ? { approval_id: parsedApprovalId }
          : approval
            ? { approval_id: normalizeMongooseUUIDv7(approval._id) }
            : {}),
        ...(parsedInput.capabilities ? { capabilities: [...parsedInput.capabilities] } : {}),
        ...(parsedInput.reason ? { reason: parsedInput.reason } : {}),
        ...(parsedInput.ttl ? { ttl: parsedInput.ttl } : {}),
        ...(parsedUserCode ? { user_code: parsedUserCode } : {}),
        ...(parsedInput.webauthnResponse ? { webauthn_response: parsedInput.webauthnResponse } : {})
      },
      headers
    }),
    'Agent approval request could not be updated'
  )
  const resultStatus = typeof result.status === 'string' ? result.status : null
  const approvalAccepted =
    parsedInput.action === 'approve' && (resultStatus === 'approved' || resultStatus === null)
  if (approvalAccepted) {
    await bindPendingAgentAccessGrantsToOrganization({
      context,
      db,
      grants: approvalGrants
    })
    await applyApprovedAgentAccessState({
      agent,
      db,
      grants: approvalGrants,
      ttl: parsedInput.ttl,
      userId: context.userId
    })
  }

  return {
    status: approvalAccepted && resultStatus === null ? 'approved' : resultStatus,
    success: true,
    view: await getAgentAccessViewForWeb({ headers })
  }
}

async function applyApprovedAgentAccessState({
  agent,
  db,
  grants,
  ttl,
  userId
}: {
  agent: AgentDocument
  db: Database
  grants: ReadonlyArray<AgentCapabilityGrantDocument>
  ttl?: number
  userId: UserId
}) {
  const now = new Date()

  await withAgentAccessTransaction(db, async (session) => {
    const grantResults: unknown[] = []
    for (const grant of grants) {
      grantResults.push(
        await execAgentAccessQuery(
          db.models.agentCapabilityGrant.updateOne(
            { _id: grant._id, status: 'pending' },
            {
              $set: {
                expiresAt: agentAccessGrantExpiresAt(grant.capability, now, ttl),
                grantedBy: userId,
                status: 'active',
                updatedAt: now
              }
            }
          ),
          session
        )
      )
    }
    for (const result of grantResults) {
      assertMatchedAgentAccessWrite(result, 'Agent capability grant is no longer pending')
    }

    assertMatchedAgentAccessWrite(
      await execAgentAccessQuery(
        db.models.agent.updateOne(
          { _id: agent._id, status: 'pending' },
          {
            $set: {
              activatedAt: now,
              expiresAt: null,
              status: 'active',
              updatedAt: now,
              userId
            }
          }
        ),
        session
      ),
      'Agent is no longer pending'
    )

    assertMatchedAgentAccessWrite(
      await execAgentAccessQuery(
        db.models.agentHost.updateOne(
          { _id: agent.hostId, status: { $in: ['active', 'pending'] } },
          {
            $set: {
              activatedAt: now,
              defaultCapabilities: '[]',
              expiresAt: null,
              status: 'active',
              updatedAt: now,
              userId
            }
          }
        ),
        session
      ),
      'Agent host is no longer active or pending'
    )
  })
}

type AgentAccessExecutableQuery<T> = {
  exec: () => Promise<T>
  session?: (session: ClientSession) => AgentAccessExecutableQuery<T>
}

async function execAgentAccessQuery<T>(
  query: AgentAccessExecutableQuery<T>,
  session: ClientSession
): Promise<T> {
  return (query.session?.(session) ?? query).exec()
}

async function withAgentAccessTransaction<T>(
  db: Pick<Database, 'connection'>,
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  const transaction = db.connection.transaction.bind(db.connection)
  return transaction((session) => operation(session))
}

function assertMatchedAgentAccessWrite(result: unknown, message: string): void {
  if (!result || typeof result !== 'object') {
    throw new AgentAccessError(message, 409)
  }
  const record = result as {
    matchedCount?: unknown
    modifiedCount?: unknown
    n?: unknown
    nModified?: unknown
  }
  const matched = [record.matchedCount, record.modifiedCount, record.n, record.nModified].some(
    (value) => typeof value === 'number' && value > 0
  )
  if (!matched) {
    throw new AgentAccessError(message, 409)
  }
}

function agentAccessGrantExpiresAt(capability: string, now: Date, explicitTTL?: number): Date | null {
  if (explicitTTL !== undefined) {
    return new Date(now.getTime() + explicitTTL * 1000)
  }
  const parsedCapability = AgentMailCapabilitySchema.safeParse(capability)
  if (!parsedCapability.success) {
    return null
  }
  const definition = AGENT_AUTH_CAPABILITIES.find((candidate) => candidate.name === parsedCapability.data)
  return definition?.grantTTL ? new Date(now.getTime() + definition.grantTTL * 1000) : null
}

export async function revokeAgentAccessAgentForWeb({
  headers,
  input
}: {
  headers: Headers
  input: unknown
}): Promise<AgentAccessMutationResult> {
  const { auth, db } = await globals()
  const context = await requireAgentAccessUserContext(headers)
  const parsedInput = parseInput(AgentAccessAgentRevokeInput, input)
  const agentId = parseAgentAccessAgentId(parsedInput.agentId)
  const agent = await requireVisibleAgent({ context, db, agentId })
  requireAgentAccessManageAbility(context)
  const allCapabilityGrants = await db.models.agentCapabilityGrant.find({ agentId: agent._id }).exec()
  const relevantGrants = allCapabilityGrants.filter(
    (grant) =>
      isActiveOrPendingAgentAccessGrant(grant) &&
      String(agentAccessGrantOrganizationId(grant)) === String(context.organizationId)
  )
  for (const grant of relevantGrants) {
    requireAgentAccessGrantManageAbility(context, grant)
  }
  const mailGrants = await getAgentAccessMailGrantsForAgent({ agentId, db })
  const scopedMailGrants = organizationScopedAgentMailGrants({ context, grants: mailGrants })
  for (const grant of scopedMailGrants.mailboxGrants) {
    requireAgentAccessMailboxGrantManageAbility(context, grant, String(agent._id))
  }
  for (const grant of scopedMailGrants.systemGrants) {
    requireAgentAccessSystemGrantManageAbility(context, grant, String(agent._id))
  }

  const now = new Date()
  for (const grant of relevantGrants) {
    const update = await db.models.agentCapabilityGrant
      .updateOne(
        {
          _id: grant._id,
          agentId,
          status: { $in: ['active', 'pending'] }
        },
        {
          $set: {
            status: 'revoked',
            updatedAt: now
          }
        }
      )
      .exec()
    assertMatchedAgentAccessWrite(update, 'Agent capability grant could not be revoked')
  }
  const revokedMailGrantCounts = await revokeAgentAccessMailGrantsForAgent({
    context,
    db,
    principalId: String(agent._id)
  })
  const hasRemainingAccess = hasRemainingAgentAccessAfterOrganizationRevoke({
    context,
    grants: allCapabilityGrants,
    mailGrants
  })
  let status: string | null = 'revoked'
  if (!hasRemainingAccess) {
    const result = await readAgentAccessAuthResult(
      await auth.api.revokeAgent({
        body: { agent_id: agentId },
        headers
      }),
      'Agent access could not be revoked'
    )
    status = typeof result.status === 'string' ? result.status : status
  }
  if (relevantGrants.length > 0) {
    await db.models.auditLog.create({
      action: 'agent_access.capability_grants.revoked',
      metadata: {
        agentId: String(agentId),
        capabilities: relevantGrants.map((grant) => grant.capability),
        grantIds: relevantGrants.map((grant) => String(grant._id)),
        organizationId: String(context.organizationId),
        revokedMailboxGrantCount: revokedMailGrantCounts.mailboxGrantCount,
        revokedSystemGrantCount: revokedMailGrantCounts.systemGrantCount
      },
      severity: 'medium',
      status: 'success',
      userId: context.userId
    })
  }
  if (revokedMailGrantCounts.mailboxGrantCount > 0 || revokedMailGrantCounts.systemGrantCount > 0) {
    await auditAgentAccessMailGrantRevocation({
      action: 'agent_access.agent_mail_grants.revoked',
      agentId,
      context,
      db,
      grantIds: [
        ...scopedMailGrants.mailboxGrants.map((grant) => String(grant._id)),
        ...scopedMailGrants.systemGrants.map((grant) => String(grant._id))
      ],
      mailboxGrantCount: revokedMailGrantCounts.mailboxGrantCount,
      systemGrantCount: revokedMailGrantCounts.systemGrantCount
    })
  }

  return {
    status,
    success: true,
    view: await getAgentAccessViewForWeb({ headers })
  }
}

export async function revokeAgentAccessCapabilitiesForWeb({
  headers,
  input
}: {
  headers: Headers
  input: unknown
}): Promise<AgentAccessMutationResult> {
  const { db } = await globals()
  const context = await requireAgentAccessUserContext(headers)
  const parsedInput = parseInput(AgentAccessCapabilityRevokeInput, input)
  const agentId = parseAgentAccessAgentId(parsedInput.agentId)
  const grantId = parsedInput.grantId ? parseAgentAccessGrantId(parsedInput.grantId) : null
  const agent = await requireVisibleAgent({ context, db, agentId })
  requireAgentAccessManageAbility(context)
  const relevantGrants = await assertAgentAuthOperationScopedToOrganization({
    agent,
    capabilities: parsedInput.capabilities,
    context,
    db,
    statuses: ['active', 'pending']
  })
  const grantsToRevoke = selectAgentAccessGrantsForRevoke({
    capabilities: parsedInput.capabilities,
    grantId,
    grants: relevantGrants
  })
  for (const grant of grantsToRevoke) {
    requireAgentAccessGrantManageAbility(context, grant)
  }
  const now = new Date()
  const revokedMailGrantCounts = {
    mailboxGrantCount: 0,
    systemGrantCount: 0
  }

  for (const grant of grantsToRevoke) {
    const update = await db.models.agentCapabilityGrant
      .updateOne(
        {
          _id: grant._id,
          agentId,
          status: { $in: ['active', 'pending'] }
        },
        {
          $set: {
            status: 'revoked',
            updatedAt: now
          }
        }
      )
      .exec()
    if (!updateMatched(update)) {
      throw new AgentAccessError('Agent capability grant could not be revoked', 409)
    }
    const mailGrantUpdate = await revokeAgentAccessMailGrantsForCapabilityGrant({
      context,
      db,
      grant,
      principalId: String(agent._id)
    })
    revokedMailGrantCounts.mailboxGrantCount += mailGrantUpdate.mailboxGrantCount
    revokedMailGrantCounts.systemGrantCount += mailGrantUpdate.systemGrantCount
  }

  await db.models.auditLog.create({
    action: 'agent_access.capability_grants.revoked',
    metadata: {
      agentId: String(agentId),
      capabilities: grantsToRevoke.map((grant) => grant.capability),
      grantIds: grantsToRevoke.map((grant) => String(grant._id)),
      organizationId: String(context.organizationId),
      revokedMailboxGrantCount: revokedMailGrantCounts.mailboxGrantCount,
      revokedSystemGrantCount: revokedMailGrantCounts.systemGrantCount
    },
    severity: 'medium',
    status: 'success',
    userId: context.userId
  })

  return {
    status: 'revoked',
    success: true,
    view: await getAgentAccessViewForWeb({ headers })
  }
}

async function requireAgentAccessUserContext(headers: Headers) {
  const { auth, db } = await globals()
  const session = await auth.api.getSession({ headers })
  if (!session?.user) {
    throw new AgentAccessError('Authentication required', 401)
  }

  const userId = session.user.id as UserId
  const organizationId =
    typeof session.session.activeOrganizationId === 'string' && session.session.activeOrganizationId
      ? (session.session.activeOrganizationId as OrganizationId)
      : null
  if (!organizationId) {
    throw new AgentAccessError('An active organization is required', 403)
  }

  const member = await db.models.member.findOne({ organizationId, userId }).exec()
  if (!member) {
    throw new AgentAccessError('Organization access is required', 403)
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
    organizationId,
    userId
  }
}

function requireAgentAccessManageAbility(context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>) {
  if (!canAgentAccessManage(context)) {
    throw new AgentAccessError('Agent access management is not authorized', 403)
  }
}

function requireAgentAccessGrantManageAbility(
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>,
  grant: AgentCapabilityGrantDocument
) {
  if (!canAgentAccessGrantManage(context, grant)) {
    throw new AgentAccessError('Agent capability grant management is not authorized', 403)
  }
}

function requireAgentAccessMailboxGrantManageAbility(
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>,
  grant: AgentMailMailboxGrantDocument,
  agentId: string
) {
  if (!canAgentAccessMailboxGrantManage(context, grant, agentId)) {
    throw new AgentAccessError('Agent capability grant management is not authorized', 403)
  }
}

function canAgentAccessMailboxGrantManage(
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>,
  grant: AgentMailMailboxGrantDocument,
  agentId: string
) {
  for (const capability of AgentMailCapabilityByMailboxGrant[grant.capability]) {
    if (
      !context.ability.can(
        'manage',
        agentMailSubject('AgentGrant', {
          agentId,
          capability,
          mailboxAddress: grant.mailboxAddress,
          organizationId: context.organizationId
        })
      )
    ) {
      return false
    }
  }
  return true
}

function requireAgentAccessSystemGrantManageAbility(
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>,
  grant: AgentMailSystemGrantDocument,
  agentId: string
) {
  if (!canAgentAccessSystemGrantManage(context, grant, agentId)) {
    throw new AgentAccessError('Agent capability grant management is not authorized', 403)
  }
}

function canAgentAccessSystemGrantManage(
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>,
  grant: AgentMailSystemGrantDocument,
  agentId: string
) {
  for (const capability of AgentMailCapabilityBySystemPermission[grant.permission]) {
    if (
      !context.ability.can(
        'manage',
        agentMailSubject('AgentGrant', {
          agentId,
          capability,
          organizationId: context.organizationId,
          permission: grant.permission
        })
      )
    ) {
      return false
    }
  }
  return true
}

function canAgentAccessManage(context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>) {
  return context.ability.can('manage', agentMailSubject('Agent', { organizationId: context.organizationId }))
}

function canAgentAccessGrantManage(
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>,
  grant: AgentCapabilityGrantDocument
) {
  const capability = AgentMailCapabilitySchema.safeParse(grant.capability)
  return (
    capability.success &&
    context.ability.can(
      'manage',
      agentMailSubject('AgentGrant', {
        agentId: String(grant.agentId),
        capability: capability.data,
        mailboxAddress: agentAccessGrantMailboxAddress(grant),
        organizationId: context.organizationId
      })
    )
  )
}

function agentAccessAllowedActions({
  context,
  now,
  scopedGrants,
  visibleAgentMailGrantsByAgentId,
  visibleAgents,
  visibleApprovals
}: {
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  now: Date
  scopedGrants: ReadonlyArray<AgentCapabilityGrantDocument>
  visibleAgentMailGrantsByAgentId: ReadonlyMap<string, AgentAccessAgentMailGrants>
  visibleAgents: ReadonlyArray<AgentDocument>
  visibleApprovals: ReadonlyArray<ApprovalRequestDocument>
}): AgentAccessAllowedActions {
  const canManage = canAgentAccessManage(context)
  const activeOrPendingGrants = scopedGrants.filter(
    (grant) => grant.status === 'active' || grant.status === 'pending'
  )
  const canRevokeCapabilityGrant =
    canManage && activeOrPendingGrants.some((grant) => canAgentAccessGrantManage(context, grant))
  const canRevokeAgent =
    canManage &&
    visibleAgents.some((agent) =>
      canAgentAccessAgentRevoke({
        agent,
        context,
        mailGrants: agentAccessMailGrantsForAgent(visibleAgentMailGrantsByAgentId, agent._id),
        scopedGrants
      })
    )
  const canManageVisibleApproval =
    canManage &&
    visibleApprovals.some((approval) =>
      canManageAgentAccessApproval({ approval, context, now, scopedGrants })
    )

  return {
    denyApproval: canManageVisibleApproval,
    reviewApproval: canManageVisibleApproval,
    revokeAgent: canRevokeAgent,
    revokeCapabilityGrant: canRevokeCapabilityGrant
  }
}

function canAgentAccessAgentRevoke({
  agent,
  context,
  mailGrants,
  scopedGrants
}: {
  agent: AgentDocument
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  mailGrants: AgentAccessAgentMailGrants
  scopedGrants: ReadonlyArray<AgentCapabilityGrantDocument>
}) {
  if (!canAgentAccessManage(context) || agent.status === 'revoked' || agent.status === 'expired') {
    return false
  }

  const agentId = String(agent._id)
  const activeOrPendingGrants = scopedGrants.filter(
    (grant) => String(grant.agentId) === agentId && isActiveOrPendingAgentAccessGrant(grant)
  )

  return (
    activeOrPendingGrants.every((grant) => canAgentAccessGrantManage(context, grant)) &&
    mailGrants.mailboxGrants.every((grant) => canAgentAccessMailboxGrantManage(context, grant, agentId)) &&
    mailGrants.systemGrants.every((grant) => canAgentAccessSystemGrantManage(context, grant, agentId))
  )
}

function canManageAgentAccessApproval({
  approval,
  context,
  now = new Date(),
  scopedGrants
}: {
  approval: ApprovalRequestDocument
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  now?: Date
  scopedGrants: ReadonlyArray<AgentCapabilityGrantDocument>
}) {
  if (approval.status !== 'pending' || isExpired(approval.expiresAt, now)) {
    return false
  }

  try {
    return selectAgentAccessApprovalGrants({
      approval,
      context,
      grants: scopedGrants
    }).every((grant) => canAgentAccessGrantManage(context, grant))
  } catch {
    return false
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new AgentAccessError('Invalid Agent Access request', 400)
  }
  return parsed.data
}

function parseAgentAccessAgentId(value: string): AgentId {
  return parseAgentAccessPublicUUID(value, 'Agent') as AgentId
}

function parseAgentAccessApprovalRequestId(value: string): ApprovalRequestId {
  return parseAgentAccessPublicUUID(value, 'Approval request') as ApprovalRequestId
}

function parseAgentAccessGrantId(value: string): AgentCapabilityGrantId {
  return parseAgentAccessPublicUUID(value, 'Agent capability grant') as AgentCapabilityGrantId
}

function selectAgentAccessGrantsForRevoke({
  capabilities,
  grantId,
  grants
}: {
  capabilities?: ReadonlyArray<AgentMailCapability>
  grantId: AgentCapabilityGrantId | null
  grants: ReadonlyArray<AgentCapabilityGrantDocument>
}): AgentCapabilityGrantDocument[] {
  if (grantId) {
    const grant = grants.find((candidate) => String(candidate._id) === String(grantId))
    if (!grant) {
      throw new AgentAccessError('Agent capability grant was not found', 404)
    }
    if (capabilities && !capabilities.includes(grant.capability as AgentMailCapability)) {
      throw new AgentAccessError('Agent capability grant does not match requested capabilities', 400)
    }
    return [grant]
  }

  if (!capabilities?.length) {
    throw new AgentAccessError('Grant ID or capabilities are required', 400)
  }

  const selectedGrants = capabilities.map((capability) => {
    const matches = grants.filter((grant) => grant.capability === capability)
    if (matches.length === 0) {
      throw new AgentAccessError('Agent capability grant was not found', 404)
    }
    if (matches.length > 1) {
      throw new AgentAccessError('Agent capability grant identifier is required', 409)
    }
    return matches[0]
  })

  return [...new Map(selectedGrants.map((grant) => [String(grant._id), grant])).values()]
}

function uniqueDocumentsById<TDocument extends { _id: unknown }>(
  documents: ReadonlyArray<TDocument>
): TDocument[] {
  return [...new Map(documents.map((document) => [String(document._id), document])).values()]
}

async function listOrganizationScopedAgentAccessAgents({
  context,
  db,
  knownAgentIds
}: {
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
  knownAgentIds: ReadonlyArray<AgentId>
}): Promise<AgentDocument[]> {
  const organizationGrants = await db.models.agentCapabilityGrant
    .find({ status: { $in: ['active', 'pending'] } })
    .exec()
  const known = new Set(knownAgentIds.map((agentId) => String(agentId)))
  const agentIds = [
    ...new Set(
      organizationGrants
        .filter((grant) => String(agentAccessGrantOrganizationId(grant)) === String(context.organizationId))
        .map((grant) => String(grant.agentId))
        .filter((agentId) => !known.has(agentId))
    )
  ]

  return agentIds.length
    ? (await Promise.all(agentIds.map((agentId) => db.models.agent.findById(agentId).exec()))).filter(
        (agent): agent is AgentDocument => agent !== null
      )
    : []
}

async function findAgentAccessApprovalByUserCode({
  db,
  userCode
}: {
  db: Database
  userCode: string
}): Promise<ApprovalRequestDocument | null> {
  const approvals = await db.models.approvalRequest
    .find({
      method: 'device_authorization',
      status: 'pending',
      userCodeHash: hashAgentAccessApprovalUserCode(userCode)
    })
    .exec()

  if (approvals.length > 1) {
    throw new AgentAccessError('Approval request user code matched multiple requests', 409)
  }

  return approvals[0] ?? null
}

function normalizeAgentAccessApprovalUserCode(code: string): string {
  const stripped = code.replaceAll(/[^A-Z0-9]/gi, '').toUpperCase()
  if (stripped.length !== 8) {
    return code.toUpperCase()
  }
  return `${stripped.slice(0, 4)}-${stripped.slice(4)}`
}

function hashAgentAccessApprovalUserCode(code: string): string {
  return createHash('sha256').update(code).digest('base64url')
}

function approvalMatchesUserCode(approval: ApprovalRequestDocument, userCode: string): boolean {
  return (
    approval.method === 'device_authorization' &&
    approval.status === 'pending' &&
    approval.userCodeHash === hashAgentAccessApprovalUserCode(userCode)
  )
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
  return record.matchedCount === undefined ? Number(record.n ?? 0) > 0 : Number(record.matchedCount) > 0
}

function updateModifiedCount(result: unknown) {
  if (!result || typeof result !== 'object') {
    return 0
  }
  const record = result as {
    modifiedCount?: unknown
    nModified?: unknown
  }
  return Number(record.modifiedCount ?? record.nModified ?? 0)
}

function parseAgentAccessPublicUUID(value: string, label: string): string {
  try {
    return parseUUIDv7(value)
  } catch {
    // Public UI routes use Base62 IDs, while Better Auth verification links carry raw UUIDv7 IDs.
  }

  try {
    return base62UUIDv7ToUUIDv7(parseBase62UUIDv7(value))
  } catch {
    throw new AgentAccessError(`${label} identifier is invalid`, 400)
  }
}

async function requireVisibleAgent({
  agentId,
  context,
  db
}: {
  agentId: AgentId
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
}): Promise<AgentDocument> {
  const agent = await db.models.agent.findById(agentId).exec()
  if (!agent) {
    throw new AgentAccessError('Agent access was not found', 404)
  }
  if (agent.userId && String(agent.userId) === String(context.userId)) {
    return agent
  }

  const host = await db.models.agentHost.findById(agent.hostId).exec()
  if (host?.userId && String(host.userId) === String(context.userId)) {
    return agent
  }

  if (canAgentAccessManage(context) && (await agentHasScopedAgentAccessGrant({ agent, context, db }))) {
    return agent
  }

  throw new AgentAccessError('Agent access is forbidden', 403)
}

async function requireVisibleAgentForApproval({
  agentId,
  approval,
  context,
  db,
  userCodeMatchesApproval
}: {
  agentId: AgentId
  approval: ApprovalRequestDocument | null
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
  userCodeMatchesApproval: boolean
}): Promise<AgentDocument> {
  const agent = await db.models.agent.findById(agentId).exec()
  if (!agent) {
    throw new AgentAccessError('Agent access was not found', 404)
  }
  if (agent.userId && String(agent.userId) === String(context.userId)) {
    return agent
  }

  const host = await db.models.agentHost.findById(agent.hostId).exec()
  if (host?.userId && String(host.userId) === String(context.userId)) {
    return agent
  }

  if (canAgentAccessManage(context) && (await agentHasScopedAgentAccessGrant({ agent, context, db }))) {
    return agent
  }

  if (
    userCodeMatchesApproval &&
    approval?.status === 'pending' &&
    approval.agentId &&
    String(approval.agentId) === String(agentId) &&
    (!approval.hostId || String(approval.hostId) === String(agent.hostId)) &&
    !approval.userId &&
    !agent.userId &&
    !host?.userId
  ) {
    return agent
  }

  throw new AgentAccessError('Agent access is forbidden', 403)
}

async function agentHasScopedAgentAccessGrant({
  agent,
  context,
  db
}: {
  agent: AgentDocument
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
}) {
  const grants = await db.models.agentCapabilityGrant
    .find({
      agentId: agent._id,
      status: { $in: ['active', 'pending'] }
    })
    .exec()
  return grants.some(
    (grant) => String(agentAccessGrantOrganizationId(grant)) === String(context.organizationId)
  )
}

async function assertAgentAuthOperationScopedToOrganization({
  agent,
  allowPendingOrganizationBinding = false,
  capabilities,
  context,
  db,
  statuses
}: {
  agent: AgentDocument
  allowPendingOrganizationBinding?: boolean
  capabilities?: ReadonlyArray<string>
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
  statuses: ReadonlyArray<AgentAuthGrantStatus>
}): Promise<AgentCapabilityGrantDocument[]> {
  const grants = await db.models.agentCapabilityGrant.find({ agentId: agent._id }).exec()
  const capabilitySet = capabilities ? new Set(capabilities) : null
  const relevantGrants = grants.filter((grant) => {
    if (!statuses.includes(grant.status)) {
      return false
    }
    return !capabilitySet || capabilitySet.has(grant.capability)
  })
  const outOfScopeGrant = relevantGrants.find((grant) => {
    const organizationId = agentAccessGrantOrganizationId(grant)
    if (String(organizationId) === String(context.organizationId)) {
      return false
    }
    return !(
      allowPendingOrganizationBinding &&
      organizationId === null &&
      isPendingAgentAccessGrantReadyForOrganizationBinding(grant)
    )
  })

  if (outOfScopeGrant) {
    throw new AgentAccessError('Agent access includes grants outside the active organization', 403)
  }
  return relevantGrants
}

function selectAgentAccessApprovalGrants({
  allowPendingOrganizationBinding = false,
  approval,
  capabilities,
  context,
  grants
}: {
  approval: ApprovalRequestDocument | null
  allowPendingOrganizationBinding?: boolean
  capabilities?: ReadonlyArray<AgentMailCapability>
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  grants: ReadonlyArray<AgentCapabilityGrantDocument>
}): AgentCapabilityGrantDocument[] {
  const approvalCapabilities = new Set(parseAgentMailCapabilities(approval?.capabilities))
  const requestedCapabilities = new Set(capabilities ?? approvalCapabilities)
  if (capabilities && approvalCapabilities.size > 0) {
    for (const capability of requestedCapabilities) {
      if (!approvalCapabilities.has(capability)) {
        throw new AgentAccessError('Agent approval includes capabilities outside the approval request', 403)
      }
    }
  }
  const pendingScopedGrants = grants.filter(
    (grant) =>
      grant.status === 'pending' &&
      agentAccessGrantCanBeApprovedForOrganization({
        allowPendingOrganizationBinding,
        context,
        grant
      })
  )

  if (pendingScopedGrants.length === 0) {
    throw new AgentAccessError('Agent approval has no pending grants in the active organization', 403)
  }

  if (requestedCapabilities.size === 0) {
    return pendingScopedGrants
  }

  const pendingCapabilities = new Set(pendingScopedGrants.map((grant) => grant.capability))
  for (const capability of requestedCapabilities) {
    if (!pendingCapabilities.has(capability)) {
      throw new AgentAccessError(
        'Agent approval includes capabilities without pending grants in the active organization',
        403
      )
    }
  }

  return pendingScopedGrants.filter((grant) =>
    requestedCapabilities.has(grant.capability as AgentMailCapability)
  )
}

function agentAccessGrantCanBeApprovedForOrganization({
  allowPendingOrganizationBinding,
  context,
  grant
}: {
  allowPendingOrganizationBinding: boolean
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  grant: AgentCapabilityGrantDocument
}) {
  const organizationId = agentAccessGrantOrganizationId(grant)
  return (
    String(organizationId) === String(context.organizationId) ||
    (allowPendingOrganizationBinding &&
      organizationId === null &&
      isPendingAgentAccessGrantReadyForOrganizationBinding(grant))
  )
}

async function bindPendingAgentAccessGrantsToOrganization({
  context,
  db,
  grants
}: {
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
  grants: ReadonlyArray<AgentCapabilityGrantDocument>
}) {
  const now = new Date()
  for (const grant of grants) {
    const organizationId = agentAccessGrantOrganizationId(grant)
    if (organizationId !== null || grant.status !== 'pending') {
      continue
    }
    const constraints = agentAccessGrantConstraintsForOrganizationBinding(grant, context.organizationId)
    if (!constraints) {
      throw new AgentAccessError('Agent approval has invalid pending grant constraints', 403)
    }
    const update = await db.models.agentCapabilityGrant
      .updateOne(
        { _id: grant._id, status: 'pending' },
        {
          $set: {
            constraints,
            updatedAt: now
          }
        }
      )
      .exec()
    assertMatchedAgentAccessWrite(update, 'Agent capability grant could not be scoped')
    Object.assign(grant, { constraints })
  }
}

async function getAgentAccessMailGrantsForAgent({
  agentId,
  db
}: {
  agentId: AgentId
  db: Database
}): Promise<{
  mailboxGrants: AgentMailMailboxGrantDocument[]
  systemGrants: AgentMailSystemGrantDocument[]
}> {
  const principalId = String(agentId)
  const [mailboxGrants, systemGrants] = await Promise.all([
    db.models.agentMailMailboxGrant
      .find({
        principalId,
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      })
      .exec(),
    db.models.agentMailSystemGrant
      .find({
        principalId,
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      })
      .exec()
  ])

  return { mailboxGrants, systemGrants }
}

async function listAgentAccessMailGrantsForAgents({
  agentIds,
  context,
  db
}: {
  agentIds: ReadonlyArray<AgentId>
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
}): Promise<Map<string, AgentAccessAgentMailGrants>> {
  const principalIds = new Set(agentIds.map((agentId) => String(agentId)))
  if (principalIds.size === 0) {
    return new Map()
  }

  const [mailboxGrants, systemGrants] = await Promise.all([
    db.models.agentMailMailboxGrant
      .find({
        organizationId: context.organizationId,
        principalId: { $in: [...principalIds] },
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      })
      .exec(),
    db.models.agentMailSystemGrant
      .find({
        organizationId: context.organizationId,
        principalId: { $in: [...principalIds] },
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      })
      .exec()
  ])

  const grantsByAgentId = new Map<string, AgentAccessAgentMailGrants>(
    [...principalIds].map((principalId) => [principalId, { mailboxGrants: [], systemGrants: [] }])
  )

  for (const grant of mailboxGrants) {
    const { principalId } = grant
    const agentGrants = grantsByAgentId.get(principalId)
    if (
      agentGrants &&
      grant.principalType === 'agent' &&
      String(grant.organizationId) === String(context.organizationId) &&
      isActiveOrPendingAgentMailGrant(grant)
    ) {
      agentGrants.mailboxGrants.push(grant)
    }
  }

  for (const grant of systemGrants) {
    const { principalId } = grant
    const agentGrants = grantsByAgentId.get(principalId)
    if (
      agentGrants &&
      grant.principalType === 'agent' &&
      String(grant.organizationId) === String(context.organizationId) &&
      isActiveOrPendingAgentMailGrant(grant)
    ) {
      agentGrants.systemGrants.push(grant)
    }
  }

  return grantsByAgentId
}

function agentAccessMailGrantsForAgent(
  grantsByAgentId: ReadonlyMap<string, AgentAccessAgentMailGrants>,
  agentId: AgentId
): AgentAccessAgentMailGrants {
  return grantsByAgentId.get(String(agentId)) ?? { mailboxGrants: [], systemGrants: [] }
}

function assertAgentMailGrantsScopedToOrganization({
  context,
  grants
}: {
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  grants: {
    mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>
    systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
  }
}) {
  const hasOutOfScopeGrant = [...grants.mailboxGrants, ...grants.systemGrants].some(
    (grant) => String(grant.organizationId) !== String(context.organizationId)
  )

  if (hasOutOfScopeGrant) {
    throw new AgentAccessError('Agent access includes grants outside the active organization', 403)
  }
}

function organizationScopedAgentMailGrants({
  context,
  grants
}: {
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  grants: {
    mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>
    systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
  }
}): {
  mailboxGrants: AgentMailMailboxGrantDocument[]
  systemGrants: AgentMailSystemGrantDocument[]
} {
  return {
    mailboxGrants: grants.mailboxGrants.filter(
      (grant) => String(grant.organizationId) === String(context.organizationId)
    ),
    systemGrants: grants.systemGrants.filter(
      (grant) => String(grant.organizationId) === String(context.organizationId)
    )
  }
}

function hasRemainingAgentAccessAfterOrganizationRevoke({
  context,
  grants,
  mailGrants
}: {
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  grants: ReadonlyArray<AgentCapabilityGrantDocument>
  mailGrants: {
    mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>
    systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
  }
}) {
  return (
    grants.some(
      (grant) =>
        isActiveOrPendingAgentAccessGrant(grant) &&
        String(agentAccessGrantOrganizationId(grant)) !== String(context.organizationId)
    ) ||
    [...mailGrants.mailboxGrants, ...mailGrants.systemGrants].some(
      (grant) =>
        isActiveOrPendingAgentMailGrant(grant) &&
        String(grant.organizationId) !== String(context.organizationId)
    )
  )
}

function isActiveOrPendingAgentAccessGrant(grant: Pick<AgentCapabilityGrantDocument, 'status'>) {
  return grant.status === 'active' || grant.status === 'pending'
}

function isActiveOrPendingAgentMailGrant(
  grant: Pick<AgentMailMailboxGrantDocument | AgentMailSystemGrantDocument, 'status'>
) {
  return grant.status === 'active' || grant.status === 'pending'
}

async function revokeAgentAccessMailGrantsForAgent({
  context,
  db,
  principalId
}: {
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
  principalId: string
}): Promise<{ mailboxGrantCount: number; systemGrantCount: number }> {
  const now = new Date()
  const [mailboxGrantUpdate, systemGrantUpdate] = await Promise.all([
    db.models.agentMailMailboxGrant
      .updateMany(
        {
          organizationId: context.organizationId,
          principalId,
          principalType: 'agent',
          status: { $in: ['active', 'pending'] }
        },
        { $set: { status: 'revoked', updatedAt: now } }
      )
      .exec(),
    db.models.agentMailSystemGrant
      .updateMany(
        {
          organizationId: context.organizationId,
          principalId,
          principalType: 'agent',
          status: { $in: ['active', 'pending'] }
        },
        { $set: { status: 'revoked', updatedAt: now } }
      )
      .exec()
  ])

  return {
    mailboxGrantCount: updateModifiedCount(mailboxGrantUpdate),
    systemGrantCount: updateModifiedCount(systemGrantUpdate)
  }
}

async function revokeAgentAccessMailGrantsForCapabilityGrant({
  context,
  db,
  grant,
  principalId
}: {
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
  grant: AgentCapabilityGrantDocument
  principalId: string
}): Promise<{ mailboxGrantCount: number; systemGrantCount: number }> {
  const capability = AgentMailCapabilitySchema.safeParse(grant.capability)
  if (!capability.success) {
    return { mailboxGrantCount: 0, systemGrantCount: 0 }
  }

  if (capability.data.startsWith('email.message.')) {
    const mailboxAddress = agentAccessGrantMailboxAddress(grant)
    if (!mailboxAddress) {
      return { mailboxGrantCount: 0, systemGrantCount: 0 }
    }

    const grantCapabilities = mailboxGrantValuesForCapability(capability.data)
    if (!grantCapabilities.length) {
      return { mailboxGrantCount: 0, systemGrantCount: 0 }
    }

    const candidates = await db.models.agentMailMailboxGrant
      .find({
        capability: { $in: grantCapabilities },
        organizationId: context.organizationId,
        principalId,
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      })
      .exec()
    const matchingGrants = candidates.filter(
      (candidate) =>
        normalizedAgentAccessMailbox(candidate.mailboxAddress) ===
        normalizedAgentAccessMailbox(mailboxAddress)
    )

    for (const mailGrant of matchingGrants) {
      requireAgentAccessMailboxGrantManageAbility(context, mailGrant, principalId)
    }

    if (!matchingGrants.length) {
      return { mailboxGrantCount: 0, systemGrantCount: 0 }
    }

    const update = await db.models.agentMailMailboxGrant
      .updateMany(
        {
          _id: { $in: matchingGrants.map((mailGrant) => mailGrant._id) },
          status: { $in: ['active', 'pending'] }
        },
        { $set: { status: 'revoked', updatedAt: new Date() } }
      )
      .exec()

    return { mailboxGrantCount: updateModifiedCount(update), systemGrantCount: 0 }
  }

  const permissions = systemPermissionValuesForCapability(capability.data)
  if (!permissions.length) {
    return { mailboxGrantCount: 0, systemGrantCount: 0 }
  }

  const matchingGrants = await db.models.agentMailSystemGrant
    .find({
      organizationId: context.organizationId,
      permission: { $in: permissions },
      principalId,
      principalType: 'agent',
      status: { $in: ['active', 'pending'] }
    })
    .exec()

  for (const mailGrant of matchingGrants) {
    requireAgentAccessSystemGrantManageAbility(context, mailGrant, principalId)
  }

  if (!matchingGrants.length) {
    return { mailboxGrantCount: 0, systemGrantCount: 0 }
  }

  const update = await db.models.agentMailSystemGrant
    .updateMany(
      {
        _id: { $in: matchingGrants.map((mailGrant) => mailGrant._id) },
        status: { $in: ['active', 'pending'] }
      },
      { $set: { status: 'revoked', updatedAt: new Date() } }
    )
    .exec()

  return { mailboxGrantCount: 0, systemGrantCount: updateModifiedCount(update) }
}

async function auditAgentAccessMailGrantRevocation({
  action,
  agentId,
  context,
  db,
  grantIds,
  mailboxGrantCount,
  systemGrantCount
}: {
  action: string
  agentId: string
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  db: Database
  grantIds: ReadonlyArray<string>
  mailboxGrantCount: number
  systemGrantCount: number
}) {
  await db.models.auditLog.create({
    action,
    metadata: {
      agentId,
      grantIds,
      organizationId: String(context.organizationId),
      revokedMailboxGrantCount: mailboxGrantCount,
      revokedSystemGrantCount: systemGrantCount
    },
    severity: 'medium',
    status: 'success',
    userId: context.userId
  })
}

function mailboxGrantValuesForCapability(
  capability: AgentMailCapability
): AgentMailMailboxGrantDocument['capability'][] {
  return Object.entries(AgentMailCapabilityByMailboxGrant).flatMap(([grant, capabilities]) =>
    (capabilities as readonly AgentMailCapability[]).includes(capability)
      ? [grant as AgentMailMailboxGrantDocument['capability']]
      : []
  )
}

function systemPermissionValuesForCapability(
  capability: AgentMailCapability
): AgentMailSystemGrantDocument['permission'][] {
  return Object.entries(AgentMailCapabilityBySystemPermission).flatMap(([permission, capabilities]) =>
    (capabilities as readonly AgentMailCapability[]).includes(capability)
      ? [permission as AgentMailSystemGrantDocument['permission']]
      : []
  )
}

type AgentAccessAuthResult =
  | Response
  | Awaited<ReturnType<GlobalAuth['api']['adminCreateOAuthClient']>>
  | Awaited<ReturnType<GlobalAuth['api']['approveCapability']>>
  | Awaited<ReturnType<GlobalAuth['api']['revokeAgent']>>
  | Awaited<ReturnType<GlobalAuth['api']['revokeCapability']>>

interface AgentAccessAuthResponseLike {
  clone?: () => { json: () => Promise<unknown> }
  json: () => Promise<unknown>
  ok: boolean
  status: number
}

async function readAgentAccessAuthResult(
  result: AgentAccessAuthResult,
  fallbackMessage: string
): Promise<Record<string, unknown>> {
  if (isAgentAccessAuthResponseLike(result)) {
    if (!result.ok) {
      throw await agentAccessErrorFromAuthResponse(result, fallbackMessage)
    }
    const body = await readAgentAccessAuthResponseBody(result)
    return isRecord(body) ? body : {}
  }
  return isRecord(result) ? result : {}
}

async function agentAccessErrorFromAuthResponse(
  response: AgentAccessAuthResponseLike,
  fallbackMessage: string
): Promise<AgentAccessError> {
  const body = await readAgentAccessAuthResponseBody(response)
  const publicError = readAgentAccessPublicAuthError(body)
  if (publicError) {
    return new AgentAccessError(publicError.message, toAgentAccessErrorStatus(response.status), {
      code: publicError.code,
      ...(publicError.webauthnOptions ? { webauthnOptions: publicError.webauthnOptions } : {})
    })
  }
  return new AgentAccessError(fallbackMessage, toAgentAccessErrorStatus(response.status))
}

async function readAgentAccessAuthResponseBody(response: AgentAccessAuthResponseLike): Promise<unknown> {
  const readable = typeof response.clone === 'function' ? response.clone() : response
  return await readable.json().catch(() => null)
}

function isAgentAccessAuthResponseLike(value: unknown): value is AgentAccessAuthResponseLike {
  return (
    isRecord(value) &&
    typeof value.ok === 'boolean' &&
    typeof value.status === 'number' &&
    typeof value.json === 'function'
  )
}

function readAgentAccessPublicAuthError(
  body: unknown
): { code: AgentAccessPublicErrorCode; message: string; webauthnOptions?: Record<string, unknown> } | null {
  if (!isRecord(body)) {
    return null
  }
  const maybeCode = body.error
  if (!isAgentAccessPublicErrorCode(maybeCode)) {
    return null
  }
  const maybeMessage = body.message
  const fallbackMessage = agentAccessPublicErrorFallbackMessage(maybeCode)
  return {
    code: maybeCode,
    message: typeof maybeMessage === 'string' && maybeMessage.trim() ? maybeMessage : fallbackMessage,
    ...(maybeCode === 'webauthn_required' && isRecord(body.webauthn_options)
      ? { webauthnOptions: body.webauthn_options }
      : {})
  }
}

function isAgentAccessPublicErrorCode(value: unknown): value is AgentAccessPublicErrorCode {
  return (
    value === 'webauthn_not_enrolled' ||
    value === 'webauthn_required' ||
    value === 'webauthn_verification_failed'
  )
}

function agentAccessPublicErrorFallbackMessage(code: AgentAccessPublicErrorCode): string {
  if (code === 'webauthn_not_enrolled') {
    return 'A registered passkey is required before approving this agent authorization request.'
  }
  if (code === 'webauthn_required') {
    return 'This agent authorization request requires passkey verification.'
  }
  return 'Passkey verification failed.'
}

function toAgentAccessErrorStatus(status: number): AgentAccessError['status'] {
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 412
  ) {
    return status
  }
  return 502
}

function toHostView(
  host: AgentHostDocument,
  organizationId: OrganizationId,
  agents: ReadonlyArray<AgentDocument>
): AgentAccessHost {
  const hostName = host.name?.trim()
  return {
    activatedAt: toISOString(host.activatedAt),
    agentCount: agents.filter((agent) => String(agent.hostId) === String(host._id)).length,
    createdAt: toISOString(host.createdAt),
    defaultCapabilities: parseAgentMailCapabilities(host.defaultCapabilities),
    expiresAt: toISOString(host.expiresAt),
    id: publicIdFromUUIDv7(host._id),
    lastUsedAt: toISOString(host.lastUsedAt),
    name: hostName === undefined || hostName === '' ? 'Unnamed host' : hostName,
    organizationId: String(organizationId),
    status: host.status
  }
}

function toAgentView({
  agent,
  context,
  grants,
  mailGrants
}: {
  agent: AgentDocument
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  grants: ReadonlyArray<AgentCapabilityGrantDocument>
  mailGrants: AgentAccessAgentMailGrants
}): AgentAccessAgent {
  const agentGrants = grants.filter((grant) => String(grant.agentId) === String(agent._id))
  return {
    activatedAt: toISOString(agent.activatedAt),
    activeCapabilityCount: agentGrants.filter((grant) => grant.status === 'active').length,
    canRevoke: canAgentAccessAgentRevoke({
      agent,
      context,
      mailGrants,
      scopedGrants: grants
    }),
    createdAt: toISOString(agent.createdAt),
    expiresAt: toISOString(agent.expiresAt),
    hostId: publicIdFromUUIDv7(agent.hostId),
    id: publicIdFromUUIDv7(agent._id),
    lastUsedAt: toISOString(agent.lastUsedAt),
    mode: agent.mode,
    name: agent.name,
    organizationId: String(context.organizationId),
    pendingCapabilityCount: agentGrants.filter((grant) => grant.status === 'pending').length,
    status: agent.status
  }
}

function toGrantView(
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>,
  grant: AgentCapabilityGrantDocument
): AgentAccessGrant {
  const capability = AgentMailCapabilitySchema.parse(grant.capability)
  const organizationId = agentAccessGrantOrganizationId(grant)
  const activeOrPending = grant.status === 'active' || grant.status === 'pending'

  return {
    agentId: publicIdFromUUIDv7(grant.agentId),
    canRevoke: canAgentAccessManage(context) && activeOrPending && canAgentAccessGrantManage(context, grant),
    capability,
    constraints: publicAgentAccessConstraints(grant.constraints),
    createdAt: toISOString(grant.createdAt),
    deniedBy: toAgentAccessUserActor(grant.deniedBy),
    deniedByUser: Boolean(grant.deniedBy),
    expiresAt: toISOString(grant.expiresAt),
    grantedBy: toAgentAccessUserActor(grant.grantedBy),
    grantedByUser: Boolean(grant.grantedBy),
    id: publicIdFromUUIDv7(grant._id),
    organizationId: publicAgentAccessOrganizationId(organizationId),
    reason: grant.reason ?? null,
    status: grant.status
  }
}

function toAgentAccessUserActor(userId: UserId | null | undefined): AgentAccessUserActor | null {
  return userId ? { id: publicIdFromUUIDv7(userId), type: 'user' } : null
}

function toApprovalView({
  approval,
  context,
  grants,
  now
}: {
  approval: ApprovalRequestDocument
  context: Awaited<ReturnType<typeof requireAgentAccessUserContext>>
  grants: ReadonlyArray<AgentCapabilityGrantDocument>
  now: Date
}): AgentAccessApproval {
  const capabilities = parseAgentMailCapabilities(approval.capabilities)
  const canManage = canManageAgentAccessApproval({ approval, context, scopedGrants: grants })

  return {
    agentId: approval.agentId ? publicIdFromUUIDv7(approval.agentId) : null,
    bindingMessage: approval.bindingMessage ?? null,
    canDeny: canManage,
    canReview: canManage,
    capabilityRequests: toApprovalCapabilityRequests(approval, capabilities, grants),
    capabilities,
    createdAt: toISOString(approval.createdAt),
    expiresAt: toISOString(approval.expiresAt),
    hostId: approval.hostId ? publicIdFromUUIDv7(approval.hostId) : null,
    id: publicIdFromUUIDv7(approval._id),
    method: approval.method,
    status: approvalStatusForView(approval, now)
  }
}

function approvalStatusForView(
  approval: Pick<ApprovalRequestDocument, 'expiresAt' | 'status'>,
  now: Date
): AgentAuthApprovalStatus {
  return approval.status === 'pending' && isExpired(approval.expiresAt, now) ? 'expired' : approval.status
}

function toApprovalCapabilityRequests(
  approval: ApprovalRequestDocument,
  capabilities: ReadonlyArray<AgentMailCapability>,
  grants: ReadonlyArray<AgentCapabilityGrantDocument>
): AgentAccessApprovalCapability[] {
  const capabilitySet = new Set(capabilities)
  const agentId = approval.agentId ? String(approval.agentId) : null
  const pendingRequests = agentId
    ? grants.flatMap((grant) => {
        const capability = AgentMailCapabilitySchema.safeParse(grant.capability)
        if (
          grant.status !== 'pending' ||
          String(grant.agentId) !== agentId ||
          !capability.success ||
          !capabilitySet.has(capability.data)
        ) {
          return []
        }
        return [
          {
            approvalStrength: agentAccessApprovalStrengthForCapability(capability.data),
            capability: capability.data,
            constraints: publicAgentAccessConstraints(grant.constraints),
            reason: grant.reason ?? null
          }
        ]
      })
    : []

  if (pendingRequests.length > 0) {
    return pendingRequests.sort((left, right) => left.capability.localeCompare(right.capability))
  }

  return capabilities.map((capability) => ({
    approvalStrength: agentAccessApprovalStrengthForCapability(capability),
    capability,
    constraints: null,
    reason: null
  }))
}

function agentAccessApprovalStrengthForCapability(capability: AgentMailCapability): ApprovalStrength {
  const definition = AGENT_AUTH_CAPABILITIES.find((candidate) => candidate.name === capability)
  return definition && 'approvalStrength' in definition ? definition.approvalStrength : 'session'
}

function hasScopedApprovalGrant(
  approval: ApprovalRequestDocument,
  grants: ReadonlyArray<AgentCapabilityGrantDocument>
): boolean {
  if (!approval.agentId) {
    return false
  }

  const agentId = String(approval.agentId)
  const capabilities = new Set(parseAgentMailCapabilities(approval.capabilities))
  return grants.some((grant) => {
    if (String(grant.agentId) !== agentId) {
      return false
    }
    if (capabilities.size === 0) {
      return true
    }
    const capability = AgentMailCapabilitySchema.safeParse(grant.capability)
    return capability.success && capabilities.has(capability.data)
  })
}

function parseCapabilities(value: string | null | undefined): string[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string').sort()
    }
  } catch {
    // Better Auth stores approval capabilities as a space-delimited string.
  }

  return value
    .split(/\s+/u)
    .map((capability) => capability.trim())
    .filter(Boolean)
    .sort()
}

function parseAgentMailCapabilities(value: string | null | undefined): AgentMailCapability[] {
  return parseCapabilities(value).flatMap((capability) => {
    const parsed = AgentMailCapabilitySchema.safeParse(capability)
    return parsed.success ? [parsed.data] : []
  })
}

function agentAccessGrantOrganizationId(
  grant: Pick<AgentCapabilityGrantDocument, 'capability' | 'constraints'>
) {
  const capability = AgentMailCapabilitySchema.safeParse(grant.capability)
  if (!capability.success) {
    return null
  }

  const grantConstraints = agentAccessGrantConstraints(grant.constraints)
  const constraints = capability.data.startsWith('email.message.')
    ? AgentMailMailboxCapabilityGrantConstraints.safeParse(grantConstraints)
    : AgentMailOrganizationCapabilityGrantConstraints.safeParse(grantConstraints)

  return constraints.success ? constraints.data.organizationId : null
}

function isPendingAgentAccessGrantReadyForOrganizationBinding(
  grant: Pick<AgentCapabilityGrantDocument, 'capability' | 'constraints' | 'status'>
) {
  return (
    grant.status === 'pending' && agentAccessGrantConstraintsForOrganizationBinding(grant, 'org') !== null
  )
}

function agentAccessGrantConstraintsForOrganizationBinding(
  grant: Pick<AgentCapabilityGrantDocument, 'capability' | 'constraints'>,
  organizationId: OrganizationId | string
): Record<string, unknown> | null {
  const capability = AgentMailCapabilitySchema.safeParse(grant.capability)
  if (!capability.success) {
    return null
  }

  const grantConstraints = agentAccessGrantConstraints(grant.constraints)
  if (capability.data.startsWith('email.message.')) {
    const constraints = AgentMailMailboxCapabilityRequestConstraints.safeParse(grantConstraints)
    return constraints.success ? { ...constraints.data, organizationId: String(organizationId) } : null
  }

  const constraints = AgentMailOrganizationCapabilityRequestConstraints.safeParse(grantConstraints ?? {})
  return constraints.success ? { organizationId: String(organizationId) } : null
}

function agentAccessGrantMailboxAddress(
  grant: Pick<AgentCapabilityGrantDocument, 'capability' | 'constraints'>
) {
  const capability = AgentMailCapabilitySchema.safeParse(grant.capability)
  if (!capability.success || !capability.data.startsWith('email.message.')) {
    return null
  }

  const grantConstraints = agentAccessGrantConstraints(grant.constraints)
  const constraints = AgentMailMailboxCapabilityGrantConstraints.safeParse(grantConstraints)
  if (constraints.success) {
    return constraints.data.mailboxAddress
  }
  const requestConstraints = AgentMailMailboxCapabilityRequestConstraints.safeParse(grantConstraints)
  return requestConstraints.success ? requestConstraints.data.mailboxAddress : null
}

function agentAccessGrantConstraints(value: unknown) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return value
    }
  }
  return value
}

function normalizedAgentAccessMailbox(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function normalizedRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return isRecord(value) ? value : null
}

function publicAgentAccessConstraints(value: unknown): Record<string, unknown> | null {
  const constraints = normalizedRecord(value)
  if (!constraints) {
    return null
  }

  const publicConstraints = Object.fromEntries(
    Object.entries(constraints).filter(([key]) => key !== 'organizationId')
  )
  return Object.keys(publicConstraints).length ? publicConstraints : null
}

function publicAgentAccessOrganizationId(organizationId: string | null): string | null {
  return organizationId ? publicIdFromUUIDv7(organizationId) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toISOString(value: Date | null | undefined) {
  return value instanceof Date ? value.toISOString() : null
}

function isExpired(value: Date | null | undefined, now: Date) {
  return value instanceof Date && value.getTime() <= now.getTime()
}

function nullLast(value: string | null) {
  return value ?? '9999-12-31T23:59:59.999Z'
}
