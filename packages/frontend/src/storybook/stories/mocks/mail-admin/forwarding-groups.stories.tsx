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
  title: 'Mocks/Mail Admin/Forwarding Groups'
} satisfies Meta<typeof mailAdminMockStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Groups: Story = {
  ...GroupsStory,
  name: 'list'
}

export const GroupsOnlyAccess: Story = {
  ...GroupsOnlyAccessStory,
  name: 'only access'
}

export const GroupsPendingStatusFilter: Story = {
  ...GroupsPendingStatusFilterStory,
  name: 'pending status filter'
}

export const GroupsStatusNoResults: Story = {
  ...GroupsStatusNoResultsStory,
  name: 'status no results'
}

export const GroupEditDialog: Story = {
  ...GroupEditDialogStory,
  name: 'edit dialog'
}

export const GroupRecipientsSheet: Story = {
  ...GroupRecipientsSheetStory,
  name: 'recipients sheet'
}

export const GroupRecipientsSaving: Story = {
  ...GroupRecipientsSavingStory,
  name: 'recipients saving'
}

export const GroupsLoading: Story = {
  ...GroupsLoadingStory,
  name: 'loading'
}

export const GroupsEmpty: Story = {
  ...GroupsEmptyStory,
  name: 'empty'
}
