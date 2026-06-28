import { defaultAuthRouteArgs } from 'src/storybook/auth-route-fixtures'
import { publicAuthRouteState, resetSuccessAuthRouteState } from 'src/storybook/screen-fixtures'
import { AuthRoutePage } from 'src/screens/auth-route-page'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Auth/Flows/Password Reset',
  component: AuthRoutePage,
  args: {
    ...defaultAuthRouteArgs,
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'forgotPassword'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRoutePage>

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

export const Step02ResetFromEmailLink: Story = {
  name: '02 reset from email link',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    resetPasswordToken: 'storybook-reset-token',
    view: 'resetPassword'
  }
}

export const Step03SignInAfterReset: Story = {
  name: '03 sign in after reset',
  args: {
    routeState: resetSuccessAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'signIn'
  }
}
