import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from 'storybook/test'

import {
  defaultAuthenticatedDashboardView,
  defaultAuthenticatedSidebarView,
  type AuthenticatedDashboardView,
  type AuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell'
import { SettingsDialog } from '../partials/authenticated/settings-dialog'
import { authenticatedSettingsRouteState, storyPublicEnv } from '../storybook/screen-fixtures'
import { DashboardScreen } from './dashboard-screen'

const loadingSidebarView = {
  ...defaultAuthenticatedSidebarView,
  mails: [],
  state: 'loading'
} satisfies AuthenticatedSidebarView

const emptySidebarView = {
  ...defaultAuthenticatedSidebarView,
  emptyDescription: 'This mailbox does not have any messages yet.',
  emptyTitle: 'No messages',
  mails: [],
  state: 'empty'
} satisfies AuthenticatedSidebarView

const loadingDashboardView = {
  ...defaultAuthenticatedDashboardView,
  state: 'loading'
} satisfies AuthenticatedDashboardView

const emptyDashboardView = {
  ...defaultAuthenticatedDashboardView,
  emptyDescription: 'Dashboard modules will appear here once there is workspace activity.',
  emptyTitle: 'No dashboard activity',
  state: 'empty'
} satisfies AuthenticatedDashboardView

const meta = {
  title: 'Authenticated Section/Views',
  component: DashboardScreen,
  args: {
    dashboardView: defaultAuthenticatedDashboardView,
    publicEnv: storyPublicEnv,
    routeState: authenticatedSettingsRouteState,
    sidebarView: defaultAuthenticatedSidebarView
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The production authenticated shell and settings dialog using the promoted sidebar-09 and sidebar-13 layouts.'
      }
    }
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Sidebar09: Story = {
  name: 'sidebar-09'
}

export const Sidebar09Loading: Story = {
  name: 'sidebar-09 loading',
  args: {
    dashboardView: loadingDashboardView,
    sidebarView: loadingSidebarView
  }
}

export const Sidebar09Empty: Story = {
  name: 'sidebar-09 empty',
  args: {
    dashboardView: emptyDashboardView,
    sidebarView: emptySidebarView
  }
}

export const SettingsDialogOpen: Story = {
  name: 'sidebar-13 settings dialog',
  render: () => <SettingsDialog />
}

export const SettingsDialogLoading: Story = {
  name: 'sidebar-13 settings dialog loading',
  render: () => <SettingsDialog contentState='loading' />
}

export const SettingsDialogEmpty: Story = {
  name: 'sidebar-13 settings dialog empty',
  render: () => <SettingsDialog contentState='empty' />
}

export const SettingsDialogConnectedAccounts: Story = {
  name: 'sidebar-13 connected accounts',
  render: () => (
    <SettingsDialog
      activeSection='connectedAccounts'
      contentState='empty'
    />
  )
}

export const SettingsDialogFromAvatarMenu: Story = {
  name: 'sidebar-09 avatar menu opens sidebar-13 settings',
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await body.findByRole('button', { name: /open account menu/i }))
    await userEvent.click(await body.findByRole('menuitem', { name: /billing/i }))

    const dialog = await body.findByRole('dialog')

    await expect(dialog).toBeInTheDocument()
    await expect(dialog).toHaveTextContent(/Messages & media/i)
  }
}
