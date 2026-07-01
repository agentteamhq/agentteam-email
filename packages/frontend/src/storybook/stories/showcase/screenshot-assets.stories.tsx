import { fn, userEvent, within } from 'storybook/test'

import {
  accountSwitchingSidebarView,
  authenticatedSectionBaseArgs
} from 'src/storybook/authenticated-section-fixtures'
import { mailboxAdminReadyView, mailboxAdminSidebarView } from 'src/storybook/mailbox-admin-fixtures'
import { longWorkspaceSwitcherMailboxes } from 'src/storybook/workspace-mailbox-switcher-fixtures'
import { DashboardScreen } from 'src/screens/dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'
import type {
  AuthenticatedEmailPreview,
  AuthenticatedMailAccount,
  AuthenticatedSidebarView
} from 'src/partials/authenticated/authenticated-shell-models'
import type { WorkspaceMailboxSwitcherMailbox } from 'src/partials/authenticated/workspace-mailbox-switcher'

const showcaseEmailId = 'northstar-account-review'

const showcaseSidebarView = {
  activeAccountId: 'support',
  activeItemId: 'inbox',
  accounts: [
    {
      address: 'support@agentteam.example',
      id: 'support',
      name: 'Support queue'
    },
    {
      address: 'billing@agentteam.example',
      id: 'billing',
      name: 'Billing intake'
    },
    {
      address: 'routing@agentteam.example',
      id: 'routing',
      name: 'Routing checks'
    }
  ],
  emptyDescription: 'Messages matching this mailbox view will appear here.',
  emptyTitle: 'No messages',
  mailboxMode: 'mailbox',
  mails: [
    {
      date: '08:42 AM',
      email: 'operations@northstar.example',
      id: showcaseEmailId,
      isUnread: true,
      name: 'Northstar Operations',
      subject: 'Account review and routing summary',
      teaser:
        'The support routing update is live. The attached account notes summarize follow-up owners and response targets.'
    },
    {
      date: 'Yesterday',
      email: 'finance@northstar.example',
      id: 'invoice-follow-up',
      name: 'Northstar Finance',
      subject: 'Invoice follow-up for June usage',
      teaser: 'Please confirm the usage rollup before we send the final invoice packet.'
    },
    {
      date: 'Jun 24',
      email: 'security@northstar.example',
      id: 'security-review',
      name: 'Security Review',
      subject: 'Allowed sender policy approval',
      teaser: 'The sender policy changes are approved for the shared support mailbox.'
    },
    {
      date: 'Jun 23',
      email: 'partners@atlas.example',
      id: 'partner-check-in',
      name: 'Atlas Partners',
      subject: 'Partner check-in agenda',
      teaser: 'Draft agenda for Thursday with routing metrics and onboarding blockers.'
    }
  ],
  navMain: [
    {
      iconKey: 'inbox',
      id: 'inbox',
      title: 'Inbox',
      url: '#'
    },
    {
      badgeLabel: '4',
      iconKey: 'drafts',
      id: 'drafts',
      title: 'Drafts',
      url: '#'
    },
    {
      iconKey: 'sent',
      id: 'sent',
      title: 'Sent',
      url: '#'
    },
    {
      iconKey: 'folder',
      id: 'archive',
      title: 'Archive',
      url: '#'
    }
  ],
  paneTitle: 'Inbox',
  refreshLabel: 'Refresh mailbox',
  searchQuery: '',
  selectedMailId: showcaseEmailId,
  state: 'ready',
  workspaceSwitcher: {
    activeWorkspaceId: 'northstar-ops',
    workspaces: [
      {
        id: 'northstar-ops',
        name: 'Northstar Ops',
        slug: 'northstar-ops'
      }
    ]
  }
} satisfies AuthenticatedSidebarView

const showcaseEmail = {
  id: showcaseEmailId,
  bodySize: 'fill',
  html: [
    '<main>',
    '<h2>Account review and routing summary</h2>',
    '<p>Hello team,</p>',
    '<p>The shared support mailbox is now routing Northstar account messages through the updated queue rules. The summary below covers response targets, current owners, and the customer-facing next steps.</p>',
    '<table>',
    '<thead><tr><th>Workstream</th><th>Owner</th><th>Status</th></tr></thead>',
    '<tbody>',
    '<tr><td>Support queue</td><td>Avery Morgan</td><td>Live</td></tr>',
    '<tr><td>Billing intake</td><td>Priya Shah</td><td>Monitoring</td></tr>',
    '<tr><td>Routing checks</td><td>Marcus Lee</td><td>Ready</td></tr>',
    '</tbody>',
    '</table>',
    '<p>For this week, please keep replies in the shared thread and use the support queue for customer-facing follow-up. I will send the final weekly report after the Friday closeout.</p>',
    '<p>Thanks,<br>Northstar Operations</p>',
    '</main>'
  ].join(''),
  receivedAt: 'Today at 08:42 AM',
  recipientEmail: 'support@agentteam.example',
  senderEmail: 'operations@northstar.example',
  senderName: 'Northstar Operations',
  subject: 'Account review and routing summary'
} satisfies AuthenticatedEmailPreview

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

const showcaseLongMailboxListSidebarView = {
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

const meta = {
  title: 'Showcase/Screenshot Assets',
  tags: ['mock'],
  component: DashboardScreen,
  args: {
    ...authenticatedSectionBaseArgs,
    emailPreviewsById: {
      [showcaseEmailId]: showcaseEmail
    },
    onComposeOpenChange: fn(),
    onEmailAction: fn(),
    onMailboxAccountSelect: fn(),
    onMailboxFolderSelect: fn(),
    onMailboxMessageSelect: fn(),
    onMailboxRefresh: fn(),
    onMailboxSearchChange: fn(),
    onMailboxUnreadOnlyChange: fn(),
    sidebarView: showcaseSidebarView
  },
  globals: {
    theme: 'dark'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

export const OgImage: Story = {
  name: 'Mock mail workspace OG image'
}

export const HomeMailWorkspace: Story = {
  name: 'Mock home mail workspace'
}

export const HomeMailboxSwitcher: Story = {
  name: 'Mock home mailbox switcher',
  args: {
    sidebarView: showcaseLongMailboxListSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /open workspace and mailbox switcher/i }))
  }
}

export const HomeMailboxAdmin: Story = {
  name: 'Mock home mailbox admin',
  args: {
    mailboxAdminView: mailboxAdminReadyView,
    sidebarView: mailboxAdminSidebarView('accounts')
  }
}
