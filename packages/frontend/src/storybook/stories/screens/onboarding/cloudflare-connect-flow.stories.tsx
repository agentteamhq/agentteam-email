import { expect, fn, within } from 'storybook/test'

import {
  buildProductOnboardingControllerArgs,
  productOnboardingScenarios
} from 'src/storybook/product-onboarding-scenarios'
import { DashboardMailControllerStoryFrame } from 'src/storybook/stories/story-frames'
import type { DomainSettingsState } from 'src/partials/authenticated/settings-dialog'
import type { Meta, StoryObj } from '@storybook/react'

const onboardingHandlers = {
  onStartOAuth: fn()
} satisfies Pick<DomainSettingsState, 'onStartOAuth'>

const meta = {
  title: 'Screens/Onboarding/Flows/Cloudflare Connect',
  component: DashboardMailControllerStoryFrame,
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.connectCloudflare, onboardingHandlers),
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardMailControllerStoryFrame>

export default meta

type Story = StoryObj<typeof meta>

export const Step01ConnectCloudflare: Story = {
  name: '01 connect Cloudflare',
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.connectCloudflare, onboardingHandlers)
}

export const Step02StartingCloudflareOAuth: Story = {
  name: '02 starting Cloudflare OAuth',
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.connectingCloudflare,
    onboardingHandlers
  )
}

export const Step03ReturningFromCloudflare: Story = {
  name: '03 returning from Cloudflare',
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.returningFromCloudflare,
    onboardingHandlers
  )
}

export const Step04ChooseDomain: Story = {
  name: '04 choose domain',
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.chooseDomain, onboardingHandlers),
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
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.domainConnected, onboardingHandlers)
}

export const Step06ProvisionDomain: Story = {
  name: '06 provision domain',
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.provisionDomain, onboardingHandlers)
}

export const Step07MailboxReady: Story = {
  name: '07 mailbox ready',
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.mailboxReady, onboardingHandlers)
}

export const Step08AgentsNoMailboxSetupReturn: Story = {
  name: '08 agents no-mailbox setup return',
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.agentsNoMailboxSetupReturn,
    onboardingHandlers
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: 'Agents' }, { timeout: 15000 })).toBeInTheDocument()
    await expect(await canvas.findByText('No agents')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Continue setup' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Create folder' })).not.toBeInTheDocument()
  }
}

export const CloudflareConnectMobile: Story = {
  name: 'Cloudflare connect - mobile',
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.connectCloudflare, onboardingHandlers),
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false
    }
  }
}
