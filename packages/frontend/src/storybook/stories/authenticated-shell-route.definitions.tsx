import { expect, userEvent, waitFor, within } from 'storybook/test'

import {
  mailboxAdminAccountsEmptyRpcView,
  mailboxAdminAccountsRpcView
} from '../mailbox-admin-fixtures'
import { mailWorkspaceJunkView, mailWorkspaceReadyView } from '../mail-workspace-fixtures'
import { getMountedStoryShellRouter } from '../story-shell-router'
import { AuthenticatedShellRouteStoryFrame } from './authenticated-shell-route-story-frame'
import type { StoryAppRpcMailboxAdminResult } from '../story-app-rpc-boundary'
import type { AgentMailWebWorkspace } from '@main/backend'
import type { Meta, StoryObj } from '@storybook/react'

const COMPOSE_DRAFT_SUBJECT = 'Quarterly research packet follow-up'
const JUNK_FOLDER_ID = 'junk-id'
const MAILBOX_ADMIN_ERROR_MESSAGE =
  'The mailbox administration RPC returned HTTP 502 while loading accounts.'
const SETTINGS_DIALOG_NAME = /^settings$/i
const SHELL_SIDEBAR_SELECTOR = '[data-slot="sidebar"]'
const SKELETON_SELECTOR = '[data-slot="skeleton"]'

/**
 * Gates the target folder response so a story can observe the transition window. A new gate
 * is built for every render so the story stays re-runnable: a module-scope promise would
 * stay resolved after the first play run and make the transition assertions vacuous.
 */
function createStoryFolderTransitionWorkspace({
  folderId,
  folderView,
  initialView
}: {
  folderId: string
  folderView: AgentMailWebWorkspace
  initialView: AgentMailWebWorkspace
}) {
  let releaseFolder = () => {}
  const folderResolved = new Promise<void>((resolve) => {
    releaseFolder = resolve
  })

  return {
    resolveFolder: () => {
      releaseFolder()
    },
    workspaceForRequest: async (url: URL) => {
      if (url.searchParams.get('folderId') !== folderId) {
        return initialView
      }

      await folderResolved
      return folderView
    }
  }
}

type StoryFolderTransitionWorkspace = ReturnType<typeof createStoryFolderTransitionWorkspace>

/** Storybook runs loaders once per story run, which keeps the gate fresh on every re-run. */
function loadStoryFolderTransitionWorkspace() {
  return {
    folderTransition: createStoryFolderTransitionWorkspace({
      folderId: 'junk-id',
      folderView: mailWorkspaceJunkView,
      initialView: mailWorkspaceReadyView
    })
  }
}

function readLoadedFolderTransition(loaded: unknown): StoryFolderTransitionWorkspace {
  return (loaded as { folderTransition: StoryFolderTransitionWorkspace }).folderTransition
}

export const authenticatedShellRouteStoryMeta = {
  component: AuthenticatedShellRouteStoryFrame,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthenticatedShellRouteStoryFrame>

type Story = StoryObj<typeof authenticatedShellRouteStoryMeta>

/**
 * The settings surface is derived by the `_authenticated/_shell` route from the matched
 * settings route. Nothing hands the screen a `settingsOpen`/`settingsSection` prop.
 */
export const SettingsSectionRoute: Story = {
  args: {
    initialPath: '/settings/domains/'
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const settingsDialog = await body.findByRole('dialog', { name: /^settings$/i }, { timeout: 15000 })
    const settings = within(settingsDialog)

    // The route segment, not a story prop, selected the domains section.
    await expect(
      await settings.findByText('Connect Cloudflare before adding domains to AgentTeam Email.')
    ).toBeInTheDocument()
    await expect(await settings.findByRole('button', { name: 'Domains' })).toBeInTheDocument()
  }
}

/**
 * The dashboard route renders the same shell with settings closed, proving the shell
 * controls settings visibility rather than falling back to uncontrolled screen state.
 */
export const DashboardRoute: Story = {
  args: {
    initialPath: '/dashboard/'
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findAllByText('Quarterly research packet', {}, { timeout: 15000 })).toHaveLength(
      2
    )
    await expect(body.queryByRole('dialog', { name: /^settings$/i })).not.toBeInTheDocument()
  }
}

/**
 * Regression coverage for shell continuity. Navigating `/dashboard/` -> `/settings/account/`
 * -> `/dashboard/` through the product's own controls must not remount the shell and must
 * not discard the in-progress compose draft owned by the mounted controller.
 */
export const SettingsRoundTripKeepsComposeDraft: Story = {
  args: {
    initialPath: '/dashboard/'
  },
  play: async ({ canvasElement }) => {
    const storyDocument = canvasElement.ownerDocument
    const body = within(storyDocument.body)

    await expect(await body.findAllByText('Quarterly research packet', {}, { timeout: 15000 })).toHaveLength(
      2
    )

    // The sidebar is owned by the shell. Holding the node detects a React remount.
    const shellSidebarBeforeNavigation = storyDocument.querySelector(SHELL_SIDEBAR_SELECTOR)
    await expect(shellSidebarBeforeNavigation).not.toBeNull()

    await userEvent.click(await body.findByRole('button', { name: /^compose$/i }))
    await userEvent.type(await body.findByLabelText(/^subject$/i), COMPOSE_DRAFT_SUBJECT)
    await expect(await body.findByLabelText(/^subject$/i)).toHaveValue(COMPOSE_DRAFT_SUBJECT)

    // The compose sheet is modal, so the settings entry point is not clickable while a
    // draft is in progress. Drive the same client-side navigation the product performs.
    await getMountedStoryShellRouter().navigate({ href: '/settings/account/' })
    await expect(
      await body.findByRole('dialog', { name: /^settings$/i }, { timeout: 15000 })
    ).toBeInTheDocument()

    // Closing settings is owned by the shell: it navigates back to the dashboard.
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(body.queryByRole('dialog', { name: /^settings$/i })).not.toBeInTheDocument()
    })

    // (a) The shell never unmounted, so its DOM node survived both navigations.
    await expect(storyDocument.querySelector(SHELL_SIDEBAR_SELECTOR)).toBe(shellSidebarBeforeNavigation)

    // (b) Controller-owned compose state survived the settings round trip.
    await expect(await body.findByLabelText(/^subject$/i)).toHaveValue(COMPOSE_DRAFT_SUBJECT)
  }
}

/**
 * Search-param navigation through the real route loader keeps the rendered mailbox visible
 * while the next folder resolves.
 */
export const FolderTransitionKeepsRenderedMailbox: Story = {
  args: {
    initialPath: '/dashboard/'
  },
  loaders: [loadStoryFolderTransitionWorkspace],
  render: (args, { loaded }) => (
    <AuthenticatedShellRouteStoryFrame
      {...args}
      workspaceForRequest={readLoadedFolderTransition(loaded).workspaceForRequest}
    />
  ),
  play: async ({ canvasElement, loaded }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findAllByText('Quarterly research packet', {}, { timeout: 15000 })).toHaveLength(
      2
    )

    await userEvent.click(await body.findByRole('button', { name: /^junk(\s+\d+)?$/iu }))

    // The pane header is route-driven, so waiting for it here means the assertions below
    // describe the real transition window rather than the moment before navigation landed.
    await waitFor(async () => {
      await expect(within(requireShellPaneHeader(canvasElement)).getByText('Junk')).toBeInTheDocument()
    })

    // While the junk folder is still resolving, the rendered inbox stays on screen, the
    // junk messages are not shown yet, and no region falls back to a skeleton.
    await expect(await body.findAllByText('Quarterly research packet')).toHaveLength(2)
    await expect(body.queryByText('False positive delivery')).not.toBeInTheDocument()
    await expect(canvasElement.ownerDocument.body.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)

    readLoadedFolderTransition(loaded).resolveFolder()

    // The replacement data still arrives and replaces the placeholder.
    await expect(await body.findAllByText('False positive delivery')).toHaveLength(2)
    await expect(body.queryByText('Quarterly research packet')).not.toBeInTheDocument()
  }
}

/**
 * Regression coverage for the whole user-visible settings round trip, driven through the
 * product's own controls: the user menu opens settings, and closing it returns to the
 * mailbox the user had open. Both navigations must keep the shell's search contract, so the
 * mailbox folder survives the round trip instead of resetting to the default inbox.
 */
export const UserMenuSettingsRoundTripKeepsMailboxFolder: Story = {
  args: {
    initialPath: `/dashboard/?folderId=${JUNK_FOLDER_ID}`,
    workspaceForRequest: storyWorkspaceForFolderRequest
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await waitFor(async () => {
      await expect(within(requireShellPaneHeader(canvasElement)).getByText('Junk')).toBeInTheDocument()
    })

    // The user menu is the product's settings entry point.
    await userEvent.click(await body.findByRole('button', { name: 'Account' }, { timeout: 15000 }))
    await userEvent.click(await body.findByRole('menuitem', { name: 'Settings' }))

    await expect(
      await body.findByRole('dialog', { name: SETTINGS_DIALOG_NAME }, { timeout: 15000 })
    ).toBeInTheDocument()
    await expect(getMountedStoryShellRouter().state.location.search.folderId).toBe(JUNK_FOLDER_ID)

    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(body.queryByRole('dialog', { name: SETTINGS_DIALOG_NAME })).not.toBeInTheDocument()
    })

    await waitFor(async () => {
      await expect(getMountedStoryShellRouter().state.location.pathname).toBe('/dashboard/')
    })
    await expect(getMountedStoryShellRouter().state.location.search.folderId).toBe(JUNK_FOLDER_ID)
    await expect(within(requireShellPaneHeader(canvasElement)).getByText('Junk')).toBeInTheDocument()
    await expect(await body.findAllByText('False positive delivery')).toHaveLength(2)
  }
}

/**
 * Regression coverage for the shell's settings-close navigation. Closing settings is owned
 * by `_authenticated/_shell`, and it must return to the dashboard with the shell's search
 * contract intact: the mailbox the user had open is search state, so a close that discards
 * search silently resets the mailbox to the default inbox view.
 */
export const SettingsCloseKeepsMailboxFolder: Story = {
  args: {
    initialPath: `/settings/account/?folderId=${JUNK_FOLDER_ID}`,
    workspaceForRequest: storyWorkspaceForFolderRequest
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(
      await body.findByRole('dialog', { name: SETTINGS_DIALOG_NAME }, { timeout: 15000 })
    ).toBeInTheDocument()

    // Closing settings is owned by the shell: it navigates back to the dashboard.
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(body.queryByRole('dialog', { name: SETTINGS_DIALOG_NAME })).not.toBeInTheDocument()
    })

    // (a) The dashboard route kept the mailbox search the shell validated.
    await waitFor(async () => {
      await expect(getMountedStoryShellRouter().state.location.pathname).toBe('/dashboard/')
    })
    await expect(getMountedStoryShellRouter().state.location.search.folderId).toBe(JUNK_FOLDER_ID)

    // (b) The rendered mailbox is still the folder the user had open, not the default inbox.
    await waitFor(async () => {
      await expect(within(requireShellPaneHeader(canvasElement)).getByText('Junk')).toBeInTheDocument()
    })
    await expect(await body.findAllByText('False positive delivery')).toHaveLength(2)
    await expect(body.queryByText('Quarterly research packet')).not.toBeInTheDocument()

    // (c) The round trip moves between two loaded views, so no region falls back to a
    // skeleton on the way back to the dashboard.
    await expect(canvasElement.ownerDocument.body.querySelectorAll(SKELETON_SELECTOR)).toHaveLength(0)
  }
}

/**
 * Switching settings sections is the same shell-owned navigation, so it must keep the
 * mailbox search too: the settings routes are children of the shell and validate the same
 * search contract, and the mailbox is still rendered behind the dialog.
 */
export const SettingsSectionChangeKeepsMailboxFolder: Story = {
  args: {
    initialPath: `/settings/account/?folderId=${JUNK_FOLDER_ID}`,
    workspaceForRequest: storyWorkspaceForFolderRequest
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const settingsDialog = await body.findByRole(
      'dialog',
      { name: SETTINGS_DIALOG_NAME },
      { timeout: 15000 }
    )

    await userEvent.click(await within(settingsDialog).findByRole('button', { name: 'Domains' }))

    await waitFor(async () => {
      await expect(getMountedStoryShellRouter().state.location.pathname).toBe('/settings/domains/')
    })
    await expect(getMountedStoryShellRouter().state.location.search.folderId).toBe(JUNK_FOLDER_ID)

    // The section route, not a story prop, selected the domains surface.
    await expect(
      await within(settingsDialog).findByText('Connect Cloudflare before adding domains to AgentTeam Email.')
    ).toBeInTheDocument()
  }
}

/**
 * The mailbox administration surface is search state as well, so the same settings round
 * trip must return to the administration surface the user had open.
 */
export const SettingsCloseKeepsMailboxAdminSection: Story = {
  args: {
    initialPath: '/settings/account/?mailboxAdmin=accounts',
    mailboxAdminForRequest: storyMailboxAdminAccountsRequest
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(
      await body.findByRole('dialog', { name: SETTINGS_DIALOG_NAME }, { timeout: 15000 })
    ).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(body.queryByRole('dialog', { name: SETTINGS_DIALOG_NAME })).not.toBeInTheDocument()
    })

    await waitFor(async () => {
      await expect(getMountedStoryShellRouter().state.location.pathname).toBe('/dashboard/')
    })
    await expect(getMountedStoryShellRouter().state.location.search.mailboxAdmin).toBe('accounts')

    await expect(
      await body.findByRole('heading', { name: 'Accounts' }, { timeout: 15000 })
    ).toBeInTheDocument()
    await expect(await body.findByRole('row', { name: /research@agentteam\.example/u })).toBeInTheDocument()
  }
}

/**
 * The mailbox administration surface reached through the real route tree: the shell reads
 * `mailboxAdmin` from its validated search and the controller loads the surface from the
 * mocked `/rpc/mail/admin` boundary.
 */
export const MailboxAdminAccountsRoute: Story = {
  args: {
    initialPath: '/dashboard/?mailboxAdmin=accounts',
    mailboxAdminForRequest: storyMailboxAdminAccountsRequest
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(
      await body.findByRole('heading', { name: 'Accounts' }, { timeout: 15000 })
    ).toBeInTheDocument()
    await expect(
      await body.findByText('Provision and assign mailbox accounts on this domain.')
    ).toBeInTheDocument()
    await expect(await body.findByRole('row', { name: /research@agentteam\.example/u })).toBeInTheDocument()
    await expect(await body.findByRole('button', { name: 'New account' })).toBeEnabled()
  }
}

/** The administration surface with no provisioned accounts yet. */
export const MailboxAdminAccountsEmptyRoute: Story = {
  args: {
    initialPath: '/dashboard/?mailboxAdmin=accounts',
    mailboxAdminForRequest: storyMailboxAdminAccountsEmptyRequest
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByText('No accounts', {}, { timeout: 15000 })).toBeInTheDocument()
    await expect(
      await body.findByText('Create the first mailbox account for this domain.')
    ).toBeInTheDocument()
  }
}

/**
 * The cold-load state of the administration surface: the route is opened with the section
 * already selected and the mailbox administration RPC has not answered yet.
 */
export const MailboxAdminAccountsPendingRoute: Story = {
  args: {
    initialPath: '/dashboard/?mailboxAdmin=accounts',
    mailboxAdminForRequest: storyMailboxAdminPendingRequest
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(
      await body.findByRole('heading', { name: 'Accounts' }, { timeout: 15000 })
    ).toBeInTheDocument()
    await waitFor(async () => {
      await expect(
        canvasElement.ownerDocument.body.querySelectorAll(SKELETON_SELECTOR).length
      ).toBeGreaterThan(0)
    })
    await expect(body.queryByRole('row', { name: /research@agentteam\.example/u })).not.toBeInTheDocument()
  }
}

/** The administration surface when the mailbox administration RPC fails. */
export const MailboxAdminAccountsErrorRoute: Story = {
  args: {
    initialPath: '/dashboard/?mailboxAdmin=accounts',
    mailboxAdminForRequest: storyMailboxAdminFailedRequest
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(
      await body.findByText('Mailbox administration unavailable', {}, { timeout: 25000 })
    ).toBeInTheDocument()
    await expect(await body.findByText(MAILBOX_ADMIN_ERROR_MESSAGE)).toBeInTheDocument()
    await expect(await body.findByRole('button', { name: 'Retry' })).toBeEnabled()
  }
}

/** Answers the workspace RPC with the requested folder's mailbox, the way the route does. */
function storyWorkspaceForFolderRequest(url: URL): AgentMailWebWorkspace {
  return url.searchParams.get('folderId') === JUNK_FOLDER_ID ? mailWorkspaceJunkView : mailWorkspaceReadyView
}

function storyMailboxAdminAccountsRequest(): StoryAppRpcMailboxAdminResult {
  return { view: mailboxAdminAccountsRpcView }
}

function storyMailboxAdminAccountsEmptyRequest(): StoryAppRpcMailboxAdminResult {
  return { view: mailboxAdminAccountsEmptyRpcView }
}

/** Never answers, so the surface stays in its cold-load state for the whole story run. */
function storyMailboxAdminPendingRequest(): Promise<StoryAppRpcMailboxAdminResult> {
  return new Promise<StoryAppRpcMailboxAdminResult>(() => {})
}

function storyMailboxAdminFailedRequest(): StoryAppRpcMailboxAdminResult {
  return {
    failure: {
      message: MAILBOX_ADMIN_ERROR_MESSAGE,
      status: 502
    }
  }
}

/**
 * The shell's pane header renders the active folder from route state, not from the mail
 * workspace payload, so it flips as soon as the navigation lands.
 */
function requireShellPaneHeader(canvasElement: HTMLElement): HTMLElement {
  const paneHeader = canvasElement.ownerDocument.body.querySelector('header')

  if (!paneHeader) {
    throw new Error('Expected the authenticated shell to render its pane header.')
  }

  return paneHeader
}
