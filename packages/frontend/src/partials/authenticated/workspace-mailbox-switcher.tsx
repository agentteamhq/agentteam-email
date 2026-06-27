import * as React from 'react'
import {
  BuildingsIcon,
  CaretRightIcon,
  CaretUpDownIcon,
  CheckIcon,
  EnvelopeSimpleIcon,
  PlusIcon,
  WarningIcon
} from '@phosphor-icons/react'

import { Avatar, AvatarFallback } from '../../components/ui/avatar'
import { Badge } from '../../components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../../components/ui/empty'
import { ScrollArea } from '../../components/ui/scroll-area'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../../components/ui/sidebar'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'

export type WorkspaceMailboxSwitcherState = 'empty' | 'loading' | 'ready'

export interface WorkspaceMailboxSwitcherWorkspace {
  badgeLabel?: string
  disabled?: boolean
  id: string
  name: string
  slug?: string
}

export interface WorkspaceMailboxSwitcherMailbox {
  address: string
  badgeLabel?: string
  disabled?: boolean
  disabledReason?: string
  id: string
  name: string
  status?: 'attention' | 'ready'
  statusLabel?: string
  unreadLabel?: string
}

export interface WorkspaceMailboxSwitcherProps {
  activeMailboxId?: string
  activeWorkspaceId?: string
  align?: 'center' | 'end' | 'start'
  className?: string
  defaultOpen?: boolean
  mailboxes: ReadonlyArray<WorkspaceMailboxSwitcherMailbox>
  onMailboxSelect?: (mailboxId: string) => void
  onOpenChange?: (open: boolean) => void
  onWorkspaceSelect?: (workspaceId: string) => void
  open?: boolean
  side?: 'bottom' | 'left' | 'right' | 'top'
  state?: WorkspaceMailboxSwitcherState
  workspaces: ReadonlyArray<WorkspaceMailboxSwitcherWorkspace>
}

export function WorkspaceMailboxSwitcher({
  activeMailboxId,
  activeWorkspaceId,
  align = 'start',
  className,
  defaultOpen,
  mailboxes,
  onMailboxSelect,
  onOpenChange,
  onWorkspaceSelect,
  open,
  side,
  state = 'ready',
  workspaces
}: WorkspaceMailboxSwitcherProps) {
  const { isMobile } = useSidebar()
  const activeWorkspace = getActiveWorkspace(workspaces, activeWorkspaceId)
  const activeMailbox = getActiveMailbox(mailboxes, activeMailboxId)
  const switchableWorkspaces = getSwitchableWorkspaces(workspaces, activeWorkspace?.id)
  const hasSwitchableWorkspaces = switchableWorkspaces.length > 0
  const resolvedSide = side ?? (isMobile ? 'bottom' : 'right')
  const mailboxCountLabel = getMailboxCountLabel(mailboxes.length)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          open={open}
        >
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              aria-label='Open workspace and mailbox switcher'
              className={cn(
                'focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
                className
              )}
              size='lg'
              tooltip='Workspace and mailboxes'
            >
              <span className='relative flex aspect-square size-8 shrink-0 overflow-hidden rounded-lg'>
                <img
                  alt=''
                  aria-hidden='true'
                  className='hidden size-8 dark:block'
                  draggable={false}
                  src='/agentteam-email-dark-logo.svg'
                />
                <img
                  alt=''
                  aria-hidden='true'
                  className='block size-8 dark:hidden'
                  draggable={false}
                  src='/agentteam-email-light-logo.svg'
                />
                <span
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-0 bg-black/5'
                />
              </span>
              <div className='grid min-w-0 flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>
                  {activeMailbox?.name ?? activeWorkspace?.name ?? 'Mailboxes'}
                </span>
                <span className='text-muted-foreground truncate text-xs'>
                  {activeMailbox?.address ?? activeWorkspace?.slug ?? mailboxCountLabel}
                </span>
              </div>
              <CaretUpDownIcon className='ml-auto shrink-0' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={align}
            className='w-80 max-w-sm rounded-lg'
            side={resolvedSide}
            sideOffset={4}
          >
            <WorkspaceSummary
              activeWorkspace={activeWorkspace}
              hasSwitchableWorkspaces={hasSwitchableWorkspaces}
            />
            {hasSwitchableWorkspaces ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className='text-muted-foreground text-xs'>Workspaces</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {switchableWorkspaces.map((workspace) => (
                    <WorkspaceItem
                      key={workspace.id}
                      onWorkspaceSelect={onWorkspaceSelect}
                      workspace={workspace}
                    />
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <div className='flex items-center justify-between gap-2 px-2 py-1.5'>
              <DropdownMenuLabel className='text-muted-foreground p-0 text-xs'>Mailboxes</DropdownMenuLabel>
              {state === 'ready' && mailboxes.length ? (
                <span className='text-muted-foreground text-xs'>{mailboxCountLabel}</span>
              ) : null}
            </div>
            <MailboxSection
              activeMailboxId={activeMailbox?.id}
              mailboxes={mailboxes}
              onMailboxSelect={onMailboxSelect}
              state={state}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function WorkspaceSummary({
  activeWorkspace,
  hasSwitchableWorkspaces
}: {
  activeWorkspace?: WorkspaceMailboxSwitcherWorkspace
  hasSwitchableWorkspaces: boolean
}) {
  return (
    <div className='flex min-w-0 items-center gap-3 px-2 py-2'>
      <div
        className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'
      >
        <BuildingsIcon />
      </div>
      <div className='grid min-w-0 flex-1 gap-0.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate text-sm font-medium'>{activeWorkspace?.name ?? 'Workspace'}</span>
          {activeWorkspace?.badgeLabel ? (
            <Badge
              className='shrink-0'
              variant='secondary'
            >
              {activeWorkspace.badgeLabel}
            </Badge>
          ) : null}
        </div>
        <span className='text-muted-foreground truncate text-xs'>
          {hasSwitchableWorkspaces
            ? 'Switch workspace context'
            : activeWorkspace?.slug
              ? `${activeWorkspace.slug} workspace`
              : 'Current workspace'}
        </span>
      </div>
    </div>
  )
}

function WorkspaceItem({
  onWorkspaceSelect,
  workspace
}: {
  onWorkspaceSelect?: (workspaceId: string) => void
  workspace: WorkspaceMailboxSwitcherWorkspace
}) {
  return (
    <DropdownMenuItem
      className='gap-2 p-2'
      disabled={workspace.disabled}
      onSelect={() => {
        onWorkspaceSelect?.(workspace.id)
      }}
    >
      <div className='flex size-7 shrink-0 items-center justify-center rounded-md border'>
        <BuildingsIcon />
      </div>
      <span className='grid min-w-0 flex-1 gap-0.5'>
        <span className='truncate'>{workspace.name}</span>
        {workspace.slug ? (
          <span className='text-muted-foreground truncate text-xs'>{workspace.slug}</span>
        ) : null}
      </span>
      <CaretRightIcon className='shrink-0' />
    </DropdownMenuItem>
  )
}

function MailboxSection({
  activeMailboxId,
  mailboxes,
  onMailboxSelect,
  state
}: {
  activeMailboxId?: string
  mailboxes: ReadonlyArray<WorkspaceMailboxSwitcherMailbox>
  onMailboxSelect?: (mailboxId: string) => void
  state: WorkspaceMailboxSwitcherState
}) {
  if (state === 'loading') {
    return <MailboxLoadingRows />
  }

  if (state === 'empty' || mailboxes.length === 0) {
    return <MailboxEmptyState />
  }

  const list = (
    <DropdownMenuGroup className='grid gap-1'>
      {mailboxes.map((mailbox) => (
        <MailboxItem
          active={mailbox.id === activeMailboxId}
          key={mailbox.id}
          mailbox={mailbox}
          onMailboxSelect={onMailboxSelect}
        />
      ))}
    </DropdownMenuGroup>
  )

  if (mailboxes.length > 7) {
    return (
      <ScrollArea className={cn(getMailboxScrollHeightClass(mailboxes.length), 'pr-2')}>{list}</ScrollArea>
    )
  }

  return list
}

function MailboxItem({
  active,
  mailbox,
  onMailboxSelect
}: {
  active: boolean
  mailbox: WorkspaceMailboxSwitcherMailbox
  onMailboxSelect?: (mailboxId: string) => void
}) {
  return (
    <DropdownMenuItem
      className='items-start gap-2 p-2'
      disabled={mailbox.disabled}
      onSelect={() => {
        onMailboxSelect?.(mailbox.id)
      }}
    >
      <MailboxAvatar mailbox={mailbox} />
      <span className='grid min-w-0 flex-1 gap-1'>
        <span className='flex min-w-0 items-center gap-2'>
          <span className='truncate font-medium'>{mailbox.name}</span>
          {mailbox.badgeLabel ? (
            <Badge
              className='shrink-0'
              variant='outline'
            >
              {mailbox.badgeLabel}
            </Badge>
          ) : null}
        </span>
        <span className='text-muted-foreground truncate text-xs'>{mailbox.address}</span>
        {mailbox.disabledReason || mailbox.statusLabel ? (
          <span className='text-muted-foreground flex min-w-0 items-center gap-1 text-xs'>
            {mailbox.status === 'attention' ? <WarningIcon className='shrink-0' /> : null}
            <span className='truncate'>{mailbox.disabledReason ?? mailbox.statusLabel}</span>
          </span>
        ) : null}
      </span>
      {mailbox.unreadLabel ? (
        <Badge
          className='shrink-0'
          variant='secondary'
        >
          {mailbox.unreadLabel}
        </Badge>
      ) : null}
      {active ? <CheckIcon className='mt-0.5 shrink-0' /> : null}
    </DropdownMenuItem>
  )
}

function MailboxAvatar({ mailbox }: { mailbox: WorkspaceMailboxSwitcherMailbox }) {
  return (
    <Avatar
      className='rounded-md'
      size='sm'
    >
      <AvatarFallback className='rounded-md'>{getInitials(mailbox.name)}</AvatarFallback>
    </Avatar>
  )
}

function MailboxEmptyState() {
  return (
    <Empty className='flex-none border-0 p-4 md:p-4'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <EnvelopeSimpleIcon />
        </EmptyMedia>
        <EmptyTitle className='text-sm'>No mailboxes</EmptyTitle>
        <EmptyDescription>This workspace does not have any mailbox accounts available yet.</EmptyDescription>
      </EmptyHeader>
      <DropdownMenuItem className='gap-2 p-2'>
        <div className='flex size-6 items-center justify-center rounded-md border'>
          <PlusIcon />
        </div>
        <span className='text-muted-foreground font-medium'>Connect mailbox</span>
      </DropdownMenuItem>
    </Empty>
  )
}

function MailboxLoadingRows() {
  return (
    <DropdownMenuGroup className='grid gap-2 px-2 py-1'>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          className='flex items-center gap-2'
          key={index}
        >
          <Skeleton className='size-6 rounded-md' />
          <div className='grid flex-1 gap-1'>
            <Skeleton className='h-3 w-32' />
            <Skeleton className='h-3 w-44' />
          </div>
        </div>
      ))}
    </DropdownMenuGroup>
  )
}

function getActiveWorkspace(
  workspaces: ReadonlyArray<WorkspaceMailboxSwitcherWorkspace>,
  activeWorkspaceId?: string
) {
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0]
}

function getActiveMailbox(
  mailboxes: ReadonlyArray<WorkspaceMailboxSwitcherMailbox>,
  activeMailboxId?: string
) {
  return mailboxes.find((mailbox) => mailbox.id === activeMailboxId) ?? mailboxes[0]
}

function getSwitchableWorkspaces(
  workspaces: ReadonlyArray<WorkspaceMailboxSwitcherWorkspace>,
  activeWorkspaceId?: string
) {
  return workspaces.filter((workspace) => workspace.id !== activeWorkspaceId)
}

function getMailboxScrollHeightClass(count: number) {
  if (count > 14) {
    return 'h-[min(44rem,calc(var(--radix-dropdown-menu-content-available-height)_-_7rem))]'
  }

  if (count > 10) {
    return 'h-[min(36rem,calc(var(--radix-dropdown-menu-content-available-height)_-_7rem))]'
  }

  return 'h-[min(28rem,calc(var(--radix-dropdown-menu-content-available-height)_-_7rem))]'
}

function getMailboxCountLabel(count: number) {
  return count === 1 ? '1 mailbox' : `${count} mailboxes`
}

function getInitials(value: string) {
  const words = value
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  if (words.length === 0) {
    return 'M'
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}
