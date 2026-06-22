import { DeviceCodeApprovalScreen, DeviceCodeVerificationScreen } from './device-authorization-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Device Authorization',
  component: DeviceCodeVerificationScreen,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DeviceCodeVerificationScreen>

export default meta

type VerificationStory = StoryObj<typeof DeviceCodeVerificationScreen>
type ApprovalStory = StoryObj<typeof DeviceCodeApprovalScreen>

const noop = async () => {}

export const EnterCode: VerificationStory = {
  name: 'device / enter code',
  args: {
    onVerify: noop
  }
}

export const PrefilledCode: VerificationStory = {
  name: 'device / prefilled code',
  args: {
    initialUserCode: 'ABCD1234',
    onVerify: noop
  }
}

export const InvalidCode: VerificationStory = {
  name: 'device / invalid code',
  args: {
    initialError: 'Invalid user code.',
    initialUserCode: 'ABCD1234',
    onVerify: noop
  }
}

export const Approve: ApprovalStory = {
  name: 'device / approve',
  render: () => (
    <DeviceCodeApprovalScreen
      userCode='ABCD1234'
      userEmail='operator@example.com'
      onApprove={noop}
      onDeny={noop}
    />
  )
}

export const ApproveMissingCode: ApprovalStory = {
  name: 'device / approve / missing code',
  render: () => (
    <DeviceCodeApprovalScreen
      userCode={null}
      userEmail='operator@example.com'
      onApprove={noop}
      onDeny={noop}
    />
  )
}

export const ApproveError: ApprovalStory = {
  name: 'device / approve / error',
  render: () => (
    <DeviceCodeApprovalScreen
      initialError='This device code has already been processed.'
      userCode='ABCD1234'
      userEmail='operator@example.com'
      onApprove={noop}
      onDeny={noop}
    />
  )
}
