import {
  AccountCreateDialog as AccountCreateDialogStory,
  AccountDisableSaving as AccountDisableSavingStory,
  AccountEditDialog as AccountEditDialogStory,
  AccountsPaginated as AccountsPaginatedStory,
  AccountsPendingStatusFilter as AccountsPendingStatusFilterStory,
  AccountsReadOnly as AccountsReadOnlyStory,
  AccountsSearchNoResults as AccountsSearchNoResultsStory,
  Accounts as AccountsStory,
  mailAdminMockStoryMeta
} from '../../mail-admin-mocks.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailAdminMockStoryMeta,
  title: 'Screens/Mail Admin/Accounts'
} satisfies Meta<typeof mailAdminMockStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Accounts: Story = {
  ...AccountsStory,
  name: 'Table'
}

export const AccountCreateDialog: Story = {
  ...AccountCreateDialogStory,
  name: 'Create dialog'
}

export const AccountEditDialog: Story = {
  ...AccountEditDialogStory,
  name: 'Edit dialog'
}

export const AccountDisableSaving: Story = {
  ...AccountDisableSavingStory,
  name: 'Disable saving'
}

export const AccountsPendingStatusFilter: Story = {
  ...AccountsPendingStatusFilterStory,
  name: 'Pending status filter'
}

export const AccountsSearchNoResults: Story = {
  ...AccountsSearchNoResultsStory,
  name: 'Search no results'
}

export const AccountsReadOnly: Story = {
  ...AccountsReadOnlyStory,
  name: 'Read only'
}

export const AccountsPaginated: Story = {
  ...AccountsPaginatedStory,
  name: 'Paginated'
}
