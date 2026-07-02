import {
  Account as AccountStory,
  AccountAppearance as AccountAppearanceStory,
  AccountManageAccounts as AccountManageAccountsStory,
  settingsScreenStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsScreenStoryMeta,
  title: 'Screens/Settings/Account'
} satisfies Meta<typeof settingsScreenStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Account: Story = {
  ...AccountStory,
  name: 'Default'
}

export const AccountManageAccounts: Story = {
  ...AccountManageAccountsStory,
  name: 'Managed accounts'
}

export const AccountAppearance: Story = {
  ...AccountAppearanceStory,
  name: 'Appearance'
}
