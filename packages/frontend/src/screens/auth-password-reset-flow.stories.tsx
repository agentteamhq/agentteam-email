import type { Meta, StoryObj } from '@storybook/react'

import { AuthRouteStory } from '../storybook/auth-route-story'
import {
  publicAuthRouteState,
  resetSuccessAuthRouteState,
  storyPublicEnv
} from '../storybook/screen-fixtures'
import { EmailStatusScreen } from './email-status-screen'

const meta = {
  title: 'Screens/Auth/Flows/Password Reset',
  component: AuthRouteStory,
  args: {
    publicEnv: storyPublicEnv,
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'forgotPassword'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRouteStory>

export default meta

type Story = StoryObj<typeof meta>

export const Step01RequestLink: Story = {
  name: '01 request link',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'forgotPassword'
  }
}

export const Step02RecoveryEmailSent: Story = {
  name: '02 recovery email sent',
  render: () => (
    <EmailStatusScreen
      publicEnv={storyPublicEnv}
      type='recovery'
    />
  )
}

export const Step03ResetFromEmailLink: Story = {
  name: '03 reset from email link',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    search: '?token=storybook-reset-token',
    view: 'resetPassword'
  }
}

export const Step04SignInAfterReset: Story = {
  name: '04 sign in after reset',
  args: {
    routeState: resetSuccessAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'signIn'
  }
}
