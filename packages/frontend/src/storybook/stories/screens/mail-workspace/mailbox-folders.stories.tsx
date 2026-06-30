import {
  MailboxCreateFolder as MailboxCreateFolderStory,
  MailboxCustomFolder as MailboxCustomFolderStory,
  MailboxDeleteFolderConfirm as MailboxDeleteFolderConfirmStory,
  MailboxFolderActions as MailboxFolderActionsStory,
  MailboxFolderNavigation as MailboxFolderNavigationStory,
  MailboxJunk as MailboxJunkStory,
  MailboxRenameFolderOpen as MailboxRenameFolderOpenStory,
  MailboxSent as MailboxSentStory,
  MailboxTrash as MailboxTrashStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Mailbox - Folders'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

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
  name: 'Create folder open'
}

export const MailboxFolderActions: Story = {
  ...MailboxFolderActionsStory,
  name: 'Folder actions'
}

export const MailboxRenameFolderOpen: Story = {
  ...MailboxRenameFolderOpenStory,
  name: 'Rename folder open'
}

export const MailboxDeleteFolderConfirm: Story = {
  ...MailboxDeleteFolderConfirmStory,
  name: 'Delete folder confirm'
}
