import { Security as SecurityStory, settingsDialogStoryMeta } from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsDialogStoryMeta,
  title: 'Screens/Settings/Security'
} satisfies Meta<typeof settingsDialogStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Security: Story = {
  ...SecurityStory,
  name: 'Default'
}
