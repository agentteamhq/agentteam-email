import {
  MailboxAccountPermissions as MailboxAccountPermissionsStory,
  MailboxAccountSwitchingResetsFilters as MailboxAccountSwitchingResetsFiltersStory,
  MailboxAccountSwitchingResetsFolder as MailboxAccountSwitchingResetsFolderStory,
  MailboxAccountSwitchingResetsSelection as MailboxAccountSwitchingResetsSelectionStory,
  MailboxAccountSwitching as MailboxAccountSwitchingStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Mailbox - Accounts'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MailboxAccountSwitching: Story = {
  ...MailboxAccountSwitchingStory,
  name: 'Account switching'
}

export const MailboxAccountSwitchingResetsSelection: Story = {
  ...MailboxAccountSwitchingResetsSelectionStory,
  name: 'Account switching resets selection'
}

export const MailboxAccountSwitchingResetsFolder: Story = {
  ...MailboxAccountSwitchingResetsFolderStory,
  name: 'Account switching resets folder'
}

export const MailboxAccountSwitchingResetsFilters: Story = {
  ...MailboxAccountSwitchingResetsFiltersStory,
  name: 'Account switching resets filters'
}

export const MailboxAccountPermissions: Story = {
  ...MailboxAccountPermissionsStory,
  name: 'Account permissions'
}
