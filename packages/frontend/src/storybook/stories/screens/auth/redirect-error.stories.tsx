import { expect, within } from 'storybook/test'

import { createRedirectErrorViewState } from 'src/lib/redirect-error-page'
import { EnvProvider } from 'src/partials/webapp/env-provider'
import { RedirectErrorPage } from 'src/partials/webapp/redirect-error-page'
import { storyPublicEnv } from 'src/storybook/screen-fixtures'
import type { Meta, StoryObj } from '@storybook/react'

const storyOccurredAt = new Date('2026-06-30T12:00:00.000Z')
const storyPublicHostname = storyPublicEnv.PUBLIC_HOSTNAME

function createStoryState(pathAndSearch: string) {
  return createRedirectErrorViewState({
    occurredAt: storyOccurredAt,
    publicHostname: storyPublicHostname,
    url: new URL(pathAndSearch, storyPublicHostname)
  })
}

const meta = {
  title: 'Screens/Auth/Redirect Error',
  component: RedirectErrorPage,
  args: {
    state: createStoryState(
      '/redirect/error?provider=cloudflare&flow=connected-account&error=invalid_request&error_description=The+request+is+missing+the+required+redirect+uri&cloudflareIntentId=intent_public_story&callbackUri=http%3A%2F%2Flocalhost%3A6007%2Frpc%2Fauth%2Fapi%2Foauth2%2Fcallback%2Fcloudflare'
    )
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
  name: 'Cloudflare connection failed',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Cloudflare connection failed')).toBeInTheDocument()
    await expect(await canvas.findByText('invalid_request')).toBeInTheDocument()
    await expect(await canvas.findByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/settings/connected-accounts/'
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
      '/redirect/error?provider=cloudflare&flow=connected-account&error=invalid_request&error_description=authorization%3DBearer%20provider-secret%20client_secret%3Dsecret-value&code=cloudflare-code&state=cloudflare-state&access_token=cloudflare-access-token'
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
