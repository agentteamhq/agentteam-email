import {
  OrganizationPeople as OrganizationPeopleStory,
  OrganizationSettings as OrganizationSettingsStory,
  Organizations as OrganizationsStory,
  settingsScreenStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsScreenStoryMeta,
  title: 'Screens/Settings/Organization'
} satisfies Meta<typeof settingsScreenStoryMeta.component>

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
