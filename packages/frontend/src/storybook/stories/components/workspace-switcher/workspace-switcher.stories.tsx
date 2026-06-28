import { expect, fn, userEvent, within } from 'storybook/test'

import {
  accountSwitchingSidebarView,
  authenticatedSectionBaseArgs,
  emailPreviewsById,
  emptyAuthenticatedDashboardView,
  emptyAuthenticatedSidebarView,
  loadingAuthenticatedDashboardView,
  loadingAuthenticatedSidebarView
} from 'src/storybook/authenticated-section-fixtures'
import { longWorkspaceSwitcherMailboxes } from 'src/storybook/workspace-mailbox-switcher-fixtures'
import { DashboardScreen } from 'src/screens/dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'
import type {
  AuthenticatedMailAccount,
  AuthenticatedSidebarView
} from 'src/partials/authenticated/authenticated-shell-models'
import type { WorkspaceMailboxSwitcherMailbox } from 'src/partials/authenticated/workspace-mailbox-switcher'

const singleWorkspace = {
  activeWorkspaceId: 'northstar-ops',
  workspaces: [
    {
      id: 'northstar-ops',
      name: 'Northstar Ops',
      slug: 'northstar-ops'
    }
  ]
} satisfies AuthenticatedSidebarView['workspaceSwitcher']

const mailboxListSidebarView = {
  ...accountSwitchingSidebarView,
  workspaceSwitcher: singleWorkspace
} satisfies AuthenticatedSidebarView

const longMailboxListSidebarView = {
  ...accountSwitchingSidebarView,
  accounts: (longWorkspaceSwitcherMailboxes as ReadonlyArray<WorkspaceMailboxSwitcherMailbox>).map(
    ({ address, disabled, disabledReason, id, name }) =>
      ({
        address,
        disabled,
        disabledReason,
        id,
        name
      }) satisfies AuthenticatedMailAccount
  ),
  activeAccountId: 'support',
  workspaceSwitcher: singleWorkspace
} satisfies AuthenticatedSidebarView

const emptyMailboxSidebarView = {
  ...emptyAuthenticatedSidebarView,
  accounts: [],
  activeAccountId: undefined,
  workspaceSwitcher: singleWorkspace
} satisfies AuthenticatedSidebarView

const loadingMailboxSidebarView = {
  ...loadingAuthenticatedSidebarView,
  accounts: [],
  activeAccountId: undefined,
  workspaceSwitcher: singleWorkspace
} satisfies AuthenticatedSidebarView

const meta = {
  title: 'Components/Workspace Switcher',
  component: DashboardScreen,
  args: {
    ...authenticatedSectionBaseArgs,
    emailPreviewsById,
    onComposeOpenChange: fn(),
    onMailboxAccountSelect: fn(),
    onMailboxRefresh: fn(),
    onMailboxSearchChange: fn(),
    onMailboxUnreadOnlyChange: fn(),
    sidebarView: mailboxListSidebarView
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

async function openWorkspaceMailboxSwitcher(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)

  await userEvent.click(await canvas.findByRole('button', { name: /open workspace and mailbox switcher/i }))

  return within(canvasElement.ownerDocument.body)
}

export const Default: Story = {
  name: 'Default',
  play: async ({ args, canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByRole('menuitem', { name: /support agent/i })).toBeInTheDocument()
    await expect(body.queryByText(/retry queue needs review/i)).not.toBeInTheDocument()

    await userEvent.click(await body.findByRole('menuitem', { name: /billing agent/i }))
    await expect(args.onMailboxAccountSelect).toHaveBeenCalledWith('agent-billing')
  }
}

export const LongMailboxList: Story = {
  name: 'Long mailbox list',
  args: {
    sidebarView: longMailboxListSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByRole('menuitem', { name: /abuse review/i })).toBeInTheDocument()
    await expect(await body.findByRole('menuitem', { name: /notifications/i })).toHaveAttribute(
      'data-disabled'
    )
    await expect(body.queryByText(/policy alerts open/i)).not.toBeInTheDocument()
  }
}

export const Empty: Story = {
  name: 'Empty',
  args: {
    dashboardView: emptyAuthenticatedDashboardView,
    sidebarView: emptyMailboxSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByText('No mailboxes')).toBeInTheDocument()
  }
}

export const Loading: Story = {
  name: 'Loading',
  args: {
    dashboardView: loadingAuthenticatedDashboardView,
    sidebarView: loadingMailboxSidebarView
  }
}

export const SingleWorkspace: Story = {
  name: 'Single workspace',
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByText('Northstar Ops')).toBeInTheDocument()
    await expect(body.queryByText(/^Workspaces$/i)).not.toBeInTheDocument()
  }
}
