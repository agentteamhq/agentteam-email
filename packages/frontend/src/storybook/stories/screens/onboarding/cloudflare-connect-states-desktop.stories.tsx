import { DashboardScreen } from 'src/screens/dashboard-screen'

import {
  cloudflareConnectStateMetaArgs,
  cloudflareConnectStateStories
} from './cloudflare-connect-states.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Onboarding/States - Desktop',
  component: DashboardScreen,
  tags: ['mock'],
  args: cloudflareConnectStateMetaArgs,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

export const ConnectCloudflare: Story = cloudflareConnectStateStories.connectCloudflare

export const ConnectingCloudflare: Story = cloudflareConnectStateStories.connectingCloudflare

export const ReturningFromCloudflare: Story = cloudflareConnectStateStories.returningFromCloudflare

export const ChooseDomain: Story = cloudflareConnectStateStories.chooseDomain

export const DomainConnected: Story = cloudflareConnectStateStories.domainConnected

export const ProvisionDomain: Story = cloudflareConnectStateStories.provisionDomain

export const MailboxReady: Story = cloudflareConnectStateStories.mailboxReady

export const CloudflareError: Story = cloudflareConnectStateStories.cloudflareError

export const SettingsOpen: Story = cloudflareConnectStateStories.settingsOpen
