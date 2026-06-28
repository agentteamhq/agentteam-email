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
  title: 'Mocks/Mail Admin/Accounts'
} satisfies Meta<typeof mailAdminMockStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Accounts: Story = {
  ...AccountsStory,
  name: 'table'
}

export const AccountCreateDialog: Story = {
  ...AccountCreateDialogStory,
  name: 'create dialog'
}

export const AccountEditDialog: Story = {
  ...AccountEditDialogStory,
  name: 'edit dialog'
}

export const AccountDisableSaving: Story = {
  ...AccountDisableSavingStory,
  name: 'disable saving'
}

export const AccountsPendingStatusFilter: Story = {
  ...AccountsPendingStatusFilterStory,
  name: 'pending status filter'
}

export const AccountsSearchNoResults: Story = {
  ...AccountsSearchNoResultsStory,
  name: 'search no results'
}

export const AccountsReadOnly: Story = {
  ...AccountsReadOnlyStory,
  name: 'read only'
}

export const AccountsPaginated: Story = {
  ...AccountsPaginatedStory,
  name: 'paginated'
}
