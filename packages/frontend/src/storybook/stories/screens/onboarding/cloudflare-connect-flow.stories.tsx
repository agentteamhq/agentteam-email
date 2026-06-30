import { expect, fn, within } from 'storybook/test'

import {
  buildProductOnboardingScreenArgs,
  productOnboardingScenarios
} from 'src/storybook/product-onboarding-scenarios'
import { DashboardScreen } from 'src/screens/dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'
import type { DashboardScreenProps } from 'src/screens/dashboard-screen'

const onboardingHandlers = {
  onDashboardOnboardingConnect: fn()
} satisfies Pick<DashboardScreenProps, 'onDashboardOnboardingConnect'>

const meta = {
  title: 'Screens/Onboarding/Flows/Cloudflare Connect',
  component: DashboardScreen,
  args: buildProductOnboardingScreenArgs(productOnboardingScenarios.connectCloudflare, onboardingHandlers),
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Step01ConnectCloudflare: Story = {
  name: '01 connect Cloudflare',
  args: buildProductOnboardingScreenArgs(productOnboardingScenarios.connectCloudflare, onboardingHandlers)
}

export const Step02StartingCloudflareOAuth: Story = {
  name: '02 starting Cloudflare OAuth',
  args: buildProductOnboardingScreenArgs(
    productOnboardingScenarios.connectingCloudflare,
    onboardingHandlers
  )
}

export const Step03ReturningFromCloudflare: Story = {
  name: '03 returning from Cloudflare',
  args: buildProductOnboardingScreenArgs(
    productOnboardingScenarios.returningFromCloudflare,
    onboardingHandlers
  )
}

export const Step04ChooseDomain: Story = {
  name: '04 choose domain',
  args: buildProductOnboardingScreenArgs(productOnboardingScenarios.chooseDomain, onboardingHandlers),
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
  args: buildProductOnboardingScreenArgs(productOnboardingScenarios.domainConnected, onboardingHandlers)
}

export const Step06ProvisionDomain: Story = {
  name: '06 provision domain',
  args: buildProductOnboardingScreenArgs(productOnboardingScenarios.provisionDomain, onboardingHandlers)
}

export const Step07MailboxReady: Story = {
  name: '07 mailbox ready',
  args: buildProductOnboardingScreenArgs(productOnboardingScenarios.mailboxReady, onboardingHandlers)
}

export const CloudflareConnectMobile: Story = {
  name: 'Cloudflare connect - mobile',
  args: buildProductOnboardingScreenArgs(productOnboardingScenarios.connectCloudflare, onboardingHandlers),
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false
    }
  }
}
