import { expect, userEvent, waitFor, within } from 'storybook/test'

import { mailWorkspaceJunkView, mailWorkspaceReadyView } from '../mail-workspace-fixtures'
import { getMountedStoryShellRouter } from '../story-shell-router'
import { AuthenticatedShellRouteStoryFrame } from './authenticated-shell-route-story-frame'
import type { AgentMailWebWorkspace } from '@main/backend'
import type { Meta, StoryObj } from '@storybook/react'

const COMPOSE_DRAFT_SUBJECT = 'Quarterly research packet follow-up'
const SHELL_SIDEBAR_SELECTOR = '[data-slot="sidebar"]'

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
