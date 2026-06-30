import { DashboardMailControllerStoryFrame } from 'src/storybook/stories/story-frames'

import {
  cloudflareConnectStateMetaArgs,
  cloudflareConnectStateStories
} from './cloudflare-connect-states.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Onboarding/States - Mobile',
  component: DashboardMailControllerStoryFrame,
  args: cloudflareConnectStateMetaArgs,
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false
    }
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardMailControllerStoryFrame>

export default meta

type Story = StoryObj<typeof meta>

export const ConnectCloudflare: Story = cloudflareConnectStateStories.connectCloudflare

export const ConnectingCloudflare: Story = cloudflareConnectStateStories.connectingCloudflare

export const ChooseDomain: Story = cloudflareConnectStateStories.chooseDomain

export const SettingUpDomain: Story = cloudflareConnectStateStories.settingUpDomain

export const CreateFirstMailbox: Story = cloudflareConnectStateStories.createFirstMailbox

export const CreatingFirstMailbox: Story = cloudflareConnectStateStories.creatingFirstMailbox

export const MailboxReady: Story = cloudflareConnectStateStories.mailboxReady

export const CloudflareError: Story = cloudflareConnectStateStories.cloudflareError

export const SettingsOpen: Story = cloudflareConnectStateStories.settingsOpen
