import {
  MessageArchiveAction as MessageArchiveActionStory,
  MessageDeleteConfirm as MessageDeleteConfirmStory,
  MessageMarkNotSpam as MessageMarkNotSpamStory,
  MessageMoveDisabledTarget as MessageMoveDisabledTargetStory,
  MessageMoveTargetSelection as MessageMoveTargetSelectionStory,
  MessageMoveToSpam as MessageMoveToSpamStory,
  MessageToolbarControllerActions as MessageToolbarControllerActionsStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Message - Actions'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MessageToolbarControllerActions: Story = {
  ...MessageToolbarControllerActionsStory,
  name: 'Toolbar controller actions'
}

export const MessageArchiveAction: Story = {
  ...MessageArchiveActionStory,
  name: 'Archive action'
}

export const MessageMarkNotSpam: Story = {
  ...MessageMarkNotSpamStory,
  name: 'Mark not spam'
}

export const MessageMoveToSpam: Story = {
  ...MessageMoveToSpamStory,
  name: 'Move dialog'
}

export const MessageMoveTargetSelection: Story = {
  ...MessageMoveTargetSelectionStory,
  name: 'Move target selection'
}

export const MessageMoveDisabledTarget: Story = {
  ...MessageMoveDisabledTargetStory,
  name: 'Move disabled target'
}

export const MessageDeleteConfirm: Story = {
  ...MessageDeleteConfirmStory,
  name: 'Delete confirm'
}
