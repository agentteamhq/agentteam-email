import { expect, userEvent, within } from 'storybook/test'

import { agentTrialClaimView } from 'src/storybook/agent-access-fixtures'
import { AgentTrialClaimScreen } from 'src/screens/agent-trial-claim-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Agent Access/Trial Claim',
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
  name: 'ready'
}

export const NarrowPostClaimAccess: Story = {
  name: 'narrower post-claim access',
  args: {
    claim: {
      ...agentTrialClaimView,
      post_claim_capabilities: ['email.status', 'email.message.read']
    }
  }
}

export const Loading: Story = {
  name: 'loading',
  args: {
    claim: null,
    loading: true
  }
}

export const LoadError: Story = {
  name: 'error',
  args: {
    claim: null,
    loadError: 'Trial claim has expired.'
  }
}

export const Approved: Story = {
  name: 'approved',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^claim agent$/i }))
    await expect(await canvas.findByText('Agent claimed. Return to the agent client.')).toBeInTheDocument()
  }
}

export const AlreadyApproved: Story = {
  name: 'already approved',
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
  name: 'expired',
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
  name: 'target organization choice',
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
  name: 'denied',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^deny$/i }))
    await expect(await canvas.findByText('Agent claim denied.')).toBeInTheDocument()
  }
}

export const ActionError: Story = {
  name: 'action error',
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
