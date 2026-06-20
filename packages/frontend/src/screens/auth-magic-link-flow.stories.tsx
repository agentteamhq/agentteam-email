import type { Meta, StoryObj } from '@storybook/react'

import { AuthRouteStory } from '../storybook/auth-route-story'
import { publicAuthRouteState, storyPublicEnv } from '../storybook/screen-fixtures'

const meta = {
  title: 'Screens/Auth/Flows/Magic Link',
  component: AuthRouteStory,
  args: {
    publicEnv: storyPublicEnv,
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'magicLink'
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
    view: 'magicLink'
  }
}
