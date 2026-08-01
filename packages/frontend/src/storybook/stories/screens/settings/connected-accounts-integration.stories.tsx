import {
  ConnectedAccountsLoadFailureStopsRetrying as ConnectedAccountsLoadFailureStopsRetryingStory,
  ConnectedAccountsRuntimeAccessExpired as ConnectedAccountsRuntimeAccessExpiredStory,
  settingsScreenStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsScreenStoryMeta,
  title: 'Screens/Settings/Integration/Connected Accounts'
} satisfies Meta<typeof settingsScreenStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const ConnectedAccountsLoadFailureStopsRetrying: Story = {
  ...ConnectedAccountsLoadFailureStopsRetryingStory,
  name: 'RPC accounts load failure stops retrying'
}

export const ConnectedAccountsRuntimeAccessExpired: Story = {
  ...ConnectedAccountsRuntimeAccessExpiredStory,
  name: 'RPC reauthorization required renders reconnect'
}
