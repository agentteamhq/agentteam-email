import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { agentAccessActionableState } from '../agent-access-fixtures'
import {
  authenticatedSectionBaseArgs,
  domainSettingsAddDomainSelectZoneState,
  domainSettingsEmptyFirstUseState
} from '../authenticated-section-fixtures'
import {
  mailboxAdminAgentsNoGrantManagementView,
  mailboxAdminCreateAccountView,
  mailboxAdminDeleteAccountSavingView,
  mailboxAdminDeleteAccountView,
  mailboxAdminDeleteGroupSavingView,
  mailboxAdminDeleteGroupView,
  mailboxAdminDisabledGroupsView,
  mailboxAdminEditAccountView,
  mailboxAdminEmptyView,
  mailboxAdminExternalPrincipalsOnlyView,
  mailboxAdminGroupsEmptyView,
  mailboxAdminGroupsOnlyView,
  mailboxAdminPaginatedAccountsView,
  mailboxAdminPendingAgentEnrollmentsView,
  mailboxAdminProvisionAccountView,
  mailboxAdminReadOnlyAccountsView,
  mailboxAdminReadyView
} from '../mailbox-admin-fixtures'
import {
  mailWorkspaceAssistantAccountView,
  mailWorkspaceEmptyView,
  mailWorkspaceJunkView,
  mailWorkspaceReadyView
} from '../mail-workspace-fixtures'
import { getMailboxAdminVisibleRecordsForView } from '../../partials/authenticated/mailbox-admin-visible-records'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import { DashboardMailControllerStoryFrame } from './story-frames'
import type { MailboxAdminViewQuery } from '../../lib/mail-admin-rpc'
import type {
  MailboxAdminSectionId,
  MailboxAdminView
} from '../../partials/authenticated/mailbox-admin-models'
import type {
  AgentMailAdminNavigation,
  AgentMailAdminView,
  AgentMailWebWorkspace,
  AgentMailWorkspaceInput
} from '@main/backend'
import type { Meta, StoryObj } from '@storybook/react'
import type { ComponentProps } from 'react'

export const dashboardMailControllerStoryMeta = {
  component: DashboardMailController,
  args: {
    authClient: authenticatedSectionBaseArgs.authClient,
    domainSettingsState: domainSettingsEmptyFirstUseState,
    publicEnv: authenticatedSectionBaseArgs.publicEnv,
    routeSearch: { mailboxAdmin: 'accounts' },
    routeState: authenticatedSectionBaseArgs.routeState,
    sessionCleanupEnabled: authenticatedSectionBaseArgs.sessionCleanupEnabled
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardMailController>

type Story = StoryObj<typeof dashboardMailControllerStoryMeta>

const mailWorkspaceMiddlePageView = {
  ...mailWorkspaceReadyView,
  pagination: {
    limit: 25,
    nextCursor: 'next-page-cursor',
    previousCursor: 'previous-page-cursor',
    total: 42
  }
} satisfies AgentMailWebWorkspace

const mailWorkspaceFirstUseView = {
  ...mailWorkspaceEmptyView,
  accounts: [],
  activeAccountId: null,
  activeFolderId: null,
  folders: []
} satisfies AgentMailWebWorkspace

const firstUseDomainSettingsState = {
  ...domainSettingsEmptyFirstUseState,
  onStartOAuth: fn()
}

export const WebmailInbox: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findAllByText('Quarterly research packet')).toHaveLength(2)
    await expect(await canvas.findByText('research-packet.txt')).toBeInTheDocument()
    await expect(await canvas.findByText('2 shown')).toBeInTheDocument()
    await expect(await canvas.findByText('42 messages')).toBeInTheDocument()
  }
}

export const WebmailPaginated: Story = {
  args: {
    routeSearch: {
      cursor: 'middle-page-cursor',
      direction: 'next'
    }
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceMiddlePageView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('2 shown')).toBeInTheDocument()
    await expect(await canvas.findByText('42 messages')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Previous page' })).toBeEnabled()
    await expect(await canvas.findByRole('button', { name: 'Next page' })).toBeEnabled()
  }
}

export const WebmailEmpty: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceEmptyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Inbox is empty')).toBeInTheDocument()
    await expect(await canvas.findByText('Select a message')).toBeInTheDocument()
  }
}

export const WebmailFirstUseOnboarding: Story = {
  args: {
    domainSettingsState: firstUseDomainSettingsState,
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceFirstUseView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Connect your domain', {}, { timeout: 15000 })).toBeInTheDocument()
    await expect(
      await canvas.findByText('Connect Cloudflare to choose the domain you want to use with AgentTeam Email.')
    ).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Continue with Cloudflare' })).toBeEnabled()
    await expect((await canvas.findAllByText('No mailbox yet')).length).toBeGreaterThan(0)
    for (const folderLabel of ['Inbox', 'Drafts', 'Sent', 'Junk', 'Trash']) {
      await expect((await canvas.findAllByText(folderLabel)).length).toBeGreaterThan(0)
    }
    await expect(canvas.queryByRole('button', { name: 'Continue setup' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Create folder' })).not.toBeInTheDocument()
    await expect(canvas.queryByText('Choose a message from the mailbox to read it here.')).not.toBeInTheDocument()

    const inboxButton = await canvas.findByRole('button', { name: 'Inbox' })
    await userEvent.hover(inboxButton)
    await expect((await body.findAllByText('Inbox: Connect a mailbox before opening folders.')).length).toBeGreaterThan(0)

    await userEvent.click(await canvas.findByRole('button', { name: 'Accounts' }))
    await expect(await canvas.findByRole('button', { name: 'Continue setup' })).toBeInTheDocument()

    await userEvent.click(await canvas.findByRole('button', { name: 'Continue setup' }))
    await expect(await canvas.findByText('Connect your domain', {}, { timeout: 15000 })).toBeInTheDocument()
    await waitFor(async () => {
      await expect(canvas.queryByRole('button', { name: 'Continue setup' })).not.toBeInTheDocument()
    })
  }
}

export const WebmailFirstUseDomainSelection: Story = {
  args: {
    domainSettingsState: domainSettingsAddDomainSelectZoneState,
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceFirstUseView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(
      await canvas.findByText('Set up email for your domain', {}, { timeout: 15000 })
    ).toBeInTheDocument()
    await expect(await canvas.findByText('Cloudflare connected')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Adopt agentteam.example' })).toBeEnabled()
    await expect(canvas.queryByRole('button', { name: 'Setting up domain' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Continue with Cloudflare' })).not.toBeInTheDocument()
    await expect(canvas.queryByText('Choose a message from the mailbox to read it here.')).not.toBeInTheDocument()
  }
}

export const WebmailJunk: Story = {
  args: {
    routeSearch: { folderId: 'junk-id' }
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceJunkView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findAllByText('False positive delivery')).toHaveLength(2)
    await expect(await canvas.findAllByRole('button', { name: 'Not spam' })).toHaveLength(1)
  }
}

/**
 * Regression coverage for search-param navigation continuity: selecting a folder builds a
 * new route-keyed mail workspace query, and the already-rendered mailbox must keep its last
 * data instead of flashing the cold-load skeleton while the next folder resolves.
 */
export const WebmailFolderTransition: Story = {
  args: {
    routeSearch: {}
  },
  loaders: [loadStoryFolderTransition],
  render: (args, { loaded }) => (
    <DashboardMailControllerStoryFrame
      {...args}
      agentAccessView={agentAccessActionableState.view}
      mailWorkspaceLoader={readLoadedFolderTransition(loaded).mailWorkspaceLoader}
      mailboxAdminNavigationLoader={createStoryMailboxAdminNavigationLoader({
        allowedSections: mailboxAdminReadyView.allowedSections
      })}
      mailboxAdminViewLoader={createStoryMailboxAdminViewLoader({
        view: mailboxAdminEmptyView
      })}
    />
  ),
  play: async ({ canvasElement, loaded }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findAllByText('Quarterly research packet')).toHaveLength(2)

    await userEvent.click(await canvas.findByRole('button', { name: /^junk(\s+\d+)?$/iu }))

    // The pane header is route-driven, so waiting for it here means the assertions below
    // describe the real transition window rather than the moment before navigation landed.
    await waitFor(async () => {
      await expect(within(requireShellPaneHeader(canvasElement)).getByText('Junk')).toBeInTheDocument()
    })

    // While the junk folder is still resolving, the inbox messages stay rendered, the junk
    // messages are not on screen yet, and no region falls back to a skeleton.
    await expect(await body.findAllByText('Quarterly research packet')).toHaveLength(2)
    await expect(body.queryByText('False positive delivery')).not.toBeInTheDocument()
    await expect(canvasElement.ownerDocument.body.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)

    readLoadedFolderTransition(loaded).resolveFolder()

    // The replacement data still arrives and replaces the placeholder.
    await expect(await body.findAllByText('False positive delivery')).toHaveLength(2)
    await expect(body.queryByText('Quarterly research packet')).not.toBeInTheDocument()
  }
}

export const WebmailAccountSwitch: Story = {
  args: {
    routeSearch: { accountId: 'assistant@second.example' }
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      view: mailWorkspaceAssistantAccountView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findAllByText('Assistant account handoff')).toHaveLength(2)
    const assistantMailboxItem = await openWorkspaceMailboxSwitcherItem(
      canvasElement,
      /assistant@second\.example/i
    )

    await expect(await within(assistantMailboxItem).findByText('Assistant')).toBeInTheDocument()
  }
}

export const WebmailLoading: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      pending: true,
      view: mailWorkspaceReadyView
    })
}

export const WebmailError: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceControllerStory(args, {
      error: new Error('The mail workspace RPC returned HTTP 403.'),
      view: mailWorkspaceReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Mailbox unavailable')).toBeInTheDocument()
    await expect(await canvas.findAllByText('The mail workspace RPC returned HTTP 403.')).toHaveLength(2)
  }
}

export const MailboxAdminAccounts: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    await expect(
      await canvas.findByRole('row', { name: /research@agentteam\.example/u })
    ).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New account' })).toBeEnabled()
    const researchMailboxItem = await openWorkspaceMailboxSwitcherItem(
      canvasElement,
      /research@agentteam\.example/i
    )

    await expect(await within(researchMailboxItem).findByText('Research')).toBeInTheDocument()
    await expect(await within(researchMailboxItem).findByText('research@agentteam.example')).toBeInTheDocument()
  }
}

export const MailboxAdminAccountsPagination: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: {
        ...mailboxAdminPaginatedAccountsView,
        pagination: {
          filteredRecords: mailboxAdminPaginatedAccountsView.accounts.length,
          page: 1,
          pageSize: 25,
          totalRecords: mailboxAdminPaginatedAccountsView.accounts.length
        }
      }
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('team-01@agentteam.example')).toBeInTheDocument()
    await expect(await canvas.findByText('Showing 1-25 of 42 records')).toBeInTheDocument()
    await expect(await canvas.findByText('Page 1 of 2')).toBeInTheDocument()
    await expect(canvas.queryByText('team-42@agentteam.example')).not.toBeInTheDocument()
  }
}

export const MailboxAdminAccountsSearch: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    const searchInput = await canvas.findByPlaceholderText('Search accounts...')

    await userEvent.type(searchInput, 'ops')

    await expect(await canvas.findByRole('row', { name: /ops@agentteam\.example/u })).toBeInTheDocument()
    await expect(await canvas.findByText('1 of 5 records')).toBeInTheDocument()
    await waitFor(async () => {
      await expect(
        canvas.queryByRole('row', { name: /research@agentteam\.example/u })
      ).not.toBeInTheDocument()
    })
  }
}

export const MailboxAdminAccountsPendingStatusFilter: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await selectMailboxAdminStatus(canvasElement, 'Pending')

    await expect(
      await canvas.findByRole('row', { name: /triage@agentteam\.example/u })
    ).toBeInTheDocument()
    await expect(await canvas.findByText('1 of 5 records')).toBeInTheDocument()
    await waitFor(async () => {
      await expect(
        canvas.queryByRole('row', { name: /research@agentteam\.example/u })
      ).not.toBeInTheDocument()
    })
  }
}

export const MailboxAdminAccountsSearchNoResults: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const searchInput = await canvas.findByPlaceholderText('Search accounts...')

    await userEvent.type(searchInput, 'not-found')

    await expect(await canvas.findByText('No matching records')).toBeInTheDocument()
    await expect(await canvas.findByText('No accounts match "not-found".')).toBeInTheDocument()
  }
}

export const MailboxAdminAccountCreateDialog: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminCreateAccountView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const dialog = await canvas.findByRole('dialog', { name: 'Create account' })
    const addressInput = await within(dialog).findByLabelText('Address')
    const displayNameInput = await within(dialog).findByLabelText('Display name')

    await expect(addressInput).toHaveValue('')
    await expect(addressInput).toHaveAttribute('placeholder', 'support@agentteam.example')
    await expect(addressInput).not.toHaveAttribute('readonly')
    await expect(displayNameInput).toHaveValue('')
    await expect(await within(dialog).findByRole('button', { name: 'Create account' })).toBeEnabled()
  }
}

export const MailboxAdminAccountEditDialog: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminEditAccountView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const dialog = await canvas.findByRole('dialog', { name: 'Edit account' })
    const addressInput = await within(dialog).findByLabelText('Address')
    const displayNameInput = await within(dialog).findByLabelText('Display name')

    await expect(addressInput).toHaveValue('research@agentteam.example')
    await expect(addressInput).toHaveAttribute('readonly')
    await expect(displayNameInput).toHaveValue('Research')
    await expect(await within(dialog).findByRole('button', { name: 'Save account' })).toBeEnabled()
  }
}

export const MailboxAdminAccountProvisionDialog: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'agents' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminProvisionAccountView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const dialog = await canvas.findByRole('dialog', { name: 'Provision account' })
    const addressInput = await within(dialog).findByLabelText('Address')
    const displayNameInput = await within(dialog).findByLabelText('Display name')

    await expect(addressInput).toHaveValue('ops-bot@agentteam.example')
    await expect(addressInput).not.toHaveAttribute('readonly')
    await expect(displayNameInput).toHaveValue('Operations Agent')
    await expect(await within(dialog).findByRole('button', { name: 'Provision account' })).toBeEnabled()
  }
}

export const MailboxAdminAccountDeleteConfirmation: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminDeleteAccountView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const dialog = await canvas.findByRole('alertdialog')

    await expect(dialog).toBeInTheDocument()
    await expect(await within(dialog).findByText('Delete mailbox account?')).toBeInTheDocument()
    await expect(await within(dialog).findByText(/handoff@agentteam\.example/u)).toBeInTheDocument()
    await expect(await within(dialog).findByRole('button', { name: 'Delete account' })).toBeEnabled()
  }
}

export const MailboxAdminAccountDeleting: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminDeleteAccountSavingView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByRole('alertdialog')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Deleting account' })).toBeDisabled()
  }
}

export const MailboxAdminGroups: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Forwarding groups' })).toBeInTheDocument()
    await expect(await canvas.findByText('support@agentteam.example')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New group' })).toBeEnabled()
  }
}

export const MailboxAdminGroupsPendingStatusFilter: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await selectMailboxAdminStatus(canvasElement, 'Pending')

    await expect(await canvas.findByText('alerts@agentteam.example')).toBeInTheDocument()
    await expect(await canvas.findByText('1 of 3 records')).toBeInTheDocument()
    await waitFor(async () => {
      await expect(canvas.queryByText('support@agentteam.example')).not.toBeInTheDocument()
    })
  }
}

export const MailboxAdminGroupsDisabledStatusFilter: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminDisabledGroupsView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await selectMailboxAdminStatus(canvasElement, 'Disabled')

    await expect(await canvas.findByText('legacy-routing@agentteam.example')).toBeInTheDocument()
    await expect(await canvas.findByText('1 of 1 records')).toBeInTheDocument()
  }
}

export const MailboxAdminGroupsStatusNoResults: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await selectMailboxAdminStatus(canvasElement, 'Disabled')

    await expect(await canvas.findByText('No matching records')).toBeInTheDocument()
    await expect(await canvas.findByText('No forwarding groups have disabled status.')).toBeInTheDocument()
  }
}

export const MailboxAdminGroupDeleteConfirmation: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminDeleteGroupView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const dialog = await canvas.findByRole('alertdialog')

    await expect(dialog).toBeInTheDocument()
    await expect(await within(dialog).findByText('Delete forwarding group?')).toBeInTheDocument()
    await expect(await within(dialog).findByText(/legacy-routing@agentteam\.example/u)).toBeInTheDocument()
    await expect(await within(dialog).findByRole('button', { name: 'Delete group' })).toBeEnabled()
  }
}

export const MailboxAdminGroupDeleting: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminDeleteGroupSavingView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByRole('alertdialog')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Deleting group' })).toBeDisabled()
  }
}

export const MailboxAdminAgents: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'agents' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Agents' })).toBeInTheDocument()
    await expect(await canvas.findByText('Research Agent')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New agent' })).toBeEnabled()
  }
}

export const MailboxAdminAgentsDisabledStatusFilter: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'agents' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await selectMailboxAdminStatus(canvasElement, 'Disabled')

    await expect(await canvas.findByText('Legacy Writer')).toBeInTheDocument()
    await expect(await canvas.findByText('1 of 6 records')).toBeInTheDocument()

    await userEvent.click(await canvas.findByRole('button', { name: /^open actions for legacy writer$/i }))
    await expect(await canvas.findByRole('menuitem', { name: /^disable agent$/i })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  }
}

export const MailboxAdminAgentsWithoutGrantManagement: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'agents' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminAgentsNoGrantManagementView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^open actions for research agent$/i }))
    await expect(await canvas.findByRole('menuitem', { name: /^system permissions$/i })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await expect(await canvas.findByRole('menuitem', { name: /^account access$/i })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  }
}

export const MailboxAdminAgentsPendingEnrollments: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'agents' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminPendingAgentEnrollmentsView
    }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Pending enrollments')).toBeInTheDocument()
    await expect((await canvas.findAllByText('Research Agent')).length).toBeGreaterThan(0)
  }
}

export const MailboxAdminConnectedClients: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'agents' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminExternalPrincipalsOnlyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Connected clients')).toBeInTheDocument()
    await expect(await canvas.findByText('Operations API key')).toBeInTheDocument()
    await expect(await canvas.findByText('Paperclip OAuth client')).toBeInTheDocument()
  }
}

export const MailboxAdminReadOnly: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminReadOnlyAccountsView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New account' })).toBeDisabled()
  }
}

export const MailboxAdminGroupsOnly: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminGroupsOnlyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Forwarding groups' })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'New group' })).toBeEnabled()
  }
}

export const MailboxAdminEmpty: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminEmptyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('No accounts')).toBeInTheDocument()
  }
}

export const MailboxAdminGroupsEmpty: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      view: mailboxAdminGroupsEmptyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('No groups')).toBeInTheDocument()
  }
}

export const MailboxAdminLoading: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      pending: true,
      view: mailboxAdminReadyView
    })
}

export const MailboxAdminGroupsLoading: Story = {
  args: {
    routeSearch: { mailboxAdmin: 'groups' }
  },
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      pending: true,
      view: mailboxAdminReadyView
    })
}

export const MailboxAdminForbidden: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      error: new Error('Mailbox administration is forbidden.'),
      navigation: { allowedSections: [] },
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Mailbox administration unavailable')).toBeInTheDocument()
    await expect(await canvas.findAllByText('Mailbox administration is forbidden.')).toHaveLength(2)
  }
}

export const MailboxAdminError: Story = {
  render: (args) =>
    renderMailboxAdminControllerStory(args, {
      error: new Error('The mailbox administration RPC returned HTTP 502 while loading accounts.'),
      view: mailboxAdminReadyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Mailbox administration unavailable')).toBeInTheDocument()
    await expect(
      await canvas.findByText('The mailbox administration RPC returned HTTP 502 while loading accounts.')
    ).toBeInTheDocument()
  }
}

function storyBody(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body)
}

async function openWorkspaceMailboxSwitcherItem(canvasElement: HTMLElement, itemName: RegExp) {
  const canvas = within(canvasElement)
  const body = storyBody(canvasElement)

  await userEvent.click(await canvas.findByRole('button', { name: /^open workspace and mailbox switcher$/i }))

  return body.findByRole('menuitem', { name: itemName })
}

async function selectMailboxAdminStatus(canvasElement: HTMLElement, statusLabel: string) {
  const canvas = storyBody(canvasElement)

  await userEvent.click(await canvas.findByRole('combobox', { name: /^filter by status$/i }))
  await userEvent.click(await canvas.findByRole('option', { name: statusLabel }))
}

function renderMailWorkspaceControllerStory(
  args: ComponentProps<typeof DashboardMailController>,
  options: {
    error?: Error
    pending?: boolean
    view: AgentMailWebWorkspace
  }
) {
  return (
    <DashboardMailControllerStoryFrame
      {...args}
      agentAccessView={agentAccessActionableState.view}
      mailWorkspaceLoader={createStoryMailWorkspaceLoader(options)}
      mailboxAdminNavigationLoader={createStoryMailboxAdminNavigationLoader({
        allowedSections: mailboxAdminReadyView.allowedSections
      })}
      mailboxAdminViewLoader={createStoryMailboxAdminViewLoader({
        view: mailboxAdminEmptyView
      })}
    />
  )
}

function renderMailboxAdminControllerStory(
  args: ComponentProps<typeof DashboardMailController>,
  options: {
    error?: Error
    navigation?: AgentMailAdminNavigation
    pending?: boolean
    view: MailboxAdminView
    workspace?: AgentMailWebWorkspace
  }
) {
  return (
    <DashboardMailControllerStoryFrame
      {...args}
      agentAccessView={agentAccessActionableState.view}
      initialMailboxAdminControllerState={mailboxAdminControllerStateFromView(options.view)}
      mailboxAdminNavigationLoader={createStoryMailboxAdminNavigationLoader(
        options.navigation ?? { allowedSections: options.view.allowedSections }
      )}
      mailboxAdminViewLoader={createStoryMailboxAdminViewLoader(options)}
      mailWorkspaceLoader={createStoryMailWorkspaceLoader({
        view: options.workspace ?? mailWorkspaceReadyView
      })}
    />
  )
}

function mailboxAdminControllerStateFromView(
  view: MailboxAdminView
): ComponentProps<typeof DashboardMailController>['initialMailboxAdminControllerState'] {
  return {
    activeDialog: view.activeDialog,
    createdAgentEnrollment: view.createdAgentEnrollment,
    pendingAccountDeleteId: view.pendingAccountDeleteId,
    pendingAccountDisableId: view.pendingAccountDisableId,
    pendingAccountSave: view.pendingAccountSave,
    pendingAgentCreate: view.pendingAgentCreate,
    pendingAgentEnrollmentRevokeId: view.pendingAgentEnrollmentRevokeId,
    pendingAgentMailboxGrantsSaveId: view.pendingAgentMailboxGrantsSaveId,
    pendingAgentRevokeId: view.pendingAgentRevokeId,
    pendingAgentSaveId: view.pendingAgentSaveId,
    pendingAgentSystemPermissionsSaveId: view.pendingAgentSystemPermissionsSaveId,
    pendingGroupDeleteId: view.pendingGroupDeleteId,
    pendingGroupDisableId: view.pendingGroupDisableId,
    pendingGroupSave: view.pendingGroupSave,
    pendingPrincipalMailboxGrantsSaveId: view.pendingPrincipalMailboxGrantsSaveId,
    pendingPrincipalSystemPermissionsSaveId: view.pendingPrincipalSystemPermissionsSaveId
  }
}

function createStoryMailWorkspaceLoader({
  error,
  pending,
  view
}: {
  error?: Error
  pending?: boolean
  view: AgentMailWebWorkspace
}) {
  return async (query: AgentMailWorkspaceInput) => {
    if (pending) {
      await new Promise(() => {})
    }

    if (error) {
      throw error
    }

    return mailWorkspaceForQuery(view, query)
  }
}

/**
 * Stages a slow folder transition. The starting folder resolves immediately and the target
 * folder resolves only when the story releases it, so a story can tell the difference
 * between the retained previous folder and the resolved next folder.
 */
function createStoryFolderTransitionMailWorkspaceLoader({
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
    mailWorkspaceLoader: async (query: AgentMailWorkspaceInput) => {
      if (query.folderId === folderId) {
        await folderResolved
        return mailWorkspaceForQuery(folderView, query)
      }

      return mailWorkspaceForQuery(initialView, query)
    },
    resolveFolder: () => {
      releaseFolder()
    }
  }
}

type StoryFolderTransition = ReturnType<typeof createStoryFolderTransitionMailWorkspaceLoader>

/** Storybook runs loaders once per story run, which keeps the gate fresh on every re-run. */
function loadStoryFolderTransition() {
  return {
    folderTransition: createStoryFolderTransitionMailWorkspaceLoader({
      folderId: 'junk-id',
      folderView: mailWorkspaceJunkView,
      initialView: mailWorkspaceReadyView
    })
  }
}

function readLoadedFolderTransition(loaded: unknown): StoryFolderTransition {
  return (loaded as { folderTransition: StoryFolderTransition }).folderTransition
}

function createStoryMailboxAdminNavigationLoader(navigation: AgentMailAdminNavigation) {
  return async () => navigation
}

function createStoryMailboxAdminViewLoader({
  error,
  pending,
  view
}: {
  error?: Error
  pending?: boolean
  view: MailboxAdminView
}) {
  return async (query: MailboxAdminViewQuery) => {
    if (pending) {
      await new Promise(() => {})
    }

    if (error) {
      throw error
    }

    return mailboxAdminViewForQuery(view, query) as AgentMailAdminView
  }
}

function countMailboxAdminRecords(view: MailboxAdminView, section: MailboxAdminSectionId) {
  if (section === 'accounts') {
    return view.accounts.length
  }

  if (section === 'groups') {
    return view.groups.length
  }

  return view.agents.length + view.pendingEnrollments.length + view.principals.length
}

function mailboxAdminViewForQuery(
  view: MailboxAdminView,
  query: MailboxAdminViewQuery
): MailboxAdminView {
  const section = query.section ?? view.section
  const searchQuery = query.searchQuery ?? ''
  const statusFilter = query.statusFilter ?? view.statusFilter ?? 'all'
  const totalRecords = countMailboxAdminRecords(view, section)
  const filteredRecords = getMailboxAdminVisibleRecordsForView({
    ...view,
    pagination: undefined,
    searchQuery,
    section,
    statusFilter
  } satisfies MailboxAdminView)
  const filteredRecordCount = countMailboxAdminRecordSet(filteredRecords, section)
  const pageSize = Math.max(1, query.pageSize ?? view.pagination?.pageSize ?? 25)
  const totalPages = Math.max(1, Math.ceil(filteredRecordCount / pageSize))
  const page = Math.min(Math.max(1, query.page ?? view.pagination?.page ?? 1), totalPages)
  const pagedRecords = paginateMailboxAdminRecords(filteredRecords, section, page, pageSize)

  return {
    ...view,
    accounts: section === 'accounts' ? pagedRecords.accounts : view.accounts,
    agents: section === 'agents' ? pagedRecords.agents : view.agents,
    groups: section === 'groups' ? pagedRecords.groups : view.groups,
    pendingEnrollments: section === 'agents' ? pagedRecords.pendingEnrollments : view.pendingEnrollments,
    pagination: {
      filteredRecords: filteredRecordCount,
      page,
      pageSize,
      totalRecords
    },
    principals: section === 'agents' ? pagedRecords.principals : view.principals,
    searchQuery,
    section,
    statusFilter
  }
}

function countMailboxAdminRecordSet(
  records: Pick<MailboxAdminView, 'accounts' | 'agents' | 'groups' | 'pendingEnrollments' | 'principals'>,
  section: MailboxAdminSectionId
) {
  if (section === 'accounts') {
    return records.accounts.length
  }

  if (section === 'groups') {
    return records.groups.length
  }

  return records.agents.length + records.pendingEnrollments.length + records.principals.length
}

function paginateMailboxAdminRecords(
  records: Pick<MailboxAdminView, 'accounts' | 'agents' | 'groups' | 'pendingEnrollments' | 'principals'>,
  section: MailboxAdminSectionId,
  page: number,
  pageSize: number
): Pick<MailboxAdminView, 'accounts' | 'agents' | 'groups' | 'pendingEnrollments' | 'principals'> {
  const startIndex = (page - 1) * pageSize

  if (section === 'accounts') {
    return {
      ...records,
      accounts: records.accounts.slice(startIndex, startIndex + pageSize)
    }
  }

  if (section === 'groups') {
    return {
      ...records,
      groups: records.groups.slice(startIndex, startIndex + pageSize)
    }
  }

  const agentRecords = records.agents.map((agent) => ({ agent, type: 'agent' as const }))
  const pendingEnrollmentRecords = records.pendingEnrollments.map((pendingEnrollment) => ({
    pendingEnrollment,
    type: 'pendingEnrollment' as const
  }))
  const principalRecords = records.principals.map((principal) => ({
    principal,
    type: 'principal' as const
  }))
  const pagedRecords = [...agentRecords, ...pendingEnrollmentRecords, ...principalRecords].slice(
    startIndex,
    startIndex + pageSize
  )

  return {
    ...records,
    agents: pagedRecords.flatMap((record) => (record.type === 'agent' ? [record.agent] : [])),
    pendingEnrollments: pagedRecords.flatMap((record) =>
      record.type === 'pendingEnrollment' ? [record.pendingEnrollment] : []
    ),
    principals: pagedRecords.flatMap((record) => (record.type === 'principal' ? [record.principal] : []))
  }
}

function mailWorkspaceForQuery(
  view: AgentMailWebWorkspace,
  query: AgentMailWorkspaceInput
): AgentMailWebWorkspace {
  const activeAccountId = query.accountId ?? view.activeAccountId
  const activeFolderId = query.folderId ?? view.activeFolderId
  const selectedMessage =
    query.messageId && view.selectedMessage?.id !== query.messageId ? null : view.selectedMessage

  return {
    ...view,
    activeAccountId,
    activeFolderId,
    selectedMessage
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
