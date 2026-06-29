import { fn } from 'storybook/test'

import {
  productOnboardingAuthenticatedShellArgs,
  productOnboardingChooseDomainShellArgs,
  productOnboardingConnectSelectedDomainShellArgs,
  productOnboardingConnectingShellArgs,
  productOnboardingErrorShellArgs,
  productOnboardingMailboxReadyShellArgs,
  productOnboardingProvisionDomainShellArgs,
  productOnboardingReturningShellArgs,
  productOnboardingSettingsOpenShellArgs
} from 'src/storybook/product-onboarding-fixtures'
import type { DashboardScreenProps } from 'src/screens/dashboard-screen'

interface CloudflareConnectStateStoryDefinition {
  args: Partial<DashboardScreenProps>
  name: string
}

export const cloudflareConnectStateMetaArgs = {
  ...productOnboardingAuthenticatedShellArgs,
  onDashboardOnboardingConnect: fn()
} satisfies Partial<DashboardScreenProps>

export const cloudflareConnectStateStories = {
  chooseDomain: {
    name: 'Choose domain',
    args: {
      ...productOnboardingChooseDomainShellArgs
    }
  },
  cloudflareError: {
    name: 'Cloudflare error',
    args: {
      ...productOnboardingErrorShellArgs
    }
  },
  connectCloudflare: {
    name: 'Connect Cloudflare',
    args: {
      ...productOnboardingAuthenticatedShellArgs
    }
  },
  connectingCloudflare: {
    name: 'Connecting Cloudflare',
    args: {
      ...productOnboardingConnectingShellArgs
    }
  },
  domainConnected: {
    name: 'Domain connected',
    args: {
      ...productOnboardingConnectSelectedDomainShellArgs
    }
  },
  mailboxReady: {
    name: 'Mailbox ready',
    args: {
      ...productOnboardingMailboxReadyShellArgs
    }
  },
  provisionDomain: {
    name: 'Provision domain',
    args: {
      ...productOnboardingProvisionDomainShellArgs
    }
  },
  returningFromCloudflare: {
    name: 'Returning from Cloudflare',
    args: {
      ...productOnboardingReturningShellArgs
    }
  },
  settingsOpen: {
    name: 'Settings open',
    args: {
      ...productOnboardingSettingsOpenShellArgs
    }
  }
} satisfies Record<string, CloudflareConnectStateStoryDefinition>
