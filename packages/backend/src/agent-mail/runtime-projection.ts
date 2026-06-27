import { HttpStatusCode } from '@main/common'
import { normalizeMongooseUUIDv7, publicIdFromUUIDv7 } from '@main/db'
import debug from 'debug'

import { globals } from '../globals'
import { hasValidControlToWebToken } from './control-to-web-auth'
import { syncAgentMailRuntime } from './control-client'
import type { AgentMailRuntimeDomainProjection } from './control-client'
import type { Database } from '../db/db'
import type {
  AgentMailDomainDocument,
  AgentMailDomainId,
  AgentMailWorkerDeploymentDocument,
  CloudflareConnectionDocument,
  MongooseUUIDValue,
  OrganizationPublicId
} from '@main/db'

const log = debug('app:agent-mail-runtime')

const ACTIVE_RUNTIME_DOMAIN_STATUSES = ['active', 'degraded'] as const
const ACTIVE_RUNTIME_DEPLOYMENT_STATUSES = ['active', 'degraded'] as const
const ACTIVE_RUNTIME_CONNECTION_STATUSES = ['active', 'degraded'] as const
interface RuntimeProjectionSnapshot {
  domainIds: AgentMailDomainId[]
  domains: AgentMailRuntimeDomainProjection[]
}

export interface AgentMailRuntimeProjectionSyncResult {
  changed: boolean
  domains: number
  reason: string
}

export function createAgentMailArchivePrefix(
  organizationPublicId: OrganizationPublicId | string,
  domain: string
): string {
  return `orgs/${organizationPublicId}/domains/${normalizeRuntimeDomain(domain)}/mail/inbound`
}

export async function buildAgentMailRuntimeProjection(
  db: Database
): Promise<AgentMailRuntimeDomainProjection[]> {
  return (await buildAgentMailRuntimeProjectionSnapshot(db)).domains
}

export async function syncAgentMailRuntimeProjection(
  db: Database,
  { reason }: { reason: string }
): Promise<AgentMailRuntimeProjectionSyncResult> {
  const snapshot = await buildAgentMailRuntimeProjectionSnapshot(db)
  const result = await syncAgentMailRuntime(snapshot.domains)
  const syncedAt = new Date()
  if (snapshot.domainIds.length > 0) {
    await db.models.agentMailDomain
      .updateMany(
        { _id: { $in: snapshot.domainIds } },
        {
          $set: {
            lastRuntimeSyncedAt: syncedAt,
            lastErrorCode: null,
            lastErrorMessage: null
          }
        }
      )
      .exec()
  }

  log('synced Agent Mail runtime projection', {
    changed: result.changed,
    domains: snapshot.domains.length,
    reason
  })

  return {
    changed: result.changed,
    domains: snapshot.domains.length,
    reason
  }
}

export async function handleAgentMailRuntimeSnapshotRequest(request: Request): Promise<Response> {
  if (!hasValidControlToWebToken(request)) {
    return Response.json(
      { message: 'Unauthorized' },
      {
        status: HttpStatusCode.Unauthorized
      }
    )
  }

  const { db } = await globals()
  return Response.json({
    domains: await buildAgentMailRuntimeProjection(db)
  })
}

async function buildAgentMailRuntimeProjectionSnapshot(db: Database): Promise<RuntimeProjectionSnapshot> {
  const domainRecords = await db.models.agentMailDomain
    .find({ status: { $in: [...ACTIVE_RUNTIME_DOMAIN_STATUSES] } })
    .sort({ domain: 1, updatedAt: 1 })
    .exec()

  if (domainRecords.length === 0) {
    return {
      domainIds: [],
      domains: []
    }
  }

  const domainIds = domainRecords.map((domain) => domain._id)
  const connectionIds = domainRecords.map((domain) => domain.cloudflareConnectionId)
  const [deploymentRecords, connectionRecords] = await Promise.all([
    db.models.agentMailWorkerDeployment
      .find({
        agentMailDomainId: { $in: domainIds },
        status: { $in: [...ACTIVE_RUNTIME_DEPLOYMENT_STATUSES] }
      })
      .exec(),
    db.models.cloudflareConnection
      .find({
        _id: { $in: connectionIds },
        status: { $in: [...ACTIVE_RUNTIME_CONNECTION_STATUSES] }
      })
      .exec()
  ])
  const deploymentsByDomain = new Map(
    deploymentRecords.map((deployment) => [uuidKey(deployment.agentMailDomainId), deployment])
  )
  const connectionsById = new Map(
    connectionRecords.map((connection) => [uuidKey(connection._id), connection])
  )
  const domains: AgentMailRuntimeDomainProjection[] = []
  const projectedDomainIds: AgentMailDomainId[] = []

  for (const domain of domainRecords) {
    const deployment = deploymentsByDomain.get(uuidKey(domain._id))
    const connection = connectionsById.get(uuidKey(domain.cloudflareConnectionId))
    if (!deployment || !connection) {
      continue
    }

    domains.push(runtimeProjectionForDomain({ connection, deployment, domain }))
    projectedDomainIds.push(domain._id)
  }

  return {
    domainIds: projectedDomainIds,
    domains
  }
}

function runtimeProjectionForDomain({
  connection,
  deployment,
  domain
}: {
  connection: CloudflareConnectionDocument
  deployment: AgentMailWorkerDeploymentDocument
  domain: AgentMailDomainDocument
}): AgentMailRuntimeDomainProjection {
  const normalizedDomain = normalizeRuntimeDomain(domain.domain)
  return {
    organization_id: normalizeMongooseUUIDv7(domain.organizationId),
    organization_public_id: domain.organizationPublicId,
    archive_prefix:
      domain.archivePrefix ||
      deployment.archivePrefix ||
      connection.archivePrefix ||
      createAgentMailArchivePrefix(domain.organizationPublicId, normalizedDomain),
    worker_connection_id: deployment.workerConnectionId,
    worker_domain_deployment_id: publicIdFromUUIDv7(domain._id),
    cloudflare_zone_name: domain.cloudflareZoneName ?? connection.cloudflareZoneName ?? normalizedDomain,
    domain: normalizedDomain,
    enabled: true,
    mail_from_domain: normalizedDomain
  }
}

function uuidKey(value: MongooseUUIDValue): string {
  return normalizeMongooseUUIDv7(value)
}

function normalizeRuntimeDomain(domain: string): string {
  const normalized = domain.trim().toLowerCase()
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(normalized)
  ) {
    throw new Error('Domain must be a valid hostname')
  }
  return normalized
}
