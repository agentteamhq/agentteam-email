import { Account as AccountStory, settingsDialogStoryMeta } from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsDialogStoryMeta,
  title: 'Screens/Settings/Account'
} satisfies Meta<typeof settingsDialogStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Account: Story = {
  ...AccountStory,
  name: 'Default'
}
