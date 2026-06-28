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
} from '../mail-dashboard-controller.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...dashboardMailControllerStoryMeta,
  title: 'Controllers/Mail Admin'
} satisfies Meta<typeof dashboardMailControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MailboxAdminAccounts: Story = {
  ...MailboxAdminAccountsStory,
  name: 'accounts'
}

export const MailboxAdminAccountsPagination: Story = {
  ...MailboxAdminAccountsPaginationStory,
  name: 'accounts pagination'
}

export const MailboxAdminAccountsSearch: Story = {
  ...MailboxAdminAccountsSearchStory,
  name: 'accounts search'
}

export const MailboxAdminGroups: Story = {
  ...MailboxAdminGroupsStory,
  name: 'groups'
}

export const MailboxAdminAgents: Story = {
  ...MailboxAdminAgentsStory,
  name: 'agents'
}

export const MailboxAdminConnectedClients: Story = {
  ...MailboxAdminConnectedClientsStory,
  name: 'connected clients'
}

export const MailboxAdminReadOnly: Story = {
  ...MailboxAdminReadOnlyStory,
  name: 'read only'
}

export const MailboxAdminGroupsOnly: Story = {
  ...MailboxAdminGroupsOnlyStory,
  name: 'groups-only permissions'
}

export const MailboxAdminEmpty: Story = {
  ...MailboxAdminEmptyStory,
  name: 'empty'
}

export const MailboxAdminLoading: Story = {
  ...MailboxAdminLoadingStory,
  name: 'loading'
}

export const MailboxAdminForbidden: Story = {
  ...MailboxAdminForbiddenStory,
  name: 'forbidden'
}

export const MailboxAdminError: Story = {
  ...MailboxAdminErrorStory,
  name: 'backend error'
}
