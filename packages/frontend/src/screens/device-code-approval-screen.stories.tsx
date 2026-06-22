import { DeviceCodeApprovalScreen } from './device-authorization-screen'
import type { Meta, StoryObj } from '@storybook/react'

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
