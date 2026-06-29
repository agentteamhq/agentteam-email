import {
  MailboxAdminAccountsPagination as MailboxAdminAccountsPaginationStory,
  MailboxAdminAccountsSearch as MailboxAdminAccountsSearchStory,
  MailboxAdminAccounts as MailboxAdminAccountsStory,
  MailboxAdminAgents as MailboxAdminAgentsStory,
  MailboxAdminConnectedClients as MailboxAdminConnectedClientsStory,
  MailboxAdminEmpty as MailboxAdminEmptyStory,
  MailboxAdminError as MailboxAdminErrorStory,
  MailboxAdminForbidden as MailboxAdminForbiddenStory,
  MailboxAdminGroupsOnly as MailboxAdminGroupsOnlyStory,
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

export const MailboxAdminGroups: Story = {
  ...MailboxAdminGroupsStory,
  name: 'Section route search groups'
}

export const MailboxAdminAgents: Story = {
  ...MailboxAdminAgentsStory,
  name: 'Section route search agents'
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

export const MailboxAdminLoading: Story = {
  ...MailboxAdminLoadingStory,
  name: 'RPC pending'
}

export const MailboxAdminForbidden: Story = {
  ...MailboxAdminForbiddenStory,
  name: 'RPC forbidden'
}

export const MailboxAdminError: Story = {
  ...MailboxAdminErrorStory,
  name: 'RPC backend error'
}
