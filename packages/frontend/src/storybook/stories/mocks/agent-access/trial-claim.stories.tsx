import { expect, within } from 'storybook/test'

import { AgentTrialClaimScreen } from 'src/screens/agent-trial-claim-screen'
import { agentTrialClaimView } from 'src/storybook/agent-access-fixtures'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mocks/Agent Access/Trial Claim',
  component: AgentTrialClaimScreen,
  args: {
    claim: agentTrialClaimView,
    onApprove: async () => {},
    onDeny: async () => {},
    userEmail: 'operator@example.com'
  },
  parameters: {
    layout: 'fullscreen'
  },
  tags: ['mock']
} satisfies Meta<typeof AgentTrialClaimScreen>

export default meta

type Story = StoryObj<typeof meta>

export const AlreadyApprovedMock: Story = {
  name: 'Already approved mock',
  args: {
    claim: {
      ...agentTrialClaimView,
      claim: {
        ...agentTrialClaimView.claim,
        status: 'approved'
      }
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Agent claimed. Return to the agent client.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^claim agent$/i })).toBeDisabled()
    await expect(await canvas.findByRole('button', { name: /^deny$/i })).toBeDisabled()
  }
}

export const ExpiredMock: Story = {
  name: 'Expired mock',
  args: {
    claim: {
      ...agentTrialClaimView,
      claim: {
        expires_at: '2026-06-20T18:00:00.000Z',
        status: 'expired'
      }
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Trial claim has expired.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^claim agent$/i })).toBeDisabled()
    await expect(await canvas.findByRole('button', { name: /^deny$/i })).toBeDisabled()
  }
}
