import { storyAuthClient } from 'src/storybook/auth-client-fixtures'
import { storyAuthenticatedUser, storyPublicEnv } from 'src/storybook/screen-fixtures'
import { AdminAuditLogsScreen } from 'src/screens/admin/admin-audit-logs-screen'
import { AdminAuditLogsStoryFrame } from 'src/storybook/admin-audit-logs-story-frame'
import {
  adminAuditLogsDefaultList,
  adminAuditLogsEmptyList,
  adminAuditLogsFilteredList
} from 'src/storybook/admin-audit-logs-fixtures'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Screens/Admin/Audit Logs',
  component: AdminAuditLogsScreen,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AdminAuditLogsScreen>

export default meta

type Story = StoryObj<typeof meta>

const routeState = {
  redirectTo: '/admin/setup/',
  setupRequired: false,
  shouldNotFound: false,
  user: storyAuthenticatedUser
} as const

const baseArgs = {
  authClient: storyAuthClient,
  onSearchChange: () => {},
  publicEnv: storyPublicEnv,
  routeSearch: {
    page: 1,
    pageSize: 25,
    severity: 'all',
    status: 'all'
  },
  routeState,
  sessionCleanupEnabled: false
} as const

export const Default: Story = {
  args: baseArgs,
  render: (args) => {
    const { onSearchChange, routeSearch, ...frameArgs } = args

    return (
      <AdminAuditLogsStoryFrame
        {...frameArgs}
        auditLogList={adminAuditLogsDefaultList}
        routeSearch={routeSearch}
      />
    )
  }
}

export const FilteredFailures: Story = {
  args: baseArgs,
  render: (args) => {
    const { onSearchChange, routeSearch, ...frameArgs } = args

    return (
      <AdminAuditLogsStoryFrame
        {...frameArgs}
        auditLogList={adminAuditLogsFilteredList}
        routeSearch={{
          ...routeSearch,
          action: 'agent',
          status: 'failed'
        }}
      />
    )
  }
}

export const Empty: Story = {
  args: baseArgs,
  render: (args) => {
    const { onSearchChange, routeSearch, ...frameArgs } = args

    return (
      <AdminAuditLogsStoryFrame
        {...frameArgs}
        auditLogList={adminAuditLogsEmptyList}
        routeSearch={routeSearch}
      />
    )
  }
}

export const Loading: Story = {
  args: baseArgs,
  render: (args) => {
    const { onSearchChange, routeSearch, ...frameArgs } = args

    return (
      <AdminAuditLogsStoryFrame
        {...frameArgs}
        loading
        routeSearch={routeSearch}
      />
    )
  }
}

export const LoadError: Story = {
  args: baseArgs,
  render: (args) => {
    const { onSearchChange, routeSearch, ...frameArgs } = args

    return (
      <AdminAuditLogsStoryFrame
        {...frameArgs}
        auditLogListError={new Error('Audit logs could not be loaded.')}
        routeSearch={routeSearch}
      />
    )
  }
}
