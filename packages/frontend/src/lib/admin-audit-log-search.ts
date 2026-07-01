import type {
  AdminAuditLogPageSize,
  AdminAuditLogSeverityFilter,
  AdminAuditLogStatusFilter
} from '@main/backend'

export interface AdminAuditLogsRouteSearch {
  action?: string
  page: number
  pageSize: AdminAuditLogPageSize
  severity: AdminAuditLogSeverityFilter
  status: AdminAuditLogStatusFilter
}

export type AdminAuditLogsRouteSearchInput = Partial<AdminAuditLogsRouteSearch>

const PAGE_SIZES = [25, 50, 100] as const
const STATUS_FILTERS = ['all', 'success', 'failed'] as const
const SEVERITY_FILTERS = ['all', 'low', 'medium', 'high', 'critical'] as const

export function validateAdminAuditLogsSearch(search: Record<string, unknown>): AdminAuditLogsRouteSearch {
  return {
    action: normalizeActionSearch(readStringSearchValue(search.action)) ?? undefined,
    page: normalizePageSearchValue(search.page),
    pageSize: normalizePageSizeSearchValue(search.pageSize),
    severity: normalizeSeveritySearchValue(search.severity),
    status: normalizeStatusSearchValue(search.status)
  }
}

function normalizeActionSearch(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().slice(0, 80)
  return normalized.length > 0 ? normalized : null
}

function normalizePageSearchValue(value: unknown): number {
  const page = readNumberSearchValue(value)
  return Number.isInteger(page) && page && page > 0 ? page : 1
}

function normalizePageSizeSearchValue(value: unknown): AdminAuditLogPageSize {
  const pageSize = readNumberSearchValue(value)
  return PAGE_SIZES.includes(pageSize as AdminAuditLogPageSize) ? (pageSize as AdminAuditLogPageSize) : 25
}

function normalizeSeveritySearchValue(value: unknown): AdminAuditLogSeverityFilter {
  return typeof value === 'string' && SEVERITY_FILTERS.includes(value as AdminAuditLogSeverityFilter)
    ? (value as AdminAuditLogSeverityFilter)
    : 'all'
}

function normalizeStatusSearchValue(value: unknown): AdminAuditLogStatusFilter {
  return typeof value === 'string' && STATUS_FILTERS.includes(value as AdminAuditLogStatusFilter)
    ? (value as AdminAuditLogStatusFilter)
    : 'all'
}

function readStringSearchValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readNumberSearchValue(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}
