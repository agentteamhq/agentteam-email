import {
  ConnectedAccountsCloudflare as ConnectedAccountsCloudflareStory,
  ConnectedAccountsEmpty as ConnectedAccountsEmptyStory,
  settingsScreenStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsScreenStoryMeta,
  title: 'Screens/Settings/Connected Accounts'
} satisfies Meta<typeof settingsScreenStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const ConnectedAccountsEmpty: Story = {
  ...ConnectedAccountsEmptyStory,
  name: 'Empty'
}

export const ConnectedAccountsCloudflare: Story = {
  ...ConnectedAccountsCloudflareStory,
  name: 'Cloudflare connected'
}
