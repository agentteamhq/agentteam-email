import * as React from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'

import {
  authenticatedSectionBaseArgs,
  domainSettingsEmptyFirstUseState
} from '../storybook/authenticated-section-fixtures'
import {
  mailboxAdminAgentAccountsSavingView,
  mailboxAdminAgentAccountsView,
  mailboxAdminAgentPermissionsSavingView,
  mailboxAdminAgentPermissionsView,
  mailboxAdminAgentsNoGrantManagementView,
  mailboxAdminCreateAccountView,
  mailboxAdminCreateAgentEnrollmentView,
  mailboxAdminCreateAgentSavingView,
  mailboxAdminCreateAgentView,
  mailboxAdminDisableAccountSavingView,
  mailboxAdminDisabledAgentsView,
  mailboxAdminEditAccountView,
  mailboxAdminEditAgentSavingView,
  mailboxAdminEditAgentView,
  mailboxAdminEditGroupView,
  mailboxAdminEmptyView,
  mailboxAdminErrorView,
  mailboxAdminExternalPrincipalsOnlyView,
  mailboxAdminForbiddenView,
  mailboxAdminGroupRecipientsSavingView,
  mailboxAdminGroupRecipientsView,
  mailboxAdminGroupsEmptyView,
  mailboxAdminGroupsLoadingView,
  mailboxAdminGroupsOnlyView,
  mailboxAdminLoadingView,
  mailboxAdminNoStatusResultsView,
  mailboxAdminPaginatedAccountsView,
  mailboxAdminPendingAccountsView,
  mailboxAdminPendingAgentEnrollmentCannotRevokeView,
  mailboxAdminPendingAgentEnrollmentRevokingView,
  mailboxAdminPendingAgentEnrollmentsView,
  mailboxAdminPendingGroupsView,
  mailboxAdminPrincipalAccountsSavingView,
  mailboxAdminPrincipalAccountsView,
  mailboxAdminPrincipalPermissionsSavingView,
  mailboxAdminPrincipalPermissionsView,
  mailboxAdminProvisionAccountSavingView,
  mailboxAdminProvisionAccountView,
  mailboxAdminReadOnlyAccountsView,
  mailboxAdminReadyView,
  mailboxAdminSearchNoResultsView,
  mailboxAdminSidebarView
} from '../storybook/mailbox-admin-fixtures'
import { DashboardScreen } from './dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mock/Mail Client/Mailbox Administration',
  component: DashboardScreen,
  tags: ['mock'],
  args: {
    ...authenticatedSectionBaseArgs,
    domainSettingsState: domainSettingsEmptyFirstUseState,
    mailboxAdminView: mailboxAdminReadyView,
    settingsOpen: false,
    sidebarView: mailboxAdminSidebarView('accounts')
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

function storyBody(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body)
}

function MailboxAdminPaginatedStory(args: React.ComponentProps<typeof DashboardScreen>) {
  const [page, setPage] = React.useState(args.mailboxAdminView?.pagination?.page ?? 1)
  const onPageChange = args.mailboxAdminView?.onPageChange
  const mailboxAdminView = React.useMemo(
    () =>
      args.mailboxAdminView
        ? {
            ...args.mailboxAdminView,
            onPageChange: (nextPage: number) => {
              setPage(nextPage)
              onPageChange?.(nextPage)
            },
            pagination: {
              page,
              pageSize: args.mailboxAdminView.pagination?.pageSize ?? 10
            }
          }
        : undefined,
    [args.mailboxAdminView, onPageChange, page]
  )

  return (
    <DashboardScreen
      {...args}
      mailboxAdminView={mailboxAdminView}
    />
  )
}

export const Accounts: Story = {
  name: 'Mock / accounts table',
  args: {
    mailboxAdminView: mailboxAdminReadyView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountCreateDialog: Story = {
  name: 'Mock / account create dialog',
  args: {
    mailboxAdminView: mailboxAdminCreateAccountView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountEditDialog: Story = {
  name: 'Mock / account edit dialog',
  args: {
    mailboxAdminView: mailboxAdminEditAccountView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountDisableSaving: Story = {
  name: 'Mock / account disable saving',
  args: {
    mailboxAdminView: mailboxAdminDisableAccountSavingView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountsPendingStatusFilter: Story = {
  name: 'Mock / accounts pending status filter',
  args: {
    mailboxAdminView: mailboxAdminPendingAccountsView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountsSearchNoResults: Story = {
  name: 'Mock / accounts search no results',
  args: {
    mailboxAdminView: mailboxAdminSearchNoResultsView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountsReadOnly: Story = {
  name: 'Mock / accounts read only',
  args: {
    mailboxAdminView: mailboxAdminReadOnlyAccountsView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountsPaginated: Story = {
  name: 'Mock / accounts paginated',
  args: {
    mailboxAdminView: {
      ...mailboxAdminPaginatedAccountsView,
      onPageChange: fn()
    },
    sidebarView: mailboxAdminSidebarView('accounts')
  },
  render: MailboxAdminPaginatedStory,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Showing 11-20 of 42 records')).toBeInTheDocument()
    await expect(await canvas.findByText('Page 2 of 5')).toBeInTheDocument()

    await userEvent.click(await canvas.findByRole('button', { name: /^previous$/i }))
    await expect(args.mailboxAdminView?.onPageChange).toHaveBeenCalledWith(1)
    await expect(await canvas.findByText('Page 1 of 5')).toBeInTheDocument()

    await userEvent.click(await canvas.findByRole('button', { name: /^next$/i }))
    await expect(args.mailboxAdminView?.onPageChange).toHaveBeenCalledWith(2)
  }
}

export const Groups: Story = {
  name: 'Mock / forwarding groups',
  args: {
    mailboxAdminView: {
      ...mailboxAdminReadyView,
      section: 'groups'
    },
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupsOnlyAccess: Story = {
  name: 'Mock / forwarding groups only access',
  args: {
    mailboxAdminView: mailboxAdminGroupsOnlyView,
    sidebarView: {
      ...mailboxAdminSidebarView('groups'),
      managementNav: (mailboxAdminSidebarView('groups').managementNav ?? []).filter(
        (item) => item.id === 'groups'
      )
    }
  }
}

export const GroupsPendingStatusFilter: Story = {
  name: 'Mock / forwarding groups pending status filter',
  args: {
    mailboxAdminView: mailboxAdminPendingGroupsView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupsStatusNoResults: Story = {
  name: 'Mock / forwarding groups status no results',
  args: {
    mailboxAdminView: mailboxAdminNoStatusResultsView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupEditDialog: Story = {
  name: 'Mock / forwarding group edit dialog',
  args: {
    mailboxAdminView: mailboxAdminEditGroupView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupRecipientsSheet: Story = {
  name: 'Mock / forwarding group recipients sheet',
  args: {
    mailboxAdminView: mailboxAdminGroupRecipientsView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupRecipientsSaving: Story = {
  name: 'Mock / forwarding group recipients saving',
  args: {
    mailboxAdminView: mailboxAdminGroupRecipientsSavingView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupsLoading: Story = {
  name: 'Mock / forwarding groups loading',
  args: {
    mailboxAdminView: mailboxAdminGroupsLoadingView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupsEmpty: Story = {
  name: 'Mock / forwarding groups empty',
  args: {
    mailboxAdminView: mailboxAdminGroupsEmptyView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const Agents: Story = {
  name: 'Mock / agents table',
  args: {
    mailboxAdminView: {
      ...mailboxAdminReadyView,
      section: 'agents'
    },
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentsDisabledStatusFilter: Story = {
  name: 'Mock / agents disabled status filter',
  args: {
    mailboxAdminView: mailboxAdminDisabledAgentsView,
    sidebarView: mailboxAdminSidebarView('agents')
  },
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^open actions for legacy writer$/i }))
    await expect(await canvas.findByRole('menuitem', { name: /^disable agent$/i })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  }
}

export const AgentsWithoutGrantManagement: Story = {
  name: 'Mock / agents without grant management',
  args: {
    mailboxAdminView: mailboxAdminAgentsNoGrantManagementView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentsExternalPrincipalsOnly: Story = {
  name: 'Mock / agents external principals only',
  args: {
    mailboxAdminView: mailboxAdminExternalPrincipalsOnlyView,
    sidebarView: mailboxAdminSidebarView('agents')
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Connected clients')).toBeInTheDocument()
    await expect(await canvas.findByText('Operations API key')).toBeInTheDocument()
  }
}

export const AgentsPendingEnrollments: Story = {
  name: 'Mock / agents pending enrollments',
  args: {
    mailboxAdminView: {
      ...mailboxAdminPendingAgentEnrollmentsView,
      onRevokeAgentEnrollment: fn()
    },
    sidebarView: mailboxAdminSidebarView('agents')
  },
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Pending enrollments')).toBeInTheDocument()
    await expect((await canvas.findAllByText('Research Agent')).length).toBeGreaterThan(0)
    await userEvent.click(
      await canvas.findByRole('button', { name: /^open actions for pending enrollment research agent$/i })
    )
    await userEvent.click(await canvas.findByRole('menuitem', { name: /^cancel enrollment$/i }))
    await expect(args.mailboxAdminView?.onRevokeAgentEnrollment).toHaveBeenCalledWith(
      '2zPendingAgentEnrollment'
    )
  }
}

export const AgentEnrollmentCancelSaving: Story = {
  name: 'Mock / agent enrollment cancel saving',
  args: {
    mailboxAdminView: mailboxAdminPendingAgentEnrollmentRevokingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentEnrollmentCancelDenied: Story = {
  name: 'Mock / agent enrollment cancel denied',
  args: {
    mailboxAdminView: {
      ...mailboxAdminPendingAgentEnrollmentCannotRevokeView,
      onRevokeAgentEnrollment: fn()
    },
    sidebarView: mailboxAdminSidebarView('agents')
  },
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await userEvent.click(
      await canvas.findByRole('button', { name: /^open actions for pending enrollment research agent$/i })
    )
    const cancelItem = await canvas.findByRole('menuitem', { name: /^cancel enrollment$/i })

    await expect(cancelItem).toHaveAttribute('aria-disabled', 'true')
    await expect(args.mailboxAdminView?.onRevokeAgentEnrollment).not.toHaveBeenCalled()
  }
}

export const AgentCreateDialog: Story = {
  name: 'Mock / agent create dialog',
  args: {
    mailboxAdminView: mailboxAdminCreateAgentView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentCreateSaving: Story = {
  name: 'Mock / agent create saving',
  args: {
    mailboxAdminView: mailboxAdminCreateAgentSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentCreateEnrollment: Story = {
  name: 'Mock / agent enrollment created',
  args: {
    mailboxAdminView: {
      ...mailboxAdminCreateAgentEnrollmentView,
      onCopyAgentEnrollmentCommand: fn()
    },
    sidebarView: mailboxAdminSidebarView('agents')
  },
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('at-email agent enroll enroll_9sV8P2uL4dTq7mZc')).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^copy command$/i }))
    await expect(args.mailboxAdminView?.onCopyAgentEnrollmentCommand).toHaveBeenCalledWith(
      'at-email agent enroll enroll_9sV8P2uL4dTq7mZc'
    )
  }
}

export const AgentEditDialog: Story = {
  name: 'Mock / agent edit dialog',
  args: {
    mailboxAdminView: mailboxAdminEditAgentView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentEditSaving: Story = {
  name: 'Mock / agent edit saving',
  args: {
    mailboxAdminView: mailboxAdminEditAgentSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentPermissionsDialog: Story = {
  name: 'Mock / agent system permissions dialog',
  args: {
    mailboxAdminView: mailboxAdminAgentPermissionsView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentPermissionsSaving: Story = {
  name: 'Mock / agent system permissions saving',
  args: {
    mailboxAdminView: mailboxAdminAgentPermissionsSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentAccountAccessSheet: Story = {
  name: 'Mock / agent account access sheet',
  args: {
    mailboxAdminView: mailboxAdminAgentAccountsView,
    sidebarView: mailboxAdminSidebarView('agents')
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: /^account access$/i }))
    await expect(await dialog.findByText('Available accounts')).toBeInTheDocument()
    await expect(await dialog.findByText('ops@agentteam.example')).toBeInTheDocument()
    await expect(dialog.queryByText('triage@agentteam.example')).not.toBeInTheDocument()
    await expect(dialog.queryByText('handoff@agentteam.example')).not.toBeInTheDocument()
  }
}

export const AgentAccountAccessSaving: Story = {
  name: 'Mock / agent account access saving',
  args: {
    mailboxAdminView: mailboxAdminAgentAccountsSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const PrincipalAccountAccessSheet: Story = {
  name: 'Mock / client account access sheet',
  args: {
    mailboxAdminView: mailboxAdminPrincipalAccountsView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const PrincipalAccountAccessSaving: Story = {
  name: 'Mock / client account access saving',
  args: {
    mailboxAdminView: mailboxAdminPrincipalAccountsSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const PrincipalPermissionsDialog: Story = {
  name: 'Mock / client system permissions dialog',
  args: {
    mailboxAdminView: mailboxAdminPrincipalPermissionsView,
    sidebarView: mailboxAdminSidebarView('agents')
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('button', { name: 'Save permissions' })).toBeEnabled()
  }
}

export const PrincipalPermissionsSaving: Story = {
  name: 'Mock / client system permissions saving',
  args: {
    mailboxAdminView: mailboxAdminPrincipalPermissionsSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentProvisionAccountDialog: Story = {
  name: 'Mock / agent provision account dialog',
  args: {
    mailboxAdminView: mailboxAdminProvisionAccountView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentProvisionAccountSaving: Story = {
  name: 'Mock / agent provision account saving',
  args: {
    mailboxAdminView: mailboxAdminProvisionAccountSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const Loading: Story = {
  name: 'Mock / loading',
  args: {
    mailboxAdminView: mailboxAdminLoadingView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const Empty: Story = {
  name: 'Mock / empty',
  args: {
    mailboxAdminView: mailboxAdminEmptyView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const BackendError: Story = {
  name: 'Mock / backend error',
  args: {
    mailboxAdminView: mailboxAdminErrorView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const Forbidden: Story = {
  name: 'Mock / forbidden',
  args: {
    mailboxAdminView: mailboxAdminForbiddenView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}
