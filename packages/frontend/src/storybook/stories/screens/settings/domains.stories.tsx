import {
  DomainsAddDomainAuthorizeCloudflare as DomainsAddDomainAuthorizeCloudflareStory,
  DomainsAddDomainSelectZone as DomainsAddDomainSelectZoneStory,
  DomainsDenseDomainList as DomainsDenseDomainListStory,
  DomainsDomainDisconnected as DomainsDomainDisconnectedStory,
  DomainsDomainLive as DomainsDomainLiveStory,
  DomainsDomainNeedsAttention as DomainsDomainNeedsAttentionStory,
  DomainsDomainRetryBusy as DomainsDomainRetryBusyStory,
  DomainsLoadDomainsBusy as DomainsLoadDomainsBusyStory,
  DomainsLoadDomains as DomainsLoadDomainsStory,
  DomainsLoadErrorMessage as DomainsLoadErrorMessageStory,
  DomainsLoading as DomainsLoadingStory,
  DomainsMissingCloudflarePermissions as DomainsMissingCloudflarePermissionsStory,
  settingsScreenStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsScreenStoryMeta,
  title: 'Screens/Settings/Integration/Domains'
} satisfies Meta<typeof settingsScreenStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const DomainsLoading: Story = {
  ...DomainsLoadingStory,
  name: 'Loading'
}

export const DomainsLoadErrorMessage: Story = {
  ...DomainsLoadErrorMessageStory,
  name: 'Load error message'
}

export const DomainsAddDomainAuthorizeCloudflare: Story = {
  ...DomainsAddDomainAuthorizeCloudflareStory,
  name: 'Add domain authorize Cloudflare'
}

export const DomainsMissingCloudflarePermissions: Story = {
  ...DomainsMissingCloudflarePermissionsStory,
  name: 'Missing Cloudflare permissions'
}

export const DomainsLoadDomains: Story = {
  ...DomainsLoadDomainsStory,
  name: 'Load domains'
}

export const DomainsLoadDomainsBusy: Story = {
  ...DomainsLoadDomainsBusyStory,
  name: 'Load domains busy'
}

export const DomainsAddDomainSelectZone: Story = {
  ...DomainsAddDomainSelectZoneStory,
  name: 'Add domain select zone'
}

export const DomainsDomainLive: Story = {
  ...DomainsDomainLiveStory,
  name: 'Domain live'
}

export const DomainsDomainNeedsAttention: Story = {
  ...DomainsDomainNeedsAttentionStory,
  name: 'Domain needs attention'
}

export const DomainsDomainDisconnected: Story = {
  ...DomainsDomainDisconnectedStory,
  name: 'Domain disconnected'
}

export const DomainsDomainRetryBusy: Story = {
  ...DomainsDomainRetryBusyStory,
  name: 'Domain retry busy'
}

export const DomainsDenseDomainList: Story = {
  ...DomainsDenseDomainListStory,
  name: 'Dense domain list'
}
