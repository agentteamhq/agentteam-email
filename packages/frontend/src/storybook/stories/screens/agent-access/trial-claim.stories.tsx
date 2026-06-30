import { expect, fn, userEvent, within } from 'storybook/test'

import { agentTrialClaimView } from 'src/storybook/agent-access-fixtures'
import { AgentTrialClaimRouteStoryFrame } from 'src/storybook/device-agent-route-frames'
import type { AgentMailTrialClaimDecisionResult } from '@main/backend'
import type { Meta, StoryObj } from '@storybook/react'

const storyClaimToken = 'trial-claim-token'

const meta = {
  title: 'Screens/Agent Access/Trial Claim',
  component: AgentTrialClaimRouteStoryFrame,
  args: {
    fetchAgentMailTrialClaimResult: agentTrialClaimView,
    token: storyClaimToken
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AgentTrialClaimRouteStoryFrame>

export default meta

type Story = StoryObj<typeof meta>

export const Ready: Story = {
  name: 'Ready'
}

export const NarrowPostClaimAccess: Story = {
  name: 'Narrower post-claim access',
  args: {
    fetchAgentMailTrialClaimResult: {
      ...agentTrialClaimView,
      post_claim_capabilities: ['email.status', 'email.message.read']
    }
  }
}

export const Loading: Story = {
  name: 'Loading',
  args: {
    fetchAgentMailTrialClaimLoading: true,
    fetchAgentMailTrialClaimResult: null
  }
}

export const LoadError: Story = {
  name: 'Expired route error',
  args: {
    fetchAgentMailTrialClaimError: 'Trial claim has expired.',
    fetchAgentMailTrialClaimResult: null
  }
}

export const Approved: Story = {
  name: 'Approved',
  args: {
    decideAgentMailTrialClaim: fn(async () => createTrialClaimDecisionResult('approve'))
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^claim agent$/i }))
    await expect(args.decideAgentMailTrialClaim).toHaveBeenCalledWith({
      action: 'approve',
      targetOrganizationId: 'org_story',
      token: storyClaimToken
    })
    await expect(await canvas.findByText('Agent claimed. Return to the agent client.')).toBeInTheDocument()
  }
}

export const TargetOrganizationChoice: Story = {
  name: 'Target organization choice',
  args: {
    fetchAgentMailTrialClaimResult: {
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
  name: 'Denied',
  args: {
    decideAgentMailTrialClaim: fn(async () => createTrialClaimDecisionResult('deny'))
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^deny$/i }))
    await expect(args.decideAgentMailTrialClaim).toHaveBeenCalledWith({
      action: 'deny',
      token: storyClaimToken
    })
    await expect(await canvas.findByText('Agent claim denied.')).toBeInTheDocument()
  }
}

export const ActionError: Story = {
  name: 'Action error',
  args: {
    decideAgentMailTrialClaim: async () => {
      throw new Error('Trial claim approval failed by policy.')
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^claim agent$/i }))
    await expect(await canvas.findByText('Trial claim approval failed by policy.')).toBeInTheDocument()
  }
}

function createTrialClaimDecisionResult(action: 'approve' | 'deny') {
  const status = action === 'approve' ? 'approved' : 'denied'

  return {
    action,
    claim: {
      status
    },
    success: true,
    view: {
      ...agentTrialClaimView,
      claim: {
        ...agentTrialClaimView.claim,
        status
      }
    }
  } satisfies AgentMailTrialClaimDecisionResult
}
