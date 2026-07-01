import type { AdminAuditLogList } from '@main/backend'

export const adminAuditLogsDefaultList = {
  events: [
    {
      action: 'sign-in/email',
      createdAt: '2026-06-30T17:04:00.000Z',
      id: auditEventId('audit-event-1'),
      severity: 'low',
      status: 'success'
    },
    {
      action: 'agent_mail.trial.claim.approved',
      createdAt: '2026-06-30T16:42:00.000Z',
      id: auditEventId('audit-event-2'),
      severity: 'medium',
      status: 'success'
    },
    {
      action: 'agent.request-capability',
      createdAt: '2026-06-30T16:18:00.000Z',
      id: auditEventId('audit-event-3'),
      severity: 'high',
      status: 'failed'
    }
  ],
  filters: {
    action: null,
    severity: 'all',
    status: 'all'
  },
  pagination: {
    hasNextPage: true,
    hasPreviousPage: false,
    page: 1,
    pageSize: 25,
    totalCount: 128,
    totalPages: 6
  }
} satisfies AdminAuditLogList

export const adminAuditLogsFilteredList = {
  events: [
    {
      action: 'agent.request-capability',
      createdAt: '2026-06-30T16:18:00.000Z',
      id: auditEventId('audit-event-3'),
      severity: 'high',
      status: 'failed'
    },
    {
      action: 'agent_mail.worker.credential_refresh.failed',
      createdAt: '2026-06-30T15:55:00.000Z',
      id: auditEventId('audit-event-4'),
      severity: 'critical',
      status: 'failed'
    }
  ],
  filters: {
    action: 'agent',
    severity: 'all',
    status: 'failed'
  },
  pagination: {
    hasNextPage: false,
    hasPreviousPage: false,
    page: 1,
    pageSize: 25,
    totalCount: 2,
    totalPages: 1
  }
} satisfies AdminAuditLogList

export const adminAuditLogsEmptyList = {
  events: [],
  filters: {
    action: null,
    severity: 'all',
    status: 'all'
  },
  pagination: {
    hasNextPage: false,
    hasPreviousPage: false,
    page: 1,
    pageSize: 25,
    totalCount: 0,
    totalPages: 0
  }
} satisfies AdminAuditLogList

function auditEventId(value: string): AdminAuditLogList['events'][number]['id'] {
  return value as AdminAuditLogList['events'][number]['id']
}
