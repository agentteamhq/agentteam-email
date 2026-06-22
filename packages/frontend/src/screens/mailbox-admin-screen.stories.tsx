import {
  authenticatedSectionBaseArgs,
  domainSettingsEmptyFirstUseState
} from '../storybook/authenticated-section-fixtures'
import {
  mailboxAdminAgentAccountsView,
  mailboxAdminAgentPermissionsView,
  mailboxAdminCreateAccountView,
  mailboxAdminCreateAgentView,
  mailboxAdminDisabledAgentsView,
  mailboxAdminEditGroupView,
  mailboxAdminEmptyView,
  mailboxAdminGroupRecipientsView,
  mailboxAdminGroupsEmptyView,
  mailboxAdminGroupsLoadingView,
  mailboxAdminLimitedAccountsView,
  mailboxAdminLoadingView,
  mailboxAdminNoStatusResultsView,
  mailboxAdminPendingGroupsView,
  mailboxAdminProvisionAccountView,
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

export const AccountsLimitedStatusFilter: Story = {
  name: 'Mock / accounts limited status filter',
  args: {
    mailboxAdminView: mailboxAdminLimitedAccountsView,
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
  }
}

export const AgentCreateDialog: Story = {
  name: 'Mock / agent create dialog',
  args: {
    mailboxAdminView: mailboxAdminCreateAgentView,
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

export const AgentAccountAccessSheet: Story = {
  name: 'Mock / agent account access sheet',
  args: {
    mailboxAdminView: mailboxAdminAgentAccountsView,
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
