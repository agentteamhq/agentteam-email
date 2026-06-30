import { expect, userEvent, within } from 'storybook/test'

import { DeviceVerificationRouteStoryFrame } from 'src/storybook/device-agent-route-frames'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Device Authorization/Verification',
  component: DeviceVerificationRouteStoryFrame,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DeviceVerificationRouteStoryFrame>

export default meta

type VerificationStory = StoryObj<typeof meta>

export const EnterCode: VerificationStory = {
  name: 'Enter code'
}

export const PrefilledCode: VerificationStory = {
  name: 'Prefilled code',
  args: {
    routeSearch: {
      user_code: 'ABCD1234'
    }
  }
}

export const InvalidCode: VerificationStory = {
  name: 'Invalid code interaction',
  args: {
    routeSearch: {
      user_code: 'ABCD1234'
    },
    verifyDeviceUserCode: async () => {
      throw new Error('Invalid user code.')
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^continue$/i }))
    await expect(await canvas.findByText('Invalid user code.')).toBeInTheDocument()
  }
}
