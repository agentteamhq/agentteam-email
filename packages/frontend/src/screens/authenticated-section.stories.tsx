import { expect, fn, userEvent, within } from 'storybook/test'

import {
  authenticatedSectionBaseArgs,
  blockedImagesSidebarView,
  conversationThreadSidebarView,
  disabledToolbarActionSidebarView,
  disabledToolbarEmailPreviewsById,
  emailPreviewSidebarView,
  emailPreviewsById,
  emptyAuthenticatedDashboardView,
  emptyAuthenticatedSidebarView,
  loadingAuthenticatedDashboardView,
  loadingAuthenticatedSidebarView,
  searchFilteredSidebarView,
  unreadOnlySidebarView,
  welcomeEmailSidebarView
} from '../storybook/authenticated-section-fixtures'
import { DashboardScreen } from './dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Workspace',
  component: DashboardScreen,
  args: {
    ...authenticatedSectionBaseArgs,
    emailPreviewsById,
    onEmailAction: fn(),
    sidebarView: emailPreviewSidebarView
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The production mail client workspace with mailbox navigation, message reading, conversation, security, and settings states.'
      }
    }
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

export const MailboxDefault: Story = {
  name: 'mailbox / default'
}

export const MailboxLoading: Story = {
  name: 'mailbox / loading',
  args: {
    dashboardView: loadingAuthenticatedDashboardView,
    sidebarView: loadingAuthenticatedSidebarView
  }
}

export const MailboxEmpty: Story = {
  name: 'mailbox / empty',
  args: {
    dashboardView: emptyAuthenticatedDashboardView,
    sidebarView: emptyAuthenticatedSidebarView
  }
}

export const MessageAppointment: Story = {
  name: 'message / appointment',
  args: {
    sidebarView: emailPreviewSidebarView
  }
}

export const MessageWelcome: Story = {
  name: 'message / welcome',
  args: {
    sidebarView: welcomeEmailSidebarView
  }
}

export const MessageDisabledActions: Story = {
  name: 'message / disabled toolbar action',
  args: {
    emailPreviewsById: disabledToolbarEmailPreviewsById,
    sidebarView: disabledToolbarActionSidebarView
  }
}

export const ConversationThread: Story = {
  name: 'conversation / thread',
  args: {
    sidebarView: conversationThreadSidebarView
  }
}

export const SecurityRemoteContentBlocked: Story = {
  name: 'security / remote content blocked',
  args: {
    sidebarView: blockedImagesSidebarView
  }
}

export const SecurityRemoteContentInteraction: Story = {
  name: 'security / remote content interaction',
  args: {
    sidebarView: blockedImagesSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(/remote images blocked/i)).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /show images/i }))
    await expect(canvas.queryByText(/remote images blocked/i)).not.toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /dash.cloudflare.com/i }))

    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('dialog')).toHaveTextContent(/dash.cloudflare.com/i)
  }
}

export const MailboxSearchFiltered: Story = {
  name: 'mailbox / search filtered',
  args: {
    sidebarView: searchFilteredSidebarView
  }
}

export const MailboxUnreadOnly: Story = {
  name: 'mailbox / unread only',
  args: {
    sidebarView: unreadOnlySidebarView
  }
}

export const MessageRowSelection: Story = {
  name: 'message / row selection',
  args: {
    sidebarView: emailPreviewSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /appointment alert/i })).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /mailjet templates/i }))
    await expect(await canvas.findByRole('heading', { name: /welcome aboard/i })).toBeInTheDocument()
  }
}

export const SettingsFromAccountMenu: Story = {
  name: 'settings / account menu',
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await body.findByRole('button', { name: /open account menu/i }))
    await userEvent.click(await body.findByRole('menuitem', { name: /billing/i }))

    const dialog = await body.findByRole('dialog')

    await expect(dialog).toBeInTheDocument()
    await expect(dialog).toHaveTextContent(/Messages & media/i)
  }
}
