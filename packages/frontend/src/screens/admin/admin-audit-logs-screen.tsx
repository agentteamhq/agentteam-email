import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  ShieldCheckIcon,
  SignOutIcon,
  WarningCircleIcon
} from '@phosphor-icons/react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { Link } from '../../components/link'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../../components/ui/native-select'
import { Skeleton } from '../../components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { fetchAdminAuditLogList } from '../../lib/admin-audit-logs-rpc'
import { WebappProviders } from '../../partials/webapp/webapp-providers'
import type {
  AdminAuditLogList,
  AdminAuditLogPageSize,
  AdminAuditLogSeverityFilter,
  AdminAuditLogStatusFilter
} from '@main/backend'
import type {
  AdminAuditLogsRouteSearch,
  AdminAuditLogsRouteSearchInput
} from '../../lib/admin-audit-log-search'
import type { PublicEnv } from '../../types'
import type { AdminRouteState } from '@main/backend/routes/webapp'
import type { AuthProviderProps } from '@better-auth-ui/react'

type AdminAuditLogListLoader = typeof fetchAdminAuditLogList

export interface AdminAuditLogsScreenProps {
  authClient?: AuthProviderProps['authClient']
  onSearchChange: (search: AdminAuditLogsRouteSearchInput) => void
  publicEnv: PublicEnv
  routeSearch: AdminAuditLogsRouteSearch
  routeState: AdminRouteState
  sessionCleanupEnabled?: boolean
  auditLogListLoader?: AdminAuditLogListLoader
}

export function AdminAuditLogsScreen({
  auditLogListLoader = fetchAdminAuditLogList,
  authClient,
  onSearchChange,
  publicEnv,
  routeSearch,
  routeState,
  sessionCleanupEnabled
}: AdminAuditLogsScreenProps) {
  const routeAction = routeSearch.action ?? ''
  const [actionDraftState, setActionDraftState] = React.useState({
    draft: routeAction,
    routeAction
  })
  const actionDraft =
    actionDraftState.routeAction === routeAction ? actionDraftState.draft : routeAction
  const setActionDraft = React.useCallback(
    (draft: string) => {
      setActionDraftState({
        draft,
        routeAction
      })
    },
    [routeAction]
  )
  const auditLogQuery = useQuery(adminAuditLogListQueryOptions(auditLogListLoader, routeSearch))
  const auditLogList = auditLogQuery.data

  return (
    <WebappProviders
      authClient={authClient}
      flash={null}
      publicEnv={publicEnv}
      sessionCleanupEnabled={sessionCleanupEnabled}
    >
      <main className='bg-background min-h-screen'>
        <div className='mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 sm:px-8 lg:px-10'>
          <header className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='min-w-0'>
              <Badge
                className='w-fit'
                variant='secondary'
              >
                <ClipboardTextIcon data-icon='inline-start' />
                Audit logs
              </Badge>
              <h1 className='mt-3 text-3xl font-semibold tracking-tight'>Audit logs</h1>
              <p className='text-muted-foreground mt-2 max-w-2xl text-sm leading-6'>
                Server-recorded auth and operational events for this deployment.
              </p>
              <Button
                asChild
                className='mt-4'
                size='xs'
                variant='outline'
              >
                <Link
                  href='/admin/'
                  unstyled
                >
                  <ArrowLeftIcon data-icon='inline-start' />
                  Dashboard
                </Link>
              </Button>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge
                className='w-fit'
                variant='outline'
              >
                <ShieldCheckIcon data-icon='inline-start' />
                {routeState.user?.email ?? 'Admin'}
              </Badge>
              <Button
                asChild
                size='xs'
                variant='outline'
              >
                <Link
                  href='/signout'
                  unstyled
                >
                  <SignOutIcon data-icon='inline-start' />
                  Sign out
                </Link>
              </Button>
            </div>
          </header>

          {auditLogQuery.isError ? (
            <Alert variant='destructive'>
              <WarningCircleIcon />
              <AlertDescription>{readErrorMessage(auditLogQuery.error)}</AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
                <div>
                  <CardTitle>Events</CardTitle>
                  <CardDescription>
                    Showing safe audit fields only: action, status, severity, and time.
                  </CardDescription>
                </div>
                <AuditLogFilters
                  actionDraft={actionDraft}
                  onActionDraftChange={setActionDraft}
                  onSearchChange={onSearchChange}
                  routeSearch={routeSearch}
                />
              </div>
            </CardHeader>
            <CardContent className='grid gap-4'>
              <AuditLogTable
                auditLogList={auditLogList}
                loading={auditLogQuery.isLoading}
              />
              <AuditLogPagination
                auditLogList={auditLogList}
                loading={auditLogQuery.isLoading}
                onSearchChange={onSearchChange}
                routeSearch={routeSearch}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </WebappProviders>
  )
}

function adminAuditLogListQueryOptions(
  auditLogListLoader: AdminAuditLogListLoader,
  routeSearch: AdminAuditLogsRouteSearch
) {
  return queryOptions({
    queryFn: () =>
      auditLogListLoader({
        action: routeSearch.action,
        page: routeSearch.page,
        pageSize: routeSearch.pageSize,
        severity: routeSearch.severity,
        status: routeSearch.status
      }),
    queryKey: ['admin', 'audit-logs', routeSearch, auditLogListLoader] as const
  })
}

function AuditLogFilters({
  actionDraft,
  onActionDraftChange,
  onSearchChange,
  routeSearch
}: {
  actionDraft: string
  onActionDraftChange: (value: string) => void
  onSearchChange: (search: AdminAuditLogsRouteSearchInput) => void
  routeSearch: AdminAuditLogsRouteSearch
}) {
  const hasFilters =
    Boolean(routeSearch.action) || routeSearch.status !== 'all' || routeSearch.severity !== 'all'

  return (
    <form
      className='flex flex-wrap items-end gap-3'
      onSubmit={(event) => {
        event.preventDefault()
        onSearchChange({
          ...routeSearch,
          action: actionDraft,
          page: 1
        })
      }}
    >
      <label className='grid min-w-48 flex-1 gap-1 text-xs font-medium'>
        Action
        <Input
          onChange={(event) => {
            onActionDraftChange(event.target.value)
          }}
          placeholder='Filter action'
          value={actionDraft}
        />
      </label>
      <label className='grid min-w-36 gap-1 text-xs font-medium'>
        Status
        <NativeSelect
          onChange={(event) => {
            onSearchChange({
              ...routeSearch,
              page: 1,
              status: event.target.value as AdminAuditLogStatusFilter
            })
          }}
          value={routeSearch.status}
        >
          <NativeSelectOption value='all'>All</NativeSelectOption>
          <NativeSelectOption value='success'>Success</NativeSelectOption>
          <NativeSelectOption value='failed'>Failed</NativeSelectOption>
        </NativeSelect>
      </label>
      <label className='grid min-w-36 gap-1 text-xs font-medium'>
        Severity
        <NativeSelect
          onChange={(event) => {
            onSearchChange({
              ...routeSearch,
              page: 1,
              severity: event.target.value as AdminAuditLogSeverityFilter
            })
          }}
          value={routeSearch.severity}
        >
          <NativeSelectOption value='all'>All</NativeSelectOption>
          <NativeSelectOption value='low'>Low</NativeSelectOption>
          <NativeSelectOption value='medium'>Medium</NativeSelectOption>
          <NativeSelectOption value='high'>High</NativeSelectOption>
          <NativeSelectOption value='critical'>Critical</NativeSelectOption>
        </NativeSelect>
      </label>
      <label className='grid min-w-28 gap-1 text-xs font-medium'>
        Rows
        <NativeSelect
          onChange={(event) => {
            onSearchChange({
              ...routeSearch,
              page: 1,
              pageSize: Number(event.target.value) as AdminAuditLogPageSize
            })
          }}
          value={String(routeSearch.pageSize)}
        >
          <NativeSelectOption value='25'>25</NativeSelectOption>
          <NativeSelectOption value='50'>50</NativeSelectOption>
          <NativeSelectOption value='100'>100</NativeSelectOption>
        </NativeSelect>
      </label>
      <div className='flex items-end gap-2'>
        <Button
          size='sm'
          type='submit'
          variant='secondary'
        >
          Apply
        </Button>
        {hasFilters ? (
          <Button
            onClick={() => {
              onActionDraftChange('')
              onSearchChange({
                action: undefined,
                page: 1,
                pageSize: routeSearch.pageSize,
                severity: 'all',
                status: 'all'
              })
            }}
            size='sm'
            type='button'
            variant='outline'
          >
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function AuditLogTable({
  auditLogList,
  loading
}: {
  auditLogList: AdminAuditLogList | undefined
  loading: boolean
}) {
  if (loading) {
    return (
      <div className='grid gap-2'>
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton
            className='h-10 w-full'
            key={index}
          />
        ))}
      </div>
    )
  }

  if (!auditLogList || auditLogList.events.length === 0) {
    return (
      <div
        className='border-border bg-muted/30 flex min-h-32 items-center justify-center rounded-lg border
          border-dashed p-6 text-center'
      >
        <p className='text-muted-foreground max-w-md text-sm leading-6'>
          No audit events match the current filters.
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Severity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {auditLogList.events.map((event) => (
          <TableRow key={event.id}>
            <TableCell className='text-muted-foreground whitespace-nowrap'>
              {formatDateTime(event.createdAt)}
            </TableCell>
            <TableCell className='font-medium'>{event.action}</TableCell>
            <TableCell>
              <Badge variant={event.status === 'success' ? 'secondary' : 'destructive'}>
                {event.status === 'success' ? <CheckCircleIcon data-icon='inline-start' /> : null}
                {event.status}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={auditSeverityVariant(event.severity)}>{event.severity}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function AuditLogPagination({
  auditLogList,
  loading,
  onSearchChange,
  routeSearch
}: {
  auditLogList: AdminAuditLogList | undefined
  loading: boolean
  onSearchChange: (search: AdminAuditLogsRouteSearchInput) => void
  routeSearch: AdminAuditLogsRouteSearch
}) {
  const pagination = auditLogList?.pagination
  const range = pagination ? visibleRange(pagination) : null

  return (
    <div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='text-muted-foreground text-sm'>
        {loading || !pagination || !range
          ? 'Loading audit events...'
          : `Showing ${formatNumber(range.start)}-${formatNumber(range.end)} of ${formatNumber(pagination.totalCount)}`}
      </div>
      <div className='flex items-center gap-2'>
        <Button
          disabled={!pagination?.hasPreviousPage}
          onClick={() => {
            onSearchChange({
              ...routeSearch,
              page: Math.max(1, routeSearch.page - 1)
            })
          }}
          size='sm'
          type='button'
          variant='outline'
        >
          Previous
        </Button>
        <Button
          disabled={!pagination?.hasNextPage}
          onClick={() => {
            onSearchChange({
              ...routeSearch,
              page: routeSearch.page + 1
            })
          }}
          size='sm'
          type='button'
          variant='outline'
        >
          Next
        </Button>
      </div>
    </div>
  )
}

function visibleRange(pagination: AdminAuditLogList['pagination']): { end: number; start: number } | null {
  if (pagination.totalCount === 0) {
    return null
  }

  const start = (pagination.page - 1) * pagination.pageSize + 1
  if (start > pagination.totalCount) {
    return null
  }

  return {
    end: Math.min(start + pagination.pageSize - 1, pagination.totalCount),
    start
  }
}

function auditSeverityVariant(severity: string): 'destructive' | 'outline' | 'secondary' {
  if (severity === 'critical' || severity === 'high') {
    return 'destructive'
  }

  if (severity === 'medium') {
    return 'outline'
  }

  return 'secondary'
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Audit logs could not be loaded.'
}
