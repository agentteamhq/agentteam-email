import { expect, fn, userEvent, within } from 'storybook/test'

import {
  agentAccessActionableState,
  agentAccessDeniedExpiredApprovalState,
  agentAccessPendingApprovalState
} from 'src/storybook/agent-access-fixtures'
import { DeviceAuthorizationApprovalRouteStoryFrame } from 'src/storybook/device-agent-route-frames'
import type { AgentAccessApprovalPreview, AgentAccessMutationResult } from '@main/backend'
import type { Meta, StoryObj } from '@storybook/react'

const agentCapabilityApprovalPreview = {
  approval: agentAccessPendingApprovalState.view.approvals[0],
  capabilityCatalog: agentAccessPendingApprovalState.view.capabilityCatalog,
  organizationId: agentAccessPendingApprovalState.view.organizationId
} satisfies AgentAccessApprovalPreview

const approveAgentCapabilities = fn(async () => createAgentAccessDecisionResult('approved'))
const denyAgentCapabilities = fn(async () => createAgentAccessDecisionResult('denied'))
const approveAgentCapabilitiesById = fn(async () => createAgentAccessDecisionResult('approved'))
const deniedAgentCapabilitiesDecision = fn(async () => createAgentAccessDecisionResult('denied'))
const expiredAgentCapabilitiesDecision = fn(async () => createAgentAccessDecisionResult('denied'))

const meta = {
  title: 'Screens/Device Authorization/Approval',
  component: DeviceAuthorizationApprovalRouteStoryFrame,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DeviceAuthorizationApprovalRouteStoryFrame>

export default meta

type Story = StoryObj<typeof meta>

export const Approve: Story = {
  name: 'Approve',
  args: {
    route: 'device-approval',
    routeSearch: {
      user_code: 'ABCD1234'
    }
  }
}

export const MissingCode: Story = {
  name: 'Approve missing code',
  args: {
    route: 'device-approval'
  }
}

export const Error: Story = {
  name: 'Approve action error',
  args: {
    approveDeviceUserCode: async () => {
      throw new globalThis.Error('This device code has already been processed.')
    },
    route: 'device-approval',
    routeSearch: {
      user_code: 'ABCD1234'
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^approve$/i }))
    await expect(await canvas.findByText('This device code has already been processed.')).toBeInTheDocument()
  }
}

export const AgentCapabilities: Story = {
  name: 'Agent capabilities approval',
  args: {
    approvalPreview: agentCapabilityApprovalPreview,
    route: 'agent-capabilities',
    routeSearch: {
      user_code: 'WXYZ9876'
    }
  }
}

export const AgentCapabilitiesApproved: Story = {
  name: 'Agent capabilities approved',
  args: {
    approvalPreview: agentCapabilityApprovalPreview,
    decideAgentAccessApproval: approveAgentCapabilities,
    route: 'agent-capabilities',
    routeSearch: {
      user_code: 'WXYZ9876'
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^approve$/i }))
    await expect(approveAgentCapabilities).toHaveBeenCalledWith({
      action: 'approve',
      userCode: 'WXYZ9876'
    })
    await expect(
      await canvas.findByText('Agent authorization was approved. Return to the agent client.')
    ).toBeInTheDocument()
  }
}

export const AgentCapabilitiesDenied: Story = {
  name: 'Agent capabilities denied',
  args: {
    approvalPreview: agentCapabilityApprovalPreview,
    decideAgentAccessApproval: denyAgentCapabilities,
    route: 'agent-capabilities',
    routeSearch: {
      user_code: 'WXYZ9876'
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^deny$/i }))
    await expect(denyAgentCapabilities).toHaveBeenCalledWith({
      action: 'deny',
      reason: 'User denied the agent authorization request.',
      userCode: 'WXYZ9876'
    })
    await expect(await canvas.findByText('The agent authorization request was denied.')).toBeInTheDocument()
  }
}

export const AgentCapabilitiesByApprovalId: Story = {
  name: 'Agent capabilities approval ID',
  args: {
    agentAccessView: agentAccessActionableState.view,
    decideAgentAccessApproval: approveAgentCapabilitiesById,
    route: 'agent-capabilities',
    routeSearch: {
      approval_id: 'approval-send'
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.queryByLabelText(/approval code/i)).not.toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^approve$/i }))
    await expect(approveAgentCapabilitiesById).toHaveBeenCalledWith({
      action: 'approve',
      approvalId: 'approval-send'
    })
    await expect(
      await canvas.findByText('Agent authorization was approved. Return to the agent client.')
    ).toBeInTheDocument()
  }
}

export const AgentCapabilitiesAlreadyDenied: Story = {
  name: 'Agent capabilities already denied',
  args: {
    agentAccessView: agentAccessDeniedExpiredApprovalState.view,
    decideAgentAccessApproval: deniedAgentCapabilitiesDecision,
    route: 'agent-capabilities',
    routeSearch: {
      approval_id: 'approval-denied'
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('This agent authorization request was denied.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^approve$/i })).toBeDisabled()
    await expect(await canvas.findByRole('button', { name: /^deny$/i })).toBeDisabled()
    await expect(deniedAgentCapabilitiesDecision).not.toHaveBeenCalled()
  }
}

export const AgentCapabilitiesExpired: Story = {
  name: 'Agent capabilities expired',
  args: {
    agentAccessView: agentAccessDeniedExpiredApprovalState.view,
    decideAgentAccessApproval: expiredAgentCapabilitiesDecision,
    route: 'agent-capabilities',
    routeSearch: {
      approval_id: 'approval-expired'
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('This agent authorization request expired.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^approve$/i })).toBeDisabled()
    await expect(await canvas.findByRole('button', { name: /^deny$/i })).toBeDisabled()
    await expect(expiredAgentCapabilitiesDecision).not.toHaveBeenCalled()
  }
}

function createAgentAccessDecisionResult(status: 'approved' | 'denied') {
  return {
    status,
    success: true,
    view: agentAccessActionableState.view
  } satisfies AgentAccessMutationResult
}
