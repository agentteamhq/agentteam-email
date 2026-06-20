import * as React from 'react'
import {
  BellIcon,
  ChatCircleIcon,
  CheckIcon,
  CloudIcon,
  GearSixIcon,
  GlobeHemisphereWestIcon,
  GlobeIcon,
  HouseIcon,
  KeyboardIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  PaintBrushIcon,
  VideoCameraIcon
} from '@phosphor-icons/react'
import type { CloudflareAccountSummary, CloudflareStatusResult, CloudflareZoneSummary } from '@main/backend'

import { Badge } from '../../components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '../../components/ui/breadcrumb'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Skeleton } from '../../components/ui/skeleton'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '../../components/ui/sidebar'
import { rpc } from '../../lib/rpc-api-client'

export type SettingsSectionId =
  | 'notifications'
  | 'navigation'
  | 'home'
  | 'appearance'
  | 'messagesMedia'
  | 'languageRegion'
  | 'accessibility'
  | 'markAsRead'
  | 'audioVideo'
  | 'connectedAccounts'
  | 'privacyVisibility'
  | 'advanced'

export type SettingsDialogContentState = 'ready' | 'loading' | 'empty'

const settingsNavigation = [
  { id: 'notifications', name: 'Notifications', icon: BellIcon },
  { id: 'navigation', name: 'Navigation', icon: ListIcon },
  { id: 'home', name: 'Home', icon: HouseIcon },
  { id: 'appearance', name: 'Appearance', icon: PaintBrushIcon },
  { id: 'messagesMedia', name: 'Messages & media', icon: ChatCircleIcon },
  { id: 'languageRegion', name: 'Language & region', icon: GlobeIcon },
  { id: 'accessibility', name: 'Accessibility', icon: KeyboardIcon },
  { id: 'markAsRead', name: 'Mark as read', icon: CheckIcon },
  { id: 'audioVideo', name: 'Audio & video', icon: VideoCameraIcon },
  { id: 'connectedAccounts', name: 'Connected accounts', icon: LinkIcon },
  { id: 'privacyVisibility', name: 'Privacy & visibility', icon: LockIcon },
  { id: 'advanced', name: 'Advanced', icon: GearSixIcon }
] satisfies Array<{
  icon: React.ComponentType<{ className?: string }>
  id: SettingsSectionId
  name: string
}>

const settingsNames = Object.fromEntries(settingsNavigation.map((item) => [item.id, item.name])) as Record<
  SettingsSectionId,
  string
>

interface SettingsDialogProps {
  activeSection?: SettingsSectionId
  contentState?: SettingsDialogContentState
  defaultActiveSection?: SettingsSectionId
  defaultOpen?: boolean
  onActiveSectionChange?: (section: SettingsSectionId) => void
  onOpenChange?: (open: boolean) => void
  open?: boolean
  trigger?: React.ReactNode
}

export function SettingsDialog({
  activeSection: activeSectionProp,
  contentState = 'ready',
  defaultActiveSection = 'messagesMedia',
  defaultOpen = true,
  onActiveSectionChange,
  onOpenChange,
  open: openProp,
  trigger = <Button size='sm'>Open Dialog</Button>
}: SettingsDialogProps = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const [uncontrolledActiveSection, setUncontrolledActiveSection] =
    React.useState<SettingsSectionId>(defaultActiveSection)
  const open = openProp ?? uncontrolledOpen
  const activeSection = activeSectionProp ?? uncontrolledActiveSection
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const setActiveSection = onActiveSectionChange ?? setUncontrolledActiveSection
  const activeName = settingsNames[activeSection]

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className='overflow-hidden p-0 md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px]'>
        <DialogTitle className='sr-only'>Settings</DialogTitle>
        <DialogDescription className='sr-only'>Customize your settings here.</DialogDescription>
        <SidebarProvider className='items-start'>
          <Sidebar
            collapsible='none'
            className='hidden md:flex'
          >
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {settingsNavigation.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={item.id === activeSection}
                        >
                          <button
                            type='button'
                            onClick={() => {
                              setActiveSection(item.id)
                            }}
                          >
                            <item.icon />
                            <span>{item.name}</span>
                          </button>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className='flex h-[480px] min-w-0 flex-1 flex-col overflow-hidden'>
            <header
              className='flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear
                group-has-data-[collapsible=icon]/sidebar-wrapper:h-12'
            >
              <div className='flex items-center gap-2 px-4'>
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className='hidden md:block'>
                      <BreadcrumbLink href='#'>Settings</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className='hidden md:block' />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeName}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <div className='flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0'>
              <SettingsPanelContent
                contentState={contentState}
                section={activeSection}
              />
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}

function SettingsPanelContent({
  contentState,
  section
}: {
  contentState: SettingsDialogContentState
  section: SettingsSectionId
}) {
  if (contentState === 'loading') {
    return <SettingsLoadingContent />
  }

  if (contentState === 'empty') {
    return (
      <SettingsEmptyContent
        description={
          section === 'connectedAccounts'
            ? 'Connected Cloudflare domains will appear here after an account is linked.'
            : 'No configurable options are available for this settings section yet.'
        }
        title={section === 'connectedAccounts' ? 'No connected domains' : 'No settings yet'}
      />
    )
  }

  if (section === 'connectedAccounts') {
    return <CloudflareConnectedAccountsPanel />
  }

  return <SettingsPlaceholderContent />
}

function SettingsPlaceholderContent() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index}
          className='bg-muted/50 aspect-video max-w-3xl rounded-xl'
        />
      ))}
    </>
  )
}

function SettingsLoadingContent() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton
          key={index}
          className='bg-muted/50 aspect-video max-w-3xl rounded-xl'
        />
      ))}
    </>
  )
}

function SettingsEmptyContent({ description, title }: { description: string; title: string }) {
  return (
    <div
      className='bg-muted/30 text-muted-foreground flex min-h-64 max-w-3xl flex-col items-center
        justify-center gap-2 rounded-xl border border-dashed p-6 text-center'
    >
      <p className='text-foreground font-medium'>{title}</p>
      <p className='max-w-sm text-sm'>{description}</p>
    </div>
  )
}

function CloudflareConnectedAccountsPanel() {
  const [status, setStatus] = React.useState<CloudflareStatusResult | null>(null)
  const [accounts, setAccounts] = React.useState<CloudflareAccountSummary[]>([])
  const [zones, setZones] = React.useState<CloudflareZoneSummary[]>([])
  const [selectedAccountId, setSelectedAccountId] = React.useState('')
  const [selectedZoneId, setSelectedZoneId] = React.useState('')
  const [domain, setDomain] = React.useState('')
  const [message, setMessage] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const activeGrant = status?.grants.find((grant) => grant.status === 'active') ?? null
  const inactiveGrants = status?.grants.filter((grant) => grant.status !== 'active') ?? []
  const missingScopes = activeGrant ? getMissingScopes(activeGrant) : []
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null

  const refreshStatus = React.useCallback(async () => {
    const result = await rpc.cloudflare.status.get()
    if (result.error) {
      throw createRpcError(result.error, result.status)
    }
    setStatus(result.data)
  }, [])

  React.useEffect(() => {
    refreshStatus().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Failed to load Cloudflare status')
    })
  }, [refreshStatus])

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const url = new URL(window.location.href)
    const intentPublicId = url.searchParams.get('cloudflareIntentId')
    const oauthError = url.searchParams.get('cloudflareOAuthError')

    if (!intentPublicId) {
      return
    }

    setBusy(true)
    const finalize = async () => {
      if (oauthError) {
        throw new Error('Cloudflare authorization was not completed')
      }

      const result = await rpc.cloudflare.oauth.finalize.post({ intentPublicId })
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }

      if (result.data.missingScopes.length > 0) {
        setMessage(`Missing Cloudflare scopes: ${result.data.missingScopes.join(', ')}`)
      } else {
        setMessage('Cloudflare account connected')
      }

      url.searchParams.delete('settings')
      url.searchParams.delete('cloudflareIntentId')
      url.searchParams.delete('cloudflareOAuthError')
      window.history.replaceState(null, '', url)
      await refreshStatus()
    }

    finalize()
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Failed to finalize Cloudflare OAuth')
      })
      .finally(() => {
        setBusy(false)
      })
  }, [refreshStatus])

  const startOAuth = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await rpc.cloudflare.oauth.start.post()
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      window.location.assign(result.data.redirectUrl)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to start Cloudflare OAuth')
      setBusy(false)
    }
  }

  const loadAccounts = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await rpc.cloudflare.accounts.get()
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      setAccounts(result.data.accounts)
      setSelectedAccountId(result.data.accounts[0]?.id ?? '')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load Cloudflare accounts')
    } finally {
      setBusy(false)
    }
  }

  const loadZones = async () => {
    if (!selectedAccountId) {
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      const result = await rpc.cloudflare.zones.get({ query: { accountId: selectedAccountId } })
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      setZones(result.data.zones)
      setSelectedZoneId(result.data.zones[0]?.id ?? '')
      setDomain(result.data.zones[0]?.name ?? '')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load Cloudflare zones')
    } finally {
      setBusy(false)
    }
  }

  const connectDomain = async () => {
    if (!selectedAccount || !selectedZone || !domain) {
      setMessage('Select a Cloudflare account, zone, and domain')
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      const result = await rpc.cloudflare.connections.post({
        cloudflareAccountId: selectedAccount.id,
        cloudflareAccountName: selectedAccount.name,
        cloudflareZoneId: selectedZone.id,
        cloudflareZoneName: selectedZone.name,
        domain
      })
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      await refreshStatus()
      setMessage('Cloudflare domain connected')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to connect Cloudflare domain')
    } finally {
      setBusy(false)
    }
  }

  const provisionConnection = async (connectionPublicId: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await rpc.cloudflare.connections({ connectionPublicId }).provision.post()
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      await refreshStatus()
      setMessage('Cloudflare provisioning applied')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to provision Cloudflare connection')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='grid max-w-3xl gap-4'>
      <div className='rounded-lg border p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='font-medium'>Cloudflare</p>
            <p className='text-muted-foreground text-sm'>
              {activeGrant ? 'Connected for hosted domain provisioning' : 'Not connected'}
            </p>
          </div>
          <Badge variant={activeGrant ? 'secondary' : 'outline'}>
            {activeGrant ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>
        <div className='mt-4 flex flex-wrap gap-2'>
          <Button
            disabled={busy}
            onClick={startOAuth}
            size='sm'
          >
            <CloudIcon />
            Connect Cloudflare
          </Button>
          <Button
            disabled={!activeGrant || busy}
            onClick={loadAccounts}
            size='sm'
            variant='outline'
          >
            Load accounts
          </Button>
        </div>
        {activeGrant ? (
          <div className='mt-4 grid gap-3 border-t pt-4'>
            <div className='grid gap-2 text-sm md:grid-cols-3'>
              <IntegrationMetric
                label='Cloudflare user'
                value={activeGrant.cloudflareEmail ?? activeGrant.cloudflareUserId}
              />
              <IntegrationMetric
                label='Permissions'
                value={missingScopes.length === 0 ? 'Complete' : `${missingScopes.length} missing`}
              />
              <IntegrationMetric
                label='Last token check'
                value={formatDateTime(activeGrant.lastTokenCheckAt)}
              />
            </div>
            <div className='flex flex-wrap gap-2'>
              {activeGrant.requiredScopes.map((scope) => {
                const granted = activeGrant.grantedScopes.includes(scope)
                return (
                  <Badge
                    key={scope}
                    variant={granted ? 'secondary' : 'destructive'}
                  >
                    {scope}
                  </Badge>
                )
              })}
            </div>
            {activeGrant.lastErrorMessage ? (
              <p className='text-destructive text-sm'>{activeGrant.lastErrorMessage}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeGrant ? (
        <div className='grid gap-3 rounded-lg border p-4'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <p className='font-medium'>Provision a domain</p>
              <p className='text-muted-foreground text-sm'>
                Select a Cloudflare account and zone, then attach it to this workspace.
              </p>
            </div>
            <Badge variant={accounts.length > 0 ? 'secondary' : 'outline'}>
              {accounts.length > 0 ? `${accounts.length} accounts` : 'Not loaded'}
            </Badge>
          </div>
          <div className='grid gap-2 md:grid-cols-2'>
            <label className='grid gap-1.5'>
              <Label htmlFor='cloudflare-account'>Account</Label>
              <select
                id='cloudflare-account'
                className='border-input bg-background h-9 rounded-md border px-3 text-sm'
                value={selectedAccountId}
                onChange={(event) => {
                  setSelectedAccountId(event.currentTarget.value)
                  setSelectedZoneId('')
                  setZones([])
                }}
              >
                <option value=''>Select account</option>
                {accounts.map((account) => (
                  <option
                    key={account.id}
                    value={account.id}
                  >
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <div className='flex items-end'>
              <Button
                disabled={!selectedAccountId || busy}
                onClick={loadZones}
                size='sm'
                variant='outline'
              >
                Load zones
              </Button>
            </div>
          </div>
          <div className='grid gap-2 md:grid-cols-2'>
            <label className='grid gap-1.5'>
              <Label htmlFor='cloudflare-zone'>Zone</Label>
              <select
                id='cloudflare-zone'
                className='border-input bg-background h-9 rounded-md border px-3 text-sm'
                value={selectedZoneId}
                onChange={(event) => {
                  const nextZoneId = event.currentTarget.value
                  const nextZone = zones.find((zone) => zone.id === nextZoneId) ?? null
                  setSelectedZoneId(nextZoneId)
                  setDomain(nextZone?.name ?? '')
                }}
              >
                <option value=''>Select zone</option>
                {zones.map((zone) => (
                  <option
                    key={zone.id}
                    value={zone.id}
                  >
                    {zone.name}
                  </option>
                ))}
              </select>
            </label>
            <label className='grid gap-1.5'>
              <Label htmlFor='cloudflare-domain'>Domain</Label>
              <Input
                id='cloudflare-domain'
                value={domain}
                onChange={(event) => {
                  setDomain(event.currentTarget.value)
                }}
              />
            </label>
          </div>
          <Button
            className='w-fit'
            disabled={!selectedAccountId || !selectedZoneId || !domain || busy}
            onClick={connectDomain}
            size='sm'
          >
            Connect domain
          </Button>
          {accounts.length > 0 ? (
            <div className='grid gap-2 border-t pt-3'>
              <p className='text-muted-foreground text-xs font-medium uppercase'>Loaded accounts</p>
              <div className='grid gap-2'>
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className='flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm'
                  >
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>{account.name}</p>
                      <p className='text-muted-foreground truncate'>{account.id}</p>
                    </div>
                    <Badge variant='outline'>{account.type}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {zones.length > 0 ? (
            <div className='grid gap-2 border-t pt-3'>
              <p className='text-muted-foreground text-xs font-medium uppercase'>Loaded zones</p>
              <div className='grid gap-2'>
                {zones.map((zone) => (
                  <div
                    key={zone.id}
                    className='flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm'
                  >
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>{zone.name}</p>
                      <p className='text-muted-foreground truncate'>{zone.accountName ?? zone.accountId}</p>
                    </div>
                    <Badge variant={zone.status === 'active' ? 'secondary' : 'outline'}>
                      {zone.status ?? 'unknown'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className='grid gap-3'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='font-medium'>Connected domains</p>
            <p className='text-muted-foreground text-sm'>
              Domains attached to Cloudflare hosted email provisioning.
            </p>
          </div>
          <Badge variant='outline'>{status?.connections.length ?? 0}</Badge>
        </div>
        {(status?.connections ?? []).length > 0 ? (
          (status?.connections ?? []).map((connection) => (
            <div
              className='grid gap-3 rounded-lg border p-3'
              key={connection.publicId}
            >
              <div className='flex items-start gap-3'>
                <div className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-md'>
                  <GlobeHemisphereWestIcon />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='font-medium'>{connection.domain}</p>
                  <p className='text-muted-foreground truncate text-sm'>
                    {connection.cloudflareZoneName ?? connection.cloudflareZoneId}
                  </p>
                </div>
                <Badge
                  className='shrink-0'
                  variant={connection.status === 'active' ? 'secondary' : 'outline'}
                >
                  {formatStatusLabel(connection.provisioningStatus)}
                </Badge>
              </div>
              <div className='grid gap-2 text-sm md:grid-cols-3'>
                <IntegrationMetric
                  label='Account'
                  value={connection.cloudflareAccountName ?? connection.cloudflareAccountId}
                />
                <IntegrationMetric
                  label='Worker'
                  value={connection.workerScriptName ?? 'Not provisioned'}
                />
                <IntegrationMetric
                  label='Last provisioned'
                  value={formatDateTime(connection.lastProvisionedAt)}
                />
              </div>
              <div className='grid gap-2 text-sm md:grid-cols-3'>
                <IntegrationMetric
                  label='R2 bucket'
                  value={connection.r2BucketName ?? 'Not provisioned'}
                />
                <IntegrationMetric
                  label='Status'
                  value={formatStatusLabel(connection.status)}
                />
                <IntegrationMetric
                  label='Updated'
                  value={formatDateTime(connection.updatedAt)}
                />
              </div>
              {connection.lastErrorMessage ? (
                <p className='text-destructive text-sm'>{connection.lastErrorMessage}</p>
              ) : null}
              <Button
                className='w-fit'
                disabled={busy || connection.status === 'disconnected'}
                onClick={() => {
                  void provisionConnection(connection.publicId)
                }}
                size='sm'
                variant='outline'
              >
                Provision
              </Button>
            </div>
          ))
        ) : (
          <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
            No Cloudflare domains are connected yet.
          </div>
        )}
      </div>

      {inactiveGrants.length > 0 ? (
        <div className='grid gap-2 rounded-lg border p-4'>
          <p className='font-medium'>Inactive connections</p>
          {inactiveGrants.map((grant) => (
            <div
              key={grant.publicId}
              className='flex items-center justify-between gap-3 text-sm'
            >
              <span className='min-w-0 truncate'>{grant.cloudflareEmail ?? grant.cloudflareUserId}</span>
              <Badge variant='outline'>{grant.status}</Badge>
            </div>
          ))}
        </div>
      ) : null}

      {message ? <p className='text-muted-foreground text-sm'>{message}</p> : null}
    </div>
  )
}

function IntegrationMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='min-w-0 rounded-md border px-3 py-2'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='truncate font-medium'>{value}</p>
    </div>
  )
}

type CloudflareGrant = CloudflareStatusResult['grants'][number]

function getMissingScopes(grant: CloudflareGrant): string[] {
  return grant.requiredScopes.filter((scope) => !grant.grantedScopes.includes(scope))
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) {
    return 'Never'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

function formatStatusLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function createRpcError(error: unknown, status: number): Error {
  return new Error(readRpcErrorMessage(error) ?? `Request failed with HTTP ${status}`)
}

function readRpcErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  if ('value' in error) {
    const valueMessage = readRpcErrorValueMessage(error.value)

    if (valueMessage) {
      return valueMessage
    }
  }

  return readRpcErrorValueMessage(error)
}

function readRpcErrorValueMessage(value: unknown): string | null {
  if (value instanceof Error && value.message.trim()) {
    return value.message
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const maybeMessage = 'message' in value ? value.message : null
  if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
    return maybeMessage
  }

  const maybeError = 'error' in value ? value.error : null
  if (typeof maybeError === 'string' && maybeError.trim()) {
    return maybeError
  }

  return null
}
