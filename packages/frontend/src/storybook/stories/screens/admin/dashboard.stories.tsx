import { storyAuthClient } from 'src/storybook/auth-client-fixtures'
import { storyAuthenticatedUser, storyPublicEnv } from 'src/storybook/screen-fixtures'
import { AdminDashboardScreen } from 'src/screens/admin/admin-dashboard-screen'
import { AdminDashboardStoryFrame } from 'src/storybook/admin-dashboard-story-frame'
import {
  adminDashboardEmptySummary,
  adminDashboardHealthySummary,
  adminDashboardNeedsAttentionSummary
} from 'src/storybook/admin-dashboard-fixtures'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Screens/Admin/Dashboard',
  component: AdminDashboardScreen,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AdminDashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

const routeState = {
  redirectTo: '/admin/setup/',
  setupRequired: false,
  shouldNotFound: false,
  user: storyAuthenticatedUser
} as const

export const Default: Story = {
  args: {
    authClient: storyAuthClient,
    publicEnv: storyPublicEnv,
    routeState,
    sessionCleanupEnabled: false
  },
  render: (args) => (
    <AdminDashboardStoryFrame
      {...args}
      summary={adminDashboardHealthySummary}
    />
  )
}

export const NeedsAttention: Story = {
  args: {
    authClient: storyAuthClient,
    publicEnv: storyPublicEnv,
    routeState,
    sessionCleanupEnabled: false
  },
  render: (args) => (
    <AdminDashboardStoryFrame
      {...args}
      summary={adminDashboardNeedsAttentionSummary}
    />
  )
}

export const EmptyInstance: Story = {
  args: {
    authClient: storyAuthClient,
    publicEnv: storyPublicEnv,
    routeState,
    sessionCleanupEnabled: false
  },
  render: (args) => (
    <AdminDashboardStoryFrame
      {...args}
      summary={adminDashboardEmptySummary}
    />
  )
}

export const Loading: Story = {
  args: {
    authClient: storyAuthClient,
    publicEnv: storyPublicEnv,
    routeState,
    sessionCleanupEnabled: false
  },
  render: (args) => (
    <AdminDashboardStoryFrame
      {...args}
      loading
    />
  )
}

export const LoadError: Story = {
  args: {
    authClient: storyAuthClient,
    publicEnv: storyPublicEnv,
    routeState,
    sessionCleanupEnabled: false
  },
  render: (args) => (
    <AdminDashboardStoryFrame
      {...args}
      summaryError={new Error('Admin dashboard summary could not be loaded.')}
    />
  )
}
