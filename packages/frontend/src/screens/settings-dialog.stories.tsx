import { SettingsDialog } from '../partials/authenticated/settings-dialog'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Settings',
  component: SettingsDialog,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof SettingsDialog>

export default meta

type Story = StoryObj<typeof meta>

export const Open: Story = {
  name: 'settings / open'
}

export const Loading: Story = {
  name: 'settings / loading',
  args: {
    contentState: 'loading'
  }
}

export const Empty: Story = {
  name: 'settings / empty',
  args: {
    contentState: 'empty'
  }
}

export const ConnectedAccounts: Story = {
  name: 'settings / connected accounts',
  args: {
    activeSection: 'connectedAccounts',
    contentState: 'empty'
  }
}
