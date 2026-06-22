import { CLIAccessPanel, SettingsDialog } from '../partials/authenticated/settings-dialog'
import type { CLIAccessSessionView } from '../partials/authenticated/settings-dialog'
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

const cliSessions = [
  {
    createdAt: '2026-06-22T12:00:00Z',
    current: true,
    expiresAt: '2026-12-19T12:00:00Z',
    id: 'session-cli-current',
    label: 'at-email 0.4.0',
    metadata: 'linux/amd64 · created Jun 22, 2026 · expires Dec 19, 2026'
  },
  {
    createdAt: '2026-06-20T09:30:00Z',
    current: false,
    expiresAt: '2026-12-17T09:30:00Z',
    id: 'session-cli-remote',
    label: 'at-email 0.4.0',
    metadata: 'darwin/arm64 · created Jun 20, 2026 · expires Dec 17, 2026'
  }
] satisfies CLIAccessSessionView[]

export const CLIAccess: Story = {
  name: 'settings / cli access',
  args: {
    activeSection: 'cliAccess',
    cliAccessPanel: (
      <CLIAccessPanel
        sessions={cliSessions}
        state='ready'
      />
    )
  }
}

export const CLIAccessEmpty: Story = {
  name: 'settings / cli access / empty',
  args: {
    activeSection: 'cliAccess',
    cliAccessPanel: (
      <CLIAccessPanel
        sessions={[]}
        state='ready'
      />
    )
  }
}

export const CLIAccessLoading: Story = {
  name: 'settings / cli access / loading',
  args: {
    activeSection: 'cliAccess',
    cliAccessPanel: (
      <CLIAccessPanel
        sessions={[]}
        state='loading'
      />
    )
  }
}

export const CLIAccessRevoking: Story = {
  name: 'settings / cli access / revoking',
  args: {
    activeSection: 'cliAccess',
    cliAccessPanel: (
      <CLIAccessPanel
        revokingSessionId='session-cli-remote'
        sessions={cliSessions}
        state='ready'
      />
    )
  }
}

export const CLIAccessError: Story = {
  name: 'settings / cli access / error',
  args: {
    activeSection: 'cliAccess',
    cliAccessPanel: (
      <CLIAccessPanel
        error='Session list failed.'
        sessions={[]}
        state='error'
      />
    )
  }
}
