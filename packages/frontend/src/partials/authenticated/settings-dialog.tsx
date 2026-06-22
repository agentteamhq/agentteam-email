import * as React from 'react'
import {
  CloudIcon,
  GlobeHemisphereWestIcon,
  IdentificationCardIcon,
  LockIcon,
  PlusCircleIcon,
  SuitcaseSimpleIcon,
  UserCircleIcon,
  UsersIcon
} from '@phosphor-icons/react'
import { useRouter } from '@tanstack/react-router'

import { Organization } from '../../components/auth/organization/organization'
import { Settings } from '../../components/auth/settings/settings'
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
import { cn } from '../../lib/utils'
import type { SettingsSectionId } from './settings-dialog-sections'
import type { CloudflareAccountSummary, CloudflareStatusResult, CloudflareZoneSummary } from '@main/backend'

export type SettingsDialogContentState = 'ready' | 'loading' | 'empty'

export interface CloudflareOAuthCallbackState {
  intentPublicId: string
  oauthError?: string
}

type CloudflareGrantView = Pick<
  CloudflareStatusResult['grants'][number],
  | 'cloudflareEmail'
  | 'cloudflareUserId'
  | 'grantedScopes'
  | 'lastErrorMessage'
  | 'lastTokenCheckAt'
  | 'publicId'
  | 'requiredScopes'
  | 'status'
>

type CloudflareConnectionView = Pick<
  CloudflareStatusResult['connections'][number],
  | 'cloudflareAccountId'
  | 'cloudflareAccountName'
  | 'cloudflareZoneId'
  | 'cloudflareZoneName'
  | 'domain'
  | 'lastErrorMessage'
  | 'lastProvisionedAt'
  | 'provisioningStatus'
  | 'publicId'
  | 'r2BucketName'
  | 'status'
  | 'updatedAt'
  | 'workerScriptName'
>

export interface DomainSettingsStatus {
  connections: readonly CloudflareConnectionView[]
  grants: readonly CloudflareGrantView[]
}

export interface DomainSettingsState {
  accounts?: readonly CloudflareAccountSummary[]
  busy?: boolean
  draftDomain?: string
  message?: string | null
  mode?: 'addDomain' | 'domain'
  readOnly?: boolean
  selectedAccountId?: string
  selectedDomainPublicId?: CloudflareConnectionView['publicId'] | null
  selectedZoneId?: string
  status: DomainSettingsStatus | null
  zones?: readonly CloudflareZoneSummary[]
}

const settingsNavigation = [
  { id: 'account', name: 'Account', icon: UserCircleIcon },
  { id: 'security', name: 'Security', icon: LockIcon },
  { id: 'organizations', name: 'Organizations', icon: SuitcaseSimpleIcon },
  { id: 'organizationSettings', name: 'Organization settings', icon: IdentificationCardIcon },
  { id: 'organizationPeople', name: 'Organization people', icon: UsersIcon },
  { id: 'domains', name: 'Domains', icon: GlobeHemisphereWestIcon }
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
  cloudflareOAuthCallback?: CloudflareOAuthCallbackState | null
  contentState?: SettingsDialogContentState
  defaultActiveSection?: SettingsSectionId
  defaultOpen?: boolean
  domainSettingsState?: DomainSettingsState
  onActiveSectionChange?: (section: SettingsSectionId) => void
  onOpenChange?: (open: boolean) => void
  open?: boolean
  trigger?: React.ReactNode
}

export function SettingsDialog({
  activeSection: activeSectionProp,
  cloudflareOAuthCallback,
  contentState = 'ready',
  defaultActiveSection = 'account',
  defaultOpen = true,
  domainSettingsState,
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
  const domainSettings = useDomainSettingsController({
    cloudflareOAuthCallback,
    state: domainSettingsState
  })
  const activeName =
    activeSection === 'domains' && domainSettings.mode === 'addDomain'
      ? 'Add domain'
      : settingsNames[activeSection]

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className='overflow-hidden p-0 md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px]'>
        <DialogTitle className='sr-only'>Settings</DialogTitle>
        <DialogDescription className='sr-only'>Manage account, security, organization, and domain settings.</DialogDescription>
        <SidebarProvider className='h-full min-h-0 min-w-0 items-start overflow-hidden'>
          <Sidebar
            collapsible='none'
            className='hidden md:flex'
          >
            <SidebarContent className='min-h-0'>
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
                              if (item.id === 'domains' && domainSettings.connections.length === 0) {
                                domainSettings.onAddDomain()
                              }
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
              <SidebarGroup className='min-h-0 flex-1'>
                <SidebarGroupContent className='min-h-0'>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={activeSection === 'domains' && domainSettings.mode === 'addDomain'}
                      >
                        <button
                          type='button'
                          onClick={() => {
                            setActiveSection('domains')
                            domainSettings.onAddDomain()
                          }}
                        >
                          <PlusCircleIcon />
                          <span>Add domain</span>
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                  {domainSettings.connections.length > 0 ? (
                    <div className='mt-2 grid max-h-48 gap-1 overflow-y-auto pr-1'>
                      {domainSettings.connections.map((connection) => (
                        <button
                          className={cn(
                            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                            activeSection === 'domains' &&
                              domainSettings.mode === 'domain' &&
                              domainSettings.selectedDomainPublicId === connection.publicId
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : ''
                          )}
                          key={connection.publicId}
                          type='button'
                          onClick={() => {
                            setActiveSection('domains')
                            domainSettings.onSelectDomain(connection.publicId)
                          }}
                        >
                          <span className='min-w-0 truncate'>{connection.domain}</span>
                          <Badge
                            className='shrink-0 whitespace-nowrap'
                            variant={getDomainStatusBadgeVariant(connection)}
                          >
                            {formatDomainStateLabel(connection)}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className='flex h-[480px] min-w-0 flex-1 flex-col overflow-hidden'>
            <header
              className='flex h-12 shrink-0 items-center gap-2 transition-[width,height] ease-linear
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
                domainSettings={domainSettings}
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
  domainSettings,
  section
}: {
  contentState: SettingsDialogContentState
  domainSettings: DomainSettingsController
  section: SettingsSectionId
}) {
  if (contentState === 'loading') {
    return <SettingsLoadingContent />
  }

  if (contentState === 'empty') {
    return (
      <SettingsEmptyContent
        description={
          section === 'domains'
            ? 'Domains connected to AgentTeam Email will appear here.'
            : 'This settings section has no records to show yet.'
        }
        title={section === 'domains' ? 'No domains' : 'Nothing to show'}
      />
    )
  }

  if (section === 'account') {
    return <Settings view='account' hideNav />
  }

  if (section === 'security') {
    return <Settings view='security' hideNav />
  }

  if (section === 'organizations') {
    return <Settings view='organizations' hideNav />
  }

  if (section === 'organizationSettings') {
    return <Organization view='settings' hideNav />
  }

  if (section === 'organizationPeople') {
    return <Organization view='people' hideNav />
  }

  if (section === 'domains') {
    return <DomainSettingsPanel settings={domainSettings} />
  }

  return null
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

type DomainPublicId = CloudflareConnectionView['publicId']

interface DomainSettingsController {
  accounts: readonly CloudflareAccountSummary[]
  activeGrant: CloudflareGrantView | null
  busy: boolean
  connections: readonly CloudflareConnectionView[]
  draftDomain: string
  message: string | null
  missingScopes: readonly string[]
  mode: 'addDomain' | 'domain'
  onAddDomain: () => void
  onConnectDomain: () => void
  onDraftDomainChange: (domain: string) => void
  onLoadAccounts: () => void
  onLoadZones: () => void
  onProvisionDomain: (connectionPublicId: DomainPublicId) => void
  onSelectAccount: (accountId: string) => void
  onSelectDomain: (connectionPublicId: DomainPublicId) => void
  onSelectZone: (zoneId: string) => void
  onStartOAuth: () => void
  readOnly: boolean
  selectedAccountId: string
  selectedDomain: CloudflareConnectionView | null
  selectedDomainPublicId: DomainPublicId | null
  selectedZoneId: string
  status: DomainSettingsStatus | null
  zones: readonly CloudflareZoneSummary[]
}

function useDomainSettingsController({
  cloudflareOAuthCallback,
  state
}: {
  cloudflareOAuthCallback?: CloudflareOAuthCallbackState | null
  state?: DomainSettingsState
}): DomainSettingsController {
  const router = useRouter()
  const isStoryState = state !== undefined
  const readOnly = state?.readOnly ?? false
  const [runtimeStatus, setRuntimeStatus] = React.useState<DomainSettingsStatus | null>(null)
  const [runtimeAccounts, setRuntimeAccounts] = React.useState<CloudflareAccountSummary[]>([])
  const [runtimeZones, setRuntimeZones] = React.useState<CloudflareZoneSummary[]>([])
  const [runtimeSelectedAccountId, setRuntimeSelectedAccountId] = React.useState('')
  const [runtimeSelectedZoneId, setRuntimeSelectedZoneId] = React.useState('')
  const [runtimeSelectedDomainPublicId, setRuntimeSelectedDomainPublicId] = React.useState<DomainPublicId | null>(
    null
  )
  const [runtimeMode, setRuntimeMode] = React.useState<'addDomain' | 'domain' | null>(null)
  const [runtimeDraftDomain, setRuntimeDraftDomain] = React.useState('')
  const [runtimeMessage, setRuntimeMessage] = React.useState<string | null>(null)
  const [runtimeBusy, setRuntimeBusy] = React.useState(false)
  const handledCloudflareIntentIdsRef = React.useRef(new Set<string>())
  const busy = state?.busy ?? runtimeBusy
  const status = state ? state.status : runtimeStatus
  const accounts = state?.accounts ?? runtimeAccounts
  const zones = state?.zones ?? runtimeZones
  const selectedAccountId = state?.selectedAccountId ?? runtimeSelectedAccountId
  const selectedZoneId = state?.selectedZoneId ?? runtimeSelectedZoneId
  const draftDomain = state?.draftDomain ?? runtimeDraftDomain
  const message = state?.message ?? runtimeMessage
  const connections = status?.connections ?? []
  const selectedDomainPublicId =
    state?.selectedDomainPublicId ??
    runtimeSelectedDomainPublicId ??
    connections[0]?.publicId ??
    null
  const mode = state?.mode ?? runtimeMode ?? (connections.length > 0 ? 'domain' : 'addDomain')
  const selectedDomain =
    selectedDomainPublicId
      ? connections.find((connection) => connection.publicId === selectedDomainPublicId) ?? connections[0] ?? null
      : connections[0] ?? null

  const activeGrant = status?.grants.find((grant) => grant.status === 'active') ?? null
  const missingScopes = activeGrant ? getMissingScopes(activeGrant) : []
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null

  const refreshStatus = React.useCallback(async () => {
    if (isStoryState) {
      return
    }

    const result = await rpc.cloudflare.status.get()
    if (result.error) {
      throw createRpcError(result.error, result.status)
    }
    setRuntimeStatus(result.data)
    setRuntimeSelectedDomainPublicId((current) => current ?? result.data.connections[0]?.publicId ?? null)
  }, [isStoryState])
  const handleUnexpectedCloudflareActionError = React.useCallback((error: unknown) => {
    setRuntimeMessage(error instanceof Error ? error.message : 'Cloudflare action failed')
    setRuntimeBusy(false)
  }, [])

  React.useEffect(() => {
    if (isStoryState) {
      return
    }

    Promise.resolve()
      .then(refreshStatus)
      .catch((error: unknown) => {
        setRuntimeMessage(error instanceof Error ? error.message : 'Failed to load Cloudflare status')
      })
  }, [isStoryState, refreshStatus])

  React.useEffect(() => {
    if (isStoryState) {
      return
    }

    const intentPublicId = cloudflareOAuthCallback?.intentPublicId
    const oauthError = cloudflareOAuthCallback?.oauthError

    if (!intentPublicId || handledCloudflareIntentIdsRef.current.has(intentPublicId)) {
      return
    }
    handledCloudflareIntentIdsRef.current.add(intentPublicId)

    const finalize = async () => {
      setRuntimeBusy(true)

      if (oauthError) {
        throw new Error('Cloudflare authorization was not completed')
      }

      const result = await rpc.cloudflare.oauth.finalize.post({ intentPublicId })
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }

      if (result.data.missingScopes.length > 0) {
        setRuntimeMessage(`Missing Cloudflare scopes: ${result.data.missingScopes.join(', ')}`)
      } else {
        setRuntimeMessage('Cloudflare account connected')
      }

      await router.navigate({
        to: '/dashboard/',
        search: {},
        replace: true
      })
      await refreshStatus()
      setRuntimeMode('addDomain')
    }

    Promise.resolve()
      .then(finalize)
      .catch((error: unknown) => {
        setRuntimeMessage(error instanceof Error ? error.message : 'Failed to finalize Cloudflare OAuth')
      })
      .finally(() => {
        setRuntimeBusy(false)
      })
  }, [cloudflareOAuthCallback?.intentPublicId, cloudflareOAuthCallback?.oauthError, isStoryState, refreshStatus, router])

  const startOAuth = async () => {
    if (isStoryState || readOnly) {
      return
    }

    setRuntimeBusy(true)
    setRuntimeMessage(null)
    try {
      const result = await rpc.cloudflare.oauth.start.post()
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      await router.navigate({ href: result.data.redirectUrl })
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : 'Failed to start Cloudflare OAuth')
      setRuntimeBusy(false)
    }
  }

  const loadAccounts = async () => {
    if (isStoryState || readOnly) {
      return
    }

    setRuntimeBusy(true)
    setRuntimeMessage(null)
    try {
      const result = await rpc.cloudflare.accounts.get()
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      setRuntimeAccounts(result.data.accounts)
      setRuntimeSelectedAccountId(result.data.accounts[0]?.id ?? '')
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : 'Failed to load Cloudflare accounts')
    } finally {
      setRuntimeBusy(false)
    }
  }

  const loadZones = async () => {
    if (isStoryState || readOnly) {
      return
    }

    if (!selectedAccountId) {
      return
    }

    setRuntimeBusy(true)
    setRuntimeMessage(null)
    try {
      const result = await rpc.cloudflare.zones.get({ query: { accountId: selectedAccountId } })
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      setRuntimeZones(result.data.zones)
      setRuntimeSelectedZoneId(result.data.zones[0]?.id ?? '')
      setRuntimeDraftDomain(result.data.zones[0]?.name ?? '')
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : 'Failed to load Cloudflare zones')
    } finally {
      setRuntimeBusy(false)
    }
  }

  const connectDomain = async () => {
    if (isStoryState || readOnly) {
      return
    }

    if (!selectedAccount || !selectedZone || !draftDomain) {
      setRuntimeMessage('Select a Cloudflare account, zone, and domain')
      return
    }

    setRuntimeBusy(true)
    setRuntimeMessage(null)
    try {
      const result = await rpc.cloudflare.connections.post({
        cloudflareAccountId: selectedAccount.id,
        cloudflareAccountName: selectedAccount.name,
        cloudflareZoneId: selectedZone.id,
        cloudflareZoneName: selectedZone.name,
        domain: draftDomain
      })
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      setRuntimeSelectedDomainPublicId(result.data.connection.publicId)
      setRuntimeMode('domain')
      await refreshStatus()
      setRuntimeMessage('Cloudflare domain connected')
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : 'Failed to connect Cloudflare domain')
    } finally {
      setRuntimeBusy(false)
    }
  }

  const provisionConnection = async (connectionPublicId: string) => {
    if (isStoryState || readOnly) {
      return
    }

    setRuntimeBusy(true)
    setRuntimeMessage(null)
    try {
      const result = await rpc.cloudflare.connections({ connectionPublicId }).provision.post()
      if (result.error) {
        throw createRpcError(result.error, result.status)
      }
      setRuntimeSelectedDomainPublicId(result.data.connection.publicId)
      setRuntimeMode('domain')
      await refreshStatus()
      setRuntimeMessage('Cloudflare provisioning applied')
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : 'Failed to provision Cloudflare connection')
    } finally {
      setRuntimeBusy(false)
    }
  }

  return {
    accounts,
    activeGrant,
    busy,
    connections,
    draftDomain,
    message,
    missingScopes,
    mode,
    onAddDomain: () => {
      if (isStoryState || readOnly) {
        return
      }
      setRuntimeMode('addDomain')
      setRuntimeMessage(null)
    },
    onConnectDomain: () => {
      connectDomain().catch(handleUnexpectedCloudflareActionError)
    },
    onDraftDomainChange: (nextDomain: string) => {
      if (!isStoryState && !readOnly) {
        setRuntimeDraftDomain(nextDomain)
      }
    },
    onLoadAccounts: () => {
      loadAccounts().catch(handleUnexpectedCloudflareActionError)
    },
    onLoadZones: () => {
      loadZones().catch(handleUnexpectedCloudflareActionError)
    },
    onProvisionDomain: (connectionPublicId: DomainPublicId) => {
      provisionConnection(connectionPublicId).catch(handleUnexpectedCloudflareActionError)
    },
    onSelectAccount: (accountId: string) => {
      if (isStoryState || readOnly) {
        return
      }
      setRuntimeSelectedAccountId(accountId)
      setRuntimeSelectedZoneId('')
      setRuntimeZones([])
      setRuntimeDraftDomain('')
    },
    onSelectDomain: (connectionPublicId: DomainPublicId) => {
      if (isStoryState || readOnly) {
        return
      }
      setRuntimeSelectedDomainPublicId(connectionPublicId)
      setRuntimeMode('domain')
      setRuntimeMessage(null)
    },
    onSelectZone: (zoneId: string) => {
      if (isStoryState || readOnly) {
        return
      }
      const nextZone = zones.find((zone) => zone.id === zoneId) ?? null
      setRuntimeSelectedZoneId(zoneId)
      setRuntimeDraftDomain(nextZone?.name ?? '')
    },
    onStartOAuth: () => {
      startOAuth().catch(handleUnexpectedCloudflareActionError)
    },
    readOnly,
    selectedAccountId,
    selectedDomain,
    selectedDomainPublicId,
    selectedZoneId,
    status,
    zones
  }
}

function DomainSettingsPanel({ settings }: { settings: DomainSettingsController }) {
  if (settings.status === null && !settings.message) {
    return <DomainSettingsLoadingContent />
  }

  if (settings.mode === 'addDomain' || !settings.selectedDomain) {
    return <AddDomainPanel settings={settings} />
  }

  return <DomainDetailPanel settings={settings} />
}

function DomainSettingsLoadingContent() {
  return (
    <div className='grid max-w-3xl gap-3'>
      <Skeleton className='h-16 rounded-lg' />
      <Skeleton className='h-28 rounded-lg' />
      <Skeleton className='h-28 rounded-lg' />
    </div>
  )
}

function AddDomainPanel({ settings }: { settings: DomainSettingsController }) {
  const activeGrant = settings.activeGrant
  const connectDisabled =
    settings.busy ||
    settings.readOnly ||
    settings.missingScopes.length > 0 ||
    !settings.selectedAccountId ||
    !settings.selectedZoneId ||
    !settings.draftDomain

  if (!activeGrant) {
    return (
      <div className='grid max-w-3xl gap-4'>
        <div className='grid gap-2'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='font-medium'>Add domain</p>
              <p className='text-muted-foreground text-sm'>
                Authorize Cloudflare to connect an email domain to this workspace.
              </p>
            </div>
            <Badge variant='outline'>Not connected</Badge>
          </div>
          <Button
            className='w-fit bg-[#f38020] text-white hover:bg-[#d96f18]'
            disabled={settings.busy || settings.readOnly}
            onClick={settings.onStartOAuth}
            size='sm'
          >
            <CloudIcon />
            Connect Cloudflare
          </Button>
        </div>
        {settings.message ? <p className='text-muted-foreground text-sm'>{settings.message}</p> : null}
      </div>
    )
  }

  return (
    <div className='grid max-w-3xl gap-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='font-medium'>Add domain</p>
          <p className='text-muted-foreground text-sm'>
            Select the Cloudflare account and zone that should receive AgentTeam Email.
          </p>
        </div>
        <Badge variant='secondary'>Cloudflare connected</Badge>
      </div>

      <div className='grid gap-2 text-sm'>
        <div className='flex items-center justify-between gap-4'>
          <span className='text-muted-foreground'>Cloudflare user</span>
          <span className='min-w-0 truncate font-medium'>
            {activeGrant.cloudflareEmail ?? activeGrant.cloudflareUserId}
          </span>
        </div>
        <div className='flex items-center justify-between gap-4'>
          <span className='text-muted-foreground'>Permissions</span>
          <span className='font-medium'>
            {settings.missingScopes.length === 0 ? 'Complete' : `${settings.missingScopes.length} missing`}
          </span>
        </div>
        <div className='flex items-center justify-between gap-4'>
          <span className='text-muted-foreground'>Last token check</span>
          <span className='font-medium'>{formatDateTime(activeGrant.lastTokenCheckAt)}</span>
        </div>
      </div>

      {settings.missingScopes.length > 0 ? (
        <div className='border-destructive/40 text-destructive rounded-lg border p-3 text-sm'>
          Missing Cloudflare scopes: {settings.missingScopes.join(', ')}
        </div>
      ) : null}

      <div className='grid gap-3 border-t pt-3'>
        <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]'>
          <label className='grid gap-1.5'>
            <Label htmlFor='domain-cloudflare-account'>Cloudflare account</Label>
            <select
              id='domain-cloudflare-account'
              className='border-input bg-background h-9 rounded-md border px-3 text-sm'
              disabled={settings.readOnly}
              value={settings.selectedAccountId}
              onChange={(event) => {
                settings.onSelectAccount(event.currentTarget.value)
              }}
            >
              <option value=''>Select account</option>
              {settings.accounts.map((account) => (
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
              disabled={settings.busy || settings.readOnly}
              onClick={settings.onLoadAccounts}
              size='sm'
              variant='outline'
            >
              {settings.accounts.length > 0 ? 'Refresh accounts' : 'Load accounts'}
            </Button>
          </div>
        </div>

        <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]'>
          <label className='grid gap-1.5'>
            <Label htmlFor='domain-cloudflare-zone'>Cloudflare zone</Label>
            <select
              id='domain-cloudflare-zone'
              className='border-input bg-background h-9 rounded-md border px-3 text-sm'
              disabled={settings.readOnly}
              value={settings.selectedZoneId}
              onChange={(event) => {
                settings.onSelectZone(event.currentTarget.value)
              }}
            >
              <option value=''>Select zone</option>
              {settings.zones.map((zone) => (
                <option
                  key={zone.id}
                  value={zone.id}
                >
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
          <div className='flex items-end'>
            <Button
              disabled={!settings.selectedAccountId || settings.busy || settings.readOnly}
              onClick={settings.onLoadZones}
              size='sm'
              variant='outline'
            >
              {settings.zones.length > 0 ? 'Refresh zones' : 'Load zones'}
            </Button>
          </div>
        </div>

        <label className='grid gap-1.5'>
          <Label htmlFor='domain-name'>Domain</Label>
          <Input
            id='domain-name'
            disabled={settings.readOnly}
            value={settings.draftDomain}
            onChange={(event) => {
              settings.onDraftDomainChange(event.currentTarget.value)
            }}
          />
        </label>

        <Button
          className='w-fit'
          disabled={connectDisabled}
          onClick={settings.onConnectDomain}
          size='sm'
        >
          Connect domain
        </Button>
      </div>

      {settings.message ? <p className='text-muted-foreground text-sm'>{settings.message}</p> : null}
    </div>
  )
}

function DomainDetailPanel({ settings }: { settings: DomainSettingsController }) {
  const domain = settings.selectedDomain

  if (!domain) {
    return <AddDomainPanel settings={settings} />
  }

  const provisionVisible = domain.status !== 'active' || domain.provisioningStatus !== 'succeeded'
  const provisionLabel =
    domain.status === 'degraded' || domain.provisioningStatus === 'failed'
      ? 'Retry provisioning'
      : domain.provisioningStatus === 'not_started'
        ? 'Provision domain'
        : 'Provisioning'

  return (
    <div className='grid max-w-3xl gap-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate font-medium'>{domain.domain}</p>
          <p className='text-muted-foreground truncate text-sm'>
            {domain.cloudflareZoneName ?? domain.cloudflareZoneId}
          </p>
        </div>
        <Badge variant={getDomainStatusBadgeVariant(domain)}>{formatDomainStateLabel(domain)}</Badge>
      </div>

      <div className='grid gap-2 text-sm md:grid-cols-2'>
        <IntegrationMetric
          label='Email routing'
          value={formatEmailRoutingStatus(domain)}
        />
        <IntegrationMetric
          label='Cloudflare zone'
          value={domain.cloudflareZoneName ?? domain.cloudflareZoneId}
        />
        <IntegrationMetric
          label='Worker'
          value={domain.workerScriptName ?? 'Not provisioned'}
        />
        <IntegrationMetric
          label='Archive bucket'
          value={domain.r2BucketName ?? 'Not provisioned'}
        />
        <IntegrationMetric
          label='Last provisioned'
          value={formatDateTime(domain.lastProvisionedAt)}
        />
        <IntegrationMetric
          label='Updated'
          value={formatDateTime(domain.updatedAt)}
        />
      </div>

      <div className='grid gap-2 border-t pt-3 text-sm'>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-muted-foreground'>Cloudflare account</span>
          <span className='min-w-0 truncate font-medium'>
            {domain.cloudflareAccountName ?? domain.cloudflareAccountId}
          </span>
        </div>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-muted-foreground'>Provisioning</span>
          <span className='font-medium'>{formatStatusLabel(domain.provisioningStatus)}</span>
        </div>
      </div>

      {domain.lastErrorMessage ? <p className='text-destructive text-sm'>{domain.lastErrorMessage}</p> : null}

      <div className='flex flex-wrap gap-2'>
        {provisionVisible ? (
          <Button
            disabled={settings.busy || settings.readOnly || domain.status === 'disconnected'}
            onClick={() => {
              settings.onProvisionDomain(domain.publicId)
            }}
            size='sm'
            variant={domain.status === 'degraded' || domain.provisioningStatus === 'failed' ? 'default' : 'outline'}
          >
            {provisionLabel}
          </Button>
        ) : null}
        <Button
          onClick={settings.onAddDomain}
          size='sm'
          variant='outline'
        >
          <PlusCircleIcon />
          Add domain
        </Button>
      </div>

      {settings.message ? <p className='text-muted-foreground text-sm'>{settings.message}</p> : null}
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

function getMissingScopes(grant: CloudflareGrantView): string[] {
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

function getDomainStatusBadgeVariant(connection: CloudflareConnectionView): 'secondary' | 'destructive' | 'outline' {
  if (connection.status === 'active' && connection.provisioningStatus === 'succeeded') {
    return 'secondary'
  }

  if (connection.status === 'degraded' || connection.provisioningStatus === 'failed') {
    return 'destructive'
  }

  return 'outline'
}

function formatDomainStateLabel(connection: CloudflareConnectionView): string {
  if (connection.status === 'active' && connection.provisioningStatus === 'succeeded') {
    return 'Live'
  }

  if (connection.status === 'degraded' || connection.provisioningStatus === 'failed') {
    return 'Needs attention'
  }

  if (connection.status === 'provisioning' || connection.provisioningStatus === 'pending') {
    return 'Provisioning'
  }

  return formatStatusLabel(connection.status)
}

function formatEmailRoutingStatus(connection: CloudflareConnectionView): string {
  if (connection.status === 'active' && connection.provisioningStatus === 'succeeded') {
    return `Live on ${connection.domain}`
  }

  if (connection.status === 'degraded' || connection.provisioningStatus === 'failed') {
    return 'Needs attention'
  }

  if (connection.status === 'provisioning' || connection.provisioningStatus === 'pending') {
    return 'Provisioning'
  }

  return formatStatusLabel(connection.status)
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
