import { expect, fn, within } from 'storybook/test'

import {
  buildProductOnboardingControllerArgs,
  productOnboardingScenarios
} from 'src/storybook/product-onboarding-scenarios'
import type { DomainSettingsState } from 'src/partials/authenticated/settings-dialog'
import type { DashboardMailControllerStoryFrameProps } from 'src/storybook/stories/story-frames'

interface CloudflareConnectStateStoryDefinition {
  args: DashboardMailControllerStoryFrameProps
  name: string
  play?: (context: { canvasElement: HTMLElement }) => Promise<void>
}

const onboardingHandlers = {
  onStartOAuth: fn()
} satisfies Pick<DomainSettingsState, 'onStartOAuth'>

export const cloudflareConnectStateMetaArgs = {
  ...buildProductOnboardingControllerArgs(productOnboardingScenarios.connectCloudflare, onboardingHandlers)
} satisfies DashboardMailControllerStoryFrameProps

export const cloudflareConnectStateStories = {
  chooseDomain: {
    name: 'Choose domain',
    args: buildProductOnboardingControllerArgs(productOnboardingScenarios.chooseDomain, onboardingHandlers)
  },
  cloudflareError: {
    name: 'Cloudflare error',
    args: buildProductOnboardingControllerArgs(productOnboardingScenarios.cloudflareError, onboardingHandlers)
  },
  connectCloudflare: {
    name: 'Connect Cloudflare',
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
  },
  connectingCloudflare: {
    name: 'Connecting Cloudflare',
    args: buildProductOnboardingControllerArgs(
      productOnboardingScenarios.connectingCloudflare,
      onboardingHandlers
    )
  },
  createFirstMailbox: {
    name: 'Create first mailbox',
    args: buildProductOnboardingControllerArgs(
      productOnboardingScenarios.createFirstMailbox,
      onboardingHandlers
    )
  },
  creatingFirstMailbox: {
    name: 'Creating first mailbox',
    args: buildProductOnboardingControllerArgs(
      productOnboardingScenarios.creatingFirstMailbox,
      onboardingHandlers
    )
  },
  mailboxReady: {
    name: 'Mailbox ready',
    args: buildProductOnboardingControllerArgs(productOnboardingScenarios.mailboxReady, onboardingHandlers)
  },
  settingUpDomain: {
    name: 'Setting up domain',
    args: buildProductOnboardingControllerArgs(
      productOnboardingScenarios.settingUpDomain,
      onboardingHandlers
    )
  }
} satisfies Record<string, CloudflareConnectStateStoryDefinition>
