import { expect, fn, userEvent, within } from 'storybook/test'

import {
  authenticatedSectionBaseArgs,
  domainSettingsEmptyFirstUseState
} from '../authenticated-section-fixtures'
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
} from '../mailbox-admin-fixtures'
import { DashboardScreen } from '../../screens/dashboard-screen'
import { MailboxAdminPaginatedStoryFrame } from './story-frames'
import type { Meta, StoryObj } from '@storybook/react'

export const mailAdminMockStoryMeta = {
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

type Story = StoryObj<typeof mailAdminMockStoryMeta>

function storyBody(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body)
}

export const Accounts: Story = {
  args: {
    mailboxAdminView: mailboxAdminReadyView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountCreateDialog: Story = {
  args: {
    mailboxAdminView: mailboxAdminCreateAccountView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountEditDialog: Story = {
  args: {
    mailboxAdminView: mailboxAdminEditAccountView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountDisableSaving: Story = {
  args: {
    mailboxAdminView: mailboxAdminDisableAccountSavingView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountsPendingStatusFilter: Story = {
  args: {
    mailboxAdminView: mailboxAdminPendingAccountsView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountsSearchNoResults: Story = {
  args: {
    mailboxAdminView: mailboxAdminSearchNoResultsView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountsReadOnly: Story = {
  args: {
    mailboxAdminView: mailboxAdminReadOnlyAccountsView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const AccountsPaginated: Story = {
  args: {
    mailboxAdminView: {
      ...mailboxAdminPaginatedAccountsView,
      onPageChange: fn()
    },
    sidebarView: mailboxAdminSidebarView('accounts')
  },
  render: MailboxAdminPaginatedStoryFrame,
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
  args: {
    mailboxAdminView: {
      ...mailboxAdminReadyView,
      section: 'groups'
    },
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupsOnlyAccess: Story = {
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
  args: {
    mailboxAdminView: mailboxAdminPendingGroupsView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupsStatusNoResults: Story = {
  args: {
    mailboxAdminView: mailboxAdminNoStatusResultsView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupEditDialog: Story = {
  args: {
    mailboxAdminView: mailboxAdminEditGroupView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupRecipientsSheet: Story = {
  args: {
    mailboxAdminView: mailboxAdminGroupRecipientsView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupRecipientsSaving: Story = {
  args: {
    mailboxAdminView: mailboxAdminGroupRecipientsSavingView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupsLoading: Story = {
  args: {
    mailboxAdminView: mailboxAdminGroupsLoadingView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const GroupsEmpty: Story = {
  args: {
    mailboxAdminView: mailboxAdminGroupsEmptyView,
    sidebarView: mailboxAdminSidebarView('groups')
  }
}

export const Agents: Story = {
  args: {
    mailboxAdminView: {
      ...mailboxAdminReadyView,
      section: 'agents'
    },
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentsDisabledStatusFilter: Story = {
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
  args: {
    mailboxAdminView: mailboxAdminAgentsNoGrantManagementView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentsExternalPrincipalsOnly: Story = {
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
  args: {
    mailboxAdminView: mailboxAdminPendingAgentEnrollmentRevokingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentEnrollmentCancelDenied: Story = {
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
  args: {
    mailboxAdminView: mailboxAdminCreateAgentView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentCreateSaving: Story = {
  args: {
    mailboxAdminView: mailboxAdminCreateAgentSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentCreateEnrollment: Story = {
  args: {
    mailboxAdminView: {
      ...mailboxAdminCreateAgentEnrollmentView,
      onCopyAgentEnrollmentCommand: fn()
    },
    sidebarView: mailboxAdminSidebarView('agents')
  },
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('at-email agent enroll enroll_AAAAAAAAAAAAAAAA')).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^copy command$/i }))
    await expect(args.mailboxAdminView?.onCopyAgentEnrollmentCommand).toHaveBeenCalledWith(
      'at-email agent enroll enroll_AAAAAAAAAAAAAAAA'
    )
  }
}

export const AgentEditDialog: Story = {
  args: {
    mailboxAdminView: mailboxAdminEditAgentView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentEditSaving: Story = {
  args: {
    mailboxAdminView: mailboxAdminEditAgentSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentPermissionsDialog: Story = {
  args: {
    mailboxAdminView: mailboxAdminAgentPermissionsView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentPermissionsSaving: Story = {
  args: {
    mailboxAdminView: mailboxAdminAgentPermissionsSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentAccountAccessSheet: Story = {
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
  args: {
    mailboxAdminView: mailboxAdminAgentAccountsSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const PrincipalAccountAccessSheet: Story = {
  args: {
    mailboxAdminView: mailboxAdminPrincipalAccountsView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const PrincipalAccountAccessSaving: Story = {
  args: {
    mailboxAdminView: mailboxAdminPrincipalAccountsSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const PrincipalPermissionsDialog: Story = {
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
  args: {
    mailboxAdminView: mailboxAdminPrincipalPermissionsSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentProvisionAccountDialog: Story = {
  args: {
    mailboxAdminView: mailboxAdminProvisionAccountView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const AgentProvisionAccountSaving: Story = {
  args: {
    mailboxAdminView: mailboxAdminProvisionAccountSavingView,
    sidebarView: mailboxAdminSidebarView('agents')
  }
}

export const Loading: Story = {
  args: {
    mailboxAdminView: mailboxAdminLoadingView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const Empty: Story = {
  args: {
    mailboxAdminView: mailboxAdminEmptyView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const BackendError: Story = {
  args: {
    mailboxAdminView: mailboxAdminErrorView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}

export const Forbidden: Story = {
  args: {
    mailboxAdminView: mailboxAdminForbiddenView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}
