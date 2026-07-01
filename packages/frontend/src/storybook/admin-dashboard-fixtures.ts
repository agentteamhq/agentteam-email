import type { AdminDashboardSummary } from '@main/backend'

export const adminDashboardHealthySummary = {
  audit: {
    failedCount: 2,
    highSeverityCount: 1,
    recent: [
      {
        action: 'sign-in/email',
        createdAt: '2026-06-30T16:42:00.000Z',
        id: auditEventId('audit-event-1'),
        severity: 'low',
        status: 'success'
      },
      {
        action: 'agent_mail.trial.claim.approved',
        createdAt: '2026-06-30T16:18:00.000Z',
        id: auditEventId('audit-event-2'),
        severity: 'medium',
        status: 'success'
      },
      {
        action: 'agent.request-capability',
        createdAt: '2026-06-30T15:55:00.000Z',
        id: auditEventId('audit-event-3'),
        severity: 'high',
        status: 'failed'
      }
    ],
    totalCount: 128
  },
  generatedAt: '2026-06-30T16:45:00.000Z',
  provisioning: {
    credentialRefreshes: {
      failedCount: 0,
      lastFailureAt: null,
      pendingCount: 0
    },
    domains: {
      byStatus: [
        {
          count: 1,
          status: 'connected'
        },
        {
          count: 0,
          status: 'provisioning'
        },
        {
          count: 6,
          status: 'active'
        },
        {
          count: 0,
          status: 'degraded'
        },
        {
          count: 0,
          status: 'disconnected'
        }
      ],
      lastRuntimeSyncedAt: '2026-06-30T16:41:00.000Z',
      totalCount: 7
    },
    workerDeployments: {
      byProvisioningStatus: [
        {
          count: 0,
          status: 'not_started'
        },
        {
          count: 1,
          status: 'pending'
        },
        {
          count: 6,
          status: 'succeeded'
        },
        {
          count: 0,
          status: 'failed'
        }
      ],
      byStatus: [
        {
          count: 1,
          status: 'pending'
        },
        {
          count: 6,
          status: 'active'
        },
        {
          count: 0,
          status: 'degraded'
        },
        {
          count: 0,
          status: 'disabled'
        },
        {
          count: 0,
          status: 'disconnected'
        }
      ],
      credentialsDueCount: 0,
      credentialsExpiredCount: 0,
      lastDeployedAt: '2026-06-30T16:37:00.000Z',
      totalCount: 7
    }
  },
  setup: {
    activeSessionCount: 14,
    adminConfigured: true,
    adminCount: 2,
    databaseReachable: true,
    organizationCount: 4,
    userCount: 31
  }
} satisfies AdminDashboardSummary

function auditEventId(value: string): AdminDashboardSummary['audit']['recent'][number]['id'] {
  return value as AdminDashboardSummary['audit']['recent'][number]['id']
}

export const adminDashboardEmptySummary = {
  ...adminDashboardHealthySummary,
  audit: {
    failedCount: 0,
    highSeverityCount: 0,
    recent: [],
    totalCount: 0
  },
  provisioning: {
    credentialRefreshes: {
      failedCount: 0,
      lastFailureAt: null,
      pendingCount: 0
    },
    domains: {
      byStatus: adminDashboardHealthySummary.provisioning.domains.byStatus.map((count) => ({
        ...count,
        count: 0
      })),
      lastRuntimeSyncedAt: null,
      totalCount: 0
    },
    workerDeployments: {
      byProvisioningStatus:
        adminDashboardHealthySummary.provisioning.workerDeployments.byProvisioningStatus.map((count) => ({
          ...count,
          count: 0
        })),
      byStatus: adminDashboardHealthySummary.provisioning.workerDeployments.byStatus.map((count) => ({
        ...count,
        count: 0
      })),
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
    organizationCount: 0,
    userCount: 1
  }
} satisfies AdminDashboardSummary

export const adminDashboardNeedsAttentionSummary = {
  ...adminDashboardHealthySummary,
  audit: {
    ...adminDashboardHealthySummary.audit,
    failedCount: 9,
    highSeverityCount: 4
  },
  provisioning: {
    credentialRefreshes: {
      failedCount: 2,
      lastFailureAt: '2026-06-30T15:12:00.000Z',
      pendingCount: 1
    },
    domains: {
      ...adminDashboardHealthySummary.provisioning.domains,
      byStatus: [
        {
          count: 1,
          status: 'connected'
        },
        {
          count: 1,
          status: 'provisioning'
        },
        {
          count: 4,
          status: 'active'
        },
        {
          count: 2,
          status: 'degraded'
        },
        {
          count: 0,
          status: 'disconnected'
        }
      ],
      totalCount: 8
    },
    workerDeployments: {
      ...adminDashboardHealthySummary.provisioning.workerDeployments,
      byProvisioningStatus: [
        {
          count: 0,
          status: 'not_started'
        },
        {
          count: 1,
          status: 'pending'
        },
        {
          count: 5,
          status: 'succeeded'
        },
        {
          count: 2,
          status: 'failed'
        }
      ],
      byStatus: [
        {
          count: 1,
          status: 'pending'
        },
        {
          count: 5,
          status: 'active'
        },
        {
          count: 2,
          status: 'degraded'
        },
        {
          count: 0,
          status: 'disabled'
        },
        {
          count: 0,
          status: 'disconnected'
        }
      ],
      credentialsDueCount: 3,
      credentialsExpiredCount: 1,
      totalCount: 8
    }
  }
} satisfies AdminDashboardSummary
