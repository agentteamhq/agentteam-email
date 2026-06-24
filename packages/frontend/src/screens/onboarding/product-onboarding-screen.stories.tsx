import { fn } from 'storybook/test'

import {
  productOnboardingAuthenticatedShellArgs,
  productOnboardingConnectingShellArgs,
  productOnboardingErrorShellArgs,
  productOnboardingSettingsOpenShellArgs
} from '../../storybook/product-onboarding-fixtures'
import { DashboardScreen } from '../dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mock/Onboarding/Product Onboarding',
  component: DashboardScreen,
  tags: ['mock'],
  args: {
    ...productOnboardingAuthenticatedShellArgs,
    onDashboardOnboardingConnect: fn()
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

export const AuthenticatedShellEmpty: Story = {
  name: 'Mock / authenticated shell empty',
  args: {
    ...productOnboardingAuthenticatedShellArgs
  }
}

export const ConnectingCloudflare: Story = {
  name: 'Mock / connecting Cloudflare',
  args: {
    ...productOnboardingConnectingShellArgs
  }
}

export const CloudflareError: Story = {
  name: 'Mock / Cloudflare error',
  args: {
    ...productOnboardingErrorShellArgs
  }
}

export const SettingsOpen: Story = {
  name: 'Mock / settings open',
  args: {
    ...productOnboardingSettingsOpenShellArgs
  }
}

export const Mobile: Story = {
  name: 'Mock / mobile',
  args: {
    ...productOnboardingAuthenticatedShellArgs
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}
