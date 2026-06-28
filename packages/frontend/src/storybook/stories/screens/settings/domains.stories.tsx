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
  settingsDialogStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsDialogStoryMeta,
  title: 'Screens/Settings/Domains'
} satisfies Meta<typeof settingsDialogStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const DomainsEmptyFirstUse: Story = {
  ...DomainsEmptyFirstUseStory,
  name: 'empty first use'
}

export const DomainsAddDomainAuthorizeCloudflare: Story = {
  ...DomainsAddDomainAuthorizeCloudflareStory,
  name: 'add domain authorize cloudflare'
}

export const DomainsAddDomainSelectZone: Story = {
  ...DomainsAddDomainSelectZoneStory,
  name: 'add domain select zone'
}

export const DomainsDomainConnected: Story = {
  ...DomainsDomainConnectedStory,
  name: 'domain connected'
}

export const DomainsDomainProvisioning: Story = {
  ...DomainsDomainProvisioningStory,
  name: 'domain provisioning'
}

export const DomainsDomainLive: Story = {
  ...DomainsDomainLiveStory,
  name: 'domain live'
}

export const DomainsDisconnectAction: Story = {
  ...DomainsDisconnectActionStory,
  name: 'disconnect action'
}

export const DomainsDomainNeedsAttention: Story = {
  ...DomainsDomainNeedsAttentionStory,
  name: 'domain needs attention'
}

export const DomainsDenseDomainList: Story = {
  ...DomainsDenseDomainListStory,
  name: 'dense domain list'
}
