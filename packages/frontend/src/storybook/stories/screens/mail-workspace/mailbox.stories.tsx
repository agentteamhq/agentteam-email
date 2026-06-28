import {
  MailboxAccountPermissions as MailboxAccountPermissionsStory,
  MailboxAccountSwitchingResetsFilters as MailboxAccountSwitchingResetsFiltersStory,
  MailboxAccountSwitchingResetsFolder as MailboxAccountSwitchingResetsFolderStory,
  MailboxAccountSwitchingResetsSelection as MailboxAccountSwitchingResetsSelectionStory,
  MailboxAccountSwitching as MailboxAccountSwitchingStory,
  MailboxCreateFolderError as MailboxCreateFolderErrorStory,
  MailboxCreateFolderOpen as MailboxCreateFolderOpenStory,
  MailboxCreateFolder as MailboxCreateFolderStory,
  MailboxCreateFolderSubmitting as MailboxCreateFolderSubmittingStory,
  MailboxCustomFolder as MailboxCustomFolderStory,
  MailboxDefault as MailboxDefaultStory,
  MailboxDeleteFolderConfirm as MailboxDeleteFolderConfirmStory,
  MailboxDeleteFolderError as MailboxDeleteFolderErrorStory,
  MailboxDeleteFolderSubmitting as MailboxDeleteFolderSubmittingStory,
  MailboxEmpty as MailboxEmptyStory,
  MailboxError as MailboxErrorStory,
  MailboxFolderActions as MailboxFolderActionsStory,
  MailboxFolderNavigation as MailboxFolderNavigationStory,
  MailboxJunk as MailboxJunkStory,
  MailboxLoading as MailboxLoadingStory,
  MailboxPaginationLoading as MailboxPaginationLoadingStory,
  MailboxPagination as MailboxPaginationStory,
  MailboxProtectedFolderActions as MailboxProtectedFolderActionsStory,
  MailboxRefreshing as MailboxRefreshingStory,
  MailboxRenameFolderError as MailboxRenameFolderErrorStory,
  MailboxRenameFolderOpen as MailboxRenameFolderOpenStory,
  MailboxRenameFolderSubmitting as MailboxRenameFolderSubmittingStory,
  MailboxSearchEmpty as MailboxSearchEmptyStory,
  MailboxSearchFiltered as MailboxSearchFilteredStory,
  MailboxSent as MailboxSentStory,
  MailboxThreadedMetadata as MailboxThreadedMetadataStory,
  MailboxTrash as MailboxTrashStory,
  MailboxUnreadOnly as MailboxUnreadOnlyStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Mailbox'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MailboxDefault: Story = {
  ...MailboxDefaultStory,
  name: 'default'
}

export const MailboxLoading: Story = {
  ...MailboxLoadingStory,
  name: 'loading'
}

export const MailboxRefreshing: Story = {
  ...MailboxRefreshingStory,
  name: 'refreshing'
}

export const MailboxEmpty: Story = {
  ...MailboxEmptyStory,
  name: 'empty'
}

export const MailboxError: Story = {
  ...MailboxErrorStory,
  name: 'error'
}

export const MailboxSearchFiltered: Story = {
  ...MailboxSearchFilteredStory,
  name: 'search filtered'
}

export const MailboxSearchEmpty: Story = {
  ...MailboxSearchEmptyStory,
  name: 'search empty'
}

export const MailboxUnreadOnly: Story = {
  ...MailboxUnreadOnlyStory,
  name: 'unread only'
}

export const MailboxThreadedMetadata: Story = {
  ...MailboxThreadedMetadataStory,
  name: 'threaded metadata'
}

export const MailboxJunk: Story = {
  ...MailboxJunkStory,
  name: 'junk'
}

export const MailboxSent: Story = {
  ...MailboxSentStory,
  name: 'sent'
}

export const MailboxTrash: Story = {
  ...MailboxTrashStory,
  name: 'trash'
}

export const MailboxAccountSwitching: Story = {
  ...MailboxAccountSwitchingStory,
  name: 'account switching'
}

export const MailboxAccountSwitchingResetsSelection: Story = {
  ...MailboxAccountSwitchingResetsSelectionStory,
  name: 'account switching resets selection'
}

export const MailboxAccountSwitchingResetsFolder: Story = {
  ...MailboxAccountSwitchingResetsFolderStory,
  name: 'account switching resets folder'
}

export const MailboxAccountSwitchingResetsFilters: Story = {
  ...MailboxAccountSwitchingResetsFiltersStory,
  name: 'account switching resets filters'
}

export const MailboxAccountPermissions: Story = {
  ...MailboxAccountPermissionsStory,
  name: 'account permissions'
}

export const MailboxFolderNavigation: Story = {
  ...MailboxFolderNavigationStory,
  name: 'folder navigation'
}

export const MailboxCustomFolder: Story = {
  ...MailboxCustomFolderStory,
  name: 'custom folder'
}

export const MailboxCreateFolder: Story = {
  ...MailboxCreateFolderStory,
  name: 'create folder trigger'
}

export const MailboxCreateFolderOpen: Story = {
  ...MailboxCreateFolderOpenStory,
  name: 'create folder open'
}

export const MailboxCreateFolderSubmitting: Story = {
  ...MailboxCreateFolderSubmittingStory,
  name: 'create folder submitting'
}

export const MailboxCreateFolderError: Story = {
  ...MailboxCreateFolderErrorStory,
  name: 'create folder error'
}

export const MailboxFolderActions: Story = {
  ...MailboxFolderActionsStory,
  name: 'folder actions'
}

export const MailboxProtectedFolderActions: Story = {
  ...MailboxProtectedFolderActionsStory,
  name: 'protected folder actions'
}

export const MailboxRenameFolderOpen: Story = {
  ...MailboxRenameFolderOpenStory,
  name: 'rename folder open'
}

export const MailboxRenameFolderSubmitting: Story = {
  ...MailboxRenameFolderSubmittingStory,
  name: 'rename folder submitting'
}

export const MailboxRenameFolderError: Story = {
  ...MailboxRenameFolderErrorStory,
  name: 'rename folder error'
}

export const MailboxDeleteFolderConfirm: Story = {
  ...MailboxDeleteFolderConfirmStory,
  name: 'delete folder confirm'
}

export const MailboxDeleteFolderSubmitting: Story = {
  ...MailboxDeleteFolderSubmittingStory,
  name: 'delete folder submitting'
}

export const MailboxDeleteFolderError: Story = {
  ...MailboxDeleteFolderErrorStory,
  name: 'delete folder error'
}

export const MailboxPagination: Story = {
  ...MailboxPaginationStory,
  name: 'cursor pagination'
}

export const MailboxPaginationLoading: Story = {
  ...MailboxPaginationLoadingStory,
  name: 'cursor pagination loading'
}
