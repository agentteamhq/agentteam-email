import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { agentAccessActionableState } from '../storybook/agent-access-fixtures'
import {
  authenticatedSectionBaseArgs,
  domainSettingsEmptyFirstUseState
} from '../storybook/authenticated-section-fixtures'
import {
  mailboxAdminEmptyView,
  mailboxAdminExternalPrincipalsOnlyView,
  mailboxAdminGroupsOnlyView,
  mailboxAdminPaginatedAccountsView,
  mailboxAdminReadOnlyAccountsView,
  mailboxAdminReadyView
} from '../storybook/mailbox-admin-fixtures'
import {
  mailWorkspaceAssistantAccountView,
  mailWorkspaceEmptyView,
  mailWorkspaceJunkView,
  mailWorkspaceReadyView
} from '../storybook/mail-workspace-fixtures'
import { getMailboxAdminVisibleRecordsForView } from '../partials/authenticated/mailbox-admin-visible-records'
import { DashboardMailController } from './dashboard-mail-client-controller'
import type { MailWorkspaceQuery } from '../lib/mail-rpc'
import type { MailboxAdminViewQuery } from '../lib/mail-admin-rpc'
import type { MailboxAdminSectionId, MailboxAdminView } from '../partials/authenticated/mailbox-admin-models'
import type { AgentMailAdminNavigation, AgentMailAdminView, AgentMailWebWorkspace } from '@main/backend'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Controller',
  component: DashboardMailController,
  args: {
    authClient: authenticatedSectionBaseArgs.authClient,
    domainSettingsState: domainSettingsEmptyFirstUseState,
    publicEnv: authenticatedSectionBaseArgs.publicEnv,
    routeSearch: { mailboxAdmin: 'accounts' },
    routeState: authenticatedSectionBaseArgs.routeState,
    sessionCleanupEnabled: authenticatedSectionBaseArgs.sessionCleanupEnabled,
    settingsOpen: false
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardMailController>

export default meta

type Story = StoryObj<typeof meta>

const mailWorkspaceMiddlePageView = {
  ...mailWorkspaceReadyView,
  pagination: {
    limit: 25,
    nextCursor: 'next-page-cursor',
    previousCursor: 'previous-page-cursor',
    total: 42
  }
} satisfies AgentMailWebWorkspace

export const WebmailInbox: Story = {
  name: 'Webmail / inbox via RPC',
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findAllByText('Quarterly research packet')).toHaveLength(2)
    await expect(await canvas.findAllByText('research-packet.txt')).toHaveLength(2)
    await expect(await canvas.findByText('2 shown')).toBeInTheDocument()
    await expect(await canvas.findByText('42 messages')).toBeInTheDocument()
  }
}

export const WebmailPaginated: Story = {
  name: 'Webmail / middle cursor page via RPC',
  args: {
    routeSearch: {
      cursor: 'middle-page-cursor',
      direction: 'next'
    }
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceMiddlePageView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('2 shown')).toBeInTheDocument()
    await expect(await canvas.findByText('42 messages')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Previous page' })).toBeEnabled()
    await expect(await canvas.findByRole('button', { name: 'Next page' })).toBeEnabled()
  }
}

export const WebmailEmpty: Story = {
  name: 'Webmail / empty folder via RPC',
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceEmptyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Inbox is empty')).toBeInTheDocument()
    await expect(await canvas.findByText('Select a message')).toBeInTheDocument()
  }
}

export const WebmailJunk: Story = {
  name: 'Webmail / junk folder via RPC',
  args: {
    routeSearch: { folderId: 'junk-id' }
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceJunkView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findAllByText('False positive delivery')).toHaveLength(2)
    await expect(await canvas.findAllByRole('button', { name: 'Not spam' })).toHaveLength(1)
  }
}

export const WebmailAccountSwitch: Story = {
  name: 'Webmail / account switch via RPC',
  args: {
    routeSearch: { accountId: 'assistant@second.example' }
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceAssistantAccountView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findAllByText('Assistant account handoff')).toHaveLength(2)
    await expect(await canvas.findByText('Assistant')).toBeInTheDocument()
  }
}

export const WebmailLoading: Story = {
  name: 'Webmail / loading via RPC',
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      pending: true,
      view: mailWorkspaceReadyView
    })
}

export const WebmailError: Story = {
  name: 'Webmail / backend error via RPC',
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      error: new Error('The mail workspace RPC returned HTTP 403.'),
      view: mailWorkspaceReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Mailbox unavailable')).toBeInTheDocument()
    await expect(await canvas.findAllByText('The mail workspace RPC returned HTTP 403.')).toHaveLength(2)
  }
}

export const MailboxAdminAccounts: Story = {
  name: 'Mailbox admin / accounts via RPC',
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    await expect(await canvas.findByText('research@agentteam.example')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New account' })).toBeEnabled()
  }
}

export const MailboxAdminAccountsPagination: Story = {
  name: 'Mailbox admin / accounts pagination via RPC',
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: {
        ...mailboxAdminPaginatedAccountsView,
        pagination: {
          filteredRecords: mailboxAdminPaginatedAccountsView.accounts.length,
          page: 1,
          pageSize: 25,
          totalRecords: mailboxAdminPaginatedAccountsView.accounts.length
        }
      }
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('team-01@agentteam.example')).toBeInTheDocument()
    await expect(await canvas.findByText('Showing 1-25 of 42 records')).toBeInTheDocument()
    await expect(await canvas.findByText('Page 1 of 2')).toBeInTheDocument()
    await expect(canvas.queryByText('team-42@agentteam.example')).not.toBeInTheDocument()
  }
}

export const MailboxAdminAccountsSearch: Story = {
  name: 'Mailbox admin / accounts search via RPC',
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    const searchInput = await canvas.findByPlaceholderText('Search accounts...')

    await userEvent.type(searchInput, 'ops')

    await expect(await canvas.findByText('ops@agentteam.example')).toBeInTheDocument()
    await expect(await canvas.findByText('1 of 5 records')).toBeInTheDocument()
    await waitFor(async () => {
      await expect(canvas.queryByText('research@agentteam.example')).not.toBeInTheDocument()
    })
  }
}

export const MailboxAdminGroups: Story = {
  name: 'Mailbox admin / groups via RPC',
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Forwarding groups' })).toBeInTheDocument()
    await expect(await canvas.findByText('support@agentteam.example')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New group' })).toBeEnabled()
  }
}

export const MailboxAdminAgents: Story = {
  name: 'Mailbox admin / agents via RPC',
  args: {
    routeSearch: { mailboxAdmin: 'agents' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Agents' })).toBeInTheDocument()
    await expect(await canvas.findByText('Research Agent')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New agent' })).toBeEnabled()
  }
}

export const MailboxAdminConnectedClients: Story = {
  name: 'Mailbox admin / connected clients via RPC',
  args: {
    routeSearch: { mailboxAdmin: 'agents' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminExternalPrincipalsOnlyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Connected clients')).toBeInTheDocument()
    await expect(await canvas.findByText('Operations API key')).toBeInTheDocument()
    await expect(await canvas.findByText('Paperclip OAuth client')).toBeInTheDocument()
  }
}

export const MailboxAdminReadOnly: Story = {
  name: 'Mailbox admin / read only via RPC',
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadOnlyAccountsView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New account' })).toBeDisabled()
  }
}

export const MailboxAdminGroupsOnly: Story = {
  name: 'Mailbox admin / groups-only permissions via RPC',
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminGroupsOnlyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Forwarding groups' })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New group' })).toBeEnabled()
  }
}

export const MailboxAdminEmpty: Story = {
  name: 'Mailbox admin / empty via RPC',
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminEmptyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('No accounts')).toBeInTheDocument()
  }
}

export const MailboxAdminLoading: Story = {
  name: 'Mailbox admin / loading via RPC',
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      pending: true,
      view: mailboxAdminReadyView
    })
}

export const MailboxAdminForbidden: Story = {
  name: 'Mailbox admin / forbidden via RPC',
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      error: new Error('Mailbox administration is forbidden.'),
      navigation: { allowedSections: [] },
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Mailbox administration unavailable')).toBeInTheDocument()
    await expect(await canvas.findAllByText('Mailbox administration is forbidden.')).toHaveLength(2)
  }
}

export const MailboxAdminError: Story = {
  name: 'Mailbox admin / backend error via RPC',
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      error: new Error('The mailbox administration RPC returned HTTP 502 while loading accounts.'),
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Mailbox administration unavailable')).toBeInTheDocument()
    await expect(
      await canvas.findByText('The mailbox administration RPC returned HTTP 502 while loading accounts.')
    ).toBeInTheDocument()
  }
}

function renderMailWorkspaceControllerStory(
  args: React.ComponentProps<typeof DashboardMailController>,
  options: {
    error?: Error
    pending?: boolean
    view: AgentMailWebWorkspace
  }
) {
  return (
    <DashboardMailControllerStory
      {...args}
      mailWorkspaceLoader={createStoryMailWorkspaceLoader(options)}
      mailboxAdminNavigationLoader={createStoryMailboxAdminNavigationLoader({
        allowedSections: mailboxAdminReadyView.allowedSections
      })}
    />
  )
}

function renderMailboxAdminControllerStory(
  args: React.ComponentProps<typeof DashboardMailController>,
  options: {
    error?: Error
    navigation?: AgentMailAdminNavigation
    pending?: boolean
    view: AgentMailAdminView
  }
) {
  return (
    <DashboardMailControllerStory
      {...args}
      mailboxAdminNavigationLoader={createStoryMailboxAdminNavigationLoader(
        options.navigation ?? { allowedSections: options.view.allowedSections }
      )}
      mailboxAdminViewLoader={createStoryMailboxAdminViewLoader(options)}
    />
  )
}

function DashboardMailControllerStory(props: React.ComponentProps<typeof DashboardMailController>) {
  const queryClient = React.useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false
          }
        }
      }),
    []
  )

  React.useEffect(
    () => () => {
      queryClient.clear()
    },
    [queryClient]
  )

  return (
    <QueryClientProvider client={queryClient}>
      <DashboardMailController
        {...props}
        agentAccessViewLoader={loadStoryAgentAccessView}
      />
    </QueryClientProvider>
  )
}

async function loadStoryAgentAccessView() {
  return agentAccessActionableState.view
}

function createStoryMailWorkspaceLoader({
  error,
  pending,
  view
}: {
  error?: Error
  pending?: boolean
  view: AgentMailWebWorkspace
}) {
  return async (query: MailWorkspaceQuery) => {
    if (pending) {
      await new Promise(() => {})
    }

    if (error) {
      throw error
    }

    return mailWorkspaceForQuery(view, query)
  }
}

function createStoryMailboxAdminNavigationLoader(navigation: AgentMailAdminNavigation) {
  return async () => navigation
}

function createStoryMailboxAdminViewLoader({
  error,
  pending,
  view
}: {
  error?: Error
  pending?: boolean
  view: AgentMailAdminView
}) {
  return async (query: MailboxAdminViewQuery) => {
    if (pending) {
      await new Promise(() => {})
    }

    if (error) {
      throw error
    }

    return mailboxAdminViewForQuery(view, query)
  }
}

function countMailboxAdminRecords(view: AgentMailAdminView, section: MailboxAdminSectionId) {
  if (section === 'accounts') {
    return view.accounts.length
  }

  if (section === 'groups') {
    return view.groups.length
  }

  return view.agents.length + view.pendingEnrollments.length + view.principals.length
}

function mailboxAdminViewForQuery(
  view: AgentMailAdminView,
  query: MailboxAdminViewQuery
): AgentMailAdminView {
  const section = query.section ?? view.section
  const searchQuery = query.searchQuery ?? ''
  const statusFilter = query.statusFilter ?? view.statusFilter ?? 'all'
  const totalRecords = countMailboxAdminRecords(view, section)
  const filteredRecords = getMailboxAdminVisibleRecordsForView({
    ...view,
    pagination: undefined,
    searchQuery,
    section,
    statusFilter
  } satisfies MailboxAdminView)
  const filteredRecordCount = countMailboxAdminRecordSet(filteredRecords, section)
  const pageSize = Math.max(1, query.pageSize ?? view.pagination?.pageSize ?? 25)
  const totalPages = Math.max(1, Math.ceil(filteredRecordCount / pageSize))
  const page = Math.min(Math.max(1, query.page ?? view.pagination?.page ?? 1), totalPages)
  const pagedRecords = paginateMailboxAdminRecords(filteredRecords, section, page, pageSize)

  return {
    ...view,
    accounts: section === 'accounts' ? pagedRecords.accounts : view.accounts,
    agents: section === 'agents' ? pagedRecords.agents : view.agents,
    groups: section === 'groups' ? pagedRecords.groups : view.groups,
    pendingEnrollments: section === 'agents' ? pagedRecords.pendingEnrollments : view.pendingEnrollments,
    pagination: {
      filteredRecords: filteredRecordCount,
      page,
      pageSize,
      totalRecords
    },
    principals: section === 'agents' ? pagedRecords.principals : view.principals,
    searchQuery,
    section,
    statusFilter
  }
}

function countMailboxAdminRecordSet(
  records: Pick<AgentMailAdminView, 'accounts' | 'agents' | 'groups' | 'pendingEnrollments' | 'principals'>,
  section: MailboxAdminSectionId
) {
  if (section === 'accounts') {
    return records.accounts.length
  }

  if (section === 'groups') {
    return records.groups.length
  }

  return records.agents.length + records.pendingEnrollments.length + records.principals.length
}

function paginateMailboxAdminRecords(
  records: Pick<AgentMailAdminView, 'accounts' | 'agents' | 'groups' | 'pendingEnrollments' | 'principals'>,
  section: MailboxAdminSectionId,
  page: number,
  pageSize: number
): Pick<AgentMailAdminView, 'accounts' | 'agents' | 'groups' | 'pendingEnrollments' | 'principals'> {
  const startIndex = (page - 1) * pageSize

  if (section === 'accounts') {
    return {
      ...records,
      accounts: records.accounts.slice(startIndex, startIndex + pageSize)
    }
  }

  if (section === 'groups') {
    return {
      ...records,
      groups: records.groups.slice(startIndex, startIndex + pageSize)
    }
  }

  const agentRecords = records.agents.map((agent) => ({ agent, type: 'agent' as const }))
  const pendingEnrollmentRecords = records.pendingEnrollments.map((pendingEnrollment) => ({
    pendingEnrollment,
    type: 'pendingEnrollment' as const
  }))
  const principalRecords = records.principals.map((principal) => ({
    principal,
    type: 'principal' as const
  }))
  const pagedRecords = [...agentRecords, ...pendingEnrollmentRecords, ...principalRecords].slice(
    startIndex,
    startIndex + pageSize
  )

  return {
    ...records,
    agents: pagedRecords.flatMap((record) => (record.type === 'agent' ? [record.agent] : [])),
    pendingEnrollments: pagedRecords.flatMap((record) =>
      record.type === 'pendingEnrollment' ? [record.pendingEnrollment] : []
    ),
    principals: pagedRecords.flatMap((record) => (record.type === 'principal' ? [record.principal] : []))
  }
}

function mailWorkspaceForQuery(
  view: AgentMailWebWorkspace,
  query: MailWorkspaceQuery
): AgentMailWebWorkspace {
  const activeAccountId = query.accountId ?? view.activeAccountId
  const activeFolderId = query.folderId ?? view.activeFolderId
  const selectedMessage =
    query.messageId && view.selectedMessage?.id !== query.messageId ? null : view.selectedMessage

  return {
    ...view,
    activeAccountId,
    activeFolderId,
    selectedMessage
  }
}
