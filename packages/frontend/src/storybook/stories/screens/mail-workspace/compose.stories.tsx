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
  name: 'sending'
}

export const ComposeSelectedAccount: Story = {
  ...ComposeSelectedAccountStory,
  name: 'selected account'
}

export const ComposeSavedDraft: Story = {
  ...ComposeSavedDraftStory,
  name: 'saved draft'
}

export const ComposeSavingDraft: Story = {
  ...ComposeSavingDraftStory,
  name: 'saving draft'
}

export const ComposeReplyAll: Story = {
  ...ComposeReplyAllStory,
  name: 'reply all'
}

export const ComposeForward: Story = {
  ...ComposeForwardStory,
  name: 'forward'
}

export const ComposeDraftSaveError: Story = {
  ...ComposeDraftSaveErrorStory,
  name: 'draft save error'
}

export const ComposeValidationErrors: Story = {
  ...ComposeValidationErrorsStory,
  name: 'validation errors'
}

export const ComposeAttachments: Story = {
  ...ComposeAttachmentsStory,
  name: 'attachments'
}

export const ComposeAttachmentStatus: Story = {
  ...ComposeAttachmentStatusStory,
  name: 'attachment status'
}
