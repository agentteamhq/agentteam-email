import { DeviceCodeVerificationScreen } from './device-authorization-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Device Authorization/Verification',
  component: DeviceCodeVerificationScreen,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DeviceCodeVerificationScreen>

export default meta

type VerificationStory = StoryObj<typeof DeviceCodeVerificationScreen>

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
