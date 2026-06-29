import {
  MailboxCreateFolderError as MailboxCreateFolderErrorStory,
  MailboxCreateFolderOpen as MailboxCreateFolderOpenStory,
  MailboxCreateFolder as MailboxCreateFolderStory,
  MailboxCreateFolderSubmitting as MailboxCreateFolderSubmittingStory,
  MailboxCustomFolder as MailboxCustomFolderStory,
  MailboxDeleteFolderConfirm as MailboxDeleteFolderConfirmStory,
  MailboxDeleteFolderError as MailboxDeleteFolderErrorStory,
  MailboxDeleteFolderSubmitting as MailboxDeleteFolderSubmittingStory,
  MailboxFolderActions as MailboxFolderActionsStory,
  MailboxFolderNavigation as MailboxFolderNavigationStory,
  MailboxJunk as MailboxJunkStory,
  MailboxProtectedFolderActions as MailboxProtectedFolderActionsStory,
  MailboxRenameFolderError as MailboxRenameFolderErrorStory,
  MailboxRenameFolderOpen as MailboxRenameFolderOpenStory,
  MailboxRenameFolderSubmitting as MailboxRenameFolderSubmittingStory,
  MailboxSent as MailboxSentStory,
  MailboxTrash as MailboxTrashStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Mailbox - Folders'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MailboxJunk: Story = {
  ...MailboxJunkStory,
  name: 'Junk'
}

export const MailboxSent: Story = {
  ...MailboxSentStory,
  name: 'Sent'
}

export const MailboxTrash: Story = {
  ...MailboxTrashStory,
  name: 'Trash'
}

export const MailboxFolderNavigation: Story = {
  ...MailboxFolderNavigationStory,
  name: 'Folder navigation'
}

export const MailboxCustomFolder: Story = {
  ...MailboxCustomFolderStory,
  name: 'Custom folder'
}

export const MailboxCreateFolder: Story = {
  ...MailboxCreateFolderStory,
  name: 'Create folder trigger'
}

export const MailboxCreateFolderOpen: Story = {
  ...MailboxCreateFolderOpenStory,
  name: 'Create folder open'
}

export const MailboxCreateFolderSubmitting: Story = {
  ...MailboxCreateFolderSubmittingStory,
  name: 'Create folder submitting'
}

export const MailboxCreateFolderError: Story = {
  ...MailboxCreateFolderErrorStory,
  name: 'Create folder error'
}

export const MailboxFolderActions: Story = {
  ...MailboxFolderActionsStory,
  name: 'Folder actions'
}

export const MailboxProtectedFolderActions: Story = {
  ...MailboxProtectedFolderActionsStory,
  name: 'Protected folder actions'
}

export const MailboxRenameFolderOpen: Story = {
  ...MailboxRenameFolderOpenStory,
  name: 'Rename folder open'
}

export const MailboxRenameFolderSubmitting: Story = {
  ...MailboxRenameFolderSubmittingStory,
  name: 'Rename folder submitting'
}

export const MailboxRenameFolderError: Story = {
  ...MailboxRenameFolderErrorStory,
  name: 'Rename folder error'
}

export const MailboxDeleteFolderConfirm: Story = {
  ...MailboxDeleteFolderConfirmStory,
  name: 'Delete folder confirm'
}

export const MailboxDeleteFolderSubmitting: Story = {
  ...MailboxDeleteFolderSubmittingStory,
  name: 'Delete folder submitting'
}

export const MailboxDeleteFolderError: Story = {
  ...MailboxDeleteFolderErrorStory,
  name: 'Delete folder error'
}
