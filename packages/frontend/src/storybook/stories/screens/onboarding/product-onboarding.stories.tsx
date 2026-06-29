import { fn } from 'storybook/test'

import {
  productOnboardingAuthenticatedShellArgs,
  productOnboardingConnectingShellArgs,
  productOnboardingErrorShellArgs,
  productOnboardingSettingsOpenShellArgs
} from 'src/storybook/product-onboarding-fixtures'
import { DashboardScreen } from 'src/screens/dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Onboarding/Product Onboarding',
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
  name: 'Authenticated shell empty',
  args: {
    ...productOnboardingAuthenticatedShellArgs
  }
}

export const ConnectingCloudflare: Story = {
  name: 'Connecting Cloudflare',
  args: {
    ...productOnboardingConnectingShellArgs
  }
}

export const CloudflareError: Story = {
  name: 'Cloudflare error',
  args: {
    ...productOnboardingErrorShellArgs
  }
}

export const SettingsOpen: Story = {
  name: 'Settings open',
  args: {
    ...productOnboardingSettingsOpenShellArgs
  }
}

export const Mobile: Story = {
  name: 'Mobile',
  args: {
    ...productOnboardingAuthenticatedShellArgs
  },
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false
    }
  }
}
