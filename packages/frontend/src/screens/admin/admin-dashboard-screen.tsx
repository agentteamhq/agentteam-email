import {
  CheckCircleIcon,
  ClipboardTextIcon,
  DatabaseIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  SignOutIcon,
  UsersThreeIcon,
  WarningCircleIcon
} from '@phosphor-icons/react'
import { queryOptions, useQuery } from '@tanstack/react-query'

import { Link } from '../../components/link'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { fetchAdminDashboardSummary } from '../../lib/admin-dashboard-rpc'
import { WebappProviders } from '../../partials/webapp/webapp-providers'
import type * as React from 'react'
import type { AdminDashboardStatusCount, AdminDashboardSummary } from '@main/backend'
import type { PublicEnv } from '../../types'
import type { AdminRouteState } from '@main/backend/routes/webapp'
import type { AuthProviderProps } from '@better-auth-ui/react'

type AdminDashboardSummaryLoader = typeof fetchAdminDashboardSummary

export interface AdminDashboardScreenProps {
  authClient?: AuthProviderProps['authClient']
  publicEnv: PublicEnv
  routeState: AdminRouteState
  sessionCleanupEnabled?: boolean
  summaryLoader?: AdminDashboardSummaryLoader
}

export function AdminDashboardScreen({
  authClient,
  publicEnv,
  routeState,
  sessionCleanupEnabled,
  summaryLoader = fetchAdminDashboardSummary
}: AdminDashboardScreenProps) {
  const summaryQuery = useQuery(adminDashboardSummaryQueryOptions(summaryLoader))
  const summary = summaryQuery.data
  const overallHealth = summary ? summarizeOverallHealth(summary) : null

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
              {overallHealth ? (
                <Badge
                  className='w-fit'
                  variant={overallHealth.variant}
                >
                  {overallHealth.icon}
                  {overallHealth.label}
                </Badge>
              ) : null}
              <h1 className='mt-3 text-3xl font-semibold tracking-tight'>Admin dashboard</h1>
              <p className='text-muted-foreground mt-2 max-w-2xl text-sm leading-6'>
                Basic setup, users, mail domains, and recent audit activity for this deployment.
              </p>
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

          {summaryQuery.isError ? (
            <Alert variant='destructive'>
              <WarningCircleIcon />
              <AlertDescription>{readErrorMessage(summaryQuery.error)}</AlertDescription>
            </Alert>
          ) : null}

          {summary ? <AdminDashboardSummaryView summary={summary} /> : <AdminDashboardLoadingState />}
        </div>
      </main>
    </WebappProviders>
  )
}

function adminDashboardSummaryQueryOptions(summaryLoader: AdminDashboardSummaryLoader) {
  return queryOptions({
    queryFn: summaryLoader,
    queryKey: ['admin', 'dashboard', summaryLoader] as const
  })
}

function AdminDashboardSummaryView({ summary }: { summary: AdminDashboardSummary }) {
  const activeDomains = countStatus(summary.provisioning.domains.byStatus, 'active')

  return (
    <div className='grid gap-4'>
      <section className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <MetricCard
          icon={<ShieldCheckIcon size={20} />}
          label='Admin users'
          value={formatNumber(summary.setup.adminCount)}
          detail={summary.setup.adminConfigured ? 'First admin is configured' : 'Setup is incomplete'}
        />
        <MetricCard
          icon={<UsersThreeIcon size={20} />}
          label='Users'
          value={formatNumber(summary.setup.userCount)}
          detail={`${formatNumber(summary.setup.activeSessionCount)} active sessions`}
        />
        <MetricCard
          icon={<DatabaseIcon size={20} />}
          label='Database'
          value={summary.setup.databaseReachable ? 'Reachable' : 'Offline'}
          detail={`${formatNumber(summary.setup.organizationCount)} organizations`}
        />
        <MetricCard
          icon={<EnvelopeIcon size={20} />}
          label='Mail domains'
          value={`${formatNumber(activeDomains)} / ${formatNumber(summary.provisioning.domains.totalCount)}`}
          detail='Provisioned / total'
        />
      </section>

      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <div>
              <div className='flex items-center gap-2'>
                <ClipboardTextIcon
                  className='text-muted-foreground'
                  size={20}
                />
                <CardTitle>Recent audit activity</CardTitle>
              </div>
              <CardDescription>Latest server-recorded auth and operational events.</CardDescription>
            </div>
            <Button
              asChild
              size='xs'
              variant='outline'
            >
              <Link
                href='/admin/audit-logs'
                unstyled
              >
                View all
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {summary.audit.recent.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className='text-right'>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.audit.recent.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className='font-medium'>{event.action}</TableCell>
                    <TableCell>
                      <Badge variant={event.status === 'success' ? 'secondary' : 'destructive'}>
                        {event.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={auditSeverityVariant(event.severity)}>{event.severity}</Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-right'>
                      {formatDateTime(event.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div
              className='border-border bg-muted/30 flex min-h-32 items-center justify-center rounded-lg border
                border-dashed p-6 text-center'
            >
              <p className='text-muted-foreground max-w-md text-sm leading-6'>
                No audit events have been recorded yet. New authentication and provisioning activity will
                appear here after the first server-owned event is written.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AdminDashboardLoadingState() {
  return (
    <div className='grid gap-4'>
      <section className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, index) => (
          <Card
            className='gap-3 py-4'
            key={index}
          >
            <CardHeader className='gap-2 px-4 pb-0'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-6 w-16' />
            </CardHeader>
            <CardContent className='px-4'>
              <Skeleton className='h-4 w-36' />
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}

function MetricCard({
  detail,
  icon,
  label,
  value
}: {
  detail: string
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card className='gap-3 py-4'>
      <CardHeader className='px-4 pb-0'>
        <div className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
          {icon}
          {label}
        </div>
      </CardHeader>
      <CardContent className='px-4'>
        <div className='text-xl font-semibold tracking-tight'>{value}</div>
        <div className='text-muted-foreground mt-1 text-xs leading-5'>{detail}</div>
      </CardContent>
    </Card>
  )
}

function summarizeOverallHealth(summary: AdminDashboardSummary): {
  icon: React.ReactNode
  label: string
  variant: 'destructive' | 'outline' | 'secondary'
} {
  const failedProvisioning = countStatus(
    summary.provisioning.workerDeployments.byProvisioningStatus,
    'failed'
  )
  const degradedDomains = countStatus(summary.provisioning.domains.byStatus, 'degraded')
  const degradedWorkers = countStatus(summary.provisioning.workerDeployments.byStatus, 'degraded')
  const needsAttention =
    failedProvisioning +
      degradedDomains +
      degradedWorkers +
      summary.provisioning.workerDeployments.credentialsExpiredCount +
      summary.provisioning.credentialRefreshes.failedCount >
    0

  if (needsAttention) {
    return {
      icon: <WarningCircleIcon data-icon='inline-start' />,
      label: 'Needs attention',
      variant: 'destructive'
    }
  }

  if (!summary.setup.adminConfigured || !summary.setup.databaseReachable) {
    return {
      icon: <WarningCircleIcon data-icon='inline-start' />,
      label: 'Setup incomplete',
      variant: 'outline'
    }
  }

  return {
    icon: <CheckCircleIcon data-icon='inline-start' />,
    label: 'Operational',
    variant: 'secondary'
  }
}

function countStatus(counts: ReadonlyArray<AdminDashboardStatusCount>, status: string): number {
  return counts.find((count) => count.status === status)?.count ?? 0
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
  return error instanceof Error ? error.message : 'Admin dashboard could not be loaded.'
}
