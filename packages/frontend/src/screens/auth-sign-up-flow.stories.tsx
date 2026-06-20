import type { Meta, StoryObj } from '@storybook/react'

import { AuthRouteStory } from '../storybook/auth-route-story'
import { publicAuthRouteState, storyPublicEnv } from '../storybook/screen-fixtures'
import { EmailStatusScreen } from './email-status-screen'

const meta = {
  title: 'Screens/Auth/Flows/Sign Up',
  component: AuthRouteStory,
  args: {
    publicEnv: storyPublicEnv,
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'signUp'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRouteStory>

export default meta

type Story = StoryObj<typeof meta>

export const Step01CreateAccount: Story = {
  name: '01 create account',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'signUp'
  }
}

export const Step02VerificationEmailSent: Story = {
  name: '02 verification email sent',
  render: () => (
    <EmailStatusScreen
      publicEnv={storyPublicEnv}
      type='verification'
    />
  )
}
