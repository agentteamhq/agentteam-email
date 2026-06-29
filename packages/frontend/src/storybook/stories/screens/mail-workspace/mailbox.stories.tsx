import {
  MailboxDefault as MailboxDefaultStory,
  MailboxEmpty as MailboxEmptyStory,
  MailboxError as MailboxErrorStory,
  MailboxLoading as MailboxLoadingStory,
  MailboxRefreshing as MailboxRefreshingStory,
  MailboxSearchEmpty as MailboxSearchEmptyStory,
  MailboxSearchFiltered as MailboxSearchFilteredStory,
  MailboxThreadedMetadata as MailboxThreadedMetadataStory,
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
  name: 'Default'
}

export const MailboxLoading: Story = {
  ...MailboxLoadingStory,
  name: 'Loading'
}

export const MailboxRefreshing: Story = {
  ...MailboxRefreshingStory,
  name: 'Refreshing'
}

export const MailboxEmpty: Story = {
  ...MailboxEmptyStory,
  name: 'Empty'
}

export const MailboxError: Story = {
  ...MailboxErrorStory,
  name: 'Error'
}

export const MailboxSearchFiltered: Story = {
  ...MailboxSearchFilteredStory,
  name: 'Search filtered'
}

export const MailboxSearchEmpty: Story = {
  ...MailboxSearchEmptyStory,
  name: 'Search empty'
}

export const MailboxUnreadOnly: Story = {
  ...MailboxUnreadOnlyStory,
  name: 'Unread only'
}

export const MailboxThreadedMetadata: Story = {
  ...MailboxThreadedMetadataStory,
  name: 'Threaded metadata'
}
