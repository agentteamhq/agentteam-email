import { expect, fn, userEvent, within } from 'storybook/test'

import { DeviceCodeApprovalScreen } from './device-authorization-screen'
import type { Meta, StoryObj } from '@storybook/react'
import type { ComponentProps } from 'react'

const meta = {
  title: 'Mail Client/Device Authorization/Approval',
  component: DeviceCodeApprovalScreen,
  args: {
    onApprove: async () => {},
    onDeny: async () => {},
    userEmail: 'operator@example.com'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DeviceCodeApprovalScreen>

export default meta

type Story = StoryObj<typeof meta>

const agentCapabilityApprovalArgs = {
  approvedMessage: 'Agent authorization was approved. Return to the agent client.',
  codeLabel: 'Approval code',
  deniedMessage: 'The agent authorization request was denied.',
  description: (
    <span className='block space-y-2'>
      <span className='block'>Approve send access for Research Agent.</span>
      <span className='block'>Message Send (research@agentteam.example · org-story)</span>
      <span className='block'>Passkey verification is required for this approval.</span>
      <span className='block'>Expires 6/22/2026, 4:15:00 PM</span>
    </span>
  ),
  title: 'Approve agent capabilities',
  userCode: 'WXYZ9876'
} satisfies Partial<ComponentProps<typeof DeviceCodeApprovalScreen>>

export const Approve: Story = {
  name: 'device / approve',
  args: {
    userCode: 'ABCD1234'
  }
}

export const MissingCode: Story = {
  name: 'device / approve / missing code',
  args: {
    userCode: null
  }
}

export const Error: Story = {
  name: 'device / approve / error',
  args: {
    initialError: 'This device code has already been processed.',
    userCode: 'ABCD1234'
  }
}

export const AgentCapabilities: Story = {
  name: 'agent / capabilities approval',
  args: agentCapabilityApprovalArgs
}

export const AgentCapabilitiesApproved: Story = {
  name: 'agent / capabilities approval / approved',
  args: {
    ...agentCapabilityApprovalArgs,
    onApprove: fn()
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^approve$/i }))
    await expect(args.onApprove).toHaveBeenCalledWith('WXYZ9876')
    await expect(
      await canvas.findByText('Agent authorization was approved. Return to the agent client.')
    ).toBeInTheDocument()
  }
}

export const AgentCapabilitiesDenied: Story = {
  name: 'agent / capabilities approval / denied',
  args: {
    ...agentCapabilityApprovalArgs,
    onDeny: fn()
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^deny$/i }))
    await expect(args.onDeny).toHaveBeenCalledWith('WXYZ9876')
    await expect(await canvas.findByText('The agent authorization request was denied.')).toBeInTheDocument()
  }
}

export const AgentCapabilitiesByApprovalId: Story = {
  name: 'agent / capabilities approval / approval id',
  args: {
    ...agentCapabilityApprovalArgs,
    onApprove: fn(),
    requiresUserCode: false,
    userCode: null
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.queryByLabelText(/approval code/i)).not.toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^approve$/i }))
    await expect(args.onApprove).toHaveBeenCalledWith('')
    await expect(
      await canvas.findByText('Agent authorization was approved. Return to the agent client.')
    ).toBeInTheDocument()
  }
}

export const AgentCapabilitiesAlreadyDenied: Story = {
  name: 'agent / capabilities approval / already denied',
  args: {
    ...agentCapabilityApprovalArgs,
    decisionDisabled: true,
    decisionDisabledMessage: 'This agent authorization request was denied.',
    onApprove: fn(),
    onDeny: fn()
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('This agent authorization request was denied.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^approve$/i })).toBeDisabled()
    await expect(await canvas.findByRole('button', { name: /^deny$/i })).toBeDisabled()
    await expect(args.onApprove).not.toHaveBeenCalled()
    await expect(args.onDeny).not.toHaveBeenCalled()
  }
}

export const AgentCapabilitiesExpired: Story = {
  name: 'agent / capabilities approval / expired',
  args: {
    ...agentCapabilityApprovalArgs,
    decisionDisabled: true,
    decisionDisabledMessage: 'This agent authorization request expired.',
    onApprove: fn(),
    onDeny: fn()
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('This agent authorization request expired.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^approve$/i })).toBeDisabled()
    await expect(await canvas.findByRole('button', { name: /^deny$/i })).toBeDisabled()
    await expect(args.onApprove).not.toHaveBeenCalled()
    await expect(args.onDeny).not.toHaveBeenCalled()
  }
}
