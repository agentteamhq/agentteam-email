import {
  MessageArchiveAction as MessageArchiveActionStory,
  MessageDeleteConfirm as MessageDeleteConfirmStory,
  MessageDeleteSubmitting as MessageDeleteSubmittingStory,
  MessageDisabledActions as MessageDisabledActionsStory,
  MessageMarkNotSpam as MessageMarkNotSpamStory,
  MessageMoveDisabledTarget as MessageMoveDisabledTargetStory,
  MessageMoveError as MessageMoveErrorStory,
  MessageMoveSubmitting as MessageMoveSubmittingStory,
  MessageMoveTargetSelection as MessageMoveTargetSelectionStory,
  MessageMoveToSpam as MessageMoveToSpamStory,
  MessagePendingAction as MessagePendingActionStory,
  MessageRestoreFromTrash as MessageRestoreFromTrashStory,
  MessageToolbarControllerActions as MessageToolbarControllerActionsStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Message - Actions'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

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

export const MessageDisabledActions: Story = {
  ...MessageDisabledActionsStory,
  name: 'Disabled toolbar action'
}

export const MessageMarkNotSpam: Story = {
  ...MessageMarkNotSpamStory,
  name: 'Mark not spam'
}

export const MessageRestoreFromTrash: Story = {
  ...MessageRestoreFromTrashStory,
  name: 'Restore from trash'
}

export const MessagePendingAction: Story = {
  ...MessagePendingActionStory,
  name: 'Pending action'
}

export const MessageMoveToSpam: Story = {
  ...MessageMoveToSpamStory,
  name: 'Move to spam'
}

export const MessageMoveTargetSelection: Story = {
  ...MessageMoveTargetSelectionStory,
  name: 'Move target selection'
}

export const MessageMoveDisabledTarget: Story = {
  ...MessageMoveDisabledTargetStory,
  name: 'Move disabled target'
}

export const MessageMoveSubmitting: Story = {
  ...MessageMoveSubmittingStory,
  name: 'Move submitting'
}

export const MessageMoveError: Story = {
  ...MessageMoveErrorStory,
  name: 'Move error'
}

export const MessageDeleteConfirm: Story = {
  ...MessageDeleteConfirmStory,
  name: 'Delete confirm'
}

export const MessageDeleteSubmitting: Story = {
  ...MessageDeleteSubmittingStory,
  name: 'Delete submitting'
}
