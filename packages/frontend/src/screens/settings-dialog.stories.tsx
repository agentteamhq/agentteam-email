import {
  authenticatedSectionBaseArgs,
  domainSettingsAddDomainAuthorizeCloudflareState,
  domainSettingsAddDomainSelectZoneState,
  domainSettingsDenseDomainListState,
  domainSettingsDomainConnectedState,
  domainSettingsDomainLiveState,
  domainSettingsDomainNeedsAttentionState,
  domainSettingsDomainProvisioningState,
  domainSettingsEmptyFirstUseState
} from '../storybook/authenticated-section-fixtures'
import { DashboardScreen } from './dashboard-screen'
import type { CLIAccessSessionView } from '../partials/authenticated/settings-dialog'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Settings',
  component: DashboardScreen,
  args: {
    ...authenticatedSectionBaseArgs,
    settingsOpen: true
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Account: Story = {
  name: 'settings / account',
  args: {
    settingsSection: 'account'
  }
}

export const Security: Story = {
  name: 'settings / security',
  args: {
    settingsSection: 'security'
  }
}

export const Organizations: Story = {
  name: 'settings / organizations',
  args: {
    settingsSection: 'organizations'
  }
}

export const OrganizationSettings: Story = {
  name: 'organization / settings',
  args: {
    settingsSection: 'organizationSettings'
  }
}

export const OrganizationPeople: Story = {
  name: 'organization / people',
  args: {
    settingsSection: 'organizationPeople'
  }
}

export const DomainsEmptyFirstUse: Story = {
  name: 'domains / empty first use',
  args: {
    domainSettingsState: domainSettingsEmptyFirstUseState,
    settingsSection: 'domains'
  }
}

export const DomainsAddDomainAuthorizeCloudflare: Story = {
  name: 'domains / add domain authorize cloudflare',
  args: {
    domainSettingsState: domainSettingsAddDomainAuthorizeCloudflareState,
    settingsSection: 'domains'
  }
}

export const DomainsAddDomainSelectZone: Story = {
  name: 'domains / add domain select zone',
  args: {
    domainSettingsState: domainSettingsAddDomainSelectZoneState,
    settingsSection: 'domains'
  }
}

export const DomainsDomainConnected: Story = {
  name: 'domains / domain connected',
  args: {
    domainSettingsState: domainSettingsDomainConnectedState,
    settingsSection: 'domains'
  }
}

export const DomainsDomainProvisioning: Story = {
  name: 'domains / domain provisioning',
  args: {
    domainSettingsState: domainSettingsDomainProvisioningState,
    settingsSection: 'domains'
  }
}

export const DomainsDomainLive: Story = {
  name: 'domains / domain live',
  args: {
    domainSettingsState: domainSettingsDomainLiveState,
    settingsSection: 'domains'
  }
}

export const DomainsDomainNeedsAttention: Story = {
  name: 'domains / domain needs attention',
  args: {
    domainSettingsState: domainSettingsDomainNeedsAttentionState,
    settingsSection: 'domains'
  }
}

export const DomainsDenseDomainList: Story = {
  name: 'domains / dense domain list',
  args: {
    domainSettingsState: domainSettingsDenseDomainListState,
    settingsSection: 'domains'
  }
}

const cliSessions = [
  {
    createdAt: '2026-06-22T12:00:00Z',
    current: true,
    expiresAt: '2026-12-19T12:00:00Z',
    id: 'session-cli-current',
    label: 'at-email 0.4.0',
    metadata: 'linux/amd64 - created Jun 22, 2026 - expires Dec 19, 2026'
  },
  {
    createdAt: '2026-06-20T09:30:00Z',
    current: false,
    expiresAt: '2026-12-17T09:30:00Z',
    id: 'session-cli-remote',
    label: 'at-email 0.4.0',
    metadata: 'darwin/arm64 - created Jun 20, 2026 - expires Dec 17, 2026'
  }
] satisfies CLIAccessSessionView[]

export const CLIAccess: Story = {
  name: 'settings / cli access',
  args: {
    cliAccessState: {
      sessions: cliSessions,
      state: 'ready'
    },
    settingsSection: 'cliAccess'
  }
}

export const CLIAccessEmpty: Story = {
  name: 'settings / cli access / empty',
  args: {
    cliAccessState: {
      sessions: [],
      state: 'ready'
    },
    settingsSection: 'cliAccess'
  }
}

export const CLIAccessLoading: Story = {
  name: 'settings / cli access / loading',
  args: {
    cliAccessState: {
      sessions: [],
      state: 'loading'
    },
    settingsSection: 'cliAccess'
  }
}

export const CLIAccessRevoking: Story = {
  name: 'settings / cli access / revoking',
  args: {
    cliAccessState: {
      revokingSessionId: 'session-cli-remote',
      sessions: cliSessions,
      state: 'ready'
    },
    settingsSection: 'cliAccess'
  }
}

export const CLIAccessError: Story = {
  name: 'settings / cli access / error',
  args: {
    cliAccessState: {
      error: 'Session list failed.',
      sessions: [],
      state: 'error'
    },
    settingsSection: 'cliAccess'
  }
}
