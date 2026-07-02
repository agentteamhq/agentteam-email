import * as React from 'react'
import { ArrowsLeftRightIcon, CheckCircleIcon, CloudIcon, XCircleIcon } from '@phosphor-icons/react'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import { Spinner } from '../../components/ui/spinner'
import { cn } from '../../lib/utils'
import { CloudflareConnectButton, CloudflareLogo } from './cloudflare-brand'
import type { DomainSettingsState, DomainSettingsStatus } from './settings-dialog'
import type { CloudflareZoneSummary } from '@main/backend'

type CloudflareGrantView = DomainSettingsStatus['grants'][number]
type CloudflareGrantPublicId = CloudflareGrantView['publicId']

interface OnboardingDomainSettingsController {
  activeGrant: CloudflareGrantView | null
  busy: boolean
  draftDomain: string
  message: string | null
  missingScopes: readonly string[]
  onLoadAccounts: () => void
  onSelectZone: (zoneId: string) => void
  onSetupDomain: () => void
  onStartOAuth: () => void
  readOnly: boolean
  selectedGrantPublicId: CloudflareGrantPublicId | ''
  selectedZoneId: string
  status: DomainSettingsStatus | null
  usableGrants: readonly CloudflareGrantView[]
  zones: readonly CloudflareZoneSummary[]
}

export function OnboardingDomainSettingsPanel({
  className,
  state
}: {
  className?: string
  state?: DomainSettingsState
}) {
  return (
    <OnboardingDomainSettingsContent
      className={className}
      settings={onboardingDomainSettingsControllerFromState(state)}
    />
  )
}

function onboardingDomainSettingsControllerFromState(
  state?: DomainSettingsState
): OnboardingDomainSettingsController {
  const readOnly = state ? (state.readOnly ?? false) : true
  const status = state?.status ?? null
  const zones = state?.zones ?? []
  const selectedGrantPublicId = state?.selectedGrantPublicId ?? ''
  const message = state?.message ?? null
  const grants = status?.grants ?? []
  const selectedConnection = state?.selectedDomainPublicId
    ? (status?.connections.find((connection) => connection.publicId === state.selectedDomainPublicId) ??
      status?.connections[0] ??
      null)
    : (status?.connections[0] ?? null)
  const selectedZoneId = state?.selectedZoneId || selectedConnection?.cloudflareZoneId || ''
  const draftDomain = state?.draftDomain || selectedConnection?.domain || ''
  const activeGrants = grants.filter((grant) => grant.status === 'active')
  const usableGrants = activeGrants.filter((grant) => getMissingScopes(grant).length === 0)
  const activeGrant = usableGrants[0] ?? activeGrants[0] ?? null
  const missingScopes = activeGrant ? getMissingScopes(activeGrant) : []
  const action =
    <TArgs extends unknown[]>(handler: ((...args: TArgs) => void) | undefined) =>
    (...args: TArgs) => {
      if (!readOnly) {
        handler?.(...args)
      }
    }

  return {
    activeGrant,
    busy: state?.busy ?? false,
    draftDomain,
    message,
    missingScopes,
    onLoadAccounts: action(state?.onLoadAccounts),
    onSelectZone: action(state?.onSelectZone),
    onSetupDomain: action(state?.onSetupDomain),
    onStartOAuth: action(state?.onStartOAuth),
    readOnly,
    selectedGrantPublicId,
    selectedZoneId,
    status,
    usableGrants,
    zones
  }
}

function OnboardingDomainSettingsContent({
  className,
  settings
}: {
  className?: string
  settings: OnboardingDomainSettingsController
}) {
  if (settings.status === null && !settings.message) {
    return <OnboardingDomainSettingsLoadingContent />
  }

  return (
    <div className={cn('grid max-w-3xl gap-4', className)}>
      <OnboardingAddDomainPanel settings={settings} />
    </div>
  )
}

function OnboardingDomainSettingsLoadingContent() {
  return (
    <div className='grid max-w-3xl gap-3'>
      <Skeleton className='h-16 rounded-lg' />
      <Skeleton className='h-28 rounded-lg' />
      <Skeleton className='h-28 rounded-lg' />
    </div>
  )
}

function OnboardingAddDomainPanel({ settings }: { settings: OnboardingDomainSettingsController }) {
  const activeGrant = settings.activeGrant
  const selectedZone = selectedOnboardingCloudflareZone(settings)
  const selectedDomainName = selectedZone?.name ?? settings.draftDomain
  const zoneGroups = groupOnboardingCloudflareZonesByAccount(settings.zones)
  const hasDomains = settings.zones.length > 0
  const hasUsableGrant = settings.usableGrants.length > 0
  const primaryAction = hasDomains ? settings.onSetupDomain : settings.onLoadAccounts
  const primaryDisabled =
    settings.busy ||
    settings.readOnly ||
    settings.missingScopes.length > 0 ||
    (hasDomains && (!selectedZone || !selectedDomainName))

  if (!hasUsableGrant) {
    return (
      <div className='grid max-w-3xl gap-4'>
        <Card className='gap-0 py-4 shadow-none'>
          <CardHeader
            className='flex flex-col gap-3 px-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'
          >
            <div className='flex min-w-0 items-start gap-3'>
              <CloudflareLogo className='mt-0.5 h-6 w-auto shrink-0' />
              <div className='min-w-0'>
                <CardTitle className='text-sm'>
                  {activeGrant ? 'Update Cloudflare access' : 'Connect your domain'}
                </CardTitle>
                <CardDescription className='mt-1'>
                  {activeGrant
                    ? 'Reconnect Cloudflare with the scopes required to choose domains.'
                    : 'Connect Cloudflare to choose your domain.'}
                </CardDescription>
              </div>
            </div>
            <CardAction
              className='w-full self-stretch justify-self-auto sm:w-56 sm:self-center sm:justify-self-end'
            >
              <CloudflareConnectButton
                busy={settings.busy}
                className='h-8 text-sm'
                disabled={settings.busy || settings.readOnly}
                onClick={settings.onStartOAuth}
              >
                {activeGrant ? 'Reconnect Cloudflare' : 'Continue with Cloudflare'}
              </CloudflareConnectButton>
            </CardAction>
          </CardHeader>
        </Card>
        {settings.missingScopes.length > 0 ? (
          <div className='border-destructive/40 text-destructive rounded-lg border p-3 text-sm'>
            Missing Cloudflare scopes: {settings.missingScopes.join(', ')}
          </div>
        ) : null}
        {settings.message ? <p className='text-muted-foreground text-sm'>{settings.message}</p> : null}
      </div>
    )
  }

  return (
    <Card className='mx-auto w-full max-w-md overflow-hidden shadow-none'>
      <CardHeader className='items-center justify-items-center px-6 text-center'>
        <OnboardingDomainSetupConnectionVisual domain={selectedDomainName} />
        <Badge variant='secondary'>Cloudflare connected</Badge>
        <CardTitle className='text-xl font-bold'>Set up email for your domain</CardTitle>
        <CardDescription className='max-w-md'>
          AgentTeam Email will set up this domain for Cloudflare email routing. This will override any
          existing mail routing DNS records on the domain, including MX records.
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-5 px-6'>
        <div className='grid gap-2'>
          <p className='text-sm font-medium'>Domain</p>
          {hasDomains ? (
            <Select
              disabled={settings.readOnly || settings.busy}
              value={selectedZone ? onboardingCloudflareZoneSelectionValue(selectedZone) : undefined}
              onValueChange={settings.onSelectZone}
            >
              <SelectTrigger
                aria-label='Domain'
                className='w-full'
                id='domain-cloudflare-zone'
              >
                <SelectValue placeholder='Select a Cloudflare domain' />
              </SelectTrigger>
              <SelectContent>
                {zoneGroups.map((group, index) => (
                  <React.Fragment key={group.groupId}>
                    {index > 0 ? <SelectSeparator /> : null}
                    <SelectGroup>
                      <SelectLabel>{group.accountName}</SelectLabel>
                      {group.zones.map((zone) => (
                        <SelectItem
                          key={onboardingCloudflareZoneSelectionValue(zone)}
                          value={onboardingCloudflareZoneSelectionValue(zone)}
                        >
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className='text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm'>
              Load the Cloudflare domains available to this connection.
            </div>
          )}
        </div>

        <OnboardingDomainSetupChecklist
          items={[
            {
              label: 'Cloudflare authorization confirmed',
              state: settings.missingScopes.length > 0 ? 'error' : 'complete'
            },
            {
              label: 'Route incoming mail through AgentTeam Email',
              state: 'complete'
            },
            {
              label: 'Enable outbound sending for the domain',
              state: 'complete'
            },
            {
              label: 'Create team and agent mailboxes after setup',
              state: 'complete'
            }
          ]}
        />

        {settings.missingScopes.length > 0 ? (
          <div className='border-destructive/40 text-destructive rounded-lg border p-3 text-sm'>
            Missing Cloudflare scopes: {settings.missingScopes.join(', ')}
          </div>
        ) : null}
        {settings.message ? <p className='text-muted-foreground text-sm'>{settings.message}</p> : null}
      </CardContent>
      <CardFooter className='flex-col gap-2'>
        <Button
          className='w-full'
          disabled={primaryDisabled}
          onClick={primaryAction}
          type='button'
        >
          {settings.busy ? <Spinner data-icon='inline-start' /> : null}
          {hasDomains ? `Adopt ${selectedDomainName || 'domain'}` : 'Load Cloudflare domains'}
        </Button>
      </CardFooter>
    </Card>
  )
}

type OnboardingDomainSetupChecklistState = 'complete' | 'error'

interface OnboardingDomainSetupChecklistItem {
  label: string
  state: OnboardingDomainSetupChecklistState
}

function OnboardingDomainSetupConnectionVisual({ domain }: { domain?: string }) {
  return (
    <div
      aria-label={domain ? `AgentTeam Email connects to ${domain}` : 'AgentTeam Email connects to a domain'}
      className='flex w-full justify-center py-2'
    >
      <div className='relative flex items-center justify-center gap-3'>
        <OnboardingDomainSetupLogoCircle label='AgentTeam Email'>
          <img
            alt=''
            aria-hidden='true'
            className='hidden size-11 rounded-xl dark:block'
            draggable={false}
            src='/agentteam-email-dark-logo.svg'
          />
          <img
            alt=''
            aria-hidden='true'
            className='block size-11 rounded-xl dark:hidden'
            draggable={false}
            src='/agentteam-email-light-logo.svg'
          />
        </OnboardingDomainSetupLogoCircle>
        <span
          aria-hidden='true'
          className='text-muted-foreground flex size-7 items-center justify-center'
        >
          <ArrowsLeftRightIcon
            className='size-5'
            weight='bold'
          />
        </span>
        <OnboardingDomainSetupLogoCircle label={domain ?? 'Cloudflare domain'}>
          <CloudIcon className='text-foreground size-7' />
        </OnboardingDomainSetupLogoCircle>
      </div>
    </div>
  )
}

function OnboardingDomainSetupLogoCircle({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span
      aria-label={label}
      className='bg-background flex size-14 items-center justify-center rounded-full border shadow-xs'
      role='img'
    >
      {children}
    </span>
  )
}

function OnboardingDomainSetupChecklist({
  items
}: {
  items: ReadonlyArray<OnboardingDomainSetupChecklistItem>
}) {
  return (
    <ul className='grid gap-3'>
      {items.map((item) => (
        <li
          className='text-foreground flex items-center gap-3 text-sm'
          key={item.label}
        >
          <OnboardingDomainSetupChecklistIcon state={item.state} />
          <span className='min-w-0 truncate'>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

function OnboardingDomainSetupChecklistIcon({ state }: { state: OnboardingDomainSetupChecklistState }) {
  if (state === 'error') {
    return <XCircleIcon className='text-destructive size-4 shrink-0' />
  }

  return <CheckCircleIcon className='text-primary size-4 shrink-0' />
}

function selectedOnboardingCloudflareZone(
  settings: OnboardingDomainSettingsController
): CloudflareZoneSummary | null {
  return (
    settings.zones.find(
      (zone) =>
        zone.id === settings.selectedZoneId &&
        (!settings.selectedGrantPublicId || zone.grantPublicId === settings.selectedGrantPublicId)
    ) ?? null
  )
}

function groupOnboardingCloudflareZonesByAccount(zones: readonly CloudflareZoneSummary[]) {
  const grantCount = new Set(zones.map((zone) => zone.grantPublicId)).size
  const groups = new Map<
    string,
    {
      accountId: string
      accountName: string
      groupId: string
      zones: CloudflareZoneSummary[]
    }
  >()

  for (const zone of zones) {
    const groupId = `${zone.grantPublicId}|${zone.accountId}`
    const group = groups.get(groupId)
    if (group) {
      group.zones.push(zone)
      continue
    }

    groups.set(groupId, {
      accountId: zone.accountId,
      accountName:
        grantCount > 1
          ? `${zone.accountName ?? zone.accountId} · Grant ${formatOnboardingReferenceId(zone.grantPublicId)}`
          : (zone.accountName ?? zone.accountId),
      groupId,
      zones: [zone]
    })
  }

  return Array.from(groups.values())
}

function onboardingCloudflareZoneSelectionValue(zone: CloudflareZoneSummary): string {
  return `${zone.grantPublicId}|${zone.id}`
}

function getMissingScopes(grant: CloudflareGrantView): string[] {
  return grant.requiredScopes.filter((scope) => !grant.grantedScopes.includes(scope))
}

function formatOnboardingReferenceId(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}
