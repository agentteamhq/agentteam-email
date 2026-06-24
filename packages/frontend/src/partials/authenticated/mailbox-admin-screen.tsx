import * as React from 'react'
import {
  CaretLeftIcon,
  CaretRightIcon,
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
import {
  formatMailboxCapability,
  formatSystemPermission,
  getMailboxAdminVisibleRecordsForView,
  getStatusFilter,
  isServerPaginatedMailboxAdminView,
  matchesSearchQuery,
  normalizeSearchQuery
} from './mailbox-admin-visible-records'
import { AgentEnrollmentCommandSummary } from './agent-enrollment-command'
import type { MailboxAdminVisibleRecords } from './mailbox-admin-visible-records'
import type {
  MailboxAdminAccount,
  MailboxAdminAccountInput,
  MailboxAdminAgent,
  MailboxAdminAgentInput,
  MailboxAdminAgentMailboxGrantsInput,
  MailboxAdminAgentSystemPermissionsInput,
  MailboxAdminDialogState,
  MailboxAdminExternalPrincipal,
  MailboxAdminGroupInput,
  MailboxAdminMailboxCapability,
  MailboxAdminMailboxGrant,
  MailboxAdminPagination,
  MailboxAdminPendingAgentEnrollment,
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

interface NormalizedMailboxAdminPagination extends MailboxAdminPagination {
  endItem: number
  startIndex: number
  startItem: number
  totalPages: number
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
  const visibleRecords = getMailboxAdminVisibleRecordsForView(view)
  const totalCount = getSectionTotalCount(view)
  const visibleCount = getVisibleSectionCount(view, visibleRecords)
  const pagination = getPagination(view, visibleCount)
  const paginatedRecords = isServerPaginatedMailboxAdminView(view)
    ? visibleRecords
    : paginateVisibleRecords(view.section, visibleRecords, pagination)

  return (
    <main className='bg-background flex min-h-0 flex-1 flex-col overflow-hidden'>
      <header className='flex shrink-0 flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='flex min-w-0 items-start gap-3'>
          <div
            className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center
              rounded-md'
          >
            <Icon className='size-4' />
          </div>
          <div className='min-w-0'>
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <h1 className='text-sm font-semibold'>{meta.title}</h1>
              <Badge variant='outline'>{view.domain}</Badge>
            </div>
            <p className='text-muted-foreground mt-1 text-sm'>{meta.description}</p>
          </div>
        </div>
        <Button
          className='self-start sm:self-auto'
          disabled={!canCreateMailboxAdminRecord(view) || !view.onDialogChange}
          onClick={() => view.onDialogChange?.(newDialogForSection(view.section))}
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
          pagination={pagination}
          totalCount={totalCount}
          view={view}
          visibleCount={visibleCount}
          visibleRecords={paginatedRecords}
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
  pagination,
  totalCount,
  view,
  visibleCount,
  visibleRecords
}: {
  pagination: NormalizedMailboxAdminPagination | null
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

  if (view.state === 'error') {
    return <MailboxAdminErrorState view={view} />
  }

  if (view.state === 'empty' || totalCount === 0) {
    return <MailboxAdminEmptyState view={view} />
  }

  if (visibleCount === 0) {
    return <MailboxAdminNoResultsState view={view} />
  }

  if (view.section === 'groups') {
    return (
      <>
        <GroupCards
          groups={visibleRecords.groups}
          view={view}
        />
        <MailboxAdminPaginationControls
          pagination={pagination}
          view={view}
          visibleCount={visibleCount}
        />
      </>
    )
  }

  return (
    <>
      <div className='mt-3 overflow-hidden rounded-md border'>
        {view.section === 'agents' ? (
          <AgentManagementTables
            agents={visibleRecords.agents}
            pendingEnrollments={visibleRecords.pendingEnrollments}
            principals={visibleRecords.principals}
            view={view}
          />
        ) : (
          <AccountTable
            accounts={visibleRecords.accounts}
            agents={view.agents}
            view={view}
          />
        )}
      </div>
      <MailboxAdminPaginationControls
        pagination={pagination}
        view={view}
        visibleCount={visibleCount}
      />
    </>
  )
}

function MailboxAdminPaginationControls({
  pagination,
  view,
  visibleCount
}: {
  pagination: NormalizedMailboxAdminPagination | null
  view: MailboxAdminView
  visibleCount: number
}) {
  if (!pagination || visibleCount <= pagination.pageSize) {
    return null
  }

  return (
    <div className='mt-3 flex flex-wrap items-center justify-between gap-3 text-sm'>
      <div className='text-muted-foreground'>
        Showing {pagination.startItem}-{pagination.endItem} of {visibleCount} records
      </div>
      <div className='flex items-center gap-2'>
        <Button
          disabled={pagination.page <= 1 || !view.onPageChange}
          onClick={() => view.onPageChange?.(pagination.page - 1)}
          size='sm'
          type='button'
          variant='outline'
        >
          <CaretLeftIcon data-icon='inline-start' />
          Previous
        </Button>
        <span className='text-muted-foreground min-w-24 text-center text-xs'>
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <Button
          disabled={pagination.page >= pagination.totalPages || !view.onPageChange}
          onClick={() => view.onPageChange?.(pagination.page + 1)}
          size='sm'
          type='button'
          variant='outline'
        >
          Next
          <CaretRightIcon data-icon='inline-end' />
        </Button>
      </div>
    </div>
  )
}

function MailboxAdminErrorState({ view }: { view: MailboxAdminView }) {
  const meta = sectionMeta[view.section]
  const Icon = meta.icon

  return (
    <Empty className='mt-3 min-h-64 rounded-md border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{view.errorTitle ?? 'Management data unavailable'}</EmptyTitle>
        <EmptyDescription>
          {view.errorDescription ?? 'Mailbox administration records could not be loaded.'}
        </EmptyDescription>
      </EmptyHeader>
      {view.onRetry ? (
        <EmptyContent>
          <Button
            onClick={view.onRetry}
            size='sm'
            type='button'
          >
            {view.retryLabel ?? 'Retry'}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

function MailboxAdminEmptyState({ view }: { view: MailboxAdminView }) {
  const meta = sectionMeta[view.section]
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
          disabled={!canCreateMailboxAdminRecord(view) || !view.onDialogChange}
          onClick={() => view.onDialogChange?.(newDialogForSection(view.section))}
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
  agents,
  view
}: {
  accounts: ReadonlyArray<MailboxAdminAccount>
  agents: ReadonlyArray<MailboxAdminAgent>
  view: MailboxAdminView
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
            <TableCell className='truncate'>{primaryAgentLabel(account, agents)}</TableCell>
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
                disabledItems={[
                  ...(!view.allowedActions.updateAccount || !view.onDialogChange ? ['Edit account'] : []),
                  ...(!view.onOpenMailbox || account.type !== 'mailbox' || account.status !== 'active'
                    ? ['Open mailbox']
                    : []),
                  ...(!view.allowedActions.disableAccount ||
                  !view.onDisableAccount ||
                  account.status === 'disabled' ||
                  view.pendingAccountDisableId === account.id
                    ? ['Disable account']
                    : [])
                ]}
                items={['Edit account', 'Open mailbox', 'Disable account']}
                destructiveItem='Disable account'
                label={`Open actions for ${account.address}`}
                onItemSelect={(item) => {
                  if (item === 'Edit account') {
                    view.onDialogChange?.({ accountId: account.id, type: 'accountEditor' })
                  } else if (item === 'Open mailbox') {
                    view.onOpenMailbox?.(account.id)
                  } else if (item === 'Disable account') {
                    view.onDisableAccount?.(account.id)
                  }
                }}
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

  if (!agents.length && account.accessCount > 0) {
    return (
      <span className='text-muted-foreground'>
        {account.accessCount} grant record{account.accessCount === 1 ? '' : 's'}
      </span>
    )
  }

  if (!grantedAgents.length) {
    return <span className='text-muted-foreground'>No agents</span>
  }

  return <TokenList values={grantedAgents.map((agent) => agent.name)} />
}

function primaryAgentLabel(
  account: MailboxAdminAccount,
  agents: ReadonlyArray<MailboxAdminAgent>
) {
  const grantedAgent = agents.find((agent) => agent.grants.some((grant) => grant.accountId === account.id))
  if (grantedAgent) {
    return grantedAgent.name
  }
  if (account.accessCount > 0) {
    return `${account.accessCount} grant record${account.accessCount === 1 ? '' : 's'}`
  }
  return 'Unassigned'
}

function GroupCards({ groups, view }: { groups: MailboxAdminView['groups']; view: MailboxAdminView }) {
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
                disabledItems={[
                  ...(!view.allowedActions.updateGroup || !view.onDialogChange
                    ? ['Edit group', 'Manage recipients']
                    : []),
                  ...(!view.allowedActions.disableGroup ||
                  !view.onDisableGroup ||
                  group.status === 'disabled' ||
                  view.pendingGroupDisableId === group.id
                    ? ['Disable group']
                    : [])
                ]}
                items={['Edit group', 'Manage recipients', 'Disable group']}
                destructiveItem='Disable group'
                label={`Open actions for ${group.address}`}
                onItemSelect={(item) => {
                  if (item === 'Edit group') {
                    view.onDialogChange?.({ groupId: group.id, type: 'groupEditor' })
                  } else if (item === 'Manage recipients') {
                    view.onDialogChange?.({ groupId: group.id, type: 'groupRecipients' })
                  } else if (item === 'Disable group') {
                    view.onDisableGroup?.(group.id)
                  }
                }}
              />
            </CardAction>
          </CardHeader>
          <CardContent className='px-4'>
            <div className='min-w-0'>
              <div className='text-muted-foreground text-xs'>
                {group.recipients.length} recipient{group.recipients.length === 1 ? '' : 's'}
              </div>
              <RecipientPreview
                agents={view.agents}
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

function AgentManagementTables({
  agents,
  pendingEnrollments,
  principals,
  view
}: {
  agents: ReadonlyArray<MailboxAdminAgent>
  pendingEnrollments: ReadonlyArray<MailboxAdminPendingAgentEnrollment>
  principals: ReadonlyArray<MailboxAdminExternalPrincipal>
  view: MailboxAdminView
}) {
  return (
    <div className='grid gap-4'>
      {agents.length ? (
        <div className='overflow-hidden'>
          <AgentTable
            agents={agents}
            view={view}
          />
        </div>
      ) : null}
      {pendingEnrollments.length ? (
        <PendingAgentEnrollmentTable
          enrollments={pendingEnrollments}
          view={view}
        />
      ) : null}
      {principals.length ? (
        <ExternalPrincipalTable
          principals={principals}
          view={view}
        />
      ) : null}
    </div>
  )
}

function PendingAgentEnrollmentTable({
  enrollments,
  view
}: {
  enrollments: ReadonlyArray<MailboxAdminPendingAgentEnrollment>
  view: MailboxAdminView
}) {
  return (
    <Card className='gap-3 rounded-none border-0 border-t py-4 shadow-none'>
      <CardHeader className='px-4'>
        <CardTitle className='text-sm'>Pending enrollments</CardTitle>
        <CardDescription>Agent hosts waiting to run their one-time enrollment command.</CardDescription>
      </CardHeader>
      <CardContent className='px-0'>
        <Table className='table-fixed'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[25%]'>Enrollment</TableHead>
              <TableHead className='w-[28%]'>Mailbox grants</TableHead>
              <TableHead className='hidden w-[24%] lg:table-cell'>System access</TableHead>
              <TableHead className='hidden w-[18%] xl:table-cell'>Token expires</TableHead>
              <TableHead className='hidden w-[18%] 2xl:table-cell'>Updated</TableHead>
              <TableHead className='w-10'>
                <span className='sr-only'>Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrollments.map((enrollment) => (
              <TableRow key={enrollment.id}>
                <TableCell className='min-w-0'>
                  <div className='flex min-w-0 flex-col'>
                    <span className='truncate font-medium'>{enrollment.name}</span>
                    <span className='text-muted-foreground text-xs'>
                      {enrollment.hostId} · {formatStatus(enrollment.status)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className='min-w-0'>
                  <GrantSummary grants={enrollment.grants} />
                </TableCell>
                <TableCell className='hidden lg:table-cell'>
                  <TokenList
                    values={enrollment.permissions.map((permission) =>
                      formatSystemPermission(view.permissionCatalog, permission)
                    )}
                  />
                </TableCell>
                <TableCell className='hidden xl:table-cell'>
                  {enrollment.tokenExpiresAt ? formatDateTimeLabel(enrollment.tokenExpiresAt) : 'No expiry'}
                </TableCell>
                <TableCell className='hidden 2xl:table-cell'>{enrollment.lastUpdated}</TableCell>
                <TableCell>
                  <RowActions
                    disabledItems={[
                      ...(!enrollment.canRevoke ||
                      !view.onRevokeAgentEnrollment ||
                      view.pendingAgentEnrollmentRevokeId === enrollment.id
                        ? ['Cancel enrollment']
                        : [])
                    ]}
                    items={['Cancel enrollment']}
                    destructiveItem='Cancel enrollment'
                    label={`Open actions for pending enrollment ${enrollment.name}`}
                    onItemSelect={(item) => {
                      if (item === 'Cancel enrollment') {
                        view.onRevokeAgentEnrollment?.(enrollment.id)
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function AgentTable({ agents, view }: { agents: ReadonlyArray<MailboxAdminAgent>; view: MailboxAdminView }) {
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
              <TokenList
                values={agent.permissions.map((permission) =>
                  formatSystemPermission(view.permissionCatalog, permission)
                )}
              />
            </TableCell>
            <TableCell className='hidden 2xl:table-cell'>{agent.lastSeen}</TableCell>
            <TableCell>
              <RowActions
                disabledItems={[
                  ...(!view.allowedActions.updateAgent || !view.onDialogChange ? ['Edit agent'] : []),
                  ...(!view.allowedActions.manageAgentSystemPermissions || !view.onDialogChange
                    ? ['System permissions']
                    : []),
                  ...(!view.allowedActions.manageAgentMailboxGrants || !view.onDialogChange
                    ? ['Account access']
                    : []),
                  ...(!canProvisionAccountForAgent(view) || !view.onDialogChange
                    ? ['Provision account']
                    : []),
                  ...(!view.allowedActions.revokeAgent ||
                  !view.onRevokeAgent ||
                  agent.status === 'disabled' ||
                  view.pendingAgentRevokeId === agent.id
                    ? ['Disable agent']
                    : [])
                ]}
                items={[
                  'Edit agent',
                  'System permissions',
                  'Account access',
                  'Provision account',
                  'Disable agent'
                ]}
                destructiveItem='Disable agent'
                label={`Open actions for ${agent.name}`}
                onItemSelect={(item) => {
                  if (item === 'Edit agent') {
                    view.onDialogChange?.({ agentId: agent.id, type: 'agentEditor' })
                  } else if (item === 'System permissions') {
                    view.onDialogChange?.({ agentId: agent.id, type: 'agentPermissions' })
                  } else if (item === 'Account access') {
                    view.onDialogChange?.({ agentId: agent.id, type: 'agentAccounts' })
                  } else if (item === 'Provision account') {
                    view.onDialogChange?.({ agentId: agent.id, type: 'accountEditor' })
                  } else if (item === 'Disable agent') {
                    view.onRevokeAgent?.(agent.id)
                  }
                }}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ExternalPrincipalTable({
  principals,
  view
}: {
  principals: ReadonlyArray<MailboxAdminExternalPrincipal>
  view: MailboxAdminView
}) {
  return (
    <Card className='gap-3 rounded-none border-0 border-t py-4 shadow-none'>
      <CardHeader className='px-4'>
        <CardTitle className='text-sm'>Connected clients</CardTitle>
        <CardDescription>
          API keys and OAuth clients with organization mailbox grants or system permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className='px-0'>
        <Table className='table-fixed'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[26%]'>Client</TableHead>
              <TableHead className='w-[18%]'>Type</TableHead>
              <TableHead className='w-[26%]'>Mailbox grants</TableHead>
              <TableHead className='hidden w-[24%] lg:table-cell'>System access</TableHead>
              <TableHead className='hidden w-[18%] xl:table-cell'>Scope</TableHead>
              <TableHead className='hidden w-[18%] 2xl:table-cell'>Last used</TableHead>
              <TableHead className='w-10'>
                <span className='sr-only'>Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {principals.map((principal) => (
              <TableRow key={`${principal.kind}:${principal.id}`}>
                <TableCell className='min-w-0'>
                  <div className='flex min-w-0 flex-col'>
                    <span className='truncate font-medium'>{principal.name}</span>
                    <span className='text-muted-foreground text-xs'>
                      {principal.id} · {formatStatus(principal.status)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{formatPrincipalKind(principal.kind)}</TableCell>
                <TableCell className='min-w-0'>
                  <GrantSummary grants={principal.grants} />
                </TableCell>
                <TableCell className='hidden lg:table-cell'>
                  <TokenList
                    values={principal.permissions.map((permission) =>
                      formatSystemPermission(view.permissionCatalog, permission)
                    )}
                  />
                </TableCell>
                <TableCell className='hidden xl:table-cell'>{formatPrincipalScope(principal.scope)}</TableCell>
                <TableCell className='hidden 2xl:table-cell'>{principal.lastUsed}</TableCell>
                <TableCell>
                  <RowActions
                    disabledItems={[
                      ...(!view.allowedActions.manageAgentSystemPermissions || !view.onDialogChange
                        ? ['System permissions']
                        : []),
                      ...(!view.allowedActions.manageAgentMailboxGrants || !view.onDialogChange
                        ? ['Account access']
                        : [])
                    ]}
                    items={['System permissions', 'Account access']}
                    label={`Open actions for ${principal.name}`}
                    onItemSelect={(item) => {
                      if (item === 'System permissions') {
                        view.onDialogChange?.({
                          principalId: principal.id,
                          principalType: principal.kind,
                          type: 'principalPermissions'
                        })
                      } else if (item === 'Account access') {
                        view.onDialogChange?.({
                          principalId: principal.id,
                          principalType: principal.kind,
                          type: 'principalAccounts'
                        })
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function GrantSummary({ grants }: { grants: ReadonlyArray<MailboxAdminMailboxGrant> }) {
  if (!grants.length) {
    return <span className='text-muted-foreground'>None</span>
  }

  return <TokenList values={grants.map((grant) => grant.accountAddress)} />
}

function RowActions({
  disabledItems = [],
  destructiveItem,
  items,
  label,
  onItemSelect
}: {
  disabledItems?: ReadonlyArray<string>
  destructiveItem?: string
  items: ReadonlyArray<string>
  label: string
  onItemSelect?: (item: string) => void
}) {
  const disabled = new Set(disabledItems)

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
              disabled={disabled.has(item)}
              key={item}
              onSelect={() => {
                onItemSelect?.(item)
              }}
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
      <PrincipalAccountsSheet view={view} />
      <PrincipalPermissionsDialog view={view} />
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
  const defaultAddress = agent ? defaultProvisionedMailboxAddress(agent, view.domain) : `research@${view.domain}`
  const canAssignAgent = view.allowedActions.manageAgentMailboxGrants
  const canSubmit =
    !!view.onSaveAccount &&
    !view.pendingAccountSave &&
    (account
      ? view.allowedActions.updateAccount
      : agent
        ? view.allowedActions.provisionAccount && canAssignAgent
        : view.allowedActions.createAccount)

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          view.onDialogChange?.(null)
        }
      }}
      open={Boolean(dialog)}
    >
      <DialogContent
        className='sm:max-w-xl'
        onOpenAutoFocus={preventDialogAutoFocus}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit) {
              return
            }
            const formData = new FormData(event.currentTarget)
            view.onSaveAccount?.(
              account?.id,
              account
                ? accountUpdateInputFromForm(formData)
                : accountInputFromForm(formData, view.permissionCatalog.defaultMailboxGrants)
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {agent
                ? `Provision a mailbox account for ${agent.name}.`
                : account
                  ? `Update the WildDuck mailbox account for ${account.address}.`
                  : `Create a WildDuck mailbox account for ${view.domain}.`}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='mailbox-account-address'>Address</FieldLabel>
              <Input
                id='mailbox-account-address'
                name='address'
                defaultValue={account?.address ?? defaultAddress}
                readOnly={Boolean(account)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='mailbox-account-name'>Display name</FieldLabel>
              <Input
                id='mailbox-account-name'
                name='name'
                defaultValue={agent?.name ?? account?.name ?? ''}
                placeholder='Support mailbox'
              />
            </Field>
            <input
              name='type'
              type='hidden'
              value='mailbox'
            />
            {!account && canAssignAgent ? (
              <AccountAgentField
                agents={view.agents}
                key={dialog?.agentId ?? 'unassigned'}
                selectedAgentId={dialog?.agentId}
              />
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type='button'
                variant='outline'
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={!canSubmit}
              type='submit'
            >
              {view.pendingAccountSave
                ? account
                  ? 'Saving account'
                  : 'Creating account'
                : account
                  ? 'Save account'
                  : agent
                    ? 'Provision account'
                    : 'Create account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AccountAgentField({
  agents,
  selectedAgentId
}: {
  agents: ReadonlyArray<MailboxAdminAgent>
  selectedAgentId?: string
}) {
  const defaultAgentId = selectedAgentId ?? 'unassigned'
  const [agentId, setAgentId] = React.useState(defaultAgentId)

  return (
    <Field>
      <FieldLabel>Assigned agent</FieldLabel>
      <input
        name='agentId'
        type='hidden'
        value={agentId === 'unassigned' ? '' : agentId}
      />
      <Select
        value={agentId}
        onValueChange={setAgentId}
      >
        <SelectTrigger className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value='unassigned'>Unassigned</SelectItem>
            {agents.map((availableAgent) => (
              <SelectItem
                key={availableAgent.id}
                value={availableAgent.id}
              >
                {availableAgent.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>
        Assigned agents receive the backend-defined default mailbox grants.
      </FieldDescription>
    </Field>
  )
}

function GroupEditorDialog({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'groupEditor' ? view.activeDialog : null
  const group = dialog?.groupId ? view.groups.find((candidate) => candidate.id === dialog.groupId) : null
  const title = group ? 'Edit forwarding group' : 'Create forwarding group'
  const canSaveGroup = group ? view.allowedActions.updateGroup : view.allowedActions.createGroup
  const canSubmitGroup = canSaveGroup && Boolean(view.onSaveGroup) && !view.pendingGroupSave

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          view.onDialogChange?.(null)
        }
      }}
      open={Boolean(dialog)}
    >
      <DialogContent
        className='sm:max-w-xl'
        onOpenAutoFocus={preventDialogAutoFocus}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmitGroup) {
              return
            }
            const formData = new FormData(event.currentTarget)
            view.onSaveGroup?.(group?.id, {
              address: formValue(formData, 'address'),
              description: formValue(formData, 'description'),
              recipients: group ? [...group.recipients] : [],
              status: formStatus(formData)
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Route one group address to mailbox accounts on {view.domain}.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='mailbox-group-address'>Group address</FieldLabel>
              <Input
                id='mailbox-group-address'
                name='address'
                defaultValue={group?.address ?? `support@${view.domain}`}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='mailbox-group-description'>Description</FieldLabel>
              <Input
                id='mailbox-group-description'
                name='description'
                defaultValue={group?.description ?? 'Route shared inbound mail to selected accounts.'}
              />
            </Field>
            <GroupStatusField
              key={group?.id ?? 'new-group'}
              status={toWritableGroupStatus(group?.status)}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type='button'
                variant='outline'
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={!canSubmitGroup}
              type='submit'
            >
              {view.pendingGroupSave ? 'Saving group' : group ? 'Save group' : 'Create group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GroupRecipientsSheet({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'groupRecipients' ? view.activeDialog : null
  const group = dialog ? view.groups.find((candidate) => candidate.id === dialog.groupId) : null

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          view.onDialogChange?.(null)
        }
      }}
      open={Boolean(dialog)}
    >
      <SheetContent className='w-full sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>Manage recipients</SheetTitle>
          <SheetDescription>
            {group?.address ?? 'Select mailbox targets for this forwarded address.'}
          </SheetDescription>
        </SheetHeader>

        {group ? (
          <GroupRecipientsSheetBody
            group={group}
            key={group.id}
            view={view}
          />
        ) : (
          <div className='text-muted-foreground px-4 text-sm'>Select a forwarding group.</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function GroupRecipientsSheetBody({
  group,
  view
}: {
  group: MailboxAdminView['groups'][number]
  view: MailboxAdminView
}) {
  const [draftRecipients, setDraftRecipients] = React.useState(() => group.recipients)
  const [query, setQuery] = React.useState('')
  const availableRecipients = view.accounts
    .map((account) => account.address)
    .filter((address) => !draftRecipients.includes(address))
  const visibleCurrentRecipients = filterRecipientsByQuery(draftRecipients, query, view.agents)
  const visibleAvailableRecipients = filterRecipientsByQuery(availableRecipients, query, view.agents)

  return (
    <>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4'>
        <InputGroup>
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput
            onChange={(event) => {
              setQuery(event.currentTarget.value)
            }}
            placeholder='Search accounts or agents...'
            value={query}
          />
        </InputGroup>

        <RecipientListCard
          actionLabel='Remove'
          agents={view.agents}
          description={`${draftRecipients.length} mailbox target${draftRecipients.length === 1 ? '' : 's'}`}
          onRecipientAction={(recipient) => {
            setDraftRecipients((current) => current.filter((candidate) => candidate !== recipient))
          }}
          recipients={visibleCurrentRecipients}
          title='Current recipients'
        />

        <RecipientListCard
          actionLabel='Add'
          agents={view.agents}
          description='Accounts available on this domain.'
          onRecipientAction={(recipient) => {
            setDraftRecipients((current) => [...new Set([...current, recipient])].sort())
          }}
          recipients={visibleAvailableRecipients}
          title='Available recipients'
        />
      </div>

      <SheetFooter>
        <SheetClose asChild>
          <Button
            type='button'
            variant='outline'
          >
            Cancel
          </Button>
        </SheetClose>
        <Button
          disabled={!view.onSaveGroup || view.pendingGroupSave}
          onClick={() => {
            view.onSaveGroup?.(group.id, {
              address: group.address,
              description: group.description,
              recipients: [...draftRecipients],
              status: toWritableGroupStatus(group.status)
            })
          }}
          type='button'
        >
          {view.pendingGroupSave ? 'Saving recipients' : 'Save recipients'}
        </Button>
      </SheetFooter>
    </>
  )
}

function GroupStatusField({ status: initialStatus }: { status: MailboxAdminGroupInput['status'] }) {
  const [status, setStatus] = React.useState<MailboxAdminGroupInput['status']>(initialStatus)

  return (
    <Field>
      <FieldLabel>Status</FieldLabel>
      <input
        name='status'
        type='hidden'
        value={status}
      />
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value as MailboxAdminGroupInput['status'])
        }}
      >
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
  )
}

function RecipientListCard({
  actionLabel,
  agents,
  description,
  onRecipientAction,
  recipients,
  title
}: {
  actionLabel: string
  agents: ReadonlyArray<MailboxAdminAgent>
  description: string
  onRecipientAction?: (recipient: string) => void
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
                  onAction={onRecipientAction}
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
  const enrollment = agent ? null : view.createdAgentEnrollment
  const pendingCreate = !agent && view.pendingAgentCreate
  const pendingSave = agent ? view.pendingAgentSaveId === agent.id : false
  const title = agent ? 'Edit agent' : 'Create agent'

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          view.onDialogChange?.(null)
        }
      }}
      open={Boolean(dialog)}
    >
      <DialogContent
        className='sm:max-w-xl'
        onOpenAutoFocus={preventDialogAutoFocus}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!agent && enrollment) {
              return
            }
            const formData = new FormData(event.currentTarget)
            if (agent) {
              view.onSaveAgent?.(agent.id, agentInputFromForm(formData, view))
              return
            }
            view.onCreateAgent?.(agentInputFromForm(formData, view))
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Agent profile and enrollment.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='mailbox-agent-name'>Name</FieldLabel>
              <Input
                id='mailbox-agent-name'
                defaultValue={agent?.name ?? 'Research Agent'}
                name='name'
              />
            </Field>
            {enrollment ? (
              <AgentEnrollmentCommandSummary
                canCopyCommand={Boolean(view.onCopyAgentEnrollmentCommand)}
                className='rounded-lg border'
                enrollment={enrollment}
                onCopyCommand={view.onCopyAgentEnrollmentCommand}
              />
            ) : null}
            {!agent && !enrollment ? <InitialAgentGrantFields view={view} /> : null}
            {agent ? (
              <>
                <Field>
                  <FieldLabel htmlFor='mailbox-agent-handle'>Handle</FieldLabel>
                  <Input
                    id='mailbox-agent-handle'
                    defaultValue={agent.handle}
                    readOnly
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='mailbox-agent-primary-account'>Primary account</FieldLabel>
                  <Input
                    id='mailbox-agent-primary-account'
                    defaultValue={agent.primaryAccount ?? 'None'}
                    readOnly
                  />
                </Field>
              </>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type='button'
                variant='outline'
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={
                agent
                  ? !view.onSaveAgent || pendingSave
                  : !view.onCreateAgent || pendingCreate || Boolean(enrollment)
              }
              type='submit'
            >
              {agent
                ? pendingSave
                  ? 'Saving agent'
                  : 'Save agent'
                : enrollment
                  ? 'Enrollment created'
                  : pendingCreate
                    ? 'Creating enrollment'
                    : 'Create enrollment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InitialAgentGrantFields({ view }: { view: MailboxAdminView }) {
  const grantableAccounts = view.accounts.filter(isGrantableMailboxAccount)
  const [selectedAccountIds, setSelectedAccountIds] = React.useState<ReadonlySet<string>>(() => new Set())

  return (
    <>
      <FieldSet>
        <legend className='sr-only'>Initial mailbox access</legend>
        <FieldTitle>Initial mailbox access</FieldTitle>
        <FieldDescription>Mailbox-specific access to apply when the agent enrolls.</FieldDescription>
        <div className='grid gap-3'>
          {grantableAccounts.length ? (
            grantableAccounts.map((account) => {
              const accountSelected = selectedAccountIds.has(account.id)

              return (
                <div
                  className='rounded-md border p-3'
                  key={account.id}
                >
                  <Field orientation='horizontal'>
                    <Checkbox
                      checked={accountSelected}
                      name='mailboxGrantAccount'
                      onCheckedChange={(checked) => {
                        setSelectedAccountIds((current) => {
                          const next = new Set(current)
                          if (checked === true) {
                            next.add(account.id)
                          } else {
                            next.delete(account.id)
                          }
                          return next
                        })
                      }}
                      value={account.id}
                    />
                    <span className='text-sm font-medium'>{account.address}</span>
                  </Field>
                  <div className='mt-3 grid gap-2 sm:grid-cols-2'>
                    {view.permissionCatalog.mailboxGrantOptions.map((option) => (
                      <label
                        className='flex items-center gap-2 text-sm'
                        key={option.value}
                      >
                        <Checkbox
                          defaultChecked={view.permissionCatalog.defaultMailboxGrants.includes(option.value)}
                          disabled={!accountSelected}
                          name={`mailboxGrant:${account.id}`}
                          value={option.value}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            <p className='text-muted-foreground text-sm'>No active mailbox accounts.</p>
          )}
        </div>
      </FieldSet>
      <FieldSet>
        <legend className='sr-only'>Initial system permissions</legend>
        <FieldTitle>Initial system permissions</FieldTitle>
        <FieldDescription>Organization-level actions to apply when the agent enrolls.</FieldDescription>
        <div className='grid gap-2 sm:grid-cols-2'>
          {view.permissionCatalog.systemPermissionOptions.map((option) => (
            <label
              className='flex items-center gap-2 text-sm'
              key={option.value}
            >
              <Checkbox
                name='systemPermission'
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </FieldSet>
      <Field>
        <FieldLabel htmlFor='mailbox-agent-grant-expires-at'>Grant expiry</FieldLabel>
        <Input
          id='mailbox-agent-grant-expires-at'
          name='grantExpiresAt'
          type='datetime-local'
        />
        <FieldDescription>Leave empty for no grant expiration.</FieldDescription>
      </Field>
    </>
  )
}

function AgentAccountsSheet({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'agentAccounts' ? view.activeDialog : null
  const agent = dialog ? view.agents.find((candidate) => candidate.id === dialog.agentId) : null

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          view.onDialogChange?.(null)
        }
      }}
      open={Boolean(dialog)}
    >
      <SheetContent className='w-full sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>Account access</SheetTitle>
          <SheetDescription>
            {agent
              ? `Assign accounts that ${agent.name} can read, draft from, send through, or manage.`
              : 'Assign mailbox accounts.'}
          </SheetDescription>
        </SheetHeader>

        {agent ? (
          <AgentAccountsSheetBody
            agent={agent}
            key={agent.id}
            view={view}
          />
        ) : (
          <div className='text-muted-foreground px-4 text-sm'>Select an agent.</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function AgentAccountsSheetBody({ agent, view }: { agent: MailboxAdminAgent; view: MailboxAdminView }) {
  return (
    <MailboxGrantSheetBody
      grants={agent.grants}
      onSave={(input) => {
        view.onSaveAgentMailboxGrants?.(agent.id, input)
      }}
      pending={view.pendingAgentMailboxGrantsSaveId === agent.id}
      view={view}
    />
  )
}

function PrincipalAccountsSheet({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'principalAccounts' ? view.activeDialog : null
  const principal = dialog ? findPrincipal(view, dialog) : null

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          view.onDialogChange?.(null)
        }
      }}
      open={Boolean(dialog)}
    >
      <SheetContent className='w-full sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>Client account access</SheetTitle>
          <SheetDescription>
            {principal
              ? `Assign accounts that ${principal.name} can read, draft from, send through, or manage.`
              : 'Assign mailbox accounts.'}
          </SheetDescription>
        </SheetHeader>

        {principal ? (
          <MailboxGrantSheetBody
            grants={principal.grants}
            key={`${principal.kind}:${principal.id}`}
            onSave={(input) => {
              view.onSavePrincipalMailboxGrants?.({ id: principal.id, kind: principal.kind }, input)
            }}
            pending={view.pendingPrincipalMailboxGrantsSaveId === principalKey(principal)}
            view={view}
          />
        ) : (
          <div className='text-muted-foreground px-4 text-sm'>Select a client.</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function MailboxGrantSheetBody({
  grants,
  onSave,
  pending,
  view
}: {
  grants: ReadonlyArray<MailboxAdminMailboxGrant>
  onSave?: (input: MailboxAdminAgentMailboxGrantsInput) => void
  pending: boolean
  view: MailboxAdminView
}) {
  const [draftGrants, setDraftGrants] = React.useState(() => grants)
  const [query, setQuery] = React.useState('')
  const availableAccounts = view.accounts.filter(
    (account) => isGrantableMailboxAccount(account) && !draftGrants.some((grant) => grant.accountId === account.id)
  )
  const visibleGrants = filterAccountGrantsByQuery(draftGrants, query, view.accounts)
  const visibleAccounts = filterAccountsByQuery(availableAccounts, query)
  const hasEmptyGrant = draftGrants.some((grant) => grant.capabilities.length === 0)

  return (
    <>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4'>
        <InputGroup>
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput
            onChange={(event) => {
              setQuery(event.currentTarget.value)
            }}
            placeholder='Search accounts...'
            value={query}
          />
        </InputGroup>

        <AccountGrantListCard
          actionLabel='Remove'
          accounts={view.accounts}
          description={`${draftGrants.length} assigned account${draftGrants.length === 1 ? '' : 's'}`}
          grants={visibleGrants}
          onGrantCapabilitiesChange={(grant, capability, checked) => {
            setDraftGrants((current) =>
              current.map((candidate) =>
                candidate.accountId === grant.accountId
                  ? {
                      ...candidate,
                      capabilities: nextMailboxCapabilities(candidate.capabilities, capability, checked, view)
                    }
                  : candidate
              )
            )
          }}
          onGrantAction={(grant) => {
            setDraftGrants((current) =>
              current.filter((candidate) => candidate.accountId !== grant.accountId)
            )
          }}
          title='Assigned accounts'
          view={view}
        />

        <AvailableAccountListCard
          accounts={visibleAccounts}
          actionLabel='Add'
          description='Accounts available on this domain.'
          onAccountAction={(account) => {
            setDraftGrants((current) =>
              [
                ...current,
                {
                  accountAddress: account.address,
                  accountId: account.id,
                  capabilities: view.permissionCatalog.defaultMailboxGrants
                }
              ].sort((left, right) => left.accountAddress.localeCompare(right.accountAddress))
            )
          }}
          title='Available accounts'
        />
      </div>

      <SheetFooter>
        <SheetClose asChild>
          <Button
            type='button'
            variant='outline'
          >
            Cancel
          </Button>
        </SheetClose>
        <Button
          disabled={!onSave || pending || hasEmptyGrant}
          onClick={() => {
            onSave?.({
              grants: draftGrants.map((grant) => ({
                accountId: grant.accountId,
                capabilities: [...grant.capabilities]
              }))
            })
          }}
          type='button'
        >
          {pending ? 'Saving account access' : 'Save account access'}
        </Button>
      </SheetFooter>
    </>
  )
}

function AgentPermissionsDialog({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'agentPermissions' ? view.activeDialog : null
  const agent = dialog ? view.agents.find((candidate) => candidate.id === dialog.agentId) : null

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          view.onDialogChange?.(null)
        }
      }}
      open={Boolean(dialog)}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>System permissions</DialogTitle>
          <DialogDescription>
            {agent
              ? `Organization-level permissions for ${agent.name}.`
              : 'Organization-level agent permissions.'}
          </DialogDescription>
        </DialogHeader>
        {agent ? (
          <AgentPermissionsDialogBody
            agent={agent}
            key={agent.id}
            view={view}
          />
        ) : (
          <div className='text-muted-foreground text-sm'>Select an agent.</div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AgentPermissionsDialogBody({ agent, view }: { agent: MailboxAdminAgent; view: MailboxAdminView }) {
  return (
    <SystemPermissionsDialogBody
      onSave={(input) => {
        view.onSaveAgentSystemPermissions?.(agent.id, input)
      }}
      pending={view.pendingAgentSystemPermissionsSaveId === agent.id}
      permissions={agent.permissions}
      view={view}
    />
  )
}

function PrincipalPermissionsDialog({ view }: { view: MailboxAdminView }) {
  const dialog = view.activeDialog?.type === 'principalPermissions' ? view.activeDialog : null
  const principal = dialog ? findPrincipal(view, dialog) : null

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          view.onDialogChange?.(null)
        }
      }}
      open={Boolean(dialog)}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Client system permissions</DialogTitle>
          <DialogDescription>
            {principal
              ? `Organization-level permissions for ${principal.name}.`
              : 'Organization-level client permissions.'}
          </DialogDescription>
        </DialogHeader>
        {principal ? (
          <SystemPermissionsDialogBody
            key={`${principal.kind}:${principal.id}`}
            onSave={(input) => {
              view.onSavePrincipalSystemPermissions?.({ id: principal.id, kind: principal.kind }, input)
            }}
            pending={view.pendingPrincipalSystemPermissionsSaveId === principalKey(principal)}
            permissions={principal.permissions}
            view={view}
          />
        ) : (
          <div className='text-muted-foreground text-sm'>Select a client.</div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SystemPermissionsDialogBody({
  onSave,
  pending,
  permissions: initialPermissions,
  view
}: {
  onSave?: (input: MailboxAdminAgentSystemPermissionsInput) => void
  pending: boolean
  permissions: ReadonlyArray<MailboxAdminSystemPermission>
  view: MailboxAdminView
}) {
  const [permissions, setPermissions] = React.useState<ReadonlyArray<MailboxAdminSystemPermission>>(
    () => initialPermissions
  )

  return (
    <>
      <PermissionChecklist
        description='These permissions apply across the organization and are separate from per-account mailbox access.'
        disabled={!onSave || pending}
        onPermissionChange={(permission, checked) => {
          setPermissions((current) => {
            const next = new Set(current)
            if (checked) {
              next.add(permission)
            } else {
              next.delete(permission)
            }
            return [...next].sort()
          })
        }}
        permissions={permissions}
        title='Allowed actions'
        values={systemPermissionOptionsForView(view)}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button
            type='button'
            variant='outline'
          >
            Cancel
          </Button>
        </DialogClose>
        <Button
          disabled={!onSave || pending}
          onClick={() => {
            onSave?.({ permissions: [...permissions] })
          }}
          type='button'
        >
          {pending ? 'Saving permissions' : 'Save permissions'}
        </Button>
      </DialogFooter>
    </>
  )
}

function AccountGrantListCard({
  accounts,
  actionLabel,
  description,
  grants,
  onGrantCapabilitiesChange,
  onGrantAction,
  title,
  view
}: {
  accounts: ReadonlyArray<MailboxAdminAccount>
  actionLabel: string
  description: string
  grants: ReadonlyArray<MailboxAdminMailboxGrant>
  onGrantCapabilitiesChange?: (
    grant: MailboxAdminMailboxGrant,
    capability: MailboxAdminMailboxCapability,
    checked: boolean
  ) => void
  onGrantAction?: (grant: MailboxAdminMailboxGrant) => void
  title: string
  view: MailboxAdminView
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
                    onAction={onGrantAction}
                    onCapabilitiesChange={onGrantCapabilitiesChange}
                    view={view}
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
  onAccountAction,
  title
}: {
  accounts: ReadonlyArray<MailboxAdminAccount>
  actionLabel: string
  description: string
  onAccountAction?: (account: MailboxAdminAccount) => void
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
                  onAction={onAccountAction}
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
  grant,
  onAction,
  onCapabilitiesChange,
  view
}: {
  account?: MailboxAdminAccount
  actionLabel: string
  grant: MailboxAdminMailboxGrant
  onAction?: (grant: MailboxAdminMailboxGrant) => void
  onCapabilitiesChange?: (
    grant: MailboxAdminMailboxGrant,
    capability: MailboxAdminMailboxCapability,
    checked: boolean
  ) => void
  view: MailboxAdminView
}) {
  return (
    <div className='flex items-start justify-between gap-3 px-4 py-3'>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-sm font-medium'>{grant.accountAddress}</div>
        <div className='text-muted-foreground truncate text-xs'>
          {account
            ? `${account.type === 'alias' ? 'Alias' : 'Mailbox'} · ${formatStatus(account.status)}`
            : 'Mailbox'}
        </div>
        <CapabilityBadges
          capabilities={grant.capabilities}
          view={view}
        />
        <div className='mt-3 grid gap-2 sm:grid-cols-2'>
          {view.permissionCatalog.mailboxGrantOptions.map((option) => (
            <label
              className='flex items-center gap-2 text-sm'
              key={option.value}
            >
              <Checkbox
                checked={grant.capabilities.includes(option.value)}
                disabled={!onCapabilitiesChange}
                onCheckedChange={(checked) => {
                  onCapabilitiesChange?.(grant, option.value, checked === true)
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {grant.capabilities.length === 0 ? (
          <p className='text-destructive mt-2 text-xs'>Select at least one capability.</p>
        ) : null}
      </div>
      <Button
        disabled={!onAction}
        onClick={() => {
          onAction?.(grant)
        }}
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
  actionLabel,
  onAction
}: {
  account: MailboxAdminAccount
  actionLabel: string
  onAction?: (account: MailboxAdminAccount) => void
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
        disabled={!onAction}
        onClick={() => {
          onAction?.(account)
        }}
        size='sm'
        type='button'
        variant='outline'
      >
        {actionLabel}
      </Button>
    </div>
  )
}

function CapabilityBadges({
  capabilities,
  view
}: {
  capabilities: ReadonlyArray<MailboxAdminMailboxCapability>
  view: MailboxAdminView
}) {
  return (
    <div className='mt-2 flex flex-wrap gap-1'>
      {capabilities.map((capability) => (
        <Badge
          key={capability}
          variant='secondary'
        >
          {formatMailboxCapability(view.permissionCatalog, capability)}
        </Badge>
      ))}
    </div>
  )
}

function RecipientRow({
  actionLabel,
  agents,
  onAction,
  recipient
}: {
  actionLabel: string
  agents: ReadonlyArray<MailboxAdminAgent>
  onAction?: (recipient: string) => void
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
        disabled={!onAction}
        onClick={() => {
          onAction?.(recipient)
        }}
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
  disabled,
  description,
  onPermissionChange,
  permissions,
  title,
  values
}: {
  disabled?: boolean
  description: string
  onPermissionChange?: (permission: T, checked: boolean) => void
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
          <Checkbox
            checked={permissions.includes(value)}
            disabled={disabled}
            onCheckedChange={(checked) => {
              onPermissionChange?.(value, checked === true)
            }}
          />
          <span className='text-sm font-medium'>{label}</span>
        </Field>
      ))}
    </FieldSet>
  )
}

function newDialogForSection(section: MailboxAdminSectionId): MailboxAdminDialogState {
  if (section === 'groups') {
    return { type: 'groupEditor' }
  }
  if (section === 'agents') {
    return { type: 'agentEditor' }
  }
  return { type: 'accountEditor' }
}

function canCreateMailboxAdminRecord(view: MailboxAdminView) {
  if (view.section === 'accounts') {
    return view.allowedActions.createAccount
  }
  if (view.section === 'agents') {
    return view.allowedActions.createAgent
  }
  return view.allowedActions.createGroup
}

function canProvisionAccountForAgent(view: MailboxAdminView) {
  return view.allowedActions.provisionAccount && view.allowedActions.manageAgentMailboxGrants
}

function defaultProvisionedMailboxAddress(agent: MailboxAdminAgent, domain: string) {
  const handleLocalPart = mailboxLocalPart(agent.handle)
  if (handleLocalPart) {
    return `${handleLocalPart}@${domain}`
  }

  const nameLocalPart = mailboxLocalPart(agent.name) || 'agent'
  const idSuffix = agent.id.replace(/[^a-z0-9]/giu, '').slice(-6).toLowerCase()
  return `${nameLocalPart}${idSuffix ? `-${idSuffix}` : ''}@${domain}`
}

function mailboxLocalPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/u, '')
    .replace(/@.*$/u, '')
    .replace(/[^a-z0-9._+-]+/gu, '.')
    .replace(/^[._+-]+|[._+-]+$/gu, '')
    .slice(0, 64)
}

function formValue(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function accountInputFromForm(
  formData: FormData,
  defaultMailboxGrants: ReadonlyArray<MailboxAdminMailboxCapability>
): MailboxAdminAccountInput {
  const agentId = formValue(formData, 'agentId').trim()
  const name = formValue(formData, 'name').trim()

  return {
    address: formValue(formData, 'address'),
    agentId: agentId || undefined,
    grants: agentId ? [...defaultMailboxGrants] : undefined,
    name: name || undefined,
    type: 'mailbox'
  }
}

function systemPermissionOptionsForView(
  view: MailboxAdminView
): ReadonlyArray<readonly [MailboxAdminSystemPermission, string]> {
  return view.permissionCatalog.systemPermissions.map(
    (permission) => [permission, formatSystemPermission(view.permissionCatalog, permission)] as const
  )
}

function accountUpdateInputFromForm(formData: FormData): MailboxAdminAccountInput {
  const name = formValue(formData, 'name').trim()
  return {
    address: formValue(formData, 'address'),
    name: name || undefined
  }
}

function agentInputFromForm(formData: FormData, view: MailboxAdminView): MailboxAdminAgentInput {
  const mailboxCapabilities = new Set(view.permissionCatalog.mailboxGrants)
  const systemPermissionValues = new Set(view.permissionCatalog.systemPermissions)
  const grantExpiresAt = formDateTimeLocalToISOString(formValue(formData, 'grantExpiresAt'))
  const mailboxGrants = formStringValues(formData, 'mailboxGrantAccount').flatMap((accountId) => {
    const capabilities = formStringValues(formData, `mailboxGrant:${accountId}`).filter(
      (capability): capability is MailboxAdminMailboxCapability =>
        mailboxCapabilities.has(capability as MailboxAdminMailboxCapability)
    )

    return capabilities.length
      ? [
          {
            accountId,
            capabilities
          }
        ]
      : []
  })
  const systemPermissions = formStringValues(formData, 'systemPermission').filter(
    (permission): permission is MailboxAdminSystemPermission =>
      systemPermissionValues.has(permission as MailboxAdminSystemPermission)
  )

  return {
    grantExpiresAt,
    mailboxGrants: mailboxGrants.length ? mailboxGrants : undefined,
    systemPermissions: systemPermissions.length ? systemPermissions : undefined,
    name: formValue(formData, 'name')
  }
}

function formStringValues(formData: FormData, name: string) {
  return formData.getAll(name).filter((value): value is string => typeof value === 'string')
}

function formDateTimeLocalToISOString(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function formStatus(formData: FormData): MailboxAdminGroupInput['status'] {
  const value = formValue(formData, 'status')
  return value === 'disabled' || value === 'pending' ? value : 'active'
}

function toWritableGroupStatus(status: MailboxAdminStatus | undefined): MailboxAdminGroupInput['status'] {
  return status === 'active' || status === 'disabled' || status === 'pending' ? status : 'active'
}

function isGrantableMailboxAccount(account: MailboxAdminAccount) {
  return account.status === 'active' && account.type === 'mailbox'
}

function getPagination(
  view: MailboxAdminView,
  visibleCount: number
): NormalizedMailboxAdminPagination | null {
  if (!view.pagination) {
    return null
  }

  const pageSize = Math.max(1, Math.floor(view.pagination.pageSize))
  const totalPages = Math.max(1, Math.ceil(visibleCount / pageSize))
  const page = Math.min(Math.max(1, Math.floor(view.pagination.page)), totalPages)
  const startIndex = (page - 1) * pageSize
  const startItem = visibleCount === 0 ? 0 : startIndex + 1
  const endItem = Math.min(visibleCount, startIndex + pageSize)

  return {
    page,
    pageSize,
    startIndex,
    startItem,
    endItem,
    totalPages
  }
}

function paginateVisibleRecords(
  section: MailboxAdminSectionId,
  visibleRecords: MailboxAdminVisibleRecords,
  pagination: NormalizedMailboxAdminPagination | null
): MailboxAdminVisibleRecords {
  if (!pagination) {
    return visibleRecords
  }

  if (section === 'groups') {
    return {
      ...visibleRecords,
      groups: visibleRecords.groups.slice(pagination.startIndex, pagination.startIndex + pagination.pageSize)
    }
  }

  if (section === 'agents') {
    const pagedRecords = [
      ...visibleRecords.agents.map((agent) => ({ agent, type: 'agent' as const })),
      ...visibleRecords.pendingEnrollments.map((pendingEnrollment) => ({
        pendingEnrollment,
        type: 'pendingEnrollment' as const
      })),
      ...visibleRecords.principals.map((principal) => ({ principal, type: 'principal' as const }))
    ].slice(pagination.startIndex, pagination.startIndex + pagination.pageSize)

    return {
      ...visibleRecords,
      agents: pagedRecords.flatMap((record) => (record.type === 'agent' ? [record.agent] : [])),
      pendingEnrollments: pagedRecords.flatMap((record) =>
        record.type === 'pendingEnrollment' ? [record.pendingEnrollment] : []
      ),
      principals: pagedRecords.flatMap((record) =>
        record.type === 'principal' ? [record.principal] : []
      )
    }
  }

  return {
    ...visibleRecords,
    accounts: visibleRecords.accounts.slice(
      pagination.startIndex,
      pagination.startIndex + pagination.pageSize
    )
  }
}

function getVisibleSectionCount(view: MailboxAdminView, visibleRecords: MailboxAdminVisibleRecords) {
  if (view.section === 'agents') {
    return (
      view.pagination?.filteredRecords ??
      visibleRecords.agents.length + visibleRecords.pendingEnrollments.length + visibleRecords.principals.length
    )
  }

  if (view.pagination?.filteredRecords !== undefined) {
    return view.pagination.filteredRecords
  }

  if (view.section === 'groups') {
    return visibleRecords.groups.length
  }

  return visibleRecords.accounts.length
}

function getSectionTotalCount(view: MailboxAdminView) {
  if (view.section === 'agents') {
    return (
      view.pagination?.totalRecords ??
      view.agents.length + view.pendingEnrollments.length + view.principals.length
    )
  }

  if (view.pagination?.totalRecords !== undefined) {
    return view.pagination.totalRecords
  }

  if (view.section === 'groups') {
    return view.groups.length
  }

  return view.accounts.length
}

function hasMailboxAdminFilters(view: MailboxAdminView) {
  return getStatusFilter(view) !== 'all' || Boolean(view.searchQuery?.trim())
}

function filterRecipientsByQuery(
  recipients: ReadonlyArray<string>,
  query: string,
  agents: ReadonlyArray<MailboxAdminAgent>
) {
  const normalizedQuery = normalizeSearchQuery(query)
  return recipients.filter((recipient) =>
    matchesSearchQuery(normalizedQuery, [recipient, getRecipientOwner(agents, recipient)])
  )
}

function filterAccountsByQuery(accounts: ReadonlyArray<MailboxAdminAccount>, query: string) {
  const normalizedQuery = normalizeSearchQuery(query)
  return accounts.filter((account) =>
    matchesSearchQuery(normalizedQuery, [account.address, account.agentName, account.status, account.type])
  )
}

function filterAccountGrantsByQuery(
  grants: ReadonlyArray<MailboxAdminMailboxGrant>,
  query: string,
  accounts: ReadonlyArray<MailboxAdminAccount>
) {
  const normalizedQuery = normalizeSearchQuery(query)
  return grants.filter((grant) => {
    const account = accounts.find((candidate) => candidate.id === grant.accountId)
    return matchesSearchQuery(normalizedQuery, [
      grant.accountAddress,
      account?.agentName,
      account?.status,
      account?.type
    ])
  })
}

function nextMailboxCapabilities(
  capabilities: ReadonlyArray<MailboxAdminMailboxCapability>,
  capability: MailboxAdminMailboxCapability,
  checked: boolean,
  view: MailboxAdminView
) {
  const capabilitySet = new Set(capabilities)

  if (checked) {
    capabilitySet.add(capability)
  } else {
    capabilitySet.delete(capability)
  }

  return view.permissionCatalog.mailboxGrants.filter((value) => capabilitySet.has(value))
}

function findPrincipal(
  view: MailboxAdminView,
  dialog: Extract<MailboxAdminDialogState, { type: 'principalAccounts' | 'principalPermissions' }>
) {
  return view.principals.find(
    (candidate) => candidate.id === dialog.principalId && candidate.kind === dialog.principalType
  )
}

function principalKey(principal: Pick<MailboxAdminExternalPrincipal, 'id' | 'kind'>) {
  return `${principal.kind}:${principal.id}`
}

function formatPrincipalKind(kind: MailboxAdminExternalPrincipal['kind']) {
  return kind === 'api_key' ? 'API key' : 'OAuth client'
}

function formatPrincipalScope(scope: MailboxAdminExternalPrincipal['scope']) {
  return scope === 'organization' ? 'Organization' : 'User'
}

function formatStatus(status: MailboxAdminStatus) {
  return status
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatDateTimeLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
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
