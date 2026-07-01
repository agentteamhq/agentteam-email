import { Elysia, t } from 'elysia'

import {
  getAdminAuditLogList,
  getAdminDashboardSummary,
  isAdminDashboardAccessError
} from '../admin/dashboard-service'
import { typedResponseSchema } from './response-schema'
import type { TSchema } from '@sinclair/typebox'
import type {
  AdminAuditLogList,
  AdminAuditLogPageSize,
  AdminDashboardStatusCount,
  AdminDashboardSummary
} from '../admin/dashboard-service'

const adminDashboardErrorResponseSchemas = {
  401: t.Object({ error: t.String() }),
  403: t.Object({ error: t.String() })
}

type AdminResponseSet = {
  status?: number | string
}

function enumObject<const TValues extends readonly string[]>(
  values: TValues
): { [TValue in TValues[number]]: TValue } {
  return Object.fromEntries(values.map((value) => [value, value])) as {
    [TValue in TValues[number]]: TValue
  }
}

const agentMailDomainStatusSchema = t.Enum(
  enumObject(['connected', 'provisioning', 'active', 'degraded', 'disconnected'] as const)
)
const agentMailWorkerDeploymentStatusSchema = t.Enum(
  enumObject(['pending', 'active', 'degraded', 'disabled', 'disconnected'] as const)
)
const cloudflareProvisioningStatusSchema = t.Enum(
  enumObject(['not_started', 'pending', 'succeeded', 'failed'] as const)
)
const auditStatusSchema = t.Enum(enumObject(['success', 'failed'] as const))
const auditSeveritySchema = t.Enum(enumObject(['low', 'medium', 'high', 'critical'] as const))
const auditStatusFilterSchema = t.Union([t.Literal('all'), auditStatusSchema])
const auditSeverityFilterSchema = t.Union([t.Literal('all'), auditSeveritySchema])

const nullableDateStringSchema = t.Nullable(t.String())

function statusCountResponseSchema<TStatus extends string>(statusSchema: TSchema) {
  return typedResponseSchema<AdminDashboardStatusCount<TStatus>>(
    t.Object({
      count: t.Number(),
      status: statusSchema
    })
  )
}

const adminDashboardSummaryResponseSchema = typedResponseSchema<AdminDashboardSummary>(
  t.Object({
    audit: t.Object({
      failedCount: t.Number(),
      highSeverityCount: t.Number(),
      recent: t.Array(
        t.Object({
          action: t.String(),
          createdAt: t.String(),
          id: t.String(),
          severity: auditSeveritySchema,
          status: auditStatusSchema
        })
      ),
      totalCount: t.Number()
    }),
    generatedAt: t.String(),
    provisioning: t.Object({
      credentialRefreshes: t.Object({
        failedCount: t.Number(),
        lastFailureAt: nullableDateStringSchema,
        pendingCount: t.Number()
      }),
      domains: t.Object({
        byStatus: t.Array(statusCountResponseSchema(agentMailDomainStatusSchema)),
        lastRuntimeSyncedAt: nullableDateStringSchema,
        totalCount: t.Number()
      }),
      workerDeployments: t.Object({
        byProvisioningStatus: t.Array(statusCountResponseSchema(cloudflareProvisioningStatusSchema)),
        byStatus: t.Array(statusCountResponseSchema(agentMailWorkerDeploymentStatusSchema)),
        credentialsDueCount: t.Number(),
        credentialsExpiredCount: t.Number(),
        lastDeployedAt: nullableDateStringSchema,
        totalCount: t.Number()
      })
    }),
    setup: t.Object({
      activeSessionCount: t.Number(),
      adminConfigured: t.Boolean(),
      adminCount: t.Number(),
      databaseReachable: t.Boolean(),
      organizationCount: t.Number(),
      userCount: t.Number()
    })
  })
)

const adminAuditLogListResponseSchema = typedResponseSchema<AdminAuditLogList>(
  t.Object({
    events: t.Array(
      t.Object({
        action: t.String(),
        createdAt: t.String(),
        id: t.String(),
        severity: auditSeveritySchema,
        status: auditStatusSchema
      })
    ),
    filters: t.Object({
      action: t.Nullable(t.String()),
      severity: auditSeverityFilterSchema,
      status: auditStatusFilterSchema
    }),
    pagination: t.Object({
      hasNextPage: t.Boolean(),
      hasPreviousPage: t.Boolean(),
      page: t.Number(),
      pageSize: t.Union([t.Literal(25), t.Literal(50), t.Literal(100)]),
      totalCount: t.Number(),
      totalPages: t.Number()
    })
  })
)

const admin = new Elysia({
  name: 'admin',
  prefix: '/admin'
})
  .get(
    '/dashboard',
    async ({ request, set }) => {
      try {
        return await getAdminDashboardSummary(request.headers)
      } catch (error) {
        return adminDashboardErrorResponse(error, set)
      }
    },
    {
      response: {
        200: adminDashboardSummaryResponseSchema,
        ...adminDashboardErrorResponseSchemas
      }
    }
  )
  .get(
    '/audit-logs',
    async ({ query, request, set }) => {
      try {
        return await getAdminAuditLogList(request.headers, {
          action: query.action,
          page: numberQueryValue(query.page),
          pageSize: pageSizeQueryValue(query.pageSize),
          severity: query.severity,
          status: query.status
        })
      } catch (error) {
        return adminDashboardErrorResponse(error, set)
      }
    },
    {
      query: t.Object({
        action: t.Optional(t.String()),
        page: t.Optional(t.Union([t.Number({ minimum: 1 }), t.String()])),
        pageSize: t.Optional(
          t.Union([
            t.Literal(25),
            t.Literal(50),
            t.Literal(100),
            t.Literal('25'),
            t.Literal('50'),
            t.Literal('100')
          ])
        ),
        severity: t.Optional(auditSeverityFilterSchema),
        status: t.Optional(auditStatusFilterSchema)
      }),
      response: {
        200: adminAuditLogListResponseSchema,
        ...adminDashboardErrorResponseSchemas
      }
    }
  )

function adminDashboardErrorResponse(error: unknown, set: AdminResponseSet): { error: string } {
  if (isAdminDashboardAccessError(error)) {
    set.status = error.status
    return { error: error.message }
  }
  throw error
}

function numberQueryValue(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function pageSizeQueryValue(value: number | string | undefined): AdminAuditLogPageSize | undefined {
  const pageSize = numberQueryValue(value)
  return pageSize === 25 || pageSize === 50 || pageSize === 100 ? pageSize : undefined
}

export default admin
