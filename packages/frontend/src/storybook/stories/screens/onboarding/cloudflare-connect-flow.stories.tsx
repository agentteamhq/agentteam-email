import { expect, fn, within } from 'storybook/test'

import {
  productOnboardingAuthenticatedShellArgs,
  productOnboardingChooseDomainShellArgs,
  productOnboardingConnectSelectedDomainShellArgs,
  productOnboardingConnectingShellArgs,
  productOnboardingMailboxReadyShellArgs,
  productOnboardingProvisionDomainShellArgs,
  productOnboardingReturningShellArgs
} from 'src/storybook/product-onboarding-fixtures'
import { DashboardScreen } from 'src/screens/dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Onboarding/Flows/Cloudflare Connect',
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

export const Step01ConnectCloudflare: Story = {
  name: '01 connect Cloudflare',
  args: {
    ...productOnboardingAuthenticatedShellArgs
  }
}

export const Step02StartingCloudflareOAuth: Story = {
  name: '02 starting Cloudflare OAuth',
  args: {
    ...productOnboardingConnectingShellArgs
  }
}

export const Step03ReturningFromCloudflare: Story = {
  name: '03 returning from Cloudflare',
  args: {
    ...productOnboardingReturningShellArgs
  }
}

export const Step04ChooseDomain: Story = {
  name: '04 choose domain',
  args: {
    ...productOnboardingChooseDomainShellArgs
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Add domain')).toBeInTheDocument()
    await expect(await canvas.findByText('Cloudflare connected')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Connect domain' })).toBeEnabled()
    await expect(canvas.queryByRole('button', { name: 'Continue with Cloudflare' })).not.toBeInTheDocument()
    await expect(canvas.queryByText('Choose a message from the mailbox to read it here.')).not.toBeInTheDocument()
  }
}

export const Step05ConnectSelectedDomain: Story = {
  name: '05 connect selected domain',
  args: {
    ...productOnboardingConnectSelectedDomainShellArgs
  }
}

export const Step06ProvisionDomain: Story = {
  name: '06 provision domain',
  args: {
    ...productOnboardingProvisionDomainShellArgs
  }
}

export const Step07MailboxReady: Story = {
  name: '07 mailbox ready',
  args: {
    ...productOnboardingMailboxReadyShellArgs
  }
}

export const CloudflareConnectMobile: Story = {
  name: 'Cloudflare connect - mobile',
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
