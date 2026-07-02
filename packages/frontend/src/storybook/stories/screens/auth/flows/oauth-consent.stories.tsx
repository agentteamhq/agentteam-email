import { expect, userEvent, within } from 'storybook/test'

import {
  buildOAuthConsentStoryArgs,
  createOAuthConsentAuthClient,
  loadingOAuthConsentAuthClient,
  missingCodeOAuthConsentSearch,
  oauthConsentRedirectUrl,
  paperclipOAuthConsentSearch,
  redirectOAuthConsent,
  unknownOAuthClient,
  unsupportedScopeOAuthConsentSearch
} from 'src/storybook/oauth-consent-fixtures'
import { OAuthConsentRouteScreen } from 'src/screens/oauth-consent-route-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Auth/Flows/OAuth Consent',
  component: OAuthConsentRouteScreen,
  args: buildOAuthConsentStoryArgs(),
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof OAuthConsentRouteScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Step01PaperclipConsent: Story = {
  name: '01 Paperclip consent',
  args: buildOAuthConsentStoryArgs(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: 'Connect Paperclip' })).toBeInTheDocument()
    await expect(
      await canvas.findByText('Paperclip wants access to AgentTeam Email for this organization.')
    ).toBeInTheDocument()
    await expect(await canvas.findByText('Use AgentTeam Email mail APIs')).toBeInTheDocument()
    await expect(await canvas.findByText('Stay connected until revoked')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^allow$/i })).toBeEnabled()
    await expect(await canvas.findByRole('button', { name: /^cancel$/i })).toBeEnabled()
  }
}

export const Step02LoadingClient: Story = {
  name: '02 loading client',
  args: buildOAuthConsentStoryArgs({
    authClient: loadingOAuthConsentAuthClient()
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: 'Connect application' })).toBeInTheDocument()
    await expect(await canvas.findByText('Loading application details.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^allow$/i })).toBeDisabled()
  }
}

export const Step03ClientLoadError: Story = {
  name: '03 client load error',
  args: buildOAuthConsentStoryArgs({
    authClient: createOAuthConsentAuthClient({
      publicClientError: new Error('Application was not found.')
    })
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Application was not found.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^allow$/i })).toBeDisabled()
  }
}

export const Step04MissingCode: Story = {
  name: '04 missing code',
  args: buildOAuthConsentStoryArgs({
    search: missingCodeOAuthConsentSearch
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(
      await canvas.findByText('OAuth consent link is missing its authorization code.')
    ).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^allow$/i })).toBeDisabled()
  }
}

export const Step05UnsupportedScope: Story = {
  name: '05 unsupported scope',
  args: buildOAuthConsentStoryArgs({
    search: unsupportedScopeOAuthConsentSearch
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Request additional access')).toBeInTheDocument()
  }
}

export const Step06UnknownClient: Story = {
  name: '06 unknown client',
  args: buildOAuthConsentStoryArgs({
    authClient: createOAuthConsentAuthClient({
      client: unknownOAuthClient
    }),
    search: {
      ...paperclipOAuthConsentSearch,
      client_id: unknownOAuthClient.client_id
    }
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Unknown App')).toBeInTheDocument()
    await expect(await canvas.findByRole('heading', { name: 'Connect Unknown App' })).toBeInTheDocument()
  }
}

export const Step07ApprovedRedirecting: Story = {
  name: '07 approved redirecting',
  args: buildOAuthConsentStoryArgs(),
  play: async ({ canvasElement }) => {
    redirectOAuthConsent.mockClear()
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^allow$/i }))
    await expect(await canvas.findByText('Approved. Redirecting...')).toBeInTheDocument()
    await expect(redirectOAuthConsent).toHaveBeenCalledWith(oauthConsentRedirectUrl)
  }
}

export const Step08DeniedRedirecting: Story = {
  name: '08 denied redirecting',
  args: buildOAuthConsentStoryArgs(),
  play: async ({ canvasElement }) => {
    redirectOAuthConsent.mockClear()
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^cancel$/i }))
    await expect(await canvas.findByText('Canceled. Redirecting...')).toBeInTheDocument()
    await expect(redirectOAuthConsent).toHaveBeenCalled()
  }
}
