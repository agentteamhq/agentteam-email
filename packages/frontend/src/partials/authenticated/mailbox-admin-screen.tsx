import * as React from 'react'
import {
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RobotIcon,
  UsersThreeIcon
} from '@phosphor-icons/react'

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
import { Checkbox } from '../../components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '../../components/ui/empty'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle
} from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../components/ui/input-group'
import { ScrollArea } from '../../components/ui/scroll-area'
import { Separator } from '../../components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '../../components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { Skeleton } from '../../components/ui/skeleton'
import type {
  MailboxAdminAccount,
  MailboxAdminAgent,
  MailboxAdminMailboxCapability,
  MailboxAdminSectionId,
  MailboxAdminStatus,
  MailboxAdminStatusFilter,
  MailboxAdminSystemPermission,
  MailboxAdminView
} from './mailbox-admin-models'

const sectionMeta = {
  accounts: {
    action: 'New account',
    description: 'Provision and assign mailbox accounts on this domain.',
    emptyDescription: 'Create the first mailbox account for this domain.',
    emptyTitle: 'No accounts',
    icon: EnvelopeSimpleIcon,
    title: 'Accounts'
  },
  agents: {
    action: 'New agent',
    description: 'Manage agent identities, primary accounts, and account-level access.',
    emptyDescription: 'Create an agent before assigning mailbox access.',
    emptyTitle: 'No agents',
    icon: RobotIcon,
    title: 'Agents'
  },
  groups: {
    action: 'New group',
    description: 'Route shared addresses to mailbox targets.',
    emptyDescription: 'Create groups for addresses such as support, press, or billing.',
    emptyTitle: 'No groups',
    icon: UsersThreeIcon,
    title: 'Forwarding groups'
  }
} satisfies Record<
  MailboxAdminSectionId,
  {
    action: string
    description: string
    emptyDescription: string
    emptyTitle: string
    icon: React.ComponentType<{ className?: string }>
    title: string
  }
>

interface MailboxAdminVisibleRecords {
  accounts: ReadonlyArray<MailboxAdminAccount>
  agents: ReadonlyArray<MailboxAdminAgent>
  groups: MailboxAdminView['groups']
}

const statusFilterOptions = [
  ['all', 'All statuses'],
  ['active', 'Active'],
  ['pending', 'Pending'],
  ['limited', 'Limited'],
  ['disabled', 'Disabled']
] satisfies ReadonlyArray<readonly [MailboxAdminStatusFilter, string]>

export function MailboxAdminScreen({ view }: { view: MailboxAdminView }) {
  const meta = sectionMeta[view.section]
  const Icon = meta.icon
  const visibleRecords = getVisibleRecords(view)
  const totalCount = getSectionTotalCount(view)
  const visibleCount = getVisibleSectionCount(view, visibleRecords)

  return (
    <main className='bg-background flex min-h-0 flex-1 flex-col overflow-hidden'>
      <header className='flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4'>
        <div className='flex min-w-0 items-start gap-3'>
          <div
            className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center
              rounded-md'
          >
            <Icon className='size-4' />
          </div>
          <div className='min-w-0'>
            <div className='flex min-w-0 items-center gap-2'>
              <h1 className='truncate text-sm font-semibold'>{meta.title}</h1>
              <Badge variant='outline'>{view.domain}</Badge>
            </div>
            <p className='text-muted-foreground mt-1 text-sm'>{meta.description}</p>
          </div>
        </div>
        <Button
          size='sm'
          type='button'
        >
          <PlusIcon data-icon='inline-start' />
          {meta.action}
        </Button>
      </header>

      <div className='flex min-h-0 flex-1 flex-col overflow-auto px-5 py-4'>
        <MailboxAdminToolbar
          totalCount={totalCount}
          view={view}
          visibleCount={visibleCount}
        />
        <MailboxAdminContent
          totalCount={totalCount}
          view={view}
          visibleCount={visibleCount}
          visibleRecords={visibleRecords}
        />
      </div>

      <MailboxAdminDialogs view={view} />
    </main>
  )
}

function MailboxAdminToolbar({
  totalCount,
  view,
  visibleCount
}: {
  totalCount: number
  view: MailboxAdminView
  visibleCount: number
}) {
  const statusFilter = getStatusFilter(view)
  const countLabel = hasMailboxAdminFilters(view)
    ? `${visibleCount} of ${totalCount} records`
    : `${totalCount} records`

  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <InputGroup className='w-72 max-w-full'>
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput
            onChange={(event) => view.onSearchQueryChange?.(event.currentTarget.value)}
            readOnly={!view.onSearchQueryChange}
            value={view.searchQuery ?? ''}
            placeholder={`Search ${sectionMeta[view.section].title.toLowerCase()}...`}
          />
        </InputGroup>
        <Select
          value={statusFilter}
          onValueChange={(value) => view.onStatusFilterChange?.(value as MailboxAdminStatusFilter)}
        >
          <SelectTrigger
            aria-label='Filter by status'
            className='w-40'
            size='sm'
          >
            <SelectValue placeholder='Status' />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {statusFilterOptions.map(([value, label]) => (
                <SelectItem
                  key={value}
                  value={value}
                >
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className='text-muted-foreground text-xs'>{countLabel}</div>
    </div>
  )
}

function MailboxAdminContent({
  totalCount,
  view,
  visibleCount,
  visibleRecords
}: {
  totalCount: number
  view: MailboxAdminView
  visibleCount: number
  visibleRecords: MailboxAdminVisibleRecords
}) {
  if (view.state === 'loading') {
    return view.section === 'groups' ? (
      <GroupCardsLoading />
    ) : (
      <div className='mt-3 overflow-hidden rounded-md border'>
        <MailboxAdminLoadingRows section={view.section} />
      </div>
    )
  }

  if (view.state === 'empty' || totalCount === 0) {
    return <MailboxAdminEmptyState section={view.section} />
  }

  if (visibleCount === 0) {
    return <MailboxAdminNoResultsState view={view} />
  }

  if (view.section === 'groups') {
    return (
      <GroupCards
        agents={view.agents}
        groups={visibleRecords.groups}
      />
    )
  }

  return (
    <div className='mt-3 overflow-hidden rounded-md border'>
      {view.section === 'agents' ? (
        <AgentTable agents={visibleRecords.agents} />
      ) : (
        <AccountTable
          accounts={visibleRecords.accounts}
          agents={view.agents}
        />
      )}
    </div>
  )
}

function MailboxAdminEmptyState({ section }: { section: MailboxAdminSectionId }) {
  const meta = sectionMeta[section]
  const Icon = meta.icon

  return (
    <Empty className='mt-3 min-h-64 rounded-md border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{meta.emptyTitle}</EmptyTitle>
        <EmptyDescription>{meta.emptyDescription}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          size='sm'
          type='button'
        >
          <PlusIcon data-icon='inline-start' />
          {meta.action}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function MailboxAdminNoResultsState({ view }: { view: MailboxAdminView }) {
  const meta = sectionMeta[view.section]
  const Icon = meta.icon
  const query = view.searchQuery?.trim()
  const statusFilter = getStatusFilter(view)
  const statusLabel = statusFilter === 'all' ? null : formatStatus(statusFilter)
  const description =
    query && statusLabel
      ? `No ${meta.title.toLowerCase()} match "${query}" with ${statusLabel.toLowerCase()} status.`
      : query
        ? `No ${meta.title.toLowerCase()} match "${query}".`
        : statusLabel
          ? `No ${meta.title.toLowerCase()} have ${statusLabel.toLowerCase()} status.`
          : `No ${meta.title.toLowerCase()} match the current filters.`

  return (
    <Empty className='mt-3 min-h-64 rounded-md border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Icon />
        </EmptyMedia>
        <EmptyTitle>No matching records</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {view.onSearchQueryChange || view.onStatusFilterChange ? (
        <EmptyContent>
          <Button
            onClick={() => {
              view.onSearchQueryChange?.('')
              view.onStatusFilterChange?.('all')
            }}
            size='sm'
            type='button'
            variant='outline'
          >
            Clear filters
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

function AccountTable({
  accounts,
  agents
}: {
  accounts: ReadonlyArray<MailboxAdminAccount>
  agents: ReadonlyArray<MailboxAdminAgent>
}) {
  return (
    <Table className='table-fixed'>
      <TableHeader>
        <TableRow>
          <TableHead className='w-[34%]'>Account</TableHead>
          <TableHead className='w-[22%]'>Primary agent</TableHead>
          <TableHead className='hidden w-[24%] lg:table-cell'>Routes</TableHead>
          <TableHead className='hidden w-[18%] xl:table-cell'>Agent access</TableHead>
          <TableHead className='hidden w-[16%] 2xl:table-cell'>Last activity</TableHead>
          <TableHead className='w-10'>
            <span className='sr-only'>Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.id}>
            <TableCell className='min-w-0'>
              <div className='flex min-w-0 flex-col'>
                <span className='truncate font-medium'>{account.address}</span>
                <span className='text-muted-foreground text-xs'>
                  {account.type === 'alias' ? 'Alias' : 'Mailbox'} · {formatStatus(account.status)}
                </span>
              </div>
            </TableCell>
            <TableCell className='truncate'>{account.agentName ?? 'Unassigned'}</TableCell>
            <TableCell className='hidden lg:table-cell'>
              <TokenList values={account.groups} />
            </TableCell>
            <TableCell className='hidden xl:table-cell'>
              <AgentAccessSummary
                account={account}
                agents={agents}
              />
            </TableCell>
            <TableCell className='hidden 2xl:table-cell'>{account.lastActivity}</TableCell>
            <TableCell>
              <RowActions
                items={['Edit account', 'Open mailbox', 'Disable account']}
                destructiveItem='Disable account'
                label={`Open actions for ${account.address}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function AgentAccessSummary({
  account,
  agents
}: {
  account: MailboxAdminAccount
  agents: ReadonlyArray<MailboxAdminAgent>
}) {
  const grantedAgents = agents.filter((agent) => agent.grants.some((grant) => grant.accountId === account.id))

  if (!grantedAgents.length) {
    return <span className='text-muted-foreground'>No agents</span>
  }

  return <TokenList values={grantedAgents.map((agent) => agent.name)} />
}

function GroupCards({
  agents,
  groups
}: {
  agents: ReadonlyArray<MailboxAdminAgent>
  groups: MailboxAdminView['groups']
}) {
  return (
    <div className='mt-3 grid gap-3'>
      {groups.map((group) => (
        <Card
          className='gap-3 py-4 shadow-none'
          key={group.id}
        >
          <CardHeader className='px-4'>
            <CardTitle className='flex min-w-0 flex-wrap items-center gap-2 text-sm'>
              <span className='truncate'>{group.address}</span>
              <Badge variant='outline'>Forwarded address</Badge>
            </CardTitle>
            <CardDescription>{group.description}</CardDescription>
            <CardAction className='flex items-center gap-2'>
              <StatusBadge status={group.status} />
              <RowActions
                items={['Edit group', 'Manage recipients', 'Disable group']}
                destructiveItem='Disable group'
                label={`Open actions for ${group.address}`}
              />
            </CardAction>
          </CardHeader>
          <CardContent className='px-4'>
            <div className='min-w-0'>
              <div className='text-muted-foreground text-xs'>
                {group.recipients.length} recipient{group.recipients.length === 1 ? '' : 's'}
              </div>
              <RecipientPreview
                agents={agents}
                recipients={group.recipients}
              />
            </div>
          </CardContent>
          <CardFooter className='text-muted-foreground flex-wrap justify-between gap-2 px-4 text-xs'>
            <span>Last delivered {group.lastDelivered}</span>
            <span>Updated {group.lastUpdated}</span>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

function RecipientPreview({
  agents,
  recipients
}: {
  agents: ReadonlyArray<MailboxAdminAgent>
  recipients: ReadonlyArray<string>
}) {
  if (!recipients.length) {
    return <p className='text-muted-foreground mt-2 text-sm'>No recipients configured.</p>
  }

  return (
    <div className='mt-2 flex min-w-0 flex-wrap gap-1'>
      {recipients.slice(0, 2).map((recipient) => (
        <RecipientBadge
          agents={agents}
          key={recipient}
          recipient={recipient}
        />
      ))}
      {recipients.length > 2 ? (
        <Badge variant='secondary'>
          {recipients.length - 2} more recipient{recipients.length - 2 === 1 ? '' : 's'}
        </Badge>
      ) : null}
    </div>
  )
}

function AgentTable({ agents }: { agents: ReadonlyArray<MailboxAdminAgent> }) {
  return (
    <Table className='table-fixed'>
      <TableHeader>
        <TableRow>
          <TableHead className='w-[25%]'>Agent</TableHead>
          <TableHead className='w-[27%]'>Primary account</TableHead>
          <TableHead className='w-[30%]'>Mailbox grants</TableHead>
          <TableHead className='hidden w-[22%] lg:table-cell'>Groups</TableHead>
          <TableHead className='hidden w-[24%] xl:table-cell'>System access</TableHead>
          <TableHead className='hidden w-[16%] 2xl:table-cell'>Last seen</TableHead>
          <TableHead className='w-10'>
            <span className='sr-only'>Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.map((agent) => (
          <TableRow key={agent.id}>
            <TableCell className='min-w-0'>
              <div className='flex min-w-0 flex-col'>
                <span className='truncate font-medium'>{agent.name}</span>
                <span className='text-muted-foreground text-xs'>
                  {agent.handle} · {formatStatus(agent.status)}
                </span>
              </div>
            </TableCell>
            <TableCell className='truncate'>{agent.primaryAccount ?? 'None'}</TableCell>
            <TableCell className='min-w-0'>
              <GrantSummary grants={agent.grants} />
            </TableCell>
            <TableCell className='hidden lg:table-cell'>
              <TokenList values={agent.groups} />
            </TableCell>
            <TableCell className='hidden xl:table-cell'>
              <TokenList values={agent.permissions.map(formatSystemPermission)} />
            </TableCell>
            <TableCell className='hidden 2xl:table-cell'>{agent.lastSeen}</TableCell>
            <TableCell>
              <RowActions
                items={[
                  'Edit agent',
                  'System permissions',
                  'Account access',
                  'Provision account',
                  'Disable agent'
                ]}
                destructiveItem='Disable agent'
                label={`Open actions for ${agent.name}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function GrantSummary({ grants }: { grants: ReadonlyArray<MailboxAdminAgent['grants'][number]> }) {
  if (!grants.length) {
    return <span className='text-muted-foreground'>None</span>
  }

  return <TokenList values={grants.map((grant) => grant.accountAddress)} />
}

function RowActions({
  destructiveItem,
  items,
  label
}: {
  destructiveItem?: string
  items: ReadonlyArray<string>
  label: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className='size-8'
          size='icon'
          type='button'
          variant='ghost'
        >
          <DotsThreeIcon data-icon='icon-only' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          {items.map((item) => (
            <DropdownMenuItem
              key={item}
              variant={item === destructiveItem ? 'destructive' : 'default'}
            >
              {item}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TokenList({ values }: { values: ReadonlyArray<string> }) {
  if (values.length === 0) {
    return <span className='text-muted-foreground'>None</span>
  }

  return (
    <div className='flex max-w-full min-w-0 flex-wrap gap-1'>
      {values.slice(0, 3).map((value) => (
        <Badge
          className='max-w-full justify-start truncate'
          key={value}
          variant='outline'
        >
          {value}
        </Badge>
      ))}
      {values.length > 3 ? <Badge variant='secondary'>+{values.length - 3}</Badge> : null}
    </div>
  )
}

function StatusBadge({ status }: { status: MailboxAdminStatus }) {
  return (
    <Badge variant={status === 'disabled' ? 'destructive' : status === 'pending' ? 'outline' : 'secondary'}>
      {formatStatus(status)}
    </Badge>
  )
}

function MailboxAdminLoadingRows({ section }: { section: MailboxAdminSectionId }) {
  const columnCount = section === 'agents' ? 6 : 6

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: columnCount }, (_, index) => (
            <TableHead key={index}>
              <Skeleton className='h-4 w-24' />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }, (_row, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columnCount }, (_cell, cellIndex) => (
              <TableCell key={cellIndex}>
                <Skeleton className='h-4 w-full max-w-36' />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function GroupCardsLoading() {
  return (
    <div className='mt-3 grid gap-3'>
      {Array.from({ length: 3 }, (_, index) => (
        <Card
          className='gap-3 py-4 shadow-none'
          key={index}
        >
          <CardHeader className='px-4'>
            <CardTitle>
              <Skeleton className='h-4 w-56' />
            </CardTitle>
            <CardDescription>
              <Skeleton className='h-4 w-full max-w-lg' />
            </CardDescription>
            <CardAction>
              <Skeleton className='h-8 w-20' />
            </CardAction>
          </CardHeader>
          <CardContent className='px-4'>
            <div className='flex flex-wrap gap-2'>
              <Skeleton className='h-6 w-40' />
              <Skeleton className='h-6 w-44' />
              <Skeleton className='h-6 w-32' />
            </div>
          </CardContent>
          <CardFooter className='justify-between gap-2 px-4'>
            <Skeleton className='h-3 w-36' />
            <Skeleton className='h-3 w-28' />
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

function MailboxAdminDialogs({ view }: { view: MailboxAdminView }) {
  return (
    <>
      <AccountEditorDialog view={view} />
      <GroupEditorDialog view={view} />
      <GroupRecipientsSheet view={view} />
      <AgentEditorDialog view={view} />
      <AgentAccountsSheet view={view} />
      <AgentPermissionsDialog view={view} />
    </>
  )
}

function AccountEditorDialog({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'accountEditor' ? view.activeDialog : null
  const account = dialog?.accountId
    ? view.accounts.find((candidate) => candidate.id === dialog.accountId)
    : null
  const agent = dialog?.agentId ? view.agents.find((candidate) => candidate.id === dialog.agentId) : null
  const title = account ? 'Edit account' : agent ? 'Provision account' : 'Create account'
  const defaultAddress = agent?.primaryAccount ?? `research@${view.domain}`

  return (
    <Dialog open={Boolean(dialog)}>
      <DialogContent
        className='sm:max-w-xl'
        onOpenAutoFocus={preventDialogAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {agent
              ? `Provision a mailbox account for ${agent.name}.`
              : `Account provisioning form for ${view.domain}.`}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='mailbox-account-address'>Address</FieldLabel>
            <Input
              id='mailbox-account-address'
              defaultValue={account?.address ?? defaultAddress}
            />
          </Field>
          <Field>
            <FieldLabel>Type</FieldLabel>
            <Select defaultValue={account?.type ?? 'mailbox'}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='mailbox'>Mailbox</SelectItem>
                  <SelectItem value='alias'>Alias</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Assigned agent</FieldLabel>
            <Select defaultValue={agent?.name ?? account?.agentName ?? 'unassigned'}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='unassigned'>Unassigned</SelectItem>
                  {view.agents.map((availableAgent) => (
                    <SelectItem
                      key={availableAgent.id}
                      value={availableAgent.name}
                    >
                      {availableAgent.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>Cancel</Button>
          </DialogClose>
          <Button>{account ? 'Save account' : agent ? 'Provision account' : 'Create account'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupEditorDialog({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'groupEditor' ? view.activeDialog : null
  const group = dialog?.groupId ? view.groups.find((candidate) => candidate.id === dialog.groupId) : null
  const title = group ? 'Edit forwarding group' : 'Create forwarding group'

  return (
    <Dialog open={Boolean(dialog)}>
      <DialogContent
        className='sm:max-w-xl'
        onOpenAutoFocus={preventDialogAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Route one group address to mailbox accounts on {view.domain}.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='mailbox-group-address'>Group address</FieldLabel>
            <Input
              id='mailbox-group-address'
              defaultValue={group?.address ?? `support@${view.domain}`}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='mailbox-group-description'>Description</FieldLabel>
            <Input
              id='mailbox-group-description'
              defaultValue={group?.description ?? 'Route shared inbound mail to selected accounts.'}
            />
          </Field>
          <Field>
            <FieldLabel>Status</FieldLabel>
            <Select defaultValue={group?.status ?? 'active'}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='active'>Active</SelectItem>
                  <SelectItem value='pending'>Pending</SelectItem>
                  <SelectItem value='disabled'>Disabled</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>Cancel</Button>
          </DialogClose>
          <Button>{group ? 'Save group' : 'Create group'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupRecipientsSheet({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'groupRecipients' ? view.activeDialog : null
  const group = dialog ? view.groups.find((candidate) => candidate.id === dialog.groupId) : null
  const currentRecipients = group?.recipients ?? []
  const availableRecipients = view.accounts
    .map((account) => account.address)
    .filter((address) => !currentRecipients.includes(address))

  return (
    <Sheet open={Boolean(dialog)}>
      <SheetContent className='w-full sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>Manage recipients</SheetTitle>
          <SheetDescription>
            {group?.address ?? 'Select mailbox targets for this forwarded address.'}
          </SheetDescription>
        </SheetHeader>

        <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4'>
          <InputGroup>
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput
              defaultValue=''
              placeholder='Search accounts or agents...'
            />
          </InputGroup>

          <RecipientListCard
            actionLabel='Remove'
            agents={view.agents}
            description={`${currentRecipients.length} mailbox target${currentRecipients.length === 1 ? '' : 's'}`}
            recipients={currentRecipients}
            title='Current recipients'
          />

          <RecipientListCard
            actionLabel='Add'
            agents={view.agents}
            description='Accounts available on this domain.'
            recipients={availableRecipients}
            title='Available recipients'
          />
        </div>

        <SheetFooter>
          <SheetClose asChild>
            <Button variant='outline'>Cancel</Button>
          </SheetClose>
          <Button>Save recipients</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function RecipientListCard({
  actionLabel,
  agents,
  description,
  recipients,
  title
}: {
  actionLabel: string
  agents: ReadonlyArray<MailboxAdminAgent>
  description: string
  recipients: ReadonlyArray<string>
  title: string
}) {
  return (
    <Card className='min-h-0 gap-3 py-4 shadow-none'>
      <CardHeader className='px-4'>
        <CardTitle className='text-sm'>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='min-h-0 px-0'>
        <ScrollArea className='max-h-64'>
          {recipients.length ? (
            recipients.map((recipient, index) => (
              <React.Fragment key={recipient}>
                {index > 0 ? <Separator /> : null}
                <RecipientRow
                  actionLabel={actionLabel}
                  agents={agents}
                  recipient={recipient}
                />
              </React.Fragment>
            ))
          ) : (
            <p className='text-muted-foreground px-4 py-3 text-sm'>No matching accounts.</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function AgentEditorDialog({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'agentEditor' ? view.activeDialog : null
  const agent = dialog?.agentId ? view.agents.find((candidate) => candidate.id === dialog.agentId) : null
  const title = agent ? 'Edit agent' : 'Create agent'

  return (
    <Dialog open={Boolean(dialog)}>
      <DialogContent
        className='sm:max-w-xl'
        onOpenAutoFocus={preventDialogAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Agent profile and primary mailbox assignment.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='mailbox-agent-name'>Name</FieldLabel>
            <Input
              id='mailbox-agent-name'
              defaultValue={agent?.name ?? 'Research Agent'}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='mailbox-agent-handle'>Handle</FieldLabel>
            <Input
              id='mailbox-agent-handle'
              defaultValue={agent?.handle ?? 'researcher'}
            />
          </Field>
          <Field>
            <FieldLabel>Primary account</FieldLabel>
            <Select defaultValue={agent?.primaryAccount ?? 'none'}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='none'>No primary account</SelectItem>
                  {view.accounts.map((account) => (
                    <SelectItem
                      key={account.id}
                      value={account.address}
                    >
                      {account.address}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>Cancel</Button>
          </DialogClose>
          <Button>{agent ? 'Save agent' : 'Create agent'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AgentAccountsSheet({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'agentAccounts' ? view.activeDialog : null
  const agent = dialog ? view.agents.find((candidate) => candidate.id === dialog.agentId) : null
  const currentGrants = agent?.grants ?? []
  const availableAccounts = view.accounts.filter(
    (account) => !currentGrants.some((grant) => grant.accountId === account.id)
  )

  return (
    <Sheet open={Boolean(dialog)}>
      <SheetContent className='w-full sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>Account access</SheetTitle>
          <SheetDescription>
            {agent
              ? `Assign accounts that ${agent.name} can read, draft from, send through, or manage.`
              : 'Assign mailbox accounts.'}
          </SheetDescription>
        </SheetHeader>

        <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4'>
          <InputGroup>
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput
              defaultValue=''
              placeholder='Search accounts...'
            />
          </InputGroup>

          <AccountGrantListCard
            actionLabel='Remove'
            accounts={view.accounts}
            description={`${currentGrants.length} assigned account${currentGrants.length === 1 ? '' : 's'}`}
            grants={currentGrants}
            title='Assigned accounts'
          />

          <AvailableAccountListCard
            accounts={availableAccounts}
            actionLabel='Add'
            description='Accounts available on this domain.'
            title='Available accounts'
          />
        </div>

        <SheetFooter>
          <SheetClose asChild>
            <Button variant='outline'>Cancel</Button>
          </SheetClose>
          <Button>Save account access</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function AgentPermissionsDialog({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'agentPermissions' ? view.activeDialog : null
  const agent = dialog ? view.agents.find((candidate) => candidate.id === dialog.agentId) : null

  return (
    <Dialog open={Boolean(dialog)}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>System permissions</DialogTitle>
          <DialogDescription>
            {agent
              ? `Organization-level permissions for ${agent.name}.`
              : 'Organization-level agent permissions.'}
          </DialogDescription>
        </DialogHeader>
        <PermissionChecklist
          description='These permissions apply across the organization and are separate from per-account mailbox access.'
          permissions={agent?.permissions ?? []}
          title='Allowed actions'
          values={[
            ['readAllMailboxes', 'Read all mailboxes'],
            ['createAccounts', 'Create accounts'],
            ['manageForwardingGroups', 'Manage forwarding groups']
          ]}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>Cancel</Button>
          </DialogClose>
          <Button>Save permissions</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AccountGrantListCard({
  accounts,
  actionLabel,
  description,
  grants,
  title
}: {
  accounts: ReadonlyArray<MailboxAdminAccount>
  actionLabel: string
  description: string
  grants: ReadonlyArray<MailboxAdminAgent['grants'][number]>
  title: string
}) {
  return (
    <Card className='min-h-0 gap-3 py-4 shadow-none'>
      <CardHeader className='px-4'>
        <CardTitle className='text-sm'>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='min-h-0 px-0'>
        <ScrollArea className='max-h-72'>
          {grants.length ? (
            grants.map((grant, index) => {
              const account = accounts.find((candidate) => candidate.id === grant.accountId)

              return (
                <React.Fragment key={grant.accountId}>
                  {index > 0 ? <Separator /> : null}
                  <AccountGrantRow
                    account={account}
                    actionLabel={actionLabel}
                    grant={grant}
                  />
                </React.Fragment>
              )
            })
          ) : (
            <p className='text-muted-foreground px-4 py-3 text-sm'>No accounts assigned.</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function AvailableAccountListCard({
  accounts,
  actionLabel,
  description,
  title
}: {
  accounts: ReadonlyArray<MailboxAdminAccount>
  actionLabel: string
  description: string
  title: string
}) {
  return (
    <Card className='min-h-0 gap-3 py-4 shadow-none'>
      <CardHeader className='px-4'>
        <CardTitle className='text-sm'>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='min-h-0 px-0'>
        <ScrollArea className='max-h-72'>
          {accounts.length ? (
            accounts.map((account, index) => (
              <React.Fragment key={account.id}>
                {index > 0 ? <Separator /> : null}
                <AvailableAccountRow
                  account={account}
                  actionLabel={actionLabel}
                />
              </React.Fragment>
            ))
          ) : (
            <p className='text-muted-foreground px-4 py-3 text-sm'>No more accounts available.</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function AccountGrantRow({
  account,
  actionLabel,
  grant
}: {
  account?: MailboxAdminAccount
  actionLabel: string
  grant: MailboxAdminAgent['grants'][number]
}) {
  return (
    <div className='flex items-center justify-between gap-3 px-4 py-3'>
      <div className='min-w-0'>
        <div className='truncate text-sm font-medium'>{grant.accountAddress}</div>
        <div className='text-muted-foreground truncate text-xs'>
          {account
            ? `${account.type === 'alias' ? 'Alias' : 'Mailbox'} · ${formatStatus(account.status)}`
            : 'Mailbox'}
        </div>
        <CapabilityBadges capabilities={grant.capabilities} />
      </div>
      <Button
        size='sm'
        type='button'
        variant='outline'
      >
        {actionLabel}
      </Button>
    </div>
  )
}

function AvailableAccountRow({
  account,
  actionLabel
}: {
  account: MailboxAdminAccount
  actionLabel: string
}) {
  return (
    <div className='flex items-center justify-between gap-3 px-4 py-3'>
      <div className='min-w-0'>
        <div className='truncate text-sm font-medium'>{account.address}</div>
        <div className='text-muted-foreground truncate text-xs'>
          {account.type === 'alias' ? 'Alias' : 'Mailbox'} · {formatStatus(account.status)}
        </div>
      </div>
      <Button
        size='sm'
        type='button'
        variant='outline'
      >
        {actionLabel}
      </Button>
    </div>
  )
}

function CapabilityBadges({ capabilities }: { capabilities: ReadonlyArray<MailboxAdminMailboxCapability> }) {
  return (
    <div className='mt-2 flex flex-wrap gap-1'>
      {capabilities.map((capability) => (
        <Badge
          key={capability}
          variant='secondary'
        >
          {formatMailboxCapability(capability)}
        </Badge>
      ))}
    </div>
  )
}

function RecipientRow({
  actionLabel,
  agents,
  recipient
}: {
  actionLabel: string
  agents: ReadonlyArray<MailboxAdminAgent>
  recipient: string
}) {
  const owner = getRecipientOwner(agents, recipient)

  return (
    <div className='flex items-center justify-between gap-3 px-4 py-3'>
      <div className='min-w-0'>
        <div className='truncate text-sm font-medium'>{recipient}</div>
        <div className='text-muted-foreground truncate text-xs'>{owner}</div>
      </div>
      <Button
        size='sm'
        type='button'
        variant='outline'
      >
        {actionLabel}
      </Button>
    </div>
  )
}

function RecipientBadge({
  agents,
  recipient
}: {
  agents: ReadonlyArray<MailboxAdminAgent>
  recipient: string
}) {
  return (
    <Badge
      className='max-w-full justify-start truncate'
      title={getRecipientOwner(agents, recipient)}
      variant='outline'
    >
      {recipient}
    </Badge>
  )
}

function PermissionChecklist<T extends string>({
  description,
  permissions,
  title,
  values
}: {
  description: string
  permissions: ReadonlyArray<T>
  title: string
  values: ReadonlyArray<readonly [T, string]>
}) {
  return (
    <FieldSet>
      <legend className='sr-only'>{title}</legend>
      <FieldTitle>{title}</FieldTitle>
      <FieldDescription>{description}</FieldDescription>
      {values.map(([value, label]) => (
        <Field
          key={value}
          orientation='horizontal'
        >
          <Checkbox defaultChecked={permissions.includes(value)} />
          <span className='text-sm font-medium'>{label}</span>
        </Field>
      ))}
    </FieldSet>
  )
}

function getVisibleRecords(view: MailboxAdminView): MailboxAdminVisibleRecords {
  const statusFilter = getStatusFilter(view)
  const query = normalizeSearchQuery(view.searchQuery)

  return {
    accounts: view.accounts.filter(
      (account) =>
        matchesStatusFilter(account.status, statusFilter) &&
        matchesSearchQuery(query, [
          account.address,
          account.agentName,
          account.domain,
          account.status,
          account.type,
          ...account.groups
        ])
    ),
    agents: view.agents.filter(
      (agent) =>
        matchesStatusFilter(agent.status, statusFilter) &&
        matchesSearchQuery(query, [
          agent.name,
          agent.handle,
          agent.primaryAccount,
          agent.status,
          ...agent.groups,
          ...agent.permissions.map(formatSystemPermission),
          ...agent.grants.map((grant) => grant.accountAddress)
        ])
    ),
    groups: view.groups.filter(
      (group) =>
        matchesStatusFilter(group.status, statusFilter) &&
        matchesSearchQuery(query, [
          group.address,
          group.description,
          group.domain,
          group.status,
          ...group.recipients
        ])
    )
  }
}

function getVisibleSectionCount(view: MailboxAdminView, visibleRecords: MailboxAdminVisibleRecords) {
  if (view.section === 'groups') {
    return visibleRecords.groups.length
  }

  if (view.section === 'agents') {
    return visibleRecords.agents.length
  }

  return visibleRecords.accounts.length
}

function getSectionTotalCount(view: MailboxAdminView) {
  if (view.section === 'groups') {
    return view.groups.length
  }

  if (view.section === 'agents') {
    return view.agents.length
  }

  return view.accounts.length
}

function getStatusFilter(view: MailboxAdminView): MailboxAdminStatusFilter {
  return view.statusFilter ?? 'all'
}

function hasMailboxAdminFilters(view: MailboxAdminView) {
  return getStatusFilter(view) !== 'all' || Boolean(view.searchQuery?.trim())
}

function matchesStatusFilter(status: MailboxAdminStatus, statusFilter: MailboxAdminStatusFilter) {
  return statusFilter === 'all' || status === statusFilter
}

function normalizeSearchQuery(query: string | undefined) {
  return query?.trim().toLocaleLowerCase() ?? ''
}

function matchesSearchQuery(query: string, values: ReadonlyArray<string | undefined>) {
  if (!query) {
    return true
  }

  return values.some((value) => value?.toLocaleLowerCase().includes(query))
}

function formatStatus(status: MailboxAdminStatus) {
  return status
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatSystemPermission(permission: MailboxAdminSystemPermission) {
  switch (permission) {
    case 'createAccounts':
      return 'Create accounts'
    case 'manageForwardingGroups':
      return 'Manage forwarding groups'
    case 'readAllMailboxes':
      return 'Read all mailboxes'
  }
}

function formatMailboxCapability(capability: MailboxAdminMailboxCapability) {
  switch (capability) {
    case 'createDrafts':
      return 'Create drafts'
    case 'manageMessages':
      return 'Manage messages'
    case 'readMailbox':
      return 'Read mailbox'
    case 'sendAs':
      return 'Send as mailbox'
  }
}

function getRecipientOwner(agents: ReadonlyArray<MailboxAdminAgent>, recipient: string) {
  const agent = agents.find((candidate) =>
    candidate.grants.some((grant) => grant.accountAddress === recipient)
  )

  return agent ? `${agent.name} mailbox` : 'Mailbox target'
}

function preventDialogAutoFocus(event: Event) {
  event.preventDefault()
}
