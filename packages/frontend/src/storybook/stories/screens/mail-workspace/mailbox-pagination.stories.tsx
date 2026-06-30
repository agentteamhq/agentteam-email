import {
  MailboxPaginationLoading as MailboxPaginationLoadingStory,
  MailboxPagination as MailboxPaginationStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Mailbox - Pagination'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

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
