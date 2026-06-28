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
  name: 'enter code',
  args: {
    onVerify: noop
  }
}

export const PrefilledCode: VerificationStory = {
  name: 'prefilled code',
  args: {
    initialUserCode: 'ABCD1234',
    onVerify: noop
  }
}

export const InvalidCode: VerificationStory = {
  name: 'invalid code',
  args: {
    initialError: 'Invalid user code.',
    initialUserCode: 'ABCD1234',
    onVerify: noop
  }
}
