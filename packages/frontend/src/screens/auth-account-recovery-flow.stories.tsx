import type { Meta, StoryObj } from '@storybook/react'

import { AuthRouteStory } from '../storybook/auth-route-story'
import { publicAuthRouteState, storyPublicEnv } from '../storybook/screen-fixtures'

const meta = {
  title: 'Screens/Auth/Flows/Account Recovery',
  component: AuthRouteStory,
  args: {
    publicEnv: storyPublicEnv,
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'recoverAccount'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRouteStory>

export default meta

type Story = StoryObj<typeof meta>

export const Step01BackupCode: Story = {
  name: '01 backup code',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'recoverAccount'
  }
}
