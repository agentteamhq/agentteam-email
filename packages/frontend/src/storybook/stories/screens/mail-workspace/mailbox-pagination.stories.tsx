import {
  MailboxPaginationLoading as MailboxPaginationLoadingStory,
  MailboxPagination as MailboxPaginationStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Mailbox - Pagination'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MailboxPagination: Story = {
  ...MailboxPaginationStory,
  name: 'Cursor pagination'
}

export const MailboxPaginationLoading: Story = {
  ...MailboxPaginationLoadingStory,
  name: 'Cursor pagination loading'
}
