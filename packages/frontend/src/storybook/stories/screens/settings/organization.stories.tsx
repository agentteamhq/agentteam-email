import {
  OrganizationPeople as OrganizationPeopleStory,
  OrganizationSettings as OrganizationSettingsStory,
  Organizations as OrganizationsStory,
  settingsDialogStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsDialogStoryMeta,
  title: 'Screens/Settings/Organization'
} satisfies Meta<typeof settingsDialogStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Organizations: Story = {
  ...OrganizationsStory,
  name: 'Organizations list'
}

export const OrganizationSettings: Story = {
  ...OrganizationSettingsStory,
  name: 'Settings'
}

export const OrganizationPeople: Story = {
  ...OrganizationPeopleStory,
  name: 'People'
}
