import {
  Security as SecurityStory,
  SecurityActiveSessions as SecurityActiveSessionsStory,
  SecurityApiKeys as SecurityApiKeysStory,
  SecurityDangerZone as SecurityDangerZoneStory,
  SecurityEmptyCredentials as SecurityEmptyCredentialsStory,
  SecurityPasskeys as SecurityPasskeysStory,
  settingsScreenStoryMeta
} from '../../settings-dialog.definitions'
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

export const SecurityActiveSessions: Story = {
  ...SecurityActiveSessionsStory,
  name: 'Active sessions'
}

export const SecurityPasskeys: Story = {
  ...SecurityPasskeysStory,
  name: 'Passkeys'
}

export const SecurityApiKeys: Story = {
  ...SecurityApiKeysStory,
  name: 'API keys'
}

export const SecurityDangerZone: Story = {
  ...SecurityDangerZoneStory,
  name: 'Danger zone'
}

export const SecurityEmptyCredentials: Story = {
  ...SecurityEmptyCredentialsStory,
  name: 'Empty credentials'
}
