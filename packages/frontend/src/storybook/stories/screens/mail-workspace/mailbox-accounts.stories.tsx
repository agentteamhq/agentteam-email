import {
  MailboxAccountPermissions as MailboxAccountPermissionsStory,
  MailboxAccountSwitching as MailboxAccountSwitchingStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Mailbox - Accounts'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MailboxAccountSwitching: Story = {
  ...MailboxAccountSwitchingStory,
  name: 'Selected account'
}

export const MailboxAccountPermissions: Story = {
  ...MailboxAccountPermissionsStory,
  name: 'Disabled account'
}
