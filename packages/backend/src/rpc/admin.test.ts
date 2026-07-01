import { beforeEach, describe, expect, it, vi } from 'vitest'

type GetAdminDashboardSummaryMock = (headers: Headers) => Promise<unknown>
type GetAdminAuditLogListMock = (headers: Headers, input: unknown) => Promise<unknown>

const adminRpcTestState = vi.hoisted(() => ({
  getAdminAuditLogList: vi.fn<GetAdminAuditLogListMock>(),
  getAdminDashboardSummary: vi.fn<GetAdminDashboardSummaryMock>()
}))

vi.mock('../admin/dashboard-service', () => {
  class AdminDashboardAccessError extends Error {
    constructor(
      message: string,
      public readonly status: 401 | 403
    ) {
      super(message)
      this.name = 'AdminDashboardAccessError'
    }
  }

  return {
    AdminDashboardAccessError,
    getAdminAuditLogList: adminRpcTestState.getAdminAuditLogList,
    getAdminDashboardSummary: adminRpcTestState.getAdminDashboardSummary,
    isAdminDashboardAccessError: (error: unknown): error is AdminDashboardAccessError =>
      error instanceof AdminDashboardAccessError
  }
})

describe('admin RPC routes', () => {
  beforeEach(() => {
    vi.resetModules()
    adminRpcTestState.getAdminAuditLogList.mockReset()
    adminRpcTestState.getAdminDashboardSummary.mockReset()
  })

  it('returns the dashboard summary through the webserver boundary', async () => {
    expect.hasAssertions()

    adminRpcTestState.getAdminDashboardSummary.mockResolvedValue({
      audit: {
        failedCount: 0,
        highSeverityCount: 0,
        recent: [],
        totalCount: 0
      },
      generatedAt: '2026-06-30T10:00:00.000Z',
      provisioning: {
        credentialRefreshes: {
          failedCount: 0,
          lastFailureAt: null,
          pendingCount: 0
        },
        domains: {
          byStatus: [
            {
              count: 0,
              status: 'connected'
            }
          ],
          lastRuntimeSyncedAt: null,
          totalCount: 0
        },
        workerDeployments: {
          byProvisioningStatus: [
            {
              count: 0,
              status: 'not_started'
            }
          ],
          byStatus: [
            {
              count: 0,
              status: 'pending'
            }
          ],
          credentialsDueCount: 0,
          credentialsExpiredCount: 0,
          lastDeployedAt: null,
          totalCount: 0
        }
      },
      setup: {
        activeSessionCount: 1,
        adminConfigured: true,
        adminCount: 1,
        databaseReachable: true,
        organizationCount: 1,
        userCount: 1
      }
    })

    const { default: admin } = await import('./admin')
    const response = await admin.handle(
      new Request('https://mail.example.com/admin/dashboard', {
        headers: {
          cookie: 'better-auth.session_token=session'
        }
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      generatedAt: '2026-06-30T10:00:00.000Z',
      setup: {
        adminConfigured: true
      }
    })
    expect(adminRpcTestState.getAdminDashboardSummary).toHaveBeenCalledOnce()
    expect(adminRpcTestState.getAdminDashboardSummary.mock.calls[0][0].get('cookie')).toBe(
      'better-auth.session_token=session'
    )
  })

  it('maps missing credentials to 401 without exposing cookies in the response', async () => {
    expect.hasAssertions()

    const { AdminDashboardAccessError } = await import('../admin/dashboard-service')
    adminRpcTestState.getAdminDashboardSummary.mockRejectedValue(
      new AdminDashboardAccessError('Authentication required.', 401)
    )

    const { default: admin } = await import('./admin')
    const response = await admin.handle(
      new Request('https://mail.example.com/admin/dashboard', {
        headers: {
          cookie: 'better-auth.session_token=secret-cookie'
        }
      })
    )

    expect(response.status).toBe(401)
    const body = await response.text()
    expect(body).toBe('{"error":"Authentication required."}')
    expect(body).not.toContain('secret-cookie')
  })

  it('returns paginated audit logs through the webserver boundary', async () => {
    expect.hasAssertions()

    adminRpcTestState.getAdminAuditLogList.mockResolvedValue({
      events: [
        {
          action: 'sign-in/email',
          createdAt: '2026-06-30T17:04:00.000Z',
          id: 'audit-event-1',
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

    const { default: admin } = await import('./admin')
    const response = await admin.handle(
      new Request(
        'https://mail.example.com/admin/audit-logs?page=2&pageSize=50&status=failed&severity=high&action=sign-in',
        {
          headers: {
            cookie: 'better-auth.session_token=session'
          }
        }
      )
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      events: [
        {
          action: 'sign-in/email',
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
        page: 2,
        pageSize: 50
      }
    })
    expect(adminRpcTestState.getAdminAuditLogList).toHaveBeenCalledWith(expect.any(Headers), {
      action: 'sign-in',
      page: 2,
      pageSize: 50,
      severity: 'high',
      status: 'failed'
    })
    expect(adminRpcTestState.getAdminAuditLogList.mock.calls[0][0].get('cookie')).toBe(
      'better-auth.session_token=session'
    )
  })

  it('maps missing credentials for audit log browsing to 401 without exposing cookies', async () => {
    expect.hasAssertions()

    const { AdminDashboardAccessError } = await import('../admin/dashboard-service')
    adminRpcTestState.getAdminAuditLogList.mockRejectedValue(
      new AdminDashboardAccessError('Authentication required.', 401)
    )

    const { default: admin } = await import('./admin')
    const response = await admin.handle(
      new Request('https://mail.example.com/admin/audit-logs', {
        headers: {
          cookie: 'better-auth.session_token=secret-cookie'
        }
      })
    )

    expect(response.status).toBe(401)
    const body = await response.text()
    expect(body).toBe('{"error":"Authentication required."}')
    expect(body).not.toContain('secret-cookie')
  })

  it('maps non-admin users to 403', async () => {
    expect.hasAssertions()

    const { AdminDashboardAccessError } = await import('../admin/dashboard-service')
    adminRpcTestState.getAdminDashboardSummary.mockRejectedValue(
      new AdminDashboardAccessError('Admin access is required.', 403)
    )

    const { default: admin } = await import('./admin')
    const response = await admin.handle(new Request('https://mail.example.com/admin/dashboard'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toStrictEqual({
      error: 'Admin access is required.'
    })
  })
})
