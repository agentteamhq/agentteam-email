import {
  ConversationThreadMessageActions as ConversationThreadMessageActionsStory,
  ConversationThread as ConversationThreadStory,
  DraftEditing as DraftEditingStory,
  DraftToolbarActions as DraftToolbarActionsStory,
  MessageAppointment as MessageAppointmentStory,
  MessageArchiveAction as MessageArchiveActionStory,
  MessageAttachments as MessageAttachmentsStory,
  MessageDeleteConfirm as MessageDeleteConfirmStory,
  MessageDeleteSubmitting as MessageDeleteSubmittingStory,
  MessageDisabledActions as MessageDisabledActionsStory,
  MessageError as MessageErrorStory,
  MessageInlineAttachments as MessageInlineAttachmentsStory,
  MessageMarkNotSpam as MessageMarkNotSpamStory,
  MessageMoveDisabledTarget as MessageMoveDisabledTargetStory,
  MessageMoveError as MessageMoveErrorStory,
  MessageMoveSubmitting as MessageMoveSubmittingStory,
  MessageMoveTargetSelection as MessageMoveTargetSelectionStory,
  MessageMoveToSpam as MessageMoveToSpamStory,
  MessageOriginalSourceError as MessageOriginalSourceErrorStory,
  MessageOriginalSourceEvidence as MessageOriginalSourceEvidenceStory,
  MessageOriginalSourceLoading as MessageOriginalSourceLoadingStory,
  MessageOriginalSource as MessageOriginalSourceStory,
  MessagePendingAction as MessagePendingActionStory,
  MessageRestoreFromTrash as MessageRestoreFromTrashStory,
  MessageRowSelection as MessageRowSelectionStory,
  MessageStarred as MessageStarredStory,
  MessageToolbarControllerActions as MessageToolbarControllerActionsStory,
  MessageUnread as MessageUnreadStory,
  MessageWelcome as MessageWelcomeStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Message'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MessageAppointment: Story = {
  ...MessageAppointmentStory,
  name: 'appointment'
}

export const MessageError: Story = {
  ...MessageErrorStory,
  name: 'error'
}

export const MessageToolbarControllerActions: Story = {
  ...MessageToolbarControllerActionsStory,
  name: 'toolbar controller actions'
}

export const MessageArchiveAction: Story = {
  ...MessageArchiveActionStory,
  name: 'archive action'
}

export const MessageWelcome: Story = {
  ...MessageWelcomeStory,
  name: 'welcome'
}

export const MessageStarred: Story = {
  ...MessageStarredStory,
  name: 'starred'
}

export const MessageUnread: Story = {
  ...MessageUnreadStory,
  name: 'unread'
}

export const MessageDisabledActions: Story = {
  ...MessageDisabledActionsStory,
  name: 'disabled toolbar action'
}

export const ConversationThread: Story = {
  ...ConversationThreadStory,
  name: 'conversation / thread'
}

export const ConversationThreadMessageActions: Story = {
  ...ConversationThreadMessageActionsStory,
  name: 'conversation / message actions'
}

export const MessageMarkNotSpam: Story = {
  ...MessageMarkNotSpamStory,
  name: 'mark not spam'
}

export const MessageRestoreFromTrash: Story = {
  ...MessageRestoreFromTrashStory,
  name: 'restore from trash'
}

export const DraftEditing: Story = {
  ...DraftEditingStory,
  name: 'drafts / edit draft'
}

export const DraftToolbarActions: Story = {
  ...DraftToolbarActionsStory,
  name: 'drafts / toolbar actions'
}

export const MessageAttachments: Story = {
  ...MessageAttachmentsStory,
  name: 'attachments'
}

export const MessageInlineAttachments: Story = {
  ...MessageInlineAttachmentsStory,
  name: 'inline attachments'
}

export const MessagePendingAction: Story = {
  ...MessagePendingActionStory,
  name: 'pending action'
}

export const MessageMoveToSpam: Story = {
  ...MessageMoveToSpamStory,
  name: 'move to spam'
}

export const MessageMoveTargetSelection: Story = {
  ...MessageMoveTargetSelectionStory,
  name: 'move target selection'
}

export const MessageMoveDisabledTarget: Story = {
  ...MessageMoveDisabledTargetStory,
  name: 'move disabled target'
}

export const MessageMoveSubmitting: Story = {
  ...MessageMoveSubmittingStory,
  name: 'move submitting'
}

export const MessageMoveError: Story = {
  ...MessageMoveErrorStory,
  name: 'move error'
}

export const MessageDeleteConfirm: Story = {
  ...MessageDeleteConfirmStory,
  name: 'delete confirm'
}

export const MessageDeleteSubmitting: Story = {
  ...MessageDeleteSubmittingStory,
  name: 'delete submitting'
}

export const MessageOriginalSource: Story = {
  ...MessageOriginalSourceStory,
  name: 'original source'
}

export const MessageOriginalSourceEvidence: Story = {
  ...MessageOriginalSourceEvidenceStory,
  name: 'original source evidence'
}

export const MessageOriginalSourceLoading: Story = {
  ...MessageOriginalSourceLoadingStory,
  name: 'original source loading'
}

export const MessageOriginalSourceError: Story = {
  ...MessageOriginalSourceErrorStory,
  name: 'original source error'
}

export const MessageRowSelection: Story = {
  ...MessageRowSelectionStory,
  name: 'row selection'
}
