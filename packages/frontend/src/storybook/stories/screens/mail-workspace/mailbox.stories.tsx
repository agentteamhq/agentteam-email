import {
  MailboxDefault as MailboxDefaultStory,
  MailboxEmpty as MailboxEmptyStory,
  MailboxError as MailboxErrorStory,
  MailboxLoading as MailboxLoadingStory,
  MailboxSearchEmpty as MailboxSearchEmptyStory,
  MailboxSearchFiltered as MailboxSearchFilteredStory,
  MailboxUnreadOnly as MailboxUnreadOnlyStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Mailbox'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

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
