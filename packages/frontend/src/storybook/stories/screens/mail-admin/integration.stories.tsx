import {
  MailboxAdminAccountsPagination as MailboxAdminAccountsPaginationStory,
  MailboxAdminAccountsPendingStatusFilter as MailboxAdminAccountsPendingStatusFilterStory,
  MailboxAdminAccountsSearchNoResults as MailboxAdminAccountsSearchNoResultsStory,
  MailboxAdminAccountsSearch as MailboxAdminAccountsSearchStory,
  MailboxAdminAccounts as MailboxAdminAccountsStory,
  MailboxAdminAgentsDisabledStatusFilter as MailboxAdminAgentsDisabledStatusFilterStory,
  MailboxAdminAgentsPendingEnrollments as MailboxAdminAgentsPendingEnrollmentsStory,
  MailboxAdminAgents as MailboxAdminAgentsStory,
  MailboxAdminAgentsWithoutGrantManagement as MailboxAdminAgentsWithoutGrantManagementStory,
  MailboxAdminConnectedClients as MailboxAdminConnectedClientsStory,
  MailboxAdminEmpty as MailboxAdminEmptyStory,
  MailboxAdminError as MailboxAdminErrorStory,
  MailboxAdminForbidden as MailboxAdminForbiddenStory,
  MailboxAdminGroupsEmpty as MailboxAdminGroupsEmptyStory,
  MailboxAdminGroupsLoading as MailboxAdminGroupsLoadingStory,
  MailboxAdminGroupsOnly as MailboxAdminGroupsOnlyStory,
  MailboxAdminGroupsPendingStatusFilter as MailboxAdminGroupsPendingStatusFilterStory,
  MailboxAdminGroupsStatusNoResults as MailboxAdminGroupsStatusNoResultsStory,
  MailboxAdminGroups as MailboxAdminGroupsStory,
  MailboxAdminLoading as MailboxAdminLoadingStory,
  MailboxAdminReadOnly as MailboxAdminReadOnlyStory,
  dashboardMailControllerStoryMeta
} from '../../mail-dashboard-controller.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...dashboardMailControllerStoryMeta,
  title: 'Screens/Mail Admin/Integration'
} satisfies Meta<typeof dashboardMailControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MailboxAdminAccounts: Story = {
  ...MailboxAdminAccountsStory,
  name: 'RPC accounts load'
}

export const MailboxAdminAccountsPagination: Story = {
  ...MailboxAdminAccountsPaginationStory,
  name: 'RPC accounts pagination'
}

export const MailboxAdminAccountsSearch: Story = {
  ...MailboxAdminAccountsSearchStory,
  name: 'RPC accounts search'
}

export const MailboxAdminAccountsPendingStatusFilter: Story = {
  ...MailboxAdminAccountsPendingStatusFilterStory,
  name: 'RPC accounts pending status filter'
}

export const MailboxAdminAccountsSearchNoResults: Story = {
  ...MailboxAdminAccountsSearchNoResultsStory,
  name: 'RPC accounts search no results'
}

export const MailboxAdminGroups: Story = {
  ...MailboxAdminGroupsStory,
  name: 'Section route search groups'
}

export const MailboxAdminGroupsPendingStatusFilter: Story = {
  ...MailboxAdminGroupsPendingStatusFilterStory,
  name: 'RPC groups pending status filter'
}

export const MailboxAdminGroupsStatusNoResults: Story = {
  ...MailboxAdminGroupsStatusNoResultsStory,
  name: 'RPC groups status no results'
}

export const MailboxAdminAgents: Story = {
  ...MailboxAdminAgentsStory,
  name: 'Section route search agents'
}

export const MailboxAdminAgentsDisabledStatusFilter: Story = {
  ...MailboxAdminAgentsDisabledStatusFilterStory,
  name: 'RPC agents disabled status filter'
}

export const MailboxAdminAgentsWithoutGrantManagement: Story = {
  ...MailboxAdminAgentsWithoutGrantManagementStory,
  name: 'RPC agents without grant management'
}

export const MailboxAdminAgentsPendingEnrollments: Story = {
  ...MailboxAdminAgentsPendingEnrollmentsStory,
  name: 'RPC agents pending enrollments'
}

export const MailboxAdminConnectedClients: Story = {
  ...MailboxAdminConnectedClientsStory,
  name: 'RPC connected clients'
}

export const MailboxAdminReadOnly: Story = {
  ...MailboxAdminReadOnlyStory,
  name: 'RPC read-only permissions'
}

export const MailboxAdminGroupsOnly: Story = {
  ...MailboxAdminGroupsOnlyStory,
  name: 'RPC groups-only permissions'
}

export const MailboxAdminEmpty: Story = {
  ...MailboxAdminEmptyStory,
  name: 'RPC empty state'
}

export const MailboxAdminGroupsEmpty: Story = {
  ...MailboxAdminGroupsEmptyStory,
  name: 'RPC groups empty state'
}

export const MailboxAdminLoading: Story = {
  ...MailboxAdminLoadingStory,
  name: 'RPC pending'
}

export const MailboxAdminGroupsLoading: Story = {
  ...MailboxAdminGroupsLoadingStory,
  name: 'RPC groups pending'
}

export const MailboxAdminForbidden: Story = {
  ...MailboxAdminForbiddenStory,
  name: 'RPC forbidden'
}

export const MailboxAdminError: Story = {
  ...MailboxAdminErrorStory,
  name: 'RPC backend error'
}
