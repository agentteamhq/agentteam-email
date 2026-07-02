import {
  IntegrationsEmpty as IntegrationsEmptyStory,
  IntegrationsPaperclipConnected as IntegrationsPaperclipConnectedStory,
  IntegrationsPaperclipReconnectRequired as IntegrationsPaperclipReconnectRequiredStory,
  IntegrationsPaperclipUnavailable as IntegrationsPaperclipUnavailableStory,
  IntegrationsUnavailable as IntegrationsUnavailableStory,
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

export const IntegrationsPaperclipConnected: Story = {
  ...IntegrationsPaperclipConnectedStory,
  name: 'Paperclip connected'
}

export const IntegrationsPaperclipReconnectRequired: Story = {
  ...IntegrationsPaperclipReconnectRequiredStory,
  name: 'Paperclip reconnect required'
}

export const IntegrationsPaperclipUnavailable: Story = {
  ...IntegrationsPaperclipUnavailableStory,
  name: 'Paperclip unavailable'
}

export const IntegrationsUnavailable: Story = {
  ...IntegrationsUnavailableStory,
  name: 'Unavailable'
}
