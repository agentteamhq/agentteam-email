import { expect, within } from 'storybook/test'

import { createRedirectErrorViewState } from 'src/lib/redirect-error-page'
import { EnvProvider } from 'src/partials/webapp/env-provider'
import { RedirectErrorPage } from 'src/partials/webapp/redirect-error-page'
import { storyPublicEnv } from 'src/storybook/screen-fixtures'
import type { Meta, StoryObj } from '@storybook/react'
import type { CloudflareOAuthReturnTarget } from '@main/backend'

const storyOccurredAt = new Date('2026-06-30T12:00:00.000Z')
const storyPublicHostname = storyPublicEnv.PUBLIC_HOSTNAME

function createStoryState(pathAndSearch: string) {
  return createRedirectErrorViewState({
    occurredAt: storyOccurredAt,
    publicHostname: storyPublicHostname,
    url: new URL(pathAndSearch, storyPublicHostname)
  })
}

function createCloudflareStoryState({
  error = 'invalid_request',
  errorDescription = 'The request is missing the required redirect uri',
  returnTarget
}: {
  error?: string
  errorDescription?: string
  returnTarget: CloudflareOAuthReturnTarget
}) {
  return createStoryState(
    `/redirect/error?${new URLSearchParams({
      callbackUri: new URL('/rpc/auth/api/oauth2/callback/cloudflare', storyPublicHostname).toString(),
      cloudflareIntentId: 'intent_public_story',
      error,
      error_description: errorDescription,
      flow: 'connected-account',
      provider: 'cloudflare',
      returnTarget
    }).toString()}`
  )
}

const meta = {
  title: 'Screens/Auth/Redirect Error',
  component: RedirectErrorPage,
  args: {
    state: createCloudflareStoryState({
      returnTarget: 'settings-connected-accounts'
    })
  },
  decorators: [
    (Story) => (
      <EnvProvider publicEnv={storyPublicEnv}>
        <Story />
      </EnvProvider>
    )
  ],
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof RedirectErrorPage>

export default meta

type Story = StoryObj<typeof meta>

export const CloudflareConnectionFailed: Story = {
  name: 'Cloudflare integration failed',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Cloudflare connection failed')).toBeInTheDocument()
    await expect(await canvas.findByText('invalid_request')).toBeInTheDocument()
    await expect(await canvas.findByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/settings/integrations/'
    )
  }
}

export const CloudflareDashboardOnboardingFailed: Story = {
  name: 'Cloudflare dashboard onboarding failed',
  args: {
    state: createCloudflareStoryState({
      errorDescription: 'Cloudflare could not finish the onboarding authorization',
      returnTarget: 'dashboard-onboarding'
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Cloudflare connection failed')).toBeInTheDocument()
    await expect(await canvas.findByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/dashboard/'
    )
  }
}

export const CloudflareDomainSetupFailed: Story = {
  name: 'Cloudflare domain setup failed',
  args: {
    state: createCloudflareStoryState({
      errorDescription: 'Cloudflare could not finish the domain setup authorization',
      returnTarget: 'settings-domains'
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Cloudflare connection failed')).toBeInTheDocument()
    await expect(await canvas.findByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/settings/domains/'
    )
  }
}

export const GenericRedirectFailed: Story = {
  name: 'Generic redirect failed',
  args: {
    state: createStoryState('/redirect/error?error=server_error')
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Connection redirect failed')).toBeInTheDocument()
    await expect(await canvas.findByText('Unknown provider')).toBeInTheDocument()
  }
}

export const RedactedQueryValues: Story = {
  name: 'Redacted query values',
  args: {
    state: createStoryState(
      '/redirect/error?provider=cloudflare&flow=connected-account&returnTarget=settings-connected-accounts&error=invalid_request&error_description=authorization%3DBearer%20provider-secret%20client_secret%3Dsecret-value&code=cloudflare-code&state=cloudflare-state&access_token=cloudflare-access-token'
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Redacted fields')).toBeInTheDocument()
    await expect(await canvas.findByText('access_token, code, state')).toBeInTheDocument()
    await expect(canvas.queryByText('cloudflare-code')).not.toBeInTheDocument()
    await expect(canvas.queryByText('cloudflare-state')).not.toBeInTheDocument()
  }
}
