import { Account as AccountStory, settingsScreenStoryMeta } from '../../settings-dialog.definitions'
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
