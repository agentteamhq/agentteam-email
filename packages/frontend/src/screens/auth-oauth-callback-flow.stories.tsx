import { defaultAuthRouteArgs } from '../storybook/auth-route-fixtures'
import { publicAuthRouteState } from '../storybook/screen-fixtures'
import { AuthRoutePage } from './auth-route-page'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Auth/Flows/OAuth Callback',
  component: AuthRoutePage,
  args: {
    ...defaultAuthRouteArgs,
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'callback'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRoutePage>

export default meta

type Story = StoryObj<typeof meta>

export const Step01CompletingAuth: Story = {
  name: '01 completing auth',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'callback'
  }
}
