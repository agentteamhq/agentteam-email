import { defaultAuthRouteArgs } from 'src/storybook/auth-route-fixtures'
import { publicAuthRouteState } from 'src/storybook/screen-fixtures'
import { AuthRoutePage } from 'src/screens/auth-route-page'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Auth/Flows/Sign Up',
  component: AuthRoutePage,
  args: {
    ...defaultAuthRouteArgs,
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'signUp'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRoutePage>

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
