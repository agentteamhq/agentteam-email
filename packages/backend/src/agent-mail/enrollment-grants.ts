import { parseUUIDv7 } from '@main/common'
import type {
  AgentHostId,
  AgentId,
  AgentMailAgentEnrollmentGrantRequestDocument,
  AgentMailMailboxGrant,
  AgentMailSystemPermission,
  OrganizationId,
  UserId
} from '@main/db'
import type { Database } from '../db/db'
import type { ClientSession } from 'mongoose'

export interface AgentMailEnrollmentMailboxGrantRequest {
  capabilities: ReadonlyArray<AgentMailMailboxGrant>
  mailboxAddress: string
}

export interface CreateAgentMailEnrollmentGrantRequestInput {
  db: Database
  grantExpiresAt: Date | null
  hostId: string
  mailboxGrants: ReadonlyArray<AgentMailEnrollmentMailboxGrantRequest>
  name: string
  organizationId: OrganizationId
  requestedByUserId?: UserId | null
  systemPermissions: ReadonlyArray<AgentMailSystemPermission>
}

export interface ApplyAgentMailEnrollmentGrantRequestResult {
  applied: boolean
  mailboxGrantCount: number
  status: 'applied' | 'expired' | 'missing'
  systemGrantCount: number
}

export async function createAgentMailEnrollmentGrantRequest({
  db,
  grantExpiresAt,
  hostId,
  mailboxGrants,
  name,
  organizationId,
  requestedByUserId,
  systemPermissions
}: CreateAgentMailEnrollmentGrantRequestInput): Promise<AgentMailAgentEnrollmentGrantRequestDocument> {
  return await db.models.agentMailAgentEnrollmentGrantRequest.create({
    grantExpiresAt,
    hostId: parseHostId(hostId),
    mailboxGrants: mailboxGrants.map((grant) => ({
      capabilities: [...grant.capabilities],
      mailboxAddress: grant.mailboxAddress
    })),
    name,
    organizationId,
    requestedByUserId: requestedByUserId ?? undefined,
    status: 'pending',
    systemPermissions: [...systemPermissions]
  })
}

export async function applyAgentMailEnrollmentGrantRequestForAgent({
  agentId,
  db,
  hostId
}: {
  agentId: string
  db: Database
  hostId: string
}): Promise<ApplyAgentMailEnrollmentGrantRequestResult> {
  const now = new Date()
  const hostUuid = parseHostId(hostId)
  const agentUuid = parseAgentId(agentId)

  return await withEnrollmentGrantTransaction(db, async (session) => {
    const request = await execEnrollmentQuery(
      db.models.agentMailAgentEnrollmentGrantRequest.findOne({
        hostId: hostUuid,
        status: 'pending'
      }),
      session
    )

    if (!request) {
      return { applied: false, mailboxGrantCount: 0, status: 'missing', systemGrantCount: 0 }
    }

    if (request.grantExpiresAt && request.grantExpiresAt <= now) {
      await execEnrollmentQuery(
        db.models.agentMailAgentEnrollmentGrantRequest.updateOne(
          { _id: request._id, status: 'pending' },
          { $set: { status: 'expired', updatedAt: now } }
        ),
        session
      )
      return { applied: false, mailboxGrantCount: 0, status: 'expired', systemGrantCount: 0 }
    }

    const agent = await execEnrollmentQuery(db.models.agent.findById(agentUuid), session)
    if (!agent || String(agent.hostId) !== String(request.hostId)) {
      return { applied: false, mailboxGrantCount: 0, status: 'missing', systemGrantCount: 0 }
    }

    const claimResult = await execEnrollmentQuery(
      db.models.agentMailAgentEnrollmentGrantRequest.updateOne(
        { _id: request._id, status: 'pending' },
        {
          $set: {
            appliedAgentId: agent._id,
            appliedAt: now,
            status: 'applied',
            updatedAt: now
          }
        }
      ),
      session
    )
    if (!updateMatched(claimResult)) {
      return { applied: false, mailboxGrantCount: 0, status: 'missing', systemGrantCount: 0 }
    }

    const principalId = String(agent._id)
    const mailboxGrantWrites = request.mailboxGrants.flatMap((mailboxGrant) =>
      [...new Set(mailboxGrant.capabilities)].sort().map((capability) =>
        db.models.agentMailMailboxGrant.updateOne(
          {
            capability,
            mailboxAddress: mailboxGrant.mailboxAddress,
            organizationId: request.organizationId,
            principalId,
            principalType: 'agent'
          },
          {
            $set: {
              constraints: null,
              expiresAt: request.grantExpiresAt ?? null,
              grantedByUserId: request.requestedByUserId ?? undefined,
              status: 'active',
              updatedAt: now
            },
            $setOnInsert: {
              capability,
              createdAt: now,
              mailboxAddress: mailboxGrant.mailboxAddress,
              organizationId: request.organizationId,
              principalId,
              principalType: 'agent'
            }
          },
          { upsert: true }
        )
      )
    )
    const systemGrantWrites = [...new Set(request.systemPermissions)].sort().map((permission) =>
      db.models.agentMailSystemGrant.updateOne(
        {
          organizationId: request.organizationId,
          permission,
          principalId,
          principalType: 'agent'
        },
        {
          $set: {
            constraints: null,
            expiresAt: request.grantExpiresAt ?? null,
            grantedByUserId: request.requestedByUserId ?? undefined,
            status: 'active',
            updatedAt: now
          },
          $setOnInsert: {
            createdAt: now,
            organizationId: request.organizationId,
            permission,
            principalId,
            principalType: 'agent'
          }
        },
        { upsert: true }
      )
    )

    await Promise.all(
      [...mailboxGrantWrites, ...systemGrantWrites].map((query) => execEnrollmentQuery(query, session))
    )
    await db.models.auditLog.create(
      [
        {
          action: 'agent_mail.agent.enrollment_grants.applied',
          metadata: {
            agentId: String(agent._id),
            hostId: String(request.hostId),
            mailboxGrantCount: mailboxGrantWrites.length,
            organizationId: String(request.organizationId),
            systemGrantCount: systemGrantWrites.length
          },
          severity: 'medium',
          status: 'success',
          userId: request.requestedByUserId ?? null
        }
      ],
      { session }
    )

    return {
      applied: true,
      mailboxGrantCount: mailboxGrantWrites.length,
      status: 'applied',
      systemGrantCount: systemGrantWrites.length
    }
  })
}

function parseHostId(value: string): AgentHostId {
  return parseUUIDv7(value) as AgentHostId
}

function parseAgentId(value: string): AgentId {
  return parseUUIDv7(value) as AgentId
}

function updateMatched(result: unknown) {
  if (!result || typeof result !== 'object') {
    return false
  }
  const record = result as {
    matchedCount?: unknown
    n?: unknown
  }
  return record.matchedCount === undefined ? Number(record.n ?? 0) > 0 : Number(record.matchedCount) > 0
}

type EnrollmentExecutableQuery<T> = {
  exec: () => Promise<T>
  session?: (session: ClientSession) => EnrollmentExecutableQuery<T>
}

async function execEnrollmentQuery<T>(
  query: EnrollmentExecutableQuery<T>,
  session: ClientSession
): Promise<T> {
  return (query.session?.(session) ?? query).exec()
}

async function withEnrollmentGrantTransaction<T>(
  db: Pick<Database, 'connection'>,
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  const transaction = db.connection.transaction.bind(db.connection)
  return transaction((session) => operation(session))
}
