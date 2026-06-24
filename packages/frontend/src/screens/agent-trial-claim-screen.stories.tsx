import { expect, userEvent, within } from 'storybook/test'

import { agentTrialClaimView } from '../storybook/agent-access-fixtures'
import { AgentTrialClaimScreen } from './agent-trial-claim-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Agent Access/Trial Claim',
  component: AgentTrialClaimScreen,
  args: {
    claim: agentTrialClaimView,
    onApprove: async () => {},
    onDeny: async () => {},
    userEmail: 'operator@example.com'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AgentTrialClaimScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Ready: Story = {
  name: 'agent trial claim / ready'
}

export const NarrowPostClaimAccess: Story = {
  name: 'agent trial claim / narrower post-claim access',
  args: {
    claim: {
      ...agentTrialClaimView,
      post_claim_capabilities: ['email.status', 'email.message.read']
    }
  }
}

export const Loading: Story = {
  name: 'agent trial claim / loading',
  args: {
    claim: null,
    loading: true
  }
}

export const LoadError: Story = {
  name: 'agent trial claim / error',
  args: {
    claim: null,
    loadError: 'Trial claim has expired.'
  }
}

export const Approved: Story = {
  name: 'agent trial claim / approved',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^claim agent$/i }))
    await expect(await canvas.findByText('Agent claimed. Return to the agent client.')).toBeInTheDocument()
  }
}

export const AlreadyApproved: Story = {
  name: 'agent trial claim / already approved',
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

export const Expired: Story = {
  name: 'agent trial claim / expired',
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

export const TargetOrganizationChoice: Story = {
  name: 'agent trial claim / target organization choice',
  args: {
    claim: {
      ...agentTrialClaimView,
      target_organizations: [
        {
          id: 'org_ops',
          name: 'Operations Team',
          slug: 'ops-team'
        },
        {
          id: 'org_story',
          name: 'Research Lab',
          slug: 'research-lab'
        }
      ]
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('combobox', { name: /target organization/i }))
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('option', {
        name: /operations team/i
      })
    )
    await expect((await canvas.findAllByText('Operations Team')).length).toBeGreaterThan(0)
  }
}

export const Denied: Story = {
  name: 'agent trial claim / denied',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^deny$/i }))
    await expect(await canvas.findByText('Agent claim denied.')).toBeInTheDocument()
  }
}

export const ActionError: Story = {
  name: 'agent trial claim / action error',
  args: {
    onApprove: async () => {
      throw new Error('Trial claim approval failed by policy.')
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^claim agent$/i }))
    await expect(await canvas.findByText('Trial claim approval failed by policy.')).toBeInTheDocument()
  }
}
