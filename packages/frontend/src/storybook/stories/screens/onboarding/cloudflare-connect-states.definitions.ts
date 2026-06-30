import { fn } from 'storybook/test'

import {
  buildProductOnboardingScreenArgs,
  productOnboardingScenarios
} from 'src/storybook/product-onboarding-scenarios'
import type { DashboardScreenProps } from 'src/screens/dashboard-screen'

interface CloudflareConnectStateStoryDefinition {
  args: DashboardScreenProps
  name: string
}

const onboardingHandlers = {
  onDashboardOnboardingConnect: fn()
} satisfies Pick<DashboardScreenProps, 'onDashboardOnboardingConnect'>

export const cloudflareConnectStateMetaArgs = {
  ...buildProductOnboardingScreenArgs(productOnboardingScenarios.connectCloudflare, onboardingHandlers)
} satisfies DashboardScreenProps

export const cloudflareConnectStateStories = {
  chooseDomain: {
    name: 'Choose domain',
    args: buildProductOnboardingScreenArgs(productOnboardingScenarios.chooseDomain, onboardingHandlers)
  },
  cloudflareError: {
    name: 'Cloudflare error',
    args: buildProductOnboardingScreenArgs(productOnboardingScenarios.cloudflareError, onboardingHandlers)
  },
  connectCloudflare: {
    name: 'Connect Cloudflare',
    args: buildProductOnboardingScreenArgs(productOnboardingScenarios.connectCloudflare, onboardingHandlers)
  },
  connectingCloudflare: {
    name: 'Connecting Cloudflare',
    args: buildProductOnboardingScreenArgs(
      productOnboardingScenarios.connectingCloudflare,
      onboardingHandlers
    )
  },
  domainConnected: {
    name: 'Domain connected',
    args: buildProductOnboardingScreenArgs(productOnboardingScenarios.domainConnected, onboardingHandlers)
  },
  mailboxReady: {
    name: 'Mailbox ready',
    args: buildProductOnboardingScreenArgs(productOnboardingScenarios.mailboxReady, onboardingHandlers)
  },
  provisionDomain: {
    name: 'Provision domain',
    args: buildProductOnboardingScreenArgs(productOnboardingScenarios.provisionDomain, onboardingHandlers)
  },
  returningFromCloudflare: {
    name: 'Returning from Cloudflare',
    args: buildProductOnboardingScreenArgs(
      productOnboardingScenarios.returningFromCloudflare,
      onboardingHandlers
    )
  },
  settingsOpen: {
    name: 'Settings open',
    args: buildProductOnboardingScreenArgs(productOnboardingScenarios.settingsOpen, onboardingHandlers)
  }
} satisfies Record<string, CloudflareConnectStateStoryDefinition>
