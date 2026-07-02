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
  title: 'Screens/Onboarding/Integration/Cloudflare Connect Flow',
  component: DashboardMailControllerStoryFrame,
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.connectCloudflare,
    onboardingHandlers
  ),
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardMailControllerStoryFrame>

export default meta

type Story = StoryObj<typeof meta>

export const Step01ConnectCloudflare: Story = {
  name: '01 connect Cloudflare',
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.connectCloudflare,
    onboardingHandlers
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('button', { name: 'Continue with Cloudflare' })).toBeEnabled()
    await expect(page.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
  }
}

export const Step02SelectDomain: Story = {
  name: '02 select domain',
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.chooseDomain, onboardingHandlers),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Set up email for your domain')).toBeInTheDocument()
    await expect(await canvas.findByText('Cloudflare connected')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Adopt agentteam.example' })).toBeEnabled()
    await expect(canvas.queryByRole('button', { name: 'Setting up domain' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Continue with Cloudflare' })).not.toBeInTheDocument()
    await expect(
      canvas.queryByText('Choose a message from the mailbox to read it here.')
    ).not.toBeInTheDocument()
  }
}

export const Step03SettingUpDomain: Story = {
  name: '03 setting up domain',
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.settingUpDomain, onboardingHandlers),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const adoptButton = await canvas.findByRole('button', { name: /Adopt agentteam\.example/i })

    await expect(await canvas.findByText('Set up email for your domain')).toBeInTheDocument()
    await expect(await canvas.findByRole('combobox', { name: 'Domain' })).toBeDisabled()
    await expect(adoptButton).toBeDisabled()
    await expect(within(adoptButton).getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    await expect(canvas.queryByText('Setting up agentteam.example')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Setting up domain' })).not.toBeInTheDocument()
  }
}

export const Step04DomainProvisioning: Story = {
  name: '04 domain provisioning',
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.domainProvisioning,
    onboardingHandlers
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const provisionButton = await canvas.findByRole('button', { name: /Setting up email routing/i })

    await expect(await canvas.findByText('agentteam.example')).toBeInTheDocument()
    await expect(
      await canvas.findByText('AgentTeam Email will configure Cloudflare routing for send and receive mail.')
    ).toBeInTheDocument()
    await expect(provisionButton).toBeDisabled()
    await expect(within(provisionButton).getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Adopt agentteam.example' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Continue with Cloudflare' })).not.toBeInTheDocument()
  }
}

export const Step05CreateFirstMailbox: Story = {
  name: '05 create first mailbox',
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.createFirstMailbox,
    onboardingHandlers
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Create your first mailbox')).toBeInTheDocument()
    await expect(await canvas.findByText('marin@agentteam.example')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Create mailbox' })).toBeEnabled()
  }
}

export const Step06CreatingMailbox: Story = {
  name: '06 creating mailbox',
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.creatingFirstMailbox,
    onboardingHandlers
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Create your first mailbox')).toBeInTheDocument()
    await expect((await canvas.findByText('Creating mailbox')).closest('button')).toBeDisabled()
  }
}

export const Step07MailboxReady: Story = {
  name: '07 mailbox ready',
  args: buildProductOnboardingControllerArgs(productOnboardingScenarios.mailboxReady, onboardingHandlers)
}

export const AgentsNoMailboxSetupReturn: Story = {
  name: 'Agents no-mailbox setup return',
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.agentsNoMailboxSetupReturn,
    onboardingHandlers
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(
      await canvas.findByRole('heading', { name: 'Agents' }, { timeout: 15000 })
    ).toBeInTheDocument()
    await expect(await canvas.findByText('No agents')).toBeInTheDocument()
  }
}

export const CloudflareConnectMobile: Story = {
  name: 'Cloudflare connect - mobile',
  args: buildProductOnboardingControllerArgs(
    productOnboardingScenarios.connectCloudflare,
    onboardingHandlers
  ),
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false
    }
  }
}
