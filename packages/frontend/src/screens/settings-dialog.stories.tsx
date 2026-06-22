import {
  authenticatedSectionBaseArgs,
  cliAccessEmptyState,
  cliAccessErrorState,
  cliAccessLoadingState,
  cliAccessReadyState,
  cliAccessRevokingState,
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
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Settings',
  component: DashboardScreen,
  args: {
    ...authenticatedSectionBaseArgs,
    domainSettingsState: domainSettingsEmptyFirstUseState,
    onCliAccessSessionRevoke: () => {},
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

export const CLIAccess: Story = {
  name: 'settings / cli access',
  args: {
    cliAccessState: cliAccessReadyState,
    settingsSection: 'cliAccess'
  }
}

export const CLIAccessEmpty: Story = {
  name: 'settings / cli access / empty',
  args: {
    cliAccessState: cliAccessEmptyState,
    settingsSection: 'cliAccess'
  }
}

export const CLIAccessLoading: Story = {
  name: 'settings / cli access / loading',
  args: {
    cliAccessState: cliAccessLoadingState,
    settingsSection: 'cliAccess'
  }
}

export const CLIAccessRevoking: Story = {
  name: 'settings / cli access / revoking',
  args: {
    cliAccessState: cliAccessRevokingState,
    settingsSection: 'cliAccess'
  }
}

export const CLIAccessError: Story = {
  name: 'settings / cli access / error',
  args: {
    cliAccessState: cliAccessErrorState,
    settingsSection: 'cliAccess'
  }
}
