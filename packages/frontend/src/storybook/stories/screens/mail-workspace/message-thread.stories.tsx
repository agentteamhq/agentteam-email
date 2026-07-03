import {
  ConversationThreadAttachments as ConversationThreadAttachmentsStory,
  ConversationThreadCollapsedMiddle as ConversationThreadCollapsedMiddleStory,
  ConversationThreadLong as ConversationThreadLongStory,
  ConversationThread as ConversationThreadStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Message - Thread'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const ConversationThread: Story = {
  ...ConversationThreadStory,
  name: 'Conversation thread'
}

export const ConversationThreadCollapsedMiddle: Story = {
  ...ConversationThreadCollapsedMiddleStory,
  name: 'Collapsed middle message'
}

export const ConversationThreadLong: Story = {
  ...ConversationThreadLongStory,
  name: 'Long conversation thread'
}

export const ConversationThreadAttachments: Story = {
  ...ConversationThreadAttachmentsStory,
  name: 'Thread attachments'
}
