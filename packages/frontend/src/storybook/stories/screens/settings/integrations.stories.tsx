import {
  IntegrationsEmpty as IntegrationsEmptyStory,
  IntegrationsPaperclipConnected as IntegrationsPaperclipConnectedStory,
  IntegrationsPaperclipHandoff as IntegrationsPaperclipHandoffStory,
  settingsScreenStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsScreenStoryMeta,
  title: 'Screens/Settings/Integrations'
} satisfies Meta<typeof settingsScreenStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const IntegrationsEmpty: Story = {
  ...IntegrationsEmptyStory,
  name: 'Empty'
}

export const IntegrationsPaperclipHandoff: Story = {
  ...IntegrationsPaperclipHandoffStory,
  name: 'Paperclip handoff'
}

export const IntegrationsPaperclipConnected: Story = {
  ...IntegrationsPaperclipConnectedStory,
  name: 'Paperclip connected'
}
