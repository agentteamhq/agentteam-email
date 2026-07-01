import { createUUIDv7 } from '@main/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminDashboardServiceTestState = vi.hoisted(() => ({
  getUser: vi.fn(),
  globals: vi.fn()
}))

vi.mock('../auth/get-user', () => ({
  getUser: adminDashboardServiceTestState.getUser
}))

vi.mock('../globals', () => ({
  globals: adminDashboardServiceTestState.globals
}))

describe('admin dashboard service', () => {
  beforeEach(() => {
    vi.resetModules()
    adminDashboardServiceTestState.getUser.mockReset()
    adminDashboardServiceTestState.globals.mockReset()
  })

  it('requires an authenticated user', async () => {
    expect.hasAssertions()

    adminDashboardServiceTestState.getUser.mockResolvedValue(null)

    const { getAdminDashboardSummary, isAdminDashboardAccessError } = await import('./dashboard-service')

    try {
      await getAdminDashboardSummary(new Headers())
      throw new Error('Expected admin dashboard summary to require authentication.')
    } catch (error) {
      expect(isAdminDashboardAccessError(error)).toBe(true)
      expect(error).toMatchObject({
        message: 'Authentication required.',
        status: 401
      })
    }

    expect(adminDashboardServiceTestState.globals).not.toHaveBeenCalled()
  })

  it('requires an admin user', async () => {
    expect.hasAssertions()

    adminDashboardServiceTestState.getUser.mockResolvedValue({
      email: 'user@example.test',
      id: createUUIDv7(),
      role: 'user'
    })

    const { getAdminDashboardSummary, isAdminDashboardAccessError } = await import('./dashboard-service')

    try {
      await getAdminDashboardSummary(new Headers())
      throw new Error('Expected admin dashboard summary to require admin access.')
    } catch (error) {
      expect(isAdminDashboardAccessError(error)).toBe(true)
      expect(error).toMatchObject({
        message: 'Admin access is required.',
        status: 403
      })
    }

    expect(adminDashboardServiceTestState.globals).not.toHaveBeenCalled()
  })

  it('requires an admin user for audit log browsing', async () => {
    expect.hasAssertions()

    adminDashboardServiceTestState.getUser.mockResolvedValue({
      email: 'user@example.test',
      id: createUUIDv7(),
      role: 'user'
    })

    const { getAdminAuditLogList, isAdminDashboardAccessError } = await import('./dashboard-service')

    try {
      await getAdminAuditLogList(new Headers())
      throw new Error('Expected admin audit log browsing to require admin access.')
    } catch (error) {
      expect(isAdminDashboardAccessError(error)).toBe(true)
      expect(error).toMatchObject({
        message: 'Admin access is required.',
        status: 403
      })
    }

    expect(adminDashboardServiceTestState.globals).not.toHaveBeenCalled()
  })

  it('returns aggregate setup, provisioning, and audit data without raw sensitive fields', async () => {
    expect.hasAssertions()

    const auditId = createUUIDv7()
    adminDashboardServiceTestState.getUser.mockResolvedValue({
      email: 'admin@example.test',
      id: createUUIDv7(),
      role: 'admin'
    })
    adminDashboardServiceTestState.globals.mockResolvedValue({
      db: createDashboardDatabase({
        recentAuditEvents: [
          {
            _id: auditId,
            action: 'sign-in/email',
            createdAt: new Date('2026-06-30T10:04:00.000Z'),
            ipAddress: '192.0.2.10',
            metadata: {
              cookie: 'better-auth.session_token=secret-cookie',
              token: 'secret-token'
            },
            severity: 'low',
            status: 'success',
            userAgent: 'Sensitive browser string'
          }
        ]
      })
    })

    const { getAdminDashboardSummary } = await import('./dashboard-service')
    const summary = await getAdminDashboardSummary(new Headers())

    expect(summary.setup).toStrictEqual({
      activeSessionCount: 4,
      adminConfigured: true,
      adminCount: 2,
      databaseReachable: true,
      organizationCount: 3,
      userCount: 9
    })
    expect(summary.provisioning.domains.byStatus).toContainEqual({
      count: 5,
      status: 'active'
    })
    expect(summary.provisioning.workerDeployments).toMatchObject({
      credentialsDueCount: 2,
      credentialsExpiredCount: 1,
      totalCount: 7
    })
    expect(summary.audit).toMatchObject({
      failedCount: 2,
      highSeverityCount: 1,
      totalCount: 12
    })
    expect(summary.audit.recent).toStrictEqual([
      {
        action: 'sign-in/email',
        createdAt: '2026-06-30T10:04:00.000Z',
        id: expect.any(String),
        severity: 'low',
        status: 'success'
      }
    ])

    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('secret-cookie')
    expect(serialized).not.toContain('192.0.2.10')
    expect(serialized).not.toContain('Sensitive browser string')
  })

  it('returns paginated admin audit logs without raw sensitive fields', async () => {
    expect.hasAssertions()

    const auditId = createUUIDv7()
    const auditLogCountDocuments = vi.fn(() => execQuery(76))
    const auditLogFind = vi.fn(() =>
      auditLogFindManyQuery([
        {
          _id: auditId,
          action: 'sign-in/email',
          createdAt: new Date('2026-06-30T17:04:00.000Z'),
          ipAddress: '192.0.2.44',
          metadata: {
            cookie: 'better-auth.session_token=secret-cookie',
            token: 'secret-token'
          },
          severity: 'high',
          status: 'failed',
          userAgent: 'Sensitive browser string',
          userId: createUUIDv7()
        }
      ])
    )
    adminDashboardServiceTestState.getUser.mockResolvedValue({
      email: 'admin@example.test',
      id: createUUIDv7(),
      role: 'admin'
    })
    adminDashboardServiceTestState.globals.mockResolvedValue({
      db: {
        models: {
          auditLog: {
            countDocuments: auditLogCountDocuments,
            find: auditLogFind
          }
        }
      }
    })

    const { getAdminAuditLogList } = await import('./dashboard-service')
    const result = await getAdminAuditLogList(new Headers(), {
      action: ' sign-in ',
      page: 2,
      pageSize: 50,
      severity: 'high',
      status: 'failed'
    })

    expect(result).toStrictEqual({
      events: [
        {
          action: 'sign-in/email',
          createdAt: '2026-06-30T17:04:00.000Z',
          id: expect.any(String),
          severity: 'high',
          status: 'failed'
        }
      ],
      filters: {
        action: 'sign-in',
        severity: 'high',
        status: 'failed'
      },
      pagination: {
        hasNextPage: false,
        hasPreviousPage: true,
        page: 2,
        pageSize: 50,
        totalCount: 76,
        totalPages: 2
      }
    })
    expect(auditLogCountDocuments).toHaveBeenCalledWith({
      action: expect.any(RegExp),
      severity: 'high',
      status: 'failed'
    })
    expect(auditLogFind).toHaveBeenCalledWith({
      action: expect.any(RegExp),
      severity: 'high',
      status: 'failed'
    })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('secret-cookie')
    expect(serialized).not.toContain('192.0.2.44')
    expect(serialized).not.toContain('Sensitive browser string')
  })
})

function createDashboardDatabase({ recentAuditEvents }: { recentAuditEvents: unknown[] }) {
  return {
    models: {
      agentMailDomain: {
        countDocuments: vi.fn((filter: Record<string, unknown>) =>
          execQuery(
            countByStatus(filter, {
              active: 5,
              connected: 1,
              degraded: 0,
              disconnected: 0,
              provisioning: 1
            })
          )
        ),
        findOne: vi.fn(() =>
          findOneQuery({
            lastRuntimeSyncedAt: new Date('2026-06-30T10:03:00.000Z')
          })
        )
      },
      agentMailWorkerCredentialRefresh: {
        countDocuments: vi.fn((filter: Record<string, unknown>) =>
          execQuery(filter.status === 'failed' ? 1 : 0)
        ),
        findOne: vi.fn(() =>
          findOneQuery({
            startedAt: new Date('2026-06-30T09:56:00.000Z')
          })
        )
      },
      agentMailWorkerDeployment: {
        countDocuments: vi.fn((filter: Record<string, unknown>) => execQuery(countWorkerDeployment(filter))),
        findOne: vi.fn(() =>
          findOneQuery({
            lastDeployedAt: new Date('2026-06-30T10:02:00.000Z')
          })
        )
      },
      auditLog: {
        countDocuments: vi.fn((filter: Record<string, unknown>) => execQuery(countAuditEvents(filter))),
        find: vi.fn(() => findManyQuery(recentAuditEvents))
      },
      organization: {
        countDocuments: vi.fn(() => execQuery(3))
      },
      session: {
        countDocuments: vi.fn(() => execQuery(4))
      },
      user: {
        countDocuments: vi.fn((filter: Record<string, unknown>) => execQuery(filter.role === 'admin' ? 2 : 9))
      }
    }
  }
}

function countWorkerDeployment(filter: Record<string, unknown>) {
  if ('credentialRefreshAfter' in filter) {
    return 2
  }
  if ('credentialExpiresAt' in filter) {
    return 1
  }
  if (typeof filter.status === 'string') {
    return countByStatus(filter, {
      active: 5,
      degraded: 1,
      disabled: 0,
      disconnected: 0,
      pending: 1
    })
  }
  if (typeof filter.provisioningStatus === 'string') {
    return countByStatus(
      { status: filter.provisioningStatus },
      {
        failed: 1,
        not_started: 0,
        pending: 1,
        succeeded: 5
      }
    )
  }
  return 7
}

function countAuditEvents(filter: Record<string, unknown>) {
  if (filter.status === 'failed') {
    return 2
  }
  if ('severity' in filter) {
    return 1
  }
  return 12
}

function countByStatus(filter: Record<string, unknown>, counts: Record<string, number>) {
  return typeof filter.status === 'string' ? (counts[filter.status] ?? 0) : sumCounts(counts)
}

function sumCounts(counts: Record<string, number>) {
  return Object.values(counts).reduce((total, count) => total + count, 0)
}

function execQuery<TValue>(value: TValue) {
  return {
    exec: vi.fn(async () => value)
  }
}

function findOneQuery<TValue>(value: TValue) {
  return {
    sort: vi.fn(() => ({
      select: vi.fn(() => execQuery(value))
    }))
  }
}

function findManyQuery<TValue>(value: TValue) {
  return {
    sort: vi.fn(() => ({
      limit: vi.fn(() => ({
        select: vi.fn(() => execQuery(value))
      }))
    }))
  }
}

function auditLogFindManyQuery<TValue>(value: TValue) {
  return {
    sort: vi.fn(() => ({
      skip: vi.fn(() => ({
        limit: vi.fn(() => ({
          select: vi.fn(() => execQuery(value))
        }))
      }))
    }))
  }
}
