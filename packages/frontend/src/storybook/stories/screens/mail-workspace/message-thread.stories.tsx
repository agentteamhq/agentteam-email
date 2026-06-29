import {
  ConversationThreadMessageActions as ConversationThreadMessageActionsStory,
  ConversationThread as ConversationThreadStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Message - Thread'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const ConversationThread: Story = {
  ...ConversationThreadStory,
  name: 'Conversation thread'
}

export const ConversationThreadMessageActions: Story = {
  ...ConversationThreadMessageActionsStory,
  name: 'Conversation message actions'
}
