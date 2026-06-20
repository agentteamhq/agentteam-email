import type { Meta, StoryObj } from '@storybook/react'

import { AuthRouteStory } from '../storybook/auth-route-story'
import { protectedRouteSignInState, storyPublicEnv } from '../storybook/screen-fixtures'

const meta = {
  title: 'Screens/Auth/Flows/Sign In',
  component: AuthRouteStory,
  args: {
    publicEnv: storyPublicEnv,
    routeState: protectedRouteSignInState,
    lastUsedLoginMethod: null,
    view: 'signIn'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRouteStory>

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
