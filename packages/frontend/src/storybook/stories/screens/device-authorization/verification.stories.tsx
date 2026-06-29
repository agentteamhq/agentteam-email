import { DeviceCodeVerificationScreen } from 'src/screens/device-authorization-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Device Authorization/Verification',
  component: DeviceCodeVerificationScreen,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DeviceCodeVerificationScreen>

export default meta

type VerificationStory = StoryObj<typeof DeviceCodeVerificationScreen>

const noop = async () => {}

export const EnterCode: VerificationStory = {
  name: 'Enter code',
  args: {
    onVerify: noop
  }
}

export const PrefilledCode: VerificationStory = {
  name: 'Prefilled code',
  args: {
    initialUserCode: 'ABCD1234',
    onVerify: noop
  }
}

export const InvalidCode: VerificationStory = {
  name: 'Invalid code',
  args: {
    initialError: 'Invalid user code.',
    initialUserCode: 'ABCD1234',
    onVerify: noop
  }
}
