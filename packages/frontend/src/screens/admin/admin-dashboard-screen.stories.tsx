import { storyAuthClient } from '../../storybook/auth-client-fixtures'
import { storyAuthenticatedUser, storyPublicEnv } from '../../storybook/screen-fixtures'
import { AdminDashboardScreen } from './admin-dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Screens/Admin Dashboard',
  component: AdminDashboardScreen,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AdminDashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    authClient: storyAuthClient,
    publicEnv: storyPublicEnv,
    routeState: {
      redirectTo: '/admin/setup/',
      setupRequired: false,
      shouldNotFound: false,
      user: storyAuthenticatedUser
    },
    sessionCleanupEnabled: false
  }
}
