import { Security as SecurityStory, settingsScreenStoryMeta } from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsScreenStoryMeta,
  title: 'Screens/Settings/Security'
} satisfies Meta<typeof settingsScreenStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Security: Story = {
  ...SecurityStory,
  name: 'Default'
}
