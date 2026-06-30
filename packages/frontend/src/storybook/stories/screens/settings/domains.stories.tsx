import {
  DomainsAddDomainAuthorizeCloudflare as DomainsAddDomainAuthorizeCloudflareStory,
  DomainsAddDomainSelectZone as DomainsAddDomainSelectZoneStory,
  DomainsDenseDomainList as DomainsDenseDomainListStory,
  DomainsDisconnectAction as DomainsDisconnectActionStory,
  DomainsDomainConnected as DomainsDomainConnectedStory,
  DomainsDomainLive as DomainsDomainLiveStory,
  DomainsDomainNeedsAttention as DomainsDomainNeedsAttentionStory,
  DomainsDomainProvisioning as DomainsDomainProvisioningStory,
  DomainsEmptyFirstUse as DomainsEmptyFirstUseStory,
  settingsScreenStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsScreenStoryMeta,
  title: 'Screens/Settings/Domains'
} satisfies Meta<typeof settingsScreenStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const DomainsEmptyFirstUse: Story = {
  ...DomainsEmptyFirstUseStory,
  name: 'Empty first use'
}

export const DomainsAddDomainAuthorizeCloudflare: Story = {
  ...DomainsAddDomainAuthorizeCloudflareStory,
  name: 'Add domain authorize Cloudflare'
}

export const DomainsAddDomainSelectZone: Story = {
  ...DomainsAddDomainSelectZoneStory,
  name: 'Add domain select zone'
}

export const DomainsDomainConnected: Story = {
  ...DomainsDomainConnectedStory,
  name: 'Domain connected'
}

export const DomainsDomainProvisioning: Story = {
  ...DomainsDomainProvisioningStory,
  name: 'Domain provisioning'
}

export const DomainsDomainLive: Story = {
  ...DomainsDomainLiveStory,
  name: 'Domain live'
}

export const DomainsDisconnectAction: Story = {
  ...DomainsDisconnectActionStory,
  name: 'Disconnect action'
}

export const DomainsDomainNeedsAttention: Story = {
  ...DomainsDomainNeedsAttentionStory,
  name: 'Domain needs attention'
}

export const DomainsDenseDomainList: Story = {
  ...DomainsDenseDomainListStory,
  name: 'Dense domain list'
}
