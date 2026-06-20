import type { Meta, StoryObj } from '@storybook/react'

import { AuthRouteStory } from '../storybook/auth-route-story'
import { publicAuthRouteState, storyPublicEnv } from '../storybook/screen-fixtures'

const meta = {
  title: 'Screens/Auth/Flows/Invitation',
  component: AuthRouteStory,
  args: {
    publicEnv: storyPublicEnv,
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'acceptInvitation'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRouteStory>

export default meta

type Story = StoryObj<typeof meta>

export const Step01Accept: Story = {
  name: '01 accept',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'acceptInvitation'
  }
}
