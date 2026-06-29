import {
  GroupEditDialog as GroupEditDialogStory,
  GroupRecipientsSaving as GroupRecipientsSavingStory,
  GroupRecipientsSheet as GroupRecipientsSheetStory,
  GroupsEmpty as GroupsEmptyStory,
  GroupsLoading as GroupsLoadingStory,
  GroupsOnlyAccess as GroupsOnlyAccessStory,
  GroupsPendingStatusFilter as GroupsPendingStatusFilterStory,
  GroupsStatusNoResults as GroupsStatusNoResultsStory,
  Groups as GroupsStory,
  mailAdminMockStoryMeta
} from '../../mail-admin-mocks.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailAdminMockStoryMeta,
  title: 'Screens/Mail Admin/Forwarding Groups'
} satisfies Meta<typeof mailAdminMockStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Groups: Story = {
  ...GroupsStory,
  name: 'List'
}

export const GroupsOnlyAccess: Story = {
  ...GroupsOnlyAccessStory,
  name: 'Only access'
}

export const GroupsPendingStatusFilter: Story = {
  ...GroupsPendingStatusFilterStory,
  name: 'Pending status filter'
}

export const GroupsStatusNoResults: Story = {
  ...GroupsStatusNoResultsStory,
  name: 'Status no results'
}

export const GroupEditDialog: Story = {
  ...GroupEditDialogStory,
  name: 'Edit dialog'
}

export const GroupRecipientsSheet: Story = {
  ...GroupRecipientsSheetStory,
  name: 'Recipients sheet'
}

export const GroupRecipientsSaving: Story = {
  ...GroupRecipientsSavingStory,
  name: 'Recipients saving'
}

export const GroupsLoading: Story = {
  ...GroupsLoadingStory,
  name: 'Loading'
}

export const GroupsEmpty: Story = {
  ...GroupsEmptyStory,
  name: 'Empty'
}
