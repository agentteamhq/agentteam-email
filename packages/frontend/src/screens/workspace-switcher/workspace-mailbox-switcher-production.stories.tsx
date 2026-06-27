import { expect, fn, userEvent, within } from 'storybook/test'

import {
  accountSwitchingSidebarView,
  authenticatedSectionBaseArgs,
  emailPreviewsById,
  emptyAuthenticatedDashboardView,
  emptyAuthenticatedSidebarView,
  loadingAuthenticatedDashboardView,
  loadingAuthenticatedSidebarView
} from '../../storybook/authenticated-section-fixtures'
import { longWorkspaceSwitcherMailboxes } from '../../storybook/workspace-mailbox-switcher-fixtures'
import { DashboardScreen } from '../dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'
import type {
  AuthenticatedMailAccount,
  AuthenticatedSidebarView
} from '../../partials/authenticated/authenticated-shell-models'
import type { WorkspaceMailboxSwitcherMailbox } from '../../partials/authenticated/workspace-mailbox-switcher'

const productionWorkspace = {
  activeWorkspaceId: 'northstar-ops',
  workspaces: [
    {
      id: 'northstar-ops',
      name: 'Northstar Ops',
      slug: 'northstar-ops'
    }
  ]
} satisfies AuthenticatedSidebarView['workspaceSwitcher']

const productionMailboxListSidebarView = {
  ...accountSwitchingSidebarView,
  workspaceSwitcher: productionWorkspace
} satisfies AuthenticatedSidebarView

const productionLongMailboxListSidebarView = {
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
  workspaceSwitcher: productionWorkspace
} satisfies AuthenticatedSidebarView

const productionEmptyMailboxSidebarView = {
  ...emptyAuthenticatedSidebarView,
  accounts: [],
  activeAccountId: undefined,
  workspaceSwitcher: productionWorkspace
} satisfies AuthenticatedSidebarView

const productionLoadingMailboxSidebarView = {
  ...loadingAuthenticatedSidebarView,
  accounts: [],
  activeAccountId: undefined,
  workspaceSwitcher: productionWorkspace
} satisfies AuthenticatedSidebarView

const meta = {
  title: 'Mail Client/Workspace Switcher/Production',
  component: DashboardScreen,
  args: {
    ...authenticatedSectionBaseArgs,
    emailPreviewsById,
    onComposeOpenChange: fn(),
    onMailboxAccountSelect: fn(),
    onMailboxRefresh: fn(),
    onMailboxSearchChange: fn(),
    onMailboxUnreadOnlyChange: fn(),
    sidebarView: productionMailboxListSidebarView
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

export const ProductionMailboxList: Story = {
  name: 'mailboxes / production list',
  play: async ({ args, canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByRole('menuitem', { name: /support agent/i })).toBeInTheDocument()
    await expect(body.queryByText(/retry queue needs review/i)).not.toBeInTheDocument()

    await userEvent.click(await body.findByRole('menuitem', { name: /billing agent/i }))
    await expect(args.onMailboxAccountSelect).toHaveBeenCalledWith('agent-billing')
  }
}

export const ProductionLongMailboxList: Story = {
  name: 'mailboxes / production long list',
  args: {
    sidebarView: productionLongMailboxListSidebarView
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

export const ProductionEmptyMailboxes: Story = {
  name: 'mailboxes / production empty',
  args: {
    dashboardView: emptyAuthenticatedDashboardView,
    sidebarView: productionEmptyMailboxSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByText('No mailboxes')).toBeInTheDocument()
  }
}

export const ProductionLoadingMailboxes: Story = {
  name: 'mailboxes / production loading',
  args: {
    dashboardView: loadingAuthenticatedDashboardView,
    sidebarView: productionLoadingMailboxSidebarView
  }
}

export const ProductionSingleWorkspace: Story = {
  name: 'workspaces / single workspace',
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByText('Northstar Ops')).toBeInTheDocument()
    await expect(body.queryByText(/^Workspaces$/i)).not.toBeInTheDocument()
  }
}
