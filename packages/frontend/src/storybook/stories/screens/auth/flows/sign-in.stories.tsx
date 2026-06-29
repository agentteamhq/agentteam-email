import { defaultAuthRouteArgs } from 'src/storybook/auth-route-fixtures'
import { protectedRouteSignInState } from 'src/storybook/screen-fixtures'
import { AuthRoutePage } from 'src/screens/auth-route-page'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Auth/Flows/Sign In',
  component: AuthRoutePage,
  args: {
    ...defaultAuthRouteArgs,
    routeState: protectedRouteSignInState,
    lastUsedLoginMethod: null,
    view: 'signIn'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRoutePage>

export default meta

type Story = StoryObj<typeof meta>

export const Step01ProtectedRouteReturn: Story = {
  name: '01 protected route return',
  args: {
    routeState: protectedRouteSignInState,
    lastUsedLoginMethod: null,
    view: 'signIn'
  }
}
