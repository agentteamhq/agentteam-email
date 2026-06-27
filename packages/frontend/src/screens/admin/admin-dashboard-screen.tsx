import {
  ClipboardTextIcon,
  DatabaseIcon,
  HardDrivesIcon,
  PulseIcon,
  ShieldCheckIcon
} from '@phosphor-icons/react'

import { Badge } from '../../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { WebappProviders } from '../../partials/webapp/webapp-providers'
import type * as React from 'react'
import type { PublicEnv } from '../../types'
import type { AdminRouteState } from '@main/backend/routes/webapp'
import type { AuthProviderProps } from '@better-auth-ui/react'

export interface AdminDashboardScreenProps {
  authClient?: AuthProviderProps['authClient']
  publicEnv: PublicEnv
  routeState: AdminRouteState
  sessionCleanupEnabled?: boolean
}

export function AdminDashboardScreen({
  authClient,
  publicEnv,
  routeState,
  sessionCleanupEnabled
}: AdminDashboardScreenProps) {
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
              <div className='text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase'>
                Instance admin
              </div>
              <h1 className='mt-3 text-3xl font-semibold tracking-tight'>Admin dashboard</h1>
              <p className='text-muted-foreground mt-2 max-w-2xl text-sm leading-6'>
                Review audit events and instance setup health for this AgentTeam Email deployment.
              </p>
            </div>
            <Badge
              className='w-fit'
              variant='secondary'
            >
              <ShieldCheckIcon data-icon='inline-start' />
              {routeState.user?.email ?? 'Admin'}
            </Badge>
          </header>

          <section className='grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]'>
            <Card>
              <CardHeader>
                <div className='flex items-center gap-2'>
                  <ClipboardTextIcon
                    className='text-muted-foreground'
                    size={20}
                  />
                  <CardTitle>Audit logs</CardTitle>
                </div>
                <CardDescription>
                  Authentication, setup, mailbox, domain, agent, and permission events will appear here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='border-border bg-muted/30 flex min-h-56 items-center justify-center rounded-lg border border-dashed p-6 text-center'>
                  <p className='text-muted-foreground max-w-md text-sm leading-6'>
                    Audit log browsing is the first admin dashboard surface. The server already owns
                    audit records; this panel is reserved for the authenticated admin view.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className='flex items-center gap-2'>
                  <PulseIcon
                    className='text-muted-foreground'
                    size={20}
                  />
                  <CardTitle>Setup health</CardTitle>
                </div>
                <CardDescription>
                  Operator-owned dependencies for the instance, separate from customer domain setup.
                </CardDescription>
              </CardHeader>
              <CardContent className='grid gap-3'>
                <SetupHealthRow
                  icon={<DatabaseIcon size={18} />}
                  label='MongoDB and Redis'
                  value='Configuration check pending'
                />
                <SetupHealthRow
                  icon={<HardDrivesIcon size={18} />}
                  label='R2 archive bucket'
                  value='Credential check pending'
                />
                <SetupHealthRow
                  icon={<PulseIcon size={18} />}
                  label='Mail-control services'
                  value='Runtime check pending'
                />
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </WebappProviders>
  )
}

function SetupHealthRow({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className='border-border/70 flex items-start gap-3 rounded-lg border p-3'>
      <div className='text-muted-foreground mt-0.5'>{icon}</div>
      <div className='min-w-0'>
        <div className='text-sm font-medium'>{label}</div>
        <div className='text-muted-foreground mt-1 text-xs leading-5'>{value}</div>
      </div>
    </div>
  )
}
