import { fn } from 'storybook/test'

import {
  buildProductOnboardingControllerArgs,
  productOnboardingScenarios
} from 'src/storybook/product-onboarding-scenarios'
import type { DomainSettingsState } from 'src/partials/authenticated/settings-dialog'
import type { DashboardMailControllerStoryFrameProps } from 'src/storybook/stories/story-frames'

interface CloudflareConnectStateStoryDefinition {
  args: DashboardMailControllerStoryFrameProps
  name: string
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
    )
  },
  connectingCloudflare: {
    name: 'Connecting Cloudflare',
    args: buildProductOnboardingControllerArgs(
      productOnboardingScenarios.connectingCloudflare,
      onboardingHandlers
    )
  },
  domainConnected: {
    name: 'Domain connected',
    args: buildProductOnboardingControllerArgs(productOnboardingScenarios.domainConnected, onboardingHandlers)
  },
  mailboxReady: {
    name: 'Mailbox ready',
    args: buildProductOnboardingControllerArgs(productOnboardingScenarios.mailboxReady, onboardingHandlers)
  },
  provisionDomain: {
    name: 'Provision domain',
    args: buildProductOnboardingControllerArgs(productOnboardingScenarios.provisionDomain, onboardingHandlers)
  },
  returningFromCloudflare: {
    name: 'Returning from Cloudflare',
    args: buildProductOnboardingControllerArgs(
      productOnboardingScenarios.returningFromCloudflare,
      onboardingHandlers
    )
  },
  settingsOpen: {
    name: 'Settings open',
    args: buildProductOnboardingControllerArgs(productOnboardingScenarios.settingsOpen, onboardingHandlers)
  }
} satisfies Record<string, CloudflareConnectStateStoryDefinition>
