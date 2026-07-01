import {
  AgentMailDomainStatusValues,
  AgentMailWorkerDeploymentStatusValues,
  CloudflareProvisioningStatusValues,
  publicIdFromUUIDv7
} from '@main/db'

import { getUser } from '../auth/get-user'
import { globals } from '../globals'
import type {
  AgentMailDomainStatus,
  AgentMailWorkerDeploymentStatus,
  AuditLogPublicId,
  AuditLogSeverity,
  AuditLogStatus,
  CloudflareProvisioningStatus
} from '@main/db'

type AdminDashboardDatabase = Awaited<ReturnType<typeof globals>>['db']
type AdminDashboardUser = NonNullable<Awaited<ReturnType<typeof getUser>>>

const ADMIN_AUDIT_LOG_PAGE_SIZES = [25, 50, 100] as const

export type AdminAuditLogPageSize = 25 | 50 | 100
export type AdminAuditLogStatusFilter = AuditLogStatus | 'all'
export type AdminAuditLogSeverityFilter = AuditLogSeverity | 'all'

export interface AdminDashboardStatusCount<TStatus extends string = string> {
  count: number
  status: TStatus
}

export interface AdminDashboardAuditEvent {
  action: string
  createdAt: string
  id: AuditLogPublicId
  severity: AuditLogSeverity
  status: AuditLogStatus
}

export interface AdminDashboardSummary {
  audit: {
    failedCount: number
    highSeverityCount: number
    recent: AdminDashboardAuditEvent[]
    totalCount: number
  }
  generatedAt: string
  provisioning: {
    credentialRefreshes: {
      failedCount: number
      lastFailureAt: string | null
      pendingCount: number
    }
    domains: {
      byStatus: AdminDashboardStatusCount<AgentMailDomainStatus>[]
      lastRuntimeSyncedAt: string | null
      totalCount: number
    }
    workerDeployments: {
      byProvisioningStatus: AdminDashboardStatusCount<CloudflareProvisioningStatus>[]
      byStatus: AdminDashboardStatusCount<AgentMailWorkerDeploymentStatus>[]
      credentialsDueCount: number
      credentialsExpiredCount: number
      lastDeployedAt: string | null
      totalCount: number
    }
  }
  setup: {
    activeSessionCount: number
    adminConfigured: boolean
    adminCount: number
    databaseReachable: boolean
    organizationCount: number
    userCount: number
  }
}

export interface AdminAuditLogListInput {
  action?: string
  page?: number
  pageSize?: AdminAuditLogPageSize
  severity?: AdminAuditLogSeverityFilter
  status?: AdminAuditLogStatusFilter
}

export interface AdminAuditLogListFilters {
  action: string | null
  severity: AdminAuditLogSeverityFilter
  status: AdminAuditLogStatusFilter
}

export interface AdminAuditLogListPagination {
  hasNextPage: boolean
  hasPreviousPage: boolean
  page: number
  pageSize: AdminAuditLogPageSize
  totalCount: number
  totalPages: number
}

export interface AdminAuditLogList {
  events: AdminDashboardAuditEvent[]
  filters: AdminAuditLogListFilters
  pagination: AdminAuditLogListPagination
}

export class AdminDashboardAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403
  ) {
    super(message)
    this.name = 'AdminDashboardAccessError'
  }
}

export function isAdminDashboardAccessError(error: unknown): error is AdminDashboardAccessError {
  return error instanceof AdminDashboardAccessError
}

export async function getAdminDashboardSummary(headers: Headers): Promise<AdminDashboardSummary> {
  await requireAdminUser(headers)

  const { db } = await globals()
  const now = new Date()

  const [
    adminCount,
    userCount,
    activeSessionCount,
    organizationCount,
    domainTotalCount,
    domainStatusCounts,
    latestDomainSync,
    workerDeploymentTotalCount,
    workerDeploymentStatusCounts,
    workerDeploymentProvisioningStatusCounts,
    workerCredentialsDueCount,
    workerCredentialsExpiredCount,
    latestWorkerDeployment,
    pendingCredentialRefreshCount,
    failedCredentialRefreshCount,
    latestCredentialRefreshFailure,
    auditTotalCount,
    auditFailedCount,
    auditHighSeverityCount,
    recentAuditEvents
  ] = await Promise.all([
    db.models.user.countDocuments({ role: 'admin' }).exec(),
    db.models.user.countDocuments({}).exec(),
    db.models.session.countDocuments({ expiresAt: { $gt: now } }).exec(),
    db.models.organization.countDocuments({}).exec(),
    db.models.agentMailDomain.countDocuments({}).exec(),
    countAgentMailDomainStatuses(db),
    db.models.agentMailDomain
      .findOne({ lastRuntimeSyncedAt: { $ne: null } })
      .sort({ lastRuntimeSyncedAt: -1 })
      .select({ lastRuntimeSyncedAt: 1 })
      .exec(),
    db.models.agentMailWorkerDeployment.countDocuments({}).exec(),
    countAgentMailWorkerDeploymentStatuses(db),
    countAgentMailWorkerDeploymentProvisioningStatuses(db),
    db.models.agentMailWorkerDeployment
      .countDocuments({
        credentialRefreshAfter: { $lte: now },
        status: { $in: ['active', 'degraded'] }
      })
      .exec(),
    db.models.agentMailWorkerDeployment
      .countDocuments({
        credentialExpiresAt: { $lte: now },
        status: { $in: ['active', 'degraded'] }
      })
      .exec(),
    db.models.agentMailWorkerDeployment
      .findOne({ lastDeployedAt: { $ne: null } })
      .sort({ lastDeployedAt: -1 })
      .select({ lastDeployedAt: 1 })
      .exec(),
    db.models.agentMailWorkerCredentialRefresh.countDocuments({ status: 'pending' }).exec(),
    db.models.agentMailWorkerCredentialRefresh.countDocuments({ status: 'failed' }).exec(),
    db.models.agentMailWorkerCredentialRefresh
      .findOne({ status: 'failed' })
      .sort({ startedAt: -1 })
      .select({ startedAt: 1 })
      .exec(),
    db.models.auditLog.countDocuments({}).exec(),
    db.models.auditLog.countDocuments({ status: 'failed' }).exec(),
    db.models.auditLog.countDocuments({ severity: { $in: ['high', 'critical'] } }).exec(),
    db.models.auditLog
      .find({})
      .sort({ createdAt: -1 })
      .limit(8)
      .select({ _id: 1, action: 1, createdAt: 1, severity: 1, status: 1 })
      .exec()
  ])

  return {
    audit: {
      failedCount: auditFailedCount,
      highSeverityCount: auditHighSeverityCount,
      recent: recentAuditEvents.map((event) => ({
        action: event.action,
        createdAt: toISOString(event.createdAt),
        id: publicIdFromUUIDv7(event._id) as AuditLogPublicId,
        severity: event.severity,
        status: event.status
      })),
      totalCount: auditTotalCount
    },
    generatedAt: now.toISOString(),
    provisioning: {
      credentialRefreshes: {
        failedCount: failedCredentialRefreshCount,
        lastFailureAt: toNullableISOString(latestCredentialRefreshFailure?.startedAt),
        pendingCount: pendingCredentialRefreshCount
      },
      domains: {
        byStatus: domainStatusCounts,
        lastRuntimeSyncedAt: toNullableISOString(latestDomainSync?.lastRuntimeSyncedAt),
        totalCount: domainTotalCount
      },
      workerDeployments: {
        byProvisioningStatus: workerDeploymentProvisioningStatusCounts,
        byStatus: workerDeploymentStatusCounts,
        credentialsDueCount: workerCredentialsDueCount,
        credentialsExpiredCount: workerCredentialsExpiredCount,
        lastDeployedAt: toNullableISOString(latestWorkerDeployment?.lastDeployedAt),
        totalCount: workerDeploymentTotalCount
      }
    },
    setup: {
      activeSessionCount,
      adminConfigured: adminCount > 0,
      adminCount,
      databaseReachable: true,
      organizationCount,
      userCount
    }
  }
}

export async function getAdminAuditLogList(
  headers: Headers,
  input: AdminAuditLogListInput = {}
): Promise<AdminAuditLogList> {
  await requireAdminUser(headers)

  const { db } = await globals()
  const filters = normalizeAdminAuditLogFilters(input)
  const page = normalizeAdminAuditLogPage(input.page)
  const pageSize = normalizeAdminAuditLogPageSize(input.pageSize)
  const queryFilter = adminAuditLogMongoFilter(filters)
  const skip = (page - 1) * pageSize

  const [totalCount, events] = await Promise.all([
    db.models.auditLog.countDocuments(queryFilter).exec(),
    db.models.auditLog
      .find(queryFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .select({ _id: 1, action: 1, createdAt: 1, severity: 1, status: 1 })
      .exec()
  ])
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0

  return {
    events: events.map((event) => ({
      action: event.action,
      createdAt: toISOString(event.createdAt),
      id: publicIdFromUUIDv7(event._id) as AuditLogPublicId,
      severity: event.severity,
      status: event.status
    })),
    filters,
    pagination: {
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      page,
      pageSize,
      totalCount,
      totalPages
    }
  }
}

export async function requireAdminUser(headers: Headers): Promise<AdminDashboardUser> {
  const user = await getUser(headers)

  if (!user) {
    throw new AdminDashboardAccessError('Authentication required.', 401)
  }

  if (user.role !== 'admin') {
    throw new AdminDashboardAccessError('Admin access is required.', 403)
  }

  return user
}

function normalizeAdminAuditLogFilters(input: AdminAuditLogListInput): AdminAuditLogListFilters {
  return {
    action: normalizeAdminAuditLogAction(input.action),
    severity: normalizeAdminAuditLogSeverity(input.severity),
    status: normalizeAdminAuditLogStatus(input.status)
  }
}

function normalizeAdminAuditLogAction(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().slice(0, 80)
  return normalized.length > 0 ? normalized : null
}

function normalizeAdminAuditLogSeverity(
  value: AdminAuditLogSeverityFilter | undefined
): AdminAuditLogSeverityFilter {
  return value && (value === 'all' || ['low', 'medium', 'high', 'critical'].includes(value)) ? value : 'all'
}

function normalizeAdminAuditLogStatus(value: AdminAuditLogStatusFilter | undefined): AdminAuditLogStatusFilter {
  return value && (value === 'all' || ['success', 'failed'].includes(value)) ? value : 'all'
}

function normalizeAdminAuditLogPage(value: number | undefined): number {
  return Number.isInteger(value) && value && value > 0 ? value : 1
}

function normalizeAdminAuditLogPageSize(value: number | undefined): AdminAuditLogPageSize {
  return ADMIN_AUDIT_LOG_PAGE_SIZES.includes(value as AdminAuditLogPageSize)
    ? (value as AdminAuditLogPageSize)
    : 25
}

function adminAuditLogMongoFilter(filters: AdminAuditLogListFilters): Record<string, unknown> {
  const filter: Record<string, unknown> = {}

  if (filters.status !== 'all') {
    filter.status = filters.status
  }

  if (filters.severity !== 'all') {
    filter.severity = filters.severity
  }

  if (filters.action) {
    filter.action = new RegExp(escapeRegex(filters.action), 'iu')
  }

  return filter
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

async function countAgentMailDomainStatuses(
  db: AdminDashboardDatabase
): Promise<AdminDashboardStatusCount<AgentMailDomainStatus>[]> {
  return Promise.all(
    AgentMailDomainStatusValues.map(async (status) => ({
      count: await db.models.agentMailDomain.countDocuments({ status }).exec(),
      status
    }))
  )
}

async function countAgentMailWorkerDeploymentStatuses(
  db: AdminDashboardDatabase
): Promise<AdminDashboardStatusCount<AgentMailWorkerDeploymentStatus>[]> {
  return Promise.all(
    AgentMailWorkerDeploymentStatusValues.map(async (status) => ({
      count: await db.models.agentMailWorkerDeployment.countDocuments({ status }).exec(),
      status
    }))
  )
}

async function countAgentMailWorkerDeploymentProvisioningStatuses(
  db: AdminDashboardDatabase
): Promise<AdminDashboardStatusCount<CloudflareProvisioningStatus>[]> {
  return Promise.all(
    CloudflareProvisioningStatusValues.map(async (status) => ({
      count: await db.models.agentMailWorkerDeployment.countDocuments({ provisioningStatus: status }).exec(),
      status
    }))
  )
}

function toNullableISOString(value: Date | null | undefined): string | null {
  return value ? toISOString(value) : null
}

function toISOString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
