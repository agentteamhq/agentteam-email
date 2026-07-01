import * as React from 'react'
import {
  ArrowClockwiseIcon,
  ArrowsLeftRightIcon,
  CheckCircleIcon,
  CloudIcon,
  GlobeHemisphereWestIcon,
  IdentificationCardIcon,
  LockIcon,
  PlusCircleIcon,
  RobotIcon,
  SuitcaseSimpleIcon,
  TrashIcon,
  UserCircleIcon,
  UsersIcon,
  XCircleIcon
} from '@phosphor-icons/react'

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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '../../components/ui/dialog'
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
import { cn } from '../../lib/utils'
import { AgentEnrollmentCommandSummary } from './agent-enrollment-command'
import { CloudflareConnectButton, CloudflareLogo } from './cloudflare-brand'
import type { SettingsSectionId } from './settings-dialog-sections'
import type {
  AgentAccessAgent,
  AgentAccessApproval,
  AgentAccessGrant,
  AgentAccessHost,
  AgentAccessPaperclipConnection,
  AgentAccessView,
  AgentMailAdminAgentEnrollment,
  AgentMailPublicStatus,
  CloudflareAccountSummary,
  CloudflareStatusResult,
  CloudflareZoneSummary
} from '@main/backend'

export type SettingsDialogContentState = 'ready' | 'loading' | 'empty'

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
  | 'status'
  | 'updatedAt'
  | 'workerScriptName'
>

type AgentAccessCapabilityRequest = AgentAccessApproval['capabilityRequests'][number]

export interface DomainSettingsStatus {
  connections: readonly CloudflareConnectionView[]
  grants: readonly CloudflareGrantView[]
}

export interface DomainSettingsState {
  accounts?: readonly CloudflareAccountSummary[]
  busy?: boolean
  draftDomain?: string
  mailStatus?: AgentMailPublicStatus | null
  mailStatusMessage?: string | null
  message?: string | null
  mode?: 'addDomain' | 'domain'
  onAddDomain?: () => void
  onConnectDomain?: () => void
  onDisconnectCloudflare?: (grantPublicId?: CloudflareGrantView['publicId']) => void
  onDraftDomainChange?: (domain: string) => void
  onLoadAccounts?: () => void
  onLoadZones?: () => void
  onProvisionDomain?: (connectionPublicId: CloudflareConnectionView['publicId']) => void
  onRefreshMailStatus?: () => void
  onSelectAccount?: (accountId: string) => void
  onSelectDomain?: (connectionPublicId: CloudflareConnectionView['publicId']) => void
  onSelectZone?: (zoneId: string) => void
  onSetupDomain?: () => void
  onStartOAuth?: () => void
  readOnly?: boolean
  selectedAccountId?: string
  selectedDomainPublicId?: CloudflareConnectionView['publicId'] | null
  selectedZoneId?: string
  status: DomainSettingsStatus | null
  zones?: readonly CloudflareZoneSummary[]
}

export interface AgentAccessSettingsState {
  busy?: boolean
  canApproveApproval?: boolean
  canCopyEnrollmentCommand?: boolean
  canDenyApproval?: boolean
  canRefresh?: boolean
  canRevokeAgent?: boolean
  canRevokeCapabilityGrant?: boolean
  connectionHandoff?: AgentAccessConnectionHandoff | null
  createdAgentEnrollment?: AgentMailAdminAgentEnrollment | null
  message?: string | null
  onCopyEnrollmentCommand?: (command: string) => void
  onApproveApproval?: (approvalId: string) => void
  onConnectPaperclip?: (handoff: AgentAccessConnectionHandoff) => void
  onDenyApproval?: (approvalId: string) => void
  onRefresh?: () => void
  onRevokeAgent?: (agentId: string) => void
  onRevokeCapabilityGrant?: (grant: AgentAccessGrant) => void
  readOnly?: boolean
  view: AgentAccessView | null
}

export interface AgentAccessConnectionHandoff {
  companyId: string | null
  pluginId: string | null
  source: 'paperclip'
}

const settingsNavigation = [
  { id: 'account', name: 'Account', icon: UserCircleIcon },
  { id: 'security', name: 'Security', icon: LockIcon },
  { id: 'agentAccess', name: 'Agent access', icon: RobotIcon },
  { id: 'organizations', name: 'Organizations', icon: SuitcaseSimpleIcon },
  { id: 'organizationSettings', name: 'Organization settings', icon: IdentificationCardIcon },
  { id: 'organizationPeople', name: 'Organization people', icon: UsersIcon }
] satisfies Array<{
  icon: React.ComponentType<{ className?: string }>
  id: Exclude<SettingsSectionId, 'domains'>
  name: string
}>

const settingsNames = {
  account: 'Account',
  security: 'Security',
  agentAccess: 'Agent access',
  organizations: 'Organizations',
  organizationSettings: 'Organization settings',
  organizationPeople: 'Organization people',
  domains: 'Domains'
} satisfies Record<SettingsSectionId, string>

interface SettingsDialogProps {
  activeSection?: SettingsSectionId
  agentAccessState?: AgentAccessSettingsState
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
  agentAccessState,
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
  const domainSettings = domainSettingsControllerFromState(domainSettingsState)
  const agentAccess = agentAccessControllerFromState(agentAccessState)
  const activeName =
    activeSection === 'domains'
      ? domainSettings.mode === 'addDomain'
        ? 'Add domain'
        : (domainSettings.selectedDomain?.domain ?? 'Domain')
      : settingsNames[activeSection]

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className='overflow-hidden p-0 md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px]'>
        <DialogTitle className='sr-only'>Settings</DialogTitle>
        <DialogDescription className='sr-only'>
          Manage account, security, organization, and domain settings.
        </DialogDescription>
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
                <SidebarGroupContent className='min-h-0 overflow-hidden'>
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
                    <SidebarMenu className='mt-1 max-h-52 overflow-y-auto pr-1'>
                      {domainSettings.connections.map((connection) => (
                        <SidebarMenuItem key={connection.publicId}>
                          <SidebarMenuButton
                            asChild
                            isActive={
                              activeSection === 'domains' &&
                              domainSettings.mode === 'domain' &&
                              domainSettings.selectedDomainPublicId === connection.publicId
                            }
                            tooltip={connection.domain}
                          >
                            <button
                              type='button'
                              onClick={() => {
                                setActiveSection('domains')
                                domainSettings.onSelectDomain(connection.publicId)
                              }}
                            >
                              <GlobeHemisphereWestIcon />
                              <span>{connection.domain}</span>
                            </button>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
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
            <nav
              aria-label='Settings sections'
              className='border-border flex shrink-0 gap-1 overflow-x-auto border-b px-3 pb-3 md:hidden'
            >
              {settingsNavigation.map((item) => (
                <Button
                  className='shrink-0'
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id)
                  }}
                  size='sm'
                  type='button'
                  variant={item.id === activeSection ? 'secondary' : 'ghost'}
                >
                  <item.icon />
                  {item.name}
                </Button>
              ))}
              <Button
                className='shrink-0'
                onClick={() => {
                  setActiveSection('domains')
                  domainSettings.onAddDomain()
                }}
                size='sm'
                type='button'
                variant={activeSection === 'domains' ? 'secondary' : 'ghost'}
              >
                <PlusCircleIcon />
                Add domain
              </Button>
            </nav>
            <div className='flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0'>
              <SettingsPanelContent
                agentAccess={agentAccess}
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
  agentAccess,
  contentState,
  domainSettings,
  section
}: {
  agentAccess: AgentAccessController
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
    return (
      <Settings
        view='account'
        hideNav
      />
    )
  }

  if (section === 'security') {
    return (
      <Settings
        view='security'
        hideNav
      />
    )
  }

  if (section === 'agentAccess') {
    return <AgentAccessPanel access={agentAccess} />
  }

  if (section === 'organizations') {
    return (
      <Settings
        view='organizations'
        hideNav
      />
    )
  }

  if (section === 'organizationSettings') {
    return (
      <Organization
        view='settings'
        hideNav
      />
    )
  }

  if (section === 'organizationPeople') {
    return (
      <Organization
        view='people'
        hideNav
      />
    )
  }

  if (section === 'domains') {
    return <DomainSettingsContent settings={domainSettings} />
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

interface AgentAccessController {
  busy: boolean
  canCopyEnrollmentCommand: boolean
  canApproveApproval: boolean
  canDenyApproval: boolean
  canRefresh: boolean
  canRevokeAgent: boolean
  canRevokeCapabilityGrant: boolean
  connectionHandoff: AgentAccessConnectionHandoff | null
  createdAgentEnrollment: AgentMailAdminAgentEnrollment | null
  message: string | null
  onCopyEnrollmentCommand: (command: string) => void
  onApproveApproval: (approvalId: string) => void
  onConnectPaperclip?: (handoff: AgentAccessConnectionHandoff) => void
  onDenyApproval: (approvalId: string) => void
  onRefresh: () => void
  onRevokeAgent: (agentId: string) => void
  onRevokeCapabilityGrant: (grant: AgentAccessGrant) => void
  readOnly: boolean
  view: AgentAccessView | null
}

function agentAccessControllerFromState(state: AgentAccessSettingsState | undefined): AgentAccessController {
  const hasCopyEnrollmentCommand = Boolean(state?.onCopyEnrollmentCommand)
  const hasRefresh = Boolean(state?.onRefresh)

  return {
    busy: state?.busy ?? false,
    canApproveApproval: state?.canApproveApproval ?? Boolean(state?.onApproveApproval),
    canCopyEnrollmentCommand: state?.canCopyEnrollmentCommand ?? hasCopyEnrollmentCommand,
    canDenyApproval: state?.canDenyApproval ?? Boolean(state?.onDenyApproval),
    canRefresh: state?.canRefresh ?? hasRefresh,
    canRevokeAgent: state?.canRevokeAgent ?? Boolean(state?.onRevokeAgent),
    canRevokeCapabilityGrant: state?.canRevokeCapabilityGrant ?? Boolean(state?.onRevokeCapabilityGrant),
    connectionHandoff: state?.connectionHandoff ?? null,
    createdAgentEnrollment: state?.createdAgentEnrollment ?? null,
    message: state?.message ?? null,
    onCopyEnrollmentCommand: state?.onCopyEnrollmentCommand ?? ignoreAgentAccessAction,
    onApproveApproval: state?.onApproveApproval ?? ignoreAgentAccessAction,
    onConnectPaperclip: state?.onConnectPaperclip,
    onDenyApproval: state?.onDenyApproval ?? ignoreAgentAccessAction,
    onRefresh: state?.onRefresh ?? ignoreAgentAccessAction,
    onRevokeAgent: state?.onRevokeAgent ?? ignoreAgentAccessAction,
    onRevokeCapabilityGrant: state?.onRevokeCapabilityGrant ?? ignoreAgentAccessAction,
    readOnly: state?.readOnly ?? true,
    view: state?.view ?? null
  }
}

function ignoreAgentAccessAction() {}

function AgentAccessPanel({ access }: { access: AgentAccessController }) {
  const view = access.view
  const enrollment = access.createdAgentEnrollment
  const paperclipConnections = view?.paperclipConnections ?? []
  const handoff = access.connectionHandoff ? (
    <AgentAccessConnectionHandoffCard
      busy={access.busy}
      handoff={access.connectionHandoff}
      onConnect={access.onConnectPaperclip}
      readOnly={access.readOnly}
    />
  ) : null

  if (!view && !access.message) {
    return (
      <div className='grid max-w-3xl gap-3'>
        {handoff}
        <AgentAccessLoadingContent />
      </div>
    )
  }

  if (!view && access.message) {
    return (
      <div className='grid max-w-3xl gap-3'>
        {handoff}
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='font-medium'>Agent access unavailable</p>
            <p className='text-muted-foreground text-sm'>
              Agent hosts, delegated agents, and capability approvals could not be loaded.
            </p>
          </div>
          <Button
            disabled={access.busy || !access.canRefresh}
            onClick={access.onRefresh}
            size='sm'
            variant='outline'
          >
            {access.busy ? 'Retrying' : 'Retry'}
          </Button>
        </div>
        <SettingsEmptyContent
          description={access.message}
          title='Agent access could not be loaded'
        />
      </div>
    )
  }

  if (!view || view.state === 'empty') {
    return (
      <div className='grid max-w-3xl gap-3'>
        {handoff}
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='font-medium'>Agent access</p>
            <p className='text-muted-foreground text-sm'>
              Agent hosts, delegated agents, and capability approvals will appear here.
            </p>
          </div>
          <Button
            disabled={access.busy || !access.canRefresh}
            onClick={access.onRefresh}
            size='sm'
            variant='outline'
          >
            {access.busy ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
        <SettingsEmptyContent
          description='No agent hosts or organization-scoped grants are available for this workspace.'
          title='No agent access'
        />
        {paperclipConnections.length > 0 ? (
          <AgentAccessPaperclipConnectionsSection connections={paperclipConnections} />
        ) : null}
        {enrollment ? (
          <AgentAccessEnrollmentCard
            busy={access.busy}
            canCopyCommand={access.canCopyEnrollmentCommand}
            enrollment={enrollment}
            onCopyCommand={access.onCopyEnrollmentCommand}
          />
        ) : null}
        {access.message ? <p className='text-muted-foreground text-sm'>{access.message}</p> : null}
      </div>
    )
  }

  const agentById = new Map(view.agents.map((agent: AgentAccessAgent) => [agent.id, agent]))
  const capabilityCatalog = view.capabilityCatalog
  const hostById = new Map(view.hosts.map((host: AgentAccessHost) => [host.id, host]))

  return (
    <section className='grid max-w-3xl gap-4'>
      {handoff}
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='font-medium'>Agent access</p>
          <p className='text-muted-foreground text-sm'>
            Review Agent Auth hosts, agents, grants, and pending approval requests.
          </p>
        </div>
        <Button
          disabled={access.busy || !access.canRefresh}
          onClick={access.onRefresh}
          size='sm'
          variant='outline'
        >
          {access.busy ? 'Refreshing' : 'Refresh'}
        </Button>
      </div>

      {access.message ? <p className='text-muted-foreground text-sm'>{access.message}</p> : null}

      {enrollment ? (
        <AgentAccessEnrollmentCard
          busy={access.busy}
          canCopyCommand={access.canCopyEnrollmentCommand}
          enrollment={enrollment}
          onCopyCommand={access.onCopyEnrollmentCommand}
        />
      ) : null}

      {paperclipConnections.length > 0 ? (
        <AgentAccessPaperclipConnectionsSection connections={paperclipConnections} />
      ) : null}

      {view.approvals.length > 0 ? (
        <AgentAccessSection title='Capability approvals'>
          {view.approvals.map((approval: AgentAccessApproval) => (
            <AgentAccessApprovalRow
              key={approval.id}
              agent={approval.agentId ? agentById.get(approval.agentId) : undefined}
              approval={approval}
              busy={access.busy}
              canApprove={access.canApproveApproval && approval.canReview}
              canDeny={access.canDenyApproval && approval.canDeny}
              capabilityCatalog={capabilityCatalog}
              host={approval.hostId ? hostById.get(approval.hostId) : undefined}
              onApprove={access.onApproveApproval}
              onDeny={access.onDenyApproval}
            />
          ))}
        </AgentAccessSection>
      ) : null}

      {view.agents.length > 0 ? (
        <AgentAccessSection title='Agents'>
          {view.agents.map((agent: AgentAccessAgent) => (
            <AgentAccessAgentRow
              key={agent.id}
              agent={agent}
              busy={access.busy}
              canRevoke={access.canRevokeAgent && agent.canRevoke}
              host={hostById.get(agent.hostId)}
              onRevoke={access.onRevokeAgent}
            />
          ))}
        </AgentAccessSection>
      ) : null}

      {view.hosts.length > 0 ? (
        <AgentAccessSection title='Hosts'>
          {view.hosts.map((host: AgentAccessHost) => (
            <AgentAccessHostRow
              key={host.id}
              host={host}
            />
          ))}
        </AgentAccessSection>
      ) : null}

      {view.grants.length > 0 ? (
        <AgentAccessSection title='Capability grants'>
          {view.grants.map((grant: AgentAccessGrant) => (
            <AgentAccessGrantRow
              key={grant.id}
              agent={agentById.get(grant.agentId)}
              busy={access.busy}
              canRevoke={access.canRevokeCapabilityGrant && grant.canRevoke}
              capabilityCatalog={capabilityCatalog}
              grant={grant}
              onRevoke={access.onRevokeCapabilityGrant}
            />
          ))}
        </AgentAccessSection>
      ) : null}
    </section>
  )
}

function AgentAccessPaperclipConnectionsSection({
  connections
}: {
  connections: ReadonlyArray<AgentAccessPaperclipConnection>
}) {
  return (
    <AgentAccessSection title='Connected integrations'>
      {connections.map((connection) => (
        <AgentAccessPaperclipConnectionRow
          connection={connection}
          key={connection.clientId}
        />
      ))}
    </AgentAccessSection>
  )
}

function AgentAccessPaperclipConnectionRow({ connection }: { connection: AgentAccessPaperclipConnection }) {
  return (
    <div className='grid gap-2 border-b p-3 text-sm last:border-b-0'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate font-medium'>{connection.name}</p>
          <p className='text-muted-foreground truncate'>
            Paperclip OAuth principal · {formatReferenceId(connection.clientId)}
          </p>
        </div>
        <Badge variant={connection.status === 'active' ? 'secondary' : 'outline'}>
          {formatStatusLabel(connection.status)}
        </Badge>
      </div>
      <div className='text-muted-foreground grid gap-1 sm:grid-cols-3'>
        <span>Company context {paperclipCompanyContextLabel(connection.companyId)}</span>
        <span>{paperclipPluginContextLabel(connection.pluginId)}</span>
        <span>{formatStatusLabel(connection.scope)} scope</span>
      </div>
    </div>
  )
}

function AgentAccessConnectionHandoffCard({
  busy,
  handoff,
  onConnect,
  readOnly
}: {
  busy: boolean
  handoff: AgentAccessConnectionHandoff
  onConnect?: (handoff: AgentAccessConnectionHandoff) => void
  readOnly: boolean
}) {
  const supportedPlugin = handoff.pluginId === 'agentteam.paperclip-email-plugin'
  const canConnect = Boolean(onConnect && handoff.companyId && supportedPlugin) && !readOnly

  return (
    <div className='border-border bg-muted/20 grid gap-2 rounded-lg border p-3 text-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='font-medium'>Paperclip connection requested</p>
          <p className='text-muted-foreground'>
            AgentTeam Email authorizes mail access from backend grants, not Paperclip context.
          </p>
        </div>
        <Badge variant='outline'>OAuth</Badge>
      </div>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground'>
          Register a backend-owned OAuth principal before granting mailbox access.
        </p>
        <Button
          disabled={busy || !canConnect}
          onClick={() => onConnect?.(handoff)}
          size='sm'
          variant='outline'
        >
          {busy ? 'Registering' : 'Register principal'}
        </Button>
      </div>
      <div className='text-muted-foreground grid gap-1 sm:grid-cols-2'>
        <p className='truncate'>Company context: {paperclipCompanyContextLabel(handoff.companyId)}</p>
        <p className='truncate'>Plugin: {paperclipPluginContextLabel(handoff.pluginId)}</p>
      </div>
    </div>
  )
}

function paperclipCompanyContextLabel(companyId: string | null) {
  return companyId ? 'Ready' : 'Pending'
}

function paperclipPluginContextLabel(pluginId: string | null) {
  if (!pluginId) {
    return 'Pending'
  }
  return pluginId === 'agentteam.paperclip-email-plugin' ? 'AgentTeam Email plugin' : 'Unsupported plugin'
}

function AgentAccessEnrollmentCard({
  busy,
  canCopyCommand,
  enrollment,
  onCopyCommand
}: {
  busy: boolean
  canCopyCommand: boolean
  enrollment: AgentMailAdminAgentEnrollment
  onCopyCommand: (command: string) => void
}) {
  return (
    <AgentAccessSection title='Pending enrollment'>
      <AgentEnrollmentCommandSummary
        busy={busy}
        canCopyCommand={canCopyCommand}
        enrollment={enrollment}
        onCopyCommand={onCopyCommand}
      />
    </AgentAccessSection>
  )
}

function AgentAccessLoadingContent() {
  return (
    <div className='grid max-w-3xl gap-3'>
      <Skeleton className='h-16 rounded-lg' />
      <Skeleton className='h-24 rounded-lg' />
      <Skeleton className='h-24 rounded-lg' />
    </div>
  )
}

function AgentAccessSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className='grid gap-2'>
      <p className='text-sm font-medium'>{title}</p>
      <div className='divide-border overflow-hidden rounded-lg border'>{children}</div>
    </div>
  )
}

function AgentAccessAgentRow({
  agent,
  busy,
  canRevoke,
  host,
  onRevoke
}: {
  agent: AgentAccessAgent
  busy: boolean
  canRevoke: boolean
  host: AgentAccessHost | undefined
  onRevoke: (agentId: string) => void
}) {
  const canRevokeAgent = canRevoke && agent.status !== 'revoked' && agent.status !== 'expired'
  const handleRevoke = React.useCallback(() => {
    onRevoke(agent.id)
  }, [agent.id, onRevoke])
  return (
    <div className='grid gap-2 border-b p-3 text-sm last:border-b-0'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate font-medium'>{agent.name}</p>
          <p className='text-muted-foreground truncate'>
            {formatStatusLabel(agent.mode)} · {formatReferenceId(agent.id)}
          </p>
        </div>
        <Badge variant={agent.status === 'active' ? 'secondary' : 'outline'}>
          {formatStatusLabel(agent.status)}
        </Badge>
      </div>
      <div className='text-muted-foreground grid gap-1 sm:grid-cols-5'>
        <span>{agent.activeCapabilityCount} active grants</span>
        <span>{agent.pendingCapabilityCount} pending grants</span>
        <span>Host {host?.name ?? formatReferenceId(agent.hostId)}</span>
        <span>Workspace {formatReferenceId(agent.organizationId)}</span>
        <span>Last used {formatDateTime(agent.lastUsedAt)}</span>
      </div>
      {canRevokeAgent ? (
        <div>
          <Button
            disabled={busy}
            onClick={handleRevoke}
            size='sm'
            variant='outline'
          >
            <TrashIcon />
            Revoke agent
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function AgentAccessHostRow({ host }: { host: AgentAccessHost }) {
  return (
    <div className='grid gap-2 border-b p-3 text-sm last:border-b-0'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate font-medium'>{host.name}</p>
          <p className='text-muted-foreground truncate'>Host ref {formatReferenceId(host.id)}</p>
        </div>
        <Badge variant={host.status === 'active' ? 'secondary' : 'outline'}>
          {formatStatusLabel(host.status)}
        </Badge>
      </div>
      <div className='text-muted-foreground grid gap-1 sm:grid-cols-4'>
        <span>{host.agentCount} agents</span>
        <span>{host.defaultCapabilities.length} default capabilities</span>
        <span>Workspace {formatReferenceId(host.organizationId)}</span>
        <span>Last used {formatDateTime(host.lastUsedAt)}</span>
      </div>
    </div>
  )
}

function AgentAccessGrantRow({
  agent,
  busy,
  canRevoke,
  capabilityCatalog,
  grant,
  onRevoke
}: {
  agent: AgentAccessAgent | undefined
  busy: boolean
  canRevoke: boolean
  capabilityCatalog: AgentAccessView['capabilityCatalog']
  grant: AgentAccessGrant
  onRevoke: (grant: AgentAccessGrant) => void
}) {
  const canRevokeGrant = canRevoke && (grant.status === 'active' || grant.status === 'pending')
  const handleRevoke = React.useCallback(() => {
    onRevoke(grant)
  }, [grant, onRevoke])
  return (
    <div className='grid gap-2 border-b p-3 text-sm last:border-b-0'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate font-medium'>{formatCapabilityLabel(capabilityCatalog, grant.capability)}</p>
          <p className='text-muted-foreground truncate'>{constraintSummary(grant.constraints)}</p>
        </div>
        <Badge variant={grant.status === 'active' ? 'secondary' : 'outline'}>
          {formatStatusLabel(grant.status)}
        </Badge>
      </div>
      <ConstraintDetails constraints={grant.constraints} />
      <p className='text-muted-foreground text-xs'>
        Agent {agent?.name ?? formatReferenceId(grant.agentId)} · Workspace{' '}
        {formatReferenceId(grant.organizationId) ?? 'Unknown'} · {formatGrantActor(grant)} · Expires{' '}
        {formatDateTime(grant.expiresAt)}
      </p>
      {canRevokeGrant ? (
        <div>
          <Button
            disabled={busy}
            onClick={handleRevoke}
            size='sm'
            variant='outline'
          >
            <TrashIcon />
            Revoke capability
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function AgentAccessApprovalRow({
  agent,
  approval,
  busy,
  canApprove,
  canDeny,
  capabilityCatalog,
  host,
  onApprove,
  onDeny
}: {
  agent: AgentAccessAgent | undefined
  approval: AgentAccessApproval
  busy: boolean
  canApprove: boolean
  canDeny: boolean
  capabilityCatalog: AgentAccessView['capabilityCatalog']
  host: AgentAccessHost | undefined
  onApprove: (approvalId: string) => void
  onDeny: (approvalId: string) => void
}) {
  const actionUnavailable = busy || approval.status !== 'pending'
  const handleApprove = React.useCallback(() => {
    onApprove(approval.id)
  }, [approval.id, onApprove])
  const handleDeny = React.useCallback(() => {
    onDeny(approval.id)
  }, [approval.id, onDeny])
  return (
    <div className='grid gap-2 border-b p-3 text-sm last:border-b-0'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate font-medium'>{approval.bindingMessage ?? 'Capability approval'}</p>
          <p className='text-muted-foreground truncate'>
            {approval.capabilityRequests
              .map((request) => formatApprovalCapabilityRequest(capabilityCatalog, request))
              .join(', ')}
          </p>
        </div>
        <Badge variant='outline'>{formatStatusLabel(approval.status)}</Badge>
      </div>
      {approval.capabilityRequests.some((request: AgentAccessCapabilityRequest) => request.reason) ? (
        <p className='text-muted-foreground text-xs'>
          {approval.capabilityRequests
            .map((request: AgentAccessCapabilityRequest) => request.reason)
            .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0)
            .join(' · ')}
        </p>
      ) : null}
      {approval.capabilityRequests.some(
        (request: AgentAccessCapabilityRequest) => request.approvalStrength === 'webauthn'
      ) ? (
        <p className='text-muted-foreground text-xs'>Passkey verification required</p>
      ) : null}
      {approval.capabilityRequests.map((request: AgentAccessCapabilityRequest) => (
        <ConstraintDetails
          constraints={request.constraints}
          key={request.capability}
        />
      ))}
      <p className='text-muted-foreground text-xs'>
        Agent {agent?.name ?? formatReferenceId(approval.agentId) ?? 'Pending'} · Host{' '}
        {host?.name ?? formatReferenceId(approval.hostId) ?? 'Pending'} · {formatStatusLabel(approval.method)}{' '}
        · Expires {formatDateTime(approval.expiresAt)}
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button
          disabled={actionUnavailable || !canApprove}
          onClick={handleApprove}
          size='sm'
          variant='outline'
        >
          <CheckCircleIcon />
          Review approval
        </Button>
        <Button
          disabled={actionUnavailable || !canDeny}
          onClick={handleDeny}
          size='sm'
          variant='outline'
        >
          <XCircleIcon />
          Deny
        </Button>
      </div>
    </div>
  )
}

function ConstraintDetails({ constraints }: { constraints: Record<string, unknown> | null }) {
  const details = constraintDetailItems(constraints)
  if (details.length === 0) {
    return null
  }

  return (
    <div className='text-muted-foreground flex flex-wrap gap-1 text-xs'>
      {details.map((detail) => (
        <Badge
          key={detail}
          variant='outline'
        >
          {detail}
        </Badge>
      ))}
    </div>
  )
}

type DomainPublicId = CloudflareConnectionView['publicId']
type CloudflareGrantPublicId = CloudflareGrantView['publicId']

interface DomainSettingsController {
  accounts: readonly CloudflareAccountSummary[]
  activeGrant: CloudflareGrantView | null
  busy: boolean
  connections: readonly CloudflareConnectionView[]
  draftDomain: string
  mailStatus: AgentMailPublicStatus | null
  mailStatusMessage: string | null
  message: string | null
  missingScopes: readonly string[]
  mode: 'addDomain' | 'domain'
  onAddDomain: () => void
  onConnectDomain: () => void
  onDisconnectCloudflare: (grantPublicId?: CloudflareGrantPublicId) => void
  onDraftDomainChange: (domain: string) => void
  onLoadAccounts: () => void
  onLoadZones: () => void
  onProvisionDomain: (connectionPublicId: DomainPublicId) => void
  onRefreshMailStatus: () => void
  onSelectAccount: (accountId: string) => void
  onSelectDomain: (connectionPublicId: DomainPublicId) => void
  onSelectZone: (zoneId: string) => void
  onSetupDomain: () => void
  onStartOAuth: () => void
  readOnly: boolean
  selectedAccountId: string
  selectedDomain: CloudflareConnectionView | null
  selectedDomainPublicId: DomainPublicId | null
  selectedZoneId: string
  status: DomainSettingsStatus | null
  zones: readonly CloudflareZoneSummary[]
}

function domainSettingsControllerFromState(state?: DomainSettingsState): DomainSettingsController {
  const readOnly = state ? (state.readOnly ?? false) : true
  const status = state?.status ?? null
  const accounts = state?.accounts ?? []
  const zones = state?.zones ?? []
  const selectedAccountId = state?.selectedAccountId ?? ''
  const selectedZoneId = state?.selectedZoneId ?? ''
  const draftDomain = state?.draftDomain ?? ''
  const mailStatus = state?.mailStatus ?? null
  const mailStatusMessage = state?.mailStatusMessage ?? null
  const message = state?.message ?? null
  const connections = status?.connections ?? []
  const selectedDomainPublicId = state?.selectedDomainPublicId ?? connections[0]?.publicId ?? null
  const selectedDomain = selectedDomainPublicId
    ? (connections.find((connection) => connection.publicId === selectedDomainPublicId) ??
      connections[0] ??
      null)
    : (connections[0] ?? null)
  const mode = state?.mode ?? (connections.length > 0 ? 'domain' : 'addDomain')
  const activeGrant = status?.grants.find((grant) => grant.status === 'active') ?? null
  const missingScopes = activeGrant ? getMissingScopes(activeGrant) : []
  const action =
    <TArgs extends unknown[]>(handler: ((...args: TArgs) => void) | undefined) =>
    (...args: TArgs) => {
      if (!readOnly) {
        handler?.(...args)
      }
    }

  return {
    accounts,
    activeGrant,
    busy: state?.busy ?? false,
    connections,
    draftDomain,
    mailStatus,
    mailStatusMessage,
    message,
    missingScopes,
    mode,
    onAddDomain: action(state?.onAddDomain),
    onConnectDomain: action(state?.onConnectDomain),
    onDisconnectCloudflare: action(state?.onDisconnectCloudflare),
    onDraftDomainChange: action(state?.onDraftDomainChange),
    onLoadAccounts: action(state?.onLoadAccounts),
    onLoadZones: action(state?.onLoadZones),
    onProvisionDomain: action(state?.onProvisionDomain),
    onRefreshMailStatus: action(state?.onRefreshMailStatus),
    onSelectAccount: action(state?.onSelectAccount),
    onSelectDomain: action(state?.onSelectDomain),
    onSelectZone: action(state?.onSelectZone),
    onSetupDomain: action(state?.onSetupDomain),
    onStartOAuth: action(state?.onStartOAuth),
    readOnly,
    selectedAccountId,
    selectedDomain,
    selectedDomainPublicId,
    selectedZoneId,
    status,
    zones
  }
}

export function DomainSettingsPanel({
  className,
  includeMailRuntimeStatus = true,
  state
}: {
  className?: string
  includeMailRuntimeStatus?: boolean
  state?: DomainSettingsState
}) {
  return (
    <DomainSettingsContent
      className={className}
      includeMailRuntimeStatus={includeMailRuntimeStatus}
      settings={domainSettingsControllerFromState(state)}
    />
  )
}

function DomainSettingsContent({
  className,
  includeMailRuntimeStatus = true,
  settings
}: {
  className?: string
  includeMailRuntimeStatus?: boolean
  settings: DomainSettingsController
}) {
  if (settings.status === null && !settings.message) {
    return <DomainSettingsLoadingContent />
  }

  const domainPanel =
    settings.mode === 'addDomain' || !settings.selectedDomain ? (
      <AddDomainPanel settings={settings} />
    ) : (
      <DomainDetailPanel settings={settings} />
    )

  return (
    <div className={cn('grid max-w-3xl gap-4', className)}>
      {domainPanel}
      {includeMailRuntimeStatus ? <MailRuntimeStatusPanel settings={settings} /> : null}
    </div>
  )
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

function MailRuntimeStatusPanel({ settings }: { settings: DomainSettingsController }) {
  const status = settings.mailStatus
  const queue = status ? aggregateMailRuntimeQueue(status) : null
  const moduleSummary = status ? summarizeMailRuntimeModules(status) : null
  const activeDomains = status?.controlState?.domainsActive
  const totalDomains = status?.controlState?.domainsTotal

  if (!status && !settings.mailStatusMessage) {
    return null
  }

  return (
    <Card className='p-0'>
      <CardContent className='space-y-3 p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='text-sm font-medium'>Mail runtime</p>
            <p className='text-muted-foreground text-sm'>
              {status?.selectedProvider ? `${status.selectedProvider} provider` : 'Runtime status'}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            {status ? (
              <Badge variant={status.ok ? 'secondary' : 'destructive'}>
                {formatStatusLabel(status.status)}
              </Badge>
            ) : null}
            <Button
              disabled={settings.busy || settings.readOnly}
              onClick={settings.onRefreshMailStatus}
              size='icon'
              variant='ghost'
            >
              <ArrowClockwiseIcon />
              <span className='sr-only'>Refresh mail runtime status</span>
            </Button>
          </div>
        </div>

        {settings.mailStatusMessage ? (
          <p className='text-destructive text-sm'>{settings.mailStatusMessage}</p>
        ) : null}

        {status ? (
          <div className='grid gap-2 text-sm md:grid-cols-2'>
            <DomainDetailRow
              label='Modules'
              value={
                moduleSummary ? `${moduleSummary.ok}/${moduleSummary.total} healthy` : 'No module status'
              }
            />
            <DomainDetailRow
              label='Queue'
              value={queue ? `${queue.pending} pending · ${queue.retryWait} retry` : 'No queue status'}
            />
            <DomainDetailRow
              label='Runtime domains'
              value={
                typeof activeDomains === 'number' && typeof totalDomains === 'number'
                  ? `${activeDomains}/${totalDomains} active`
                  : 'No domain status'
              }
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function AddDomainPanel({ settings }: { settings: DomainSettingsController }) {
  const activeGrant = settings.activeGrant
  const selectedZone = selectedCloudflareZone(settings)
  const selectedDomainName = selectedZone?.name ?? settings.draftDomain
  const zoneGroups = groupCloudflareZonesByAccount(settings.zones)
  const hasDomains = settings.zones.length > 0
  const primaryAction = hasDomains ? settings.onSetupDomain : settings.onLoadAccounts
  const primaryDisabled =
    settings.busy ||
    settings.readOnly ||
    settings.missingScopes.length > 0 ||
    (hasDomains && (!selectedZone || !selectedDomainName))

  if (!activeGrant) {
    return (
      <div className='grid max-w-3xl gap-4'>
        <Card className='gap-0 py-4 shadow-none'>
          <CardHeader
            className='flex flex-col gap-3 px-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'
          >
            <div className='flex min-w-0 items-start gap-3'>
              <CloudflareLogo className='mt-0.5 h-6 w-auto shrink-0' />
              <div className='min-w-0'>
                <CardTitle className='text-sm'>Connect your domain</CardTitle>
                <CardDescription className='mt-1'>Connect Cloudflare to choose your domain.</CardDescription>
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
                Continue with Cloudflare
              </CloudflareConnectButton>
            </CardAction>
          </CardHeader>
        </Card>
        {settings.message ? <p className='text-muted-foreground text-sm'>{settings.message}</p> : null}
      </div>
    )
  }

  return (
    <Card className='mx-auto w-full max-w-md overflow-hidden shadow-none'>
      <CardHeader className='items-center justify-items-center px-6 text-center'>
        <DomainSetupConnectionVisual domain={selectedDomainName} />
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
              value={settings.selectedZoneId || undefined}
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
                  <React.Fragment key={group.accountId}>
                    {index > 0 ? <SelectSeparator /> : null}
                    <SelectGroup>
                      <SelectLabel>{group.accountName}</SelectLabel>
                      {group.zones.map((zone) => (
                        <SelectItem
                          key={zone.id}
                          value={zone.id}
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

        <DomainSetupChecklist
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

function DomainDetailPanel({ settings }: { settings: DomainSettingsController }) {
  const domain = settings.selectedDomain

  if (!domain) {
    return <AddDomainPanel settings={settings} />
  }

  const provisionVisible = domain.status !== 'active' || domain.provisioningStatus !== 'succeeded'
  const isProvisioning = domain.status === 'provisioning' || domain.provisioningStatus === 'pending'
  const provisionLabel =
    domain.status === 'degraded' || domain.provisioningStatus === 'failed'
      ? 'Retry email setup'
      : domain.provisioningStatus === 'not_started'
        ? 'Set up email routing'
        : 'Setting up email routing'
  const disconnectDisabled =
    settings.busy || settings.readOnly || !settings.activeGrant || domain.status === 'disconnected'

  return (
    <Card className='mx-auto w-full max-w-md gap-0 overflow-hidden py-6 shadow-none'>
      <CardHeader className='items-center justify-items-center px-6 text-center'>
        <DomainSetupConnectionVisual domain={domain.domain} />
        <Badge variant={getDomainStatusBadgeVariant(domain)}>{formatDomainStateLabel(domain)}</Badge>
        <CardTitle className='text-xl'>{domain.domain}</CardTitle>
        <CardDescription className='max-w-md'>
          {domain.status === 'active' && domain.provisioningStatus === 'succeeded'
            ? 'Send and receive mail are ready through Cloudflare.'
            : 'AgentTeam Email will configure Cloudflare routing for send and receive mail.'}
        </CardDescription>
      </CardHeader>

      <CardContent className='grid gap-5 px-6'>
        <DomainSetupChecklist
          items={[
            {
              label: 'Cloudflare access approved',
              state: settings.activeGrant ? 'complete' : 'pending'
            },
            {
              label: `${domain.domain} selected`,
              state: 'complete'
            },
            {
              label: 'Email routing connected',
              state: domain.status === 'disconnected' ? 'error' : 'complete'
            },
            {
              label: 'Send and receive mail configured',
              state:
                domain.status === 'active' && domain.provisioningStatus === 'succeeded'
                  ? 'complete'
                  : domain.status === 'degraded' || domain.provisioningStatus === 'failed'
                    ? 'error'
                    : 'current'
            }
          ]}
        />

        <div className='text-muted-foreground grid gap-1 text-sm'>
          <div className='flex items-center justify-between gap-4'>
            <span>Cloudflare account</span>
            <span className='text-foreground min-w-0 truncate text-right font-medium'>
              {domain.cloudflareAccountName ?? domain.cloudflareAccountId}
            </span>
          </div>
          <div className='flex items-center justify-between gap-4'>
            <span>Last setup</span>
            <span className='text-foreground min-w-0 truncate text-right font-medium'>
              {formatDateTime(domain.lastProvisionedAt)}
            </span>
          </div>
        </div>

        {domain.lastErrorMessage ? <p className='text-destructive text-sm'>{domain.lastErrorMessage}</p> : null}
        {settings.message ? <p className='text-muted-foreground text-sm'>{settings.message}</p> : null}
      </CardContent>

      {provisionVisible || settings.activeGrant ? (
        <CardFooter className='flex-col gap-2 border-t px-6 pt-4 sm:flex-row sm:justify-end'>
          {provisionVisible ? (
            <Button
              className='w-full sm:w-auto'
              disabled={settings.busy || settings.readOnly || isProvisioning || domain.status === 'disconnected'}
              onClick={() => {
                settings.onProvisionDomain(domain.publicId)
              }}
              variant={
                domain.status === 'degraded' || domain.provisioningStatus === 'failed' ? 'default' : 'outline'
              }
            >
              {settings.busy || isProvisioning ? <Spinner data-icon='inline-start' /> : null}
              {provisionLabel}
            </Button>
          ) : null}
          {settings.activeGrant ? (
            <Button
              className='w-full sm:w-auto'
              disabled={disconnectDisabled}
              onClick={() => {
                settings.onDisconnectCloudflare(settings.activeGrant?.publicId)
              }}
              variant='outline'
            >
              <TrashIcon data-icon='inline-start' />
              Disconnect Cloudflare
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  )
}

function DomainDetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex min-h-11 items-center justify-between gap-4 rounded-md border px-4 py-3 text-sm'>
      <span className='text-muted-foreground shrink-0'>{label}</span>
      <span className='min-w-0 truncate text-right font-medium'>{value}</span>
    </div>
  )
}

type DomainSetupChecklistState = 'complete' | 'current' | 'error' | 'pending'

interface DomainSetupChecklistItem {
  label: string
  state: DomainSetupChecklistState
}

function DomainSetupConnectionVisual({ domain }: { domain?: string }) {
  return (
    <div
      aria-label={domain ? `AgentTeam Email connects to ${domain}` : 'AgentTeam Email connects to a domain'}
      className='flex w-full justify-center py-2'
    >
      <div className='relative flex items-center justify-center gap-3'>
        <DomainSetupLogoCircle label='AgentTeam Email'>
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
        </DomainSetupLogoCircle>
        <span
          aria-hidden='true'
          className='text-muted-foreground flex size-7 items-center justify-center'
        >
          <ArrowsLeftRightIcon
            className='size-5'
            weight='bold'
          />
        </span>
        <DomainSetupLogoCircle label={domain ?? 'Cloudflare domain'}>
          <CloudIcon className='text-foreground size-7' />
        </DomainSetupLogoCircle>
      </div>
    </div>
  )
}

function DomainSetupLogoCircle({
  children,
  label
}: {
  children: React.ReactNode
  label: string
}) {
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

function DomainSetupChecklist({ items }: { items: ReadonlyArray<DomainSetupChecklistItem> }) {
  return (
    <ul className='grid gap-3'>
      {items.map((item) => (
        <li
          className='text-foreground flex items-center gap-3 text-sm'
          key={item.label}
        >
          <DomainSetupChecklistIcon state={item.state} />
          <span className='min-w-0 truncate'>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

function DomainSetupChecklistIcon({ state }: { state: DomainSetupChecklistState }) {
  if (state === 'error') {
    return <XCircleIcon className='text-destructive size-4 shrink-0' />
  }

  return <CheckCircleIcon className='text-primary size-4 shrink-0' />
}

function selectedCloudflareZone(settings: DomainSettingsController): CloudflareZoneSummary | null {
  return settings.zones.find((zone) => zone.id === settings.selectedZoneId) ?? null
}

function groupCloudflareZonesByAccount(zones: readonly CloudflareZoneSummary[]) {
  const groups = new Map<
    string,
    {
      accountId: string
      accountName: string
      zones: CloudflareZoneSummary[]
    }
  >()

  for (const zone of zones) {
    const accountId = zone.accountId
    const group = groups.get(accountId)
    if (group) {
      group.zones.push(zone)
      continue
    }

    groups.set(accountId, {
      accountId,
      accountName: zone.accountName ?? accountId,
      zones: [zone]
    })
  }

  return Array.from(groups.values())
}

function getMissingScopes(grant: CloudflareGrantView): string[] {
  return grant.requiredScopes.filter((scope) => !grant.grantedScopes.includes(scope))
}

function aggregateMailRuntimeQueue(status: AgentMailPublicStatus) {
  let pending = 0
  let retryWait = 0
  let seen = false

  for (const moduleStatus of Object.values(status.modules)) {
    if (!moduleStatus.queue) {
      continue
    }
    pending += moduleStatus.queue.pending ?? 0
    retryWait += moduleStatus.queue.retryWait ?? 0
    seen = true
  }

  return seen ? { pending, retryWait } : null
}

function summarizeMailRuntimeModules(status: AgentMailPublicStatus) {
  const modules = Object.values(status.modules)
  if (modules.length === 0) {
    return null
  }

  return {
    ok: modules.filter((moduleStatus) => moduleStatus.ok === true).length,
    total: modules.length
  }
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
    .join(' ')
    .split(/[\s.]+/u)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatCapabilityLabel(catalog: AgentAccessView['capabilityCatalog'], value: string): string {
  return (
    catalog.capabilityOptions.find((option) => option.value === value)?.label ??
    `Unknown capability (${value})`
  )
}

function formatGrantActor(grant: AgentAccessGrant): string {
  if (grant.deniedBy) {
    return `Denied by ${formatAgentAccessActor(grant.deniedBy)}`
  }
  if (grant.grantedBy) {
    return `Granted by ${formatAgentAccessActor(grant.grantedBy)}`
  }
  if (grant.deniedByUser) {
    return 'Denied by user'
  }
  if (grant.grantedByUser) {
    return 'Granted by user'
  }
  return 'Granted by system'
}

function formatAgentAccessActor(actor: NonNullable<AgentAccessGrant['grantedBy']>): string {
  return `user ${formatReferenceId(actor.id) ?? actor.id}`
}

function formatApprovalCapabilityRequest(
  catalog: AgentAccessView['capabilityCatalog'],
  request: AgentAccessApproval['capabilityRequests'][number]
): string {
  const constraints = constraintSummary(request.constraints)
  return constraints === 'No constraints'
    ? formatCapabilityLabel(catalog, request.capability)
    : `${formatCapabilityLabel(catalog, request.capability)} (${constraints})`
}

function constraintSummary(constraints: Record<string, unknown> | null): string {
  if (!constraints) {
    return 'No constraints'
  }

  const mailboxAddress = typeof constraints.mailboxAddress === 'string' ? constraints.mailboxAddress : null
  const organizationId = typeof constraints.organizationId === 'string' ? constraints.organizationId : null
  const details = constraintDetailItems(constraints)
  if (mailboxAddress) {
    return details.length > 0
      ? `${mailboxAddress} · ${formatConstraintSummaryDetails(details)}`
      : mailboxAddress
  }
  if (organizationId) {
    const organization = `Workspace ${formatReferenceId(organizationId)}`
    return details.length > 0 ? `${organization} · ${formatConstraintSummaryDetails(details)}` : organization
  }
  return details.length > 0 ? formatConstraintSummaryDetails(details) : 'No constraints'
}

function formatConstraintSummaryDetails(details: ReadonlyArray<string>): string {
  return details.length > 2
    ? `${details.slice(0, 2).join(' · ')} · ${details.length - 2} more`
    : details.join(' · ')
}

function formatReferenceId(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function constraintDetailItems(constraints: Record<string, unknown> | null): string[] {
  if (!constraints) {
    return []
  }

  return Object.entries(constraints)
    .filter(([key]) => key !== 'mailboxAddress' && key !== 'organizationId')
    .map(([key, value]) => `${key}: ${formatConstraintValue(value)}`)
    .sort()
}

function formatConstraintValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(formatConstraintValue).join(', ')
  }
  if (!value || typeof value !== 'object') {
    return 'null'
  }

  return JSON.stringify(value)
}

function getDomainStatusBadgeVariant(
  connection: CloudflareConnectionView
): 'secondary' | 'destructive' | 'outline' {
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
