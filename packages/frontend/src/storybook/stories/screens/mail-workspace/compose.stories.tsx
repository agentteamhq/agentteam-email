import {
  ComposeAttachmentStatus as ComposeAttachmentStatusStory,
  ComposeAttachments as ComposeAttachmentsStory,
  ComposeDraftSaveError as ComposeDraftSaveErrorStory,
  ComposeForward as ComposeForwardStory,
  ComposeReplyAll as ComposeReplyAllStory,
  ComposeSavedDraft as ComposeSavedDraftStory,
  ComposeSavingDraft as ComposeSavingDraftStory,
  ComposeSelectedAccount as ComposeSelectedAccountStory,
  ComposeSending as ComposeSendingStory,
  ComposeValidationErrors as ComposeValidationErrorsStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Compose'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const ComposeSending: Story = {
  ...ComposeSendingStory,
  name: 'Sending'
}

export const ComposeSelectedAccount: Story = {
  ...ComposeSelectedAccountStory,
  name: 'Selected account'
}

export const ComposeSavedDraft: Story = {
  ...ComposeSavedDraftStory,
  name: 'Saved draft'
}

export const ComposeSavingDraft: Story = {
  ...ComposeSavingDraftStory,
  name: 'Saving draft'
}

export const ComposeReplyAll: Story = {
  ...ComposeReplyAllStory,
  name: 'Reply all'
}

export const ComposeForward: Story = {
  ...ComposeForwardStory,
  name: 'Forward'
}

export const ComposeDraftSaveError: Story = {
  ...ComposeDraftSaveErrorStory,
  name: 'Draft save error'
}

export const ComposeValidationErrors: Story = {
  ...ComposeValidationErrorsStory,
  name: 'Validation errors'
}

export const ComposeAttachments: Story = {
  ...ComposeAttachmentsStory,
  name: 'Attachments'
}

export const ComposeAttachmentStatus: Story = {
  ...ComposeAttachmentStatusStory,
  name: 'Attachment status'
}
