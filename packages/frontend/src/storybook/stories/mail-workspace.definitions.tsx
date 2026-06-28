import * as React from 'react'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'

import {
  accountPermissionsSidebarView,
  accountScopedRemoteImagesSidebarView,
  accountSwitchingSidebarView,
  archiveActionEmailPreviewsById,
  attachmentEmailPreviewsById,
  attachmentSidebarView,
  authenticatedSectionBaseArgs,
  blockedImagesSidebarView,
  composeAttachmentUploadStatusView,
  composeDraftSaveErrorView,
  composeDraftView,
  composeForwardView,
  composeReplyAllView,
  composeSavedDraftView,
  composeSavingDraftView,
  composeSelectedAccountView,
  composeSendingView,
  composeValidationErrorView,
  composeWithAttachmentsView,
  conversationThreadSidebarView,
  customFolderEmailPreviewsById,
  customFolderSidebarView,
  deleteMessageActionView,
  deleteMessageSubmittingActionView,
  disabledToolbarActionSidebarView,
  disabledToolbarEmailPreviewsById,
  documentResourceEmailPreviewsById,
  documentResourceSidebarView,
  draftEmailPreviewsById,
  draftSidebarView,
  draftToolbarEmailPreviewsById,
  emailPreviewSidebarView,
  emailPreviewsById,
  emptyAuthenticatedDashboardView,
  emptyAuthenticatedSidebarView,
  errorAuthenticatedDashboardView,
  errorAuthenticatedSidebarView,
  externalLinkCollisionEmailPreviewsById,
  externalLinkCollisionSidebarView,
  folderCreateErrorSidebarView,
  folderCreateOpenSidebarView,
  folderCreateSidebarView,
  folderCreateSubmittingSidebarView,
  folderDeleteErrorSidebarView,
  folderDeleteOpenSidebarView,
  folderDeleteSubmittingSidebarView,
  folderRenameErrorSidebarView,
  folderRenameOpenSidebarView,
  folderRenameSubmittingSidebarView,
  formEmailPreviewsById,
  formEmailSidebarView,
  inlineAttachmentEmailPreviewsById,
  inlineAttachmentSidebarView,
  junkActionEmailPreviewsById,
  junkMailboxSidebarView,
  loadingAuthenticatedDashboardView,
  loadingAuthenticatedSidebarView,
  mailtoLinkEmailPreviewsById,
  mailtoLinkSidebarView,
  moveActionErrorView,
  moveActionSubmittingView,
  moveDisabledTargetActionView,
  moveToSpamActionView,
  originalSourceActionView,
  originalSourceErrorActionView,
  originalSourceEvidenceActionView,
  originalSourceLoadingActionView,
  paginatedMailboxLoadingSidebarView,
  paginatedMailboxSidebarView,
  pendingActionEmailPreviewsById,
  pendingActionSidebarView,
  protectedFolderActionSidebarView,
  refreshingMailboxSidebarView,
  remoteBackgroundImagesEmailPreviewsById,
  remoteBackgroundImagesSidebarView,
  searchEmptySidebarView,
  searchFilteredSidebarView,
  sentEmailPreviewsById,
  sentMailboxSidebarView,
  starredEmailPreviewsById,
  starredMessageSidebarView,
  threadedMailboxSidebarView,
  trashActionEmailPreviewsById,
  trashEmailPreviewsById,
  trashMailboxSidebarView,
  unreadMessageEmailPreviewsById,
  unreadOnlySidebarView,
  unsafeExternalLinkEmailPreviewsById,
  welcomeEmailSidebarView
} from '../authenticated-section-fixtures'
import { DashboardScreen } from '../../screens/dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'

export const mailWorkspaceStoryMeta = {
  component: DashboardScreen,
  args: {
    ...authenticatedSectionBaseArgs,
    emailPreviewsById,
    onComposeAttachmentAdd: fn(),
    onComposeAttachmentRemove: fn(),
    onComposeDiscardDraft: fn(),
    onComposeFieldChange: fn(),
    onComposeOpenChange: fn(),
    onComposeSaveDraft: fn(),
    onComposeSubmit: fn(),
    onEmailAttachmentPreview: fn(),
    onEmailAction: fn(),
    onMailActionDialogOpenChange: fn(),
    onMailDeleteConfirm: fn(),
    onMailMoveSubmit: fn(),
    onMailMoveTargetChange: fn(),
    onMailOriginalSourceDownload: fn(),
    onMailboxAccountSelect: fn(),
    onMailboxFolderAction: fn(),
    onMailboxFolderCreateNameChange: fn(),
    onMailboxFolderCreateOpenChange: fn(),
    onMailboxFolderCreateSubmit: fn(),
    onMailboxFolderDeleteConfirm: fn(),
    onMailboxFolderDeleteOpenChange: fn(),
    onMailboxFolderRenameNameChange: fn(),
    onMailboxFolderRenameOpenChange: fn(),
    onMailboxFolderRenameSubmit: fn(),
    onMailboxFolderSelect: fn(),
    onMailboxMessageSelect: fn(),
    onMailboxPageChange: fn(),
    onMailboxRefresh: fn(),
    onMailboxRetry: fn(),
    onMailboxSearchChange: fn(),
    onMailboxUnreadOnlyChange: fn(),
    onMessageRetry: fn(),
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

type Story = StoryObj<typeof mailWorkspaceStoryMeta>

function getContainingButton(element: HTMLElement) {
  const button = element.closest('button')
  if (!(button instanceof globalThis.HTMLButtonElement)) {
    throw new TypeError('Expected text to be rendered inside a button')
  }
  return button
}

function getContainingMailRow(element: HTMLElement, id: string) {
  const row = element.closest(`[data-mail-row-id="${id}"]`)
  if (!(row instanceof globalThis.HTMLElement)) {
    throw new TypeError(`Expected message row ${id} to contain the element`)
  }
  return row
}

async function openWorkspaceMailboxSwitcher(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)

  await userEvent.click(await canvas.findByRole('button', { name: /open workspace and mailbox switcher/i }))

  return within(canvasElement.ownerDocument.body)
}

export const MailboxDefault: Story = {
  name: 'mailbox / default',
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^compose$/i }))
    await expect(args.onComposeOpenChange).toHaveBeenCalledWith(true)
    await userEvent.click(await canvas.findByRole('button', { name: /^refresh mailbox$/i }))
    await expect(args.onMailboxRefresh).toHaveBeenCalled()
  }
}

export const MailboxLoading: Story = {
  name: 'mailbox / loading',
  args: {
    dashboardView: loadingAuthenticatedDashboardView,
    sidebarView: loadingAuthenticatedSidebarView
  }
}

export const MailboxRefreshing: Story = {
  name: 'mailbox / refreshing',
  args: {
    sidebarView: refreshingMailboxSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^refreshing mailbox$/i })).toBeDisabled()
  }
}

export const MailboxEmpty: Story = {
  name: 'mailbox / empty',
  args: {
    dashboardView: emptyAuthenticatedDashboardView,
    sidebarView: emptyAuthenticatedSidebarView
  }
}

export const MailboxError: Story = {
  name: 'mailbox / error',
  args: {
    dashboardView: emptyAuthenticatedDashboardView,
    sidebarView: errorAuthenticatedSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(/mailbox failed to load/i)).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^retry mailbox$/i }))
    await expect(args.onMailboxRetry).toHaveBeenCalled()
  }
}

export const MessageAppointment: Story = {
  name: 'message / appointment',
  args: {
    sidebarView: emailPreviewSidebarView
  }
}

export const MessageError: Story = {
  name: 'message / error',
  args: {
    dashboardView: errorAuthenticatedDashboardView,
    emailPreviewsById: {},
    sidebarView: emailPreviewSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(/message failed to load/i)).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^retry message$/i }))
    await expect(args.onMessageRetry).toHaveBeenCalled()
  }
}

export const MessageToolbarControllerActions: Story = {
  name: 'message / toolbar controller actions',
  args: {
    sidebarView: emailPreviewSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^reply$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'reply',
      expect.objectContaining({ id: 'appointment-alert' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^reply all$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'reply-all',
      expect.objectContaining({ id: 'appointment-alert' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^forward$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'forward',
      expect.objectContaining({ id: 'appointment-alert' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^star$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'star',
      expect.objectContaining({ id: 'appointment-alert' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^mark as unread$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'mark-unread',
      expect.objectContaining({ id: 'appointment-alert' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^move to folder$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'move',
      expect.objectContaining({ id: 'appointment-alert' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^mark as spam$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'mark-spam',
      expect.objectContaining({ id: 'appointment-alert' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^view original$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'view-original',
      expect.objectContaining({ id: 'appointment-alert' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^delete$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'delete',
      expect.objectContaining({ id: 'appointment-alert' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^close$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'close',
      expect.objectContaining({ id: 'appointment-alert' })
    )
  }
}

export const MessageArchiveAction: Story = {
  name: 'message / archive action',
  args: {
    emailPreviewsById: archiveActionEmailPreviewsById,
    sidebarView: blockedImagesSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^archive$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'archive',
      expect.objectContaining({ id: 'blocked-images' })
    )
  }
}

export const MessageWelcome: Story = {
  name: 'message / welcome',
  args: {
    sidebarView: welcomeEmailSidebarView
  }
}

export const MessageStarred: Story = {
  name: 'message / starred',
  args: {
    emailPreviewsById: starredEmailPreviewsById,
    sidebarView: starredMessageSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /welcome aboard/i })).toBeInTheDocument()
    await expect((await canvas.findAllByText(/^starred$/i)).length).toBeGreaterThanOrEqual(2)
    await userEvent.click(await canvas.findByRole('button', { name: /^unstar$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'unstar',
      expect.objectContaining({ id: 'welcome-email', isStarred: true })
    )
  }
}

export const MessageUnread: Story = {
  name: 'message / unread',
  args: {
    emailPreviewsById: unreadMessageEmailPreviewsById,
    sidebarView: emailPreviewSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /appointment alert/i })).toBeInTheDocument()
    await expect((await canvas.findAllByText(/^unread$/i)).length).toBeGreaterThanOrEqual(1)
    await userEvent.click(await canvas.findByRole('button', { name: /^mark as read$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'mark-read',
      expect.objectContaining({ id: 'appointment-alert', isUnread: true })
    )
  }
}

export const MessageDisabledActions: Story = {
  name: 'message / disabled toolbar action',
  args: {
    emailPreviewsById: disabledToolbarEmailPreviewsById,
    sidebarView: disabledToolbarActionSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^reply all$/i })).toBeDisabled()
  }
}

export const ConversationThread: Story = {
  name: 'conversation / thread',
  args: {
    sidebarView: conversationThreadSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const replyButtons = await canvas.findAllByRole('button', { name: /^reply$/i })
    const forwardButtons = await canvas.findAllByRole('button', { name: /^forward$/i })
    const threadReplyButton = replyButtons[replyButtons.length - 1]
    const threadForwardButton = forwardButtons[forwardButtons.length - 1]

    if (!threadReplyButton || !threadForwardButton) {
      throw new Error('Expected conversation thread reply and forward controls')
    }

    await userEvent.click(threadReplyButton)
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'reply',
      expect.objectContaining({ id: 'conversation-thread' })
    )
    await userEvent.click(threadForwardButton)
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'forward',
      expect.objectContaining({ id: 'conversation-thread' })
    )
  }
}

export const ConversationThreadMessageActions: Story = {
  name: 'conversation / message actions',
  args: {
    sidebarView: conversationThreadSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^expand agentteam email message$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'expand-thread-message',
      expect.objectContaining({ id: 'thread-original' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^collapse testing message$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'collapse-thread-message',
      expect.objectContaining({ id: 'thread-latest' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^view message original$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'view-original',
      expect.objectContaining({ id: 'thread-latest' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^send draft$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'send-draft',
      expect.objectContaining({ id: 'thread-draft-reply', isDraft: true })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^edit draft$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'edit-draft',
      expect.objectContaining({ id: 'thread-draft-reply', isDraft: true })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^discard draft$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'discard-draft',
      expect.objectContaining({ id: 'thread-draft-reply', isDraft: true })
    )
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

    const iframeElement = await canvas.findByTitle(/deployment checklist and routing review email body/i)
    if (!(iframeElement instanceof globalThis.HTMLIFrameElement)) {
      throw new TypeError('Expected email body to render in an iframe')
    }
    const iframeBody = iframeElement.contentDocument?.body
    if (!iframeBody) {
      throw new Error('Expected email iframe body to be readable')
    }
    await waitFor(async () => {
      await expect(iframeBody.textContent ?? '').toContain('Remote image blocked')
    })
    await userEvent.click(await within(iframeBody).findByText(/provider portal/i))

    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('dialog')).toHaveTextContent(/dash.cloudflare.com/i)
    await userEvent.click(await body.findByRole('button', { name: /^cancel$/i }))

    await userEvent.click(await canvas.findByRole('button', { name: /show images/i }))
    await expect(canvas.queryByText(/remote images blocked/i)).not.toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /dash.cloudflare.com/i }))

    await expect(await body.findByRole('dialog')).toHaveTextContent(/dash.cloudflare.com/i)
  }
}

export const SecurityRemoteContentAccountScoped: Story = {
  name: 'security / remote content account scoped',
  args: {
    sidebarView: accountScopedRemoteImagesSidebarView
  },
  render: function Render(args) {
    const [activeAccountId, setActiveAccountId] = React.useState(
      accountScopedRemoteImagesSidebarView.activeAccountId
    )
    const sidebarView = React.useMemo(
      () => ({
        ...accountScopedRemoteImagesSidebarView,
        activeAccountId
      }),
      [activeAccountId]
    )

    return (
      <DashboardScreen
        {...args}
        onMailboxAccountSelect={(accountId) => {
          setActiveAccountId(accountId)
          args.onMailboxAccountSelect?.(accountId)
        }}
        sidebarView={sidebarView}
      />
    )
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText(/remote images blocked/i)).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /show images/i }))
    await waitFor(async () => {
      await expect(canvas.queryByText(/remote images blocked/i)).not.toBeInTheDocument()
    })

    await openWorkspaceMailboxSwitcher(canvasElement)
    await userEvent.click(await body.findByRole('menuitem', { name: /billing agent/i }))

    await expect(args.onMailboxAccountSelect).toHaveBeenCalledWith('agent-billing')
    await expect(await canvas.findByText(/remote images blocked/i)).toBeInTheDocument()
  }
}

export const SecurityRemoteBackgroundImagesBlocked: Story = {
  name: 'security / remote background images blocked',
  args: {
    emailPreviewsById: remoteBackgroundImagesEmailPreviewsById,
    sidebarView: remoteBackgroundImagesSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const iframeElement = await canvas.findByTitle(/background image tracking email body/i)

    await expect(await canvas.findByText(/remote images blocked from 2 sources/i)).toBeInTheDocument()

    if (!(iframeElement instanceof globalThis.HTMLIFrameElement)) {
      throw new TypeError('Expected background image email body to render in an iframe')
    }

    const iframeBody = iframeElement.contentDocument?.body
    if (!iframeBody) {
      throw new Error('Expected background image iframe body to be readable')
    }

    await waitFor(async () => {
      await expect(iframeBody.textContent ?? '').toContain('Background image content')
      await expect(iframeBody.innerHTML).not.toContain('assets.provider.example')
      await expect(iframeBody.innerHTML).not.toContain('background-image')
    })
  }
}

export const SecurityDocumentResourceTagsBlocked: Story = {
  name: 'security / document resource tags blocked',
  args: {
    emailPreviewsById: documentResourceEmailPreviewsById,
    sidebarView: documentResourceSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const iframeElement = await canvas.findByTitle(/document resource controls email body/i)

    if (!(iframeElement instanceof globalThis.HTMLIFrameElement)) {
      throw new TypeError('Expected document resource email body to render in an iframe')
    }

    const iframeBody = iframeElement.contentDocument?.body
    if (!iframeBody) {
      throw new Error('Expected document resource iframe body to be readable')
    }

    await waitFor(async () => {
      await expect(iframeBody.textContent ?? '').toContain('Document resource content')
      await expect(iframeBody.innerHTML).not.toContain('wildduck.example.test')
      await expect(iframeBody.innerHTML).not.toContain('<base')
      await expect(iframeBody.innerHTML).not.toContain('<meta')
      await expect(iframeBody.innerHTML).not.toContain('<link')
      await expect(iframeBody.innerHTML).not.toContain('<script')
      await expect(iframeBody.innerHTML).not.toContain('<iframe')
      await expect(iframeBody.innerHTML).not.toContain('<object')
      await expect(iframeBody.innerHTML).not.toContain('<embed')
      await expect(iframeBody.textContent ?? '').not.toContain('iframe fallback')
      await expect(iframeBody.textContent ?? '').not.toContain('object fallback')
    })
  }
}

export const SecurityUnsafeControllerLink: Story = {
  name: 'security / unsafe controller link',
  args: {
    emailPreviewsById: unsafeExternalLinkEmailPreviewsById,
    sidebarView: blockedImagesSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const iframeElement = await canvas.findByTitle(/deployment checklist and routing review email body/i)
    if (!(iframeElement instanceof globalThis.HTMLIFrameElement)) {
      throw new TypeError('Expected email body to render in an iframe')
    }
    const iframeBody = iframeElement.contentDocument?.body
    if (!iframeBody) {
      throw new Error('Expected email iframe body to be readable')
    }

    await userEvent.click(await within(iframeBody).findByText(/provider portal/i))

    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole('dialog')
    await expect(dialog).toHaveTextContent(/unsupported destination/i)
    await expect(dialog).toHaveTextContent(/not a supported external URL/i)
    await expect(within(dialog).queryByRole('link', { name: /^continue$/i })).not.toBeInTheDocument()
  }
}

export const SecurityMailtoLinkInteraction: Story = {
  name: 'security / mailto link interaction',
  args: {
    emailPreviewsById: mailtoLinkEmailPreviewsById,
    sidebarView: mailtoLinkSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const iframeElement = await canvas.findByTitle(/contact support by email email body/i)

    if (!(iframeElement instanceof globalThis.HTMLIFrameElement)) {
      throw new TypeError('Expected mailto email body to render in an iframe')
    }

    const iframeBody = iframeElement.contentDocument?.body
    if (!iframeBody) {
      throw new Error('Expected mailto iframe body to be readable')
    }

    await userEvent.click(await within(iframeBody).findByText(/email support/i))

    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole('dialog')

    await expect(dialog).toHaveTextContent(/support@example\.test/i)
    await expect(dialog).toHaveTextContent(/mailto:support@example\.test/i)
  }
}

export const SecurityExternalLinkGeneratedIdCollision: Story = {
  name: 'security / external link generated id collision',
  args: {
    emailPreviewsById: externalLinkCollisionEmailPreviewsById,
    sidebarView: externalLinkCollisionSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const iframeElement = await canvas.findByTitle(/external link collision handling email body/i)

    if (!(iframeElement instanceof globalThis.HTMLIFrameElement)) {
      throw new TypeError('Expected external link collision email body to render in an iframe')
    }

    const iframeBody = iframeElement.contentDocument?.body
    if (!iframeBody) {
      throw new Error('Expected external link collision iframe body to be readable')
    }

    await userEvent.click(await within(iframeBody).findByText(/generated docs link/i))
    await expect(await body.findByRole('dialog')).toHaveTextContent(/docs.example.test/i)
    await userEvent.click(await body.findByRole('button', { name: /^cancel$/i }))

    await userEvent.click(await within(iframeBody).findByText(/controller link/i))
    await expect(await body.findByRole('dialog')).toHaveTextContent(/controller.example.test/i)
    await userEvent.click(await body.findByRole('button', { name: /^cancel$/i }))
  }
}

export const SecurityFormContentRemoved: Story = {
  name: 'security / form content removed',
  args: {
    emailPreviewsById: formEmailPreviewsById,
    sidebarView: formEmailSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const iframeElement = await canvas.findByTitle(/form in email body email body/i)

    if (!(iframeElement instanceof globalThis.HTMLIFrameElement)) {
      throw new TypeError('Expected form email body to render in an iframe')
    }

    const iframeBody = iframeElement.contentDocument?.body
    if (!iframeBody) {
      throw new Error('Expected form iframe body to be readable')
    }

    await waitFor(async () => {
      await expect(iframeBody.querySelector('form')).toBeNull()
      await expect(iframeBody.querySelector('input')).toBeNull()
      await expect(iframeBody.querySelector('button')).toBeNull()
      await expect(iframeBody.querySelector('[data-agent-mail-inert-form]')).toBeNull()
      await expect(iframeBody.innerHTML).not.toContain('phish.example.test')
    })
  }
}

export const MailboxSearchFiltered: Story = {
  name: 'mailbox / search filtered',
  args: {
    sidebarView: searchFilteredSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const search = await canvas.findByPlaceholderText(/type to search/i)

    await userEvent.clear(search)
    await userEvent.type(search, 'billing')
    await expect(args.onMailboxSearchChange).toHaveBeenLastCalledWith('billing')
  }
}

export const MailboxSearchEmpty: Story = {
  name: 'mailbox / search empty',
  args: {
    dashboardView: emptyAuthenticatedDashboardView,
    sidebarView: searchEmptySidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(/no matching messages/i)).toBeInTheDocument()
    await expect(
      await canvas.findByText(/try another search or turn off the unread filter/i)
    ).toBeInTheDocument()
  }
}

export const MailboxUnreadOnly: Story = {
  name: 'mailbox / unread only',
  args: {
    sidebarView: unreadOnlySidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('switch', { name: /show unread messages only/i }))
    await expect(args.onMailboxUnreadOnlyChange).toHaveBeenCalledWith(false)
  }
}

export const MailboxThreadedMetadata: Story = {
  name: 'mailbox / threaded metadata',
  args: {
    sidebarView: threadedMailboxSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = await canvas.findByRole('button', { name: /agent mail smoke/i })

    await expect(row).toHaveTextContent(/3/)
    await expect(row).toHaveTextContent(/2 attachments/i)
    await expect(row).toHaveTextContent(/draft in thread/i)
    await expect(row).toHaveTextContent(/needs reply/i)
  }
}

export const MailboxJunk: Story = {
  name: 'mailbox / junk',
  args: {
    sidebarView: junkMailboxSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^junk$/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /provider portal/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('heading', { name: /deployment checklist/i })).toBeInTheDocument()
  }
}

export const MailboxSent: Story = {
  name: 'mailbox / sent',
  args: {
    emailPreviewsById: sentEmailPreviewsById,
    sidebarView: sentMailboxSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^sent$/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /support agent/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('heading', { name: /deployment checklist/i })).toBeInTheDocument()
  }
}

export const MailboxTrash: Story = {
  name: 'mailbox / trash',
  args: {
    emailPreviewsById: trashEmailPreviewsById,
    sidebarView: trashMailboxSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^trash$/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /old alert/i })).toBeInTheDocument()
    await expect(
      await canvas.findByRole('heading', { name: /expired deployment alert/i })
    ).toBeInTheDocument()
  }
}

export const MessageMarkNotSpam: Story = {
  name: 'message / mark not spam',
  args: {
    emailPreviewsById: junkActionEmailPreviewsById,
    sidebarView: junkMailboxSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^mark as not spam$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'mark-not-spam',
      expect.objectContaining({ folderId: 'junk', id: 'blocked-images' })
    )
  }
}

export const MessageRestoreFromTrash: Story = {
  name: 'message / restore from trash',
  args: {
    emailPreviewsById: trashActionEmailPreviewsById,
    sidebarView: trashMailboxSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^restore$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'restore',
      expect.objectContaining({ folderId: 'trash', id: 'trash-archive' })
    )
  }
}

export const MailboxAccountSwitching: Story = {
  name: 'mailbox / account switching',
  args: {
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(/support agent/i)).toBeInTheDocument()

    const body = await openWorkspaceMailboxSwitcher(canvasElement)
    await userEvent.click(await body.findByRole('menuitem', { name: /billing agent/i }))
    await expect(args.onMailboxAccountSelect).toHaveBeenCalledWith('agent-billing')

    await openWorkspaceMailboxSwitcher(canvasElement)
    await expect(await body.findByRole('menuitem', { name: /alerts agent/i })).toBeInTheDocument()
  }
}

export const MailboxAccountSwitchingResetsSelection: Story = {
  name: 'mailbox / account switching resets selection',
  args: {
    sidebarView: accountSwitchingSidebarView
  },
  render: function Render(args) {
    const [activeAccountId, setActiveAccountId] = React.useState(accountSwitchingSidebarView.activeAccountId)
    const sidebarView = React.useMemo(
      () => ({
        ...accountSwitchingSidebarView,
        activeAccountId
      }),
      [activeAccountId]
    )

    return (
      <DashboardScreen
        {...args}
        onMailboxAccountSelect={(accountId) => {
          setActiveAccountId(accountId)
          args.onMailboxAccountSelect?.(accountId)
        }}
        sidebarView={sidebarView}
      />
    )
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /welcome aboard/i }))
    await expect(await canvas.findByRole('heading', { name: /welcome aboard/i })).toBeInTheDocument()

    await openWorkspaceMailboxSwitcher(canvasElement)
    await userEvent.click(await body.findByRole('menuitem', { name: /billing agent/i }))

    await expect(args.onMailboxAccountSelect).toHaveBeenCalledWith('agent-billing')
    await expect(await canvas.findByRole('heading', { name: /appointment alert/i })).toBeInTheDocument()
    await expect(canvas.queryByRole('heading', { name: /welcome aboard/i })).not.toBeInTheDocument()
  }
}

export const MailboxAccountSwitchingResetsFolder: Story = {
  name: 'mailbox / account switching resets folder',
  args: {
    sidebarView: customFolderSidebarView
  },
  render: function Render(args) {
    const [activeAccountId, setActiveAccountId] = React.useState(accountSwitchingSidebarView.activeAccountId)
    const sidebarView = React.useMemo(
      () => ({
        ...customFolderSidebarView,
        activeAccountId,
        activeItemId: 'inbox',
        mails: accountSwitchingSidebarView.mails,
        selectedMailId: 'appointment-alert'
      }),
      [activeAccountId]
    )

    return (
      <DashboardScreen
        {...args}
        onMailboxAccountSelect={(accountId) => {
          setActiveAccountId(accountId)
          args.onMailboxAccountSelect?.(accountId)
        }}
        sidebarView={sidebarView}
      />
    )
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /archive 42/i }))
    await expect(args.onMailboxFolderSelect).toHaveBeenCalledWith('archive')
    await expect(await canvas.findByRole('button', { name: /archive 42/i })).toHaveAttribute(
      'data-active',
      'true'
    )

    await openWorkspaceMailboxSwitcher(canvasElement)
    await userEvent.click(await body.findByRole('menuitem', { name: /billing agent/i }))

    await expect(args.onMailboxAccountSelect).toHaveBeenCalledWith('agent-billing')
    await expect(await canvas.findByRole('button', { name: /^inbox$/i })).toHaveAttribute(
      'data-active',
      'true'
    )
    await expect(await canvas.findByRole('button', { name: /archive 42/i })).toHaveAttribute(
      'data-active',
      'false'
    )
  }
}

export const MailboxAccountSwitchingResetsFilters: Story = {
  name: 'mailbox / account switching resets filters',
  args: {
    sidebarView: accountSwitchingSidebarView
  },
  render: function Render(args) {
    const [activeAccountId, setActiveAccountId] = React.useState(accountSwitchingSidebarView.activeAccountId)
    const sidebarView = React.useMemo(
      () => ({
        ...accountSwitchingSidebarView,
        activeAccountId
      }),
      [activeAccountId]
    )

    return (
      <DashboardScreen
        {...args}
        onMailboxAccountSelect={(accountId) => {
          setActiveAccountId(accountId)
          args.onMailboxAccountSelect?.(accountId)
        }}
        sidebarView={sidebarView}
      />
    )
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const searchInput = await canvas.findByPlaceholderText(/type to search/i)
    const unreadSwitch = await canvas.findByRole('switch', { name: /show unread messages only/i })

    await fireEvent.change(searchInput, {
      target: { value: 'welcome' }
    })
    await userEvent.click(unreadSwitch)

    await expect(args.onMailboxSearchChange).toHaveBeenCalledWith('welcome')
    await expect(args.onMailboxUnreadOnlyChange).toHaveBeenCalledWith(true)
    await expect(searchInput).toHaveValue('welcome')
    await expect(unreadSwitch).toBeChecked()

    await openWorkspaceMailboxSwitcher(canvasElement)
    await userEvent.click(await body.findByRole('menuitem', { name: /billing agent/i }))

    await expect(args.onMailboxAccountSelect).toHaveBeenCalledWith('agent-billing')
    await expect(await canvas.findByPlaceholderText(/type to search/i)).toHaveValue('')
    await expect(await canvas.findByRole('switch', { name: /show unread messages only/i })).not.toBeChecked()
  }
}

export const MailboxAccountPermissions: Story = {
  name: 'mailbox / account permissions',
  args: {
    sidebarView: accountPermissionsSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await openWorkspaceMailboxSwitcher(canvasElement)

    const deniedAccount = await body.findByRole('menuitem', { name: /finance agent/i })
    const loadingAccount = await body.findByRole('menuitem', { name: /importing agent/i })

    await expect(await body.findByText(/^no mailbox permission$/i)).toBeInTheDocument()
    await expect(loadingAccount).toHaveTextContent(/loading/i)
    await expect(deniedAccount).toHaveAttribute('data-disabled')
    await expect(loadingAccount).toHaveAttribute('data-disabled')
  }
}

export const MailboxFolderNavigation: Story = {
  name: 'mailbox / folder navigation',
  args: {
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^drafts$/i }))
    await expect(args.onMailboxFolderSelect).toHaveBeenCalledWith('drafts')
    await userEvent.click(await canvas.findByRole('button', { name: /^sent$/i }))
    await expect(args.onMailboxFolderSelect).toHaveBeenCalledWith('sent')
    await userEvent.click(await canvas.findByRole('button', { name: /^junk$/i }))
    await expect(args.onMailboxFolderSelect).toHaveBeenCalledWith('junk')
    await userEvent.click(await canvas.findByRole('button', { name: /^trash$/i }))
    await expect(args.onMailboxFolderSelect).toHaveBeenCalledWith('trash')
  }
}

export const MailboxCustomFolder: Story = {
  name: 'mailbox / custom folder',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: customFolderSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /archive 42/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /provider portal/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('heading', { name: /archived routing review/i })).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /archive 42/i }))
    await expect(args.onMailboxFolderSelect).toHaveBeenCalledWith('archive')
  }
}

export const MailboxCreateFolder: Story = {
  name: 'mailbox / create folder trigger',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderCreateSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^create folder$/i }))
    await expect(args.onMailboxFolderCreateOpenChange).toHaveBeenCalledWith(true)
  }
}

export const MailboxCreateFolderOpen: Story = {
  name: 'mailbox / create folder open',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderCreateOpenSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: /^create folder$/i }))

    await expect(await dialog.findByLabelText(/^folder name$/i)).toHaveValue('Projects')
    await fireEvent.change(await dialog.findByLabelText(/^folder name$/i), {
      target: { value: 'Projects Archive' }
    })
    await expect(args.onMailboxFolderCreateNameChange).toHaveBeenCalledWith('Projects Archive')
    await userEvent.click(await dialog.findByRole('button', { name: /^create folder$/i }))
    await expect(args.onMailboxFolderCreateSubmit).toHaveBeenCalled()
  }
}

export const MailboxCreateFolderSubmitting: Story = {
  name: 'mailbox / create folder submitting',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderCreateSubmittingSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: /^create folder$/i }))

    await expect(await dialog.findByLabelText(/^folder name$/i)).toBeDisabled()
    await expect(await dialog.findByRole('button', { name: /creating folder/i })).toBeDisabled()
  }
}

export const MailboxCreateFolderError: Story = {
  name: 'mailbox / create folder error',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderCreateErrorSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: /^create folder$/i }))

    await expect(await dialog.findByText(/wildduck already has a folder named projects/i)).toBeInTheDocument()
    await expect(await dialog.findByRole('button', { name: /^create folder$/i })).toBeEnabled()
  }
}

export const MailboxFolderActions: Story = {
  name: 'mailbox / folder actions',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: customFolderSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^archive folder actions$/i }))
    await userEvent.click(await body.findByRole('menuitem', { name: /^rename folder$/i }))
    await expect(args.onMailboxFolderAction).toHaveBeenCalledWith(
      'rename-folder',
      expect.objectContaining({ id: 'archive' })
    )

    await userEvent.click(await canvas.findByRole('button', { name: /^archive folder actions$/i }))
    await userEvent.click(await body.findByRole('menuitem', { name: /^delete folder$/i }))
    await expect(args.onMailboxFolderAction).toHaveBeenCalledWith(
      'delete-folder',
      expect.objectContaining({ id: 'archive' })
    )
  }
}

export const MailboxProtectedFolderActions: Story = {
  name: 'mailbox / protected folder actions',
  args: {
    sidebarView: protectedFolderActionSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^inbox folder actions$/i }))

    const renameAction = await body.findByRole('menuitem', { name: /rename folder/i })
    const deleteAction = await body.findByRole('menuitem', { name: /delete folder/i })

    await expect(await body.findAllByText(/^system folder managed by wildduck$/i)).toHaveLength(2)
    await expect(renameAction).toHaveAttribute('aria-disabled', 'true')
    await expect(deleteAction).toHaveAttribute('aria-disabled', 'true')
  }
}

export const MailboxRenameFolderOpen: Story = {
  name: 'mailbox / rename folder open',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderRenameOpenSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: /^rename folder$/i }))

    await expect(await dialog.findByLabelText(/^folder name$/i)).toHaveValue('Archive')
    await fireEvent.change(await dialog.findByLabelText(/^folder name$/i), {
      target: { value: 'Provider Archive' }
    })
    await expect(args.onMailboxFolderRenameNameChange).toHaveBeenCalledWith('Provider Archive')
    await userEvent.click(await dialog.findByRole('button', { name: /^rename folder$/i }))
    await expect(args.onMailboxFolderRenameSubmit).toHaveBeenCalled()
  }
}

export const MailboxRenameFolderSubmitting: Story = {
  name: 'mailbox / rename folder submitting',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderRenameSubmittingSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: /^rename folder$/i }))

    await expect(await dialog.findByLabelText(/^folder name$/i)).toBeDisabled()
    await expect(await dialog.findByRole('button', { name: /renaming folder/i })).toBeDisabled()
  }
}

export const MailboxRenameFolderError: Story = {
  name: 'mailbox / rename folder error',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderRenameErrorSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: /^rename folder$/i }))

    await expect(await dialog.findByText(/could not rename this folder/i)).toBeInTheDocument()
    await expect(await dialog.findByRole('button', { name: /^rename folder$/i })).toBeEnabled()
  }
}

export const MailboxDeleteFolderConfirm: Story = {
  name: 'mailbox / delete folder confirm',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderDeleteOpenSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialogElement = await body.findByRole('alertdialog')
    const dialog = within(dialogElement)

    await expect(dialogElement).toHaveTextContent(/delete archive folder/i)
    await userEvent.click(await dialog.findByRole('button', { name: /^delete folder$/i }))
    await expect(args.onMailboxFolderDeleteConfirm).toHaveBeenCalled()
  }
}

export const MailboxDeleteFolderSubmitting: Story = {
  name: 'mailbox / delete folder submitting',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderDeleteSubmittingSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('alertdialog'))

    await expect(await dialog.findByRole('button', { name: /deleting folder/i })).toBeDisabled()
  }
}

export const MailboxDeleteFolderError: Story = {
  name: 'mailbox / delete folder error',
  args: {
    emailPreviewsById: customFolderEmailPreviewsById,
    sidebarView: folderDeleteErrorSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('alertdialog'))

    await expect(await dialog.findByText(/folder still contains messages/i)).toBeInTheDocument()
    await expect(await dialog.findByRole('button', { name: /^delete folder$/i })).toBeEnabled()
  }
}

export const MailboxPagination: Story = {
  name: 'mailbox / cursor pagination',
  args: {
    sidebarView: paginatedMailboxSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('51-75')).toBeInTheDocument()
    await expect(await canvas.findByText(/235 messages/i)).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /previous page/i }))
    await expect(args.onMailboxPageChange).toHaveBeenCalledWith({
      cursor: 'previous-cursor-page-1',
      direction: 'previous'
    })
    await userEvent.click(await canvas.findByRole('button', { name: /next page/i }))
    await expect(args.onMailboxPageChange).toHaveBeenCalledWith({
      cursor: 'next-cursor-page-3',
      direction: 'next'
    })
  }
}

export const MailboxPaginationLoading: Story = {
  name: 'mailbox / cursor pagination loading',
  args: {
    sidebarView: paginatedMailboxLoadingSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /previous page/i })).toBeDisabled()
    await expect(await canvas.findByRole('button', { name: /next page/i })).toBeDisabled()
  }
}

export const DraftEditing: Story = {
  name: 'drafts / edit draft',
  args: {
    composeView: composeDraftView,
    emailPreviewsById: draftEmailPreviewsById,
    sidebarView: draftSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.type(await body.findByLabelText(/^subject$/i), ' updated')
    await expect(args.onComposeFieldChange).toHaveBeenCalledWith(
      'subject',
      expect.stringContaining('Re: Deployment checklist')
    )
    await userEvent.click(await body.findByRole('button', { name: /^save draft$/i }))
    await expect(args.onComposeSaveDraft).toHaveBeenCalled()
    await userEvent.click(await body.findByRole('button', { name: /^send$/i }))
    await expect(args.onComposeSubmit).toHaveBeenCalled()
    await userEvent.click(await body.findByRole('button', { name: /^discard$/i }))
    await expect(args.onComposeDiscardDraft).toHaveBeenCalled()
  }
}

export const DraftToolbarActions: Story = {
  name: 'drafts / toolbar actions',
  args: {
    emailPreviewsById: draftToolbarEmailPreviewsById,
    sidebarView: draftSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /deployment checklist/i })).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^send draft$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'send-draft',
      expect.objectContaining({ id: 'draft-reply' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^edit draft$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'edit-draft',
      expect.objectContaining({ id: 'draft-reply' })
    )
    await userEvent.click(await canvas.findByRole('button', { name: /^discard draft$/i }))
    await expect(args.onEmailAction).toHaveBeenCalledWith(
      'discard-draft',
      expect.objectContaining({ id: 'draft-reply' })
    )
  }
}

export const ComposeSending: Story = {
  name: 'compose / sending',
  args: {
    composeView: composeSendingView,
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(getContainingButton(await body.findByText(/^Send$/i))).toBeDisabled()
    await expect(getContainingButton(await body.findByText(/^Save draft$/i))).toBeDisabled()
  }
}

export const ComposeSelectedAccount: Story = {
  name: 'compose / selected account',
  args: {
    composeView: composeSelectedAccountView,
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const from = await body.findByLabelText(/^from$/i)

    await expect(from).toHaveValue('Support Agent <support@agentteam.test>')
    await expect(from).toHaveAttribute('readonly')
  }
}

export const ComposeSavedDraft: Story = {
  name: 'compose / saved draft',
  args: {
    composeView: composeSavedDraftView,
    sidebarView: draftSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByText(/saved to wildduck drafts 2 minutes ago/i)).toBeInTheDocument()
    await expect(await body.findByRole('button', { name: /^save draft$/i })).toBeEnabled()
    await expect(await body.findByRole('button', { name: /^send$/i })).toBeEnabled()
  }
}

export const ComposeSavingDraft: Story = {
  name: 'compose / saving draft',
  args: {
    composeView: composeSavingDraftView,
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(getContainingButton(await body.findByText(/^Save draft$/i))).toBeDisabled()
    await expect(await body.findByRole('button', { name: /^discard$/i })).toBeDisabled()
    await expect(getContainingButton(await body.findByText(/^Send$/i))).toBeDisabled()
  }
}

export const ComposeReplyAll: Story = {
  name: 'compose / reply all',
  args: {
    composeView: composeReplyAllView,
    sidebarView: accountSwitchingSidebarView
  }
}

export const ComposeForward: Story = {
  name: 'compose / forward',
  args: {
    composeView: composeForwardView,
    sidebarView: accountSwitchingSidebarView
  }
}

export const ComposeDraftSaveError: Story = {
  name: 'compose / draft save error',
  args: {
    composeView: composeDraftSaveErrorView,
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByRole('dialog')).toHaveTextContent(/draft could not be saved/i)
  }
}

export const ComposeValidationErrors: Story = {
  name: 'compose / validation errors',
  args: {
    composeView: composeValidationErrorView,
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const toField = await body.findByLabelText(/^to$/i)
    const messageBody = await body.findByLabelText(/^body$/i)

    await expect(await body.findByText(/^use a valid recipient address\.$/i)).toBeInTheDocument()
    await expect(await body.findByText(/^message body is required before sending\.$/i)).toBeInTheDocument()
    await expect(toField).toHaveAttribute('aria-invalid', 'true')
    await expect(messageBody).toHaveAttribute('aria-invalid', 'true')
    await expect(getContainingButton(await body.findByText(/^Send$/i))).toBeDisabled()
    await expect(getContainingButton(await body.findByText(/^Save draft$/i))).toBeEnabled()

    await fireEvent.change(toField, {
      target: { value: 'updates@provider.example' }
    })
    await expect(args.onComposeFieldChange).toHaveBeenCalledWith('to', 'updates@provider.example')
  }
}

export const ComposeAttachments: Story = {
  name: 'compose / attachments',
  args: {
    composeView: composeWithAttachmentsView,
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const attachment = new File(['Draft attachment notes'], 'reply-notes.txt', {
      type: 'text/plain'
    })

    await userEvent.upload(await body.findByLabelText(/^attach files$/i), attachment)
    await expect(args.onComposeAttachmentAdd).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'reply-notes.txt', type: 'text/plain' })])
    )
    await expect(await body.findByText(/routing-checklist\.pdf/i)).toBeInTheDocument()
    await userEvent.click(
      await body.findByRole('button', { name: /remove attachment routing-checklist\.pdf/i })
    )
    await expect(args.onComposeAttachmentRemove).toHaveBeenCalledWith('compose-attachment-checklist')
  }
}

export const ComposeAttachmentStatus: Story = {
  name: 'compose / attachment status',
  args: {
    composeView: composeAttachmentUploadStatusView,
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByText(/^Uploading$/i)).toBeInTheDocument()
    await expect(await body.findByText(/^Upload failed$/i)).toBeInTheDocument()
    await expect(await body.findByText(/^Ready$/i)).toBeInTheDocument()
    await expect(
      await body.findByRole('button', { name: /remove attachment provider-log\.csv/i })
    ).toBeDisabled()
    await expect(
      await body.findByRole('button', { name: /remove attachment large-export\.zip/i })
    ).toBeEnabled()
  }
}

export const MessageAttachments: Story = {
  name: 'message / attachments',
  args: {
    emailPreviewsById: attachmentEmailPreviewsById,
    sidebarView: attachmentSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const manifestLink = await canvas.findByRole('link', { name: /manifest\.json/i })

    await userEvent.click(await canvas.findByRole('button', { name: /preview attachment preview\.png/i }))
    await expect(args.onEmailAttachmentPreview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'attachment-preview', filename: 'preview.png' }),
      expect.objectContaining({ id: 'attachment-message' })
    )
    await expect(manifestLink).toHaveAttribute(
      'href',
      expect.stringContaining(
        '/rpc/mail/accounts/agent-support/mailboxes/inbox/messages/attachment-message/attachments/attachment-manifest'
      )
    )
    await expect(canvas.queryByRole('link', { name: /wildduck-source\.eml/i })).not.toBeInTheDocument()
    await expect(await canvas.findByText(/wildduck-source\.eml/i)).toBeInTheDocument()
  }
}

export const MessageInlineAttachments: Story = {
  name: 'message / inline attachments',
  args: {
    emailPreviewsById: inlineAttachmentEmailPreviewsById,
    sidebarView: inlineAttachmentSidebarView
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const iframeElement = await canvas.findByTitle(/inline attachment rendering email body/i)

    if (!(iframeElement instanceof globalThis.HTMLIFrameElement)) {
      throw new TypeError('Expected inline attachment email body to render in an iframe')
    }

    const iframeBody = iframeElement.contentDocument?.body
    if (!iframeBody) {
      throw new Error('Expected inline attachment iframe body to be readable')
    }

    await waitFor(async () => {
      const inlineLogo = iframeBody.querySelector('img[alt="Provider logo"]')
      const inlineLogoSrc = inlineLogo?.getAttribute('src')

      if (!inlineLogoSrc) {
        throw new TypeError('Expected provider logo to render as an inline image')
      }

      await expect(inlineLogoSrc).toContain(
        '/rpc/mail/accounts/agent-support/mailboxes/inbox/messages/inline-attachment-message/attachments/inline-provider-logo'
      )
      await expect(iframeBody.innerHTML).toContain('Inline image unavailable')
      await expect(iframeBody.innerHTML).not.toContain('cid:provider-logo')
      await expect(iframeBody.innerHTML).not.toContain('wildduck.example.test')
    })
  }
}

export const MessagePendingAction: Story = {
  name: 'message / pending action',
  args: {
    emailPreviewsById: pendingActionEmailPreviewsById,
    sidebarView: pendingActionSidebarView
  }
}

export const MessageMoveToSpam: Story = {
  name: 'message / move to spam',
  args: {
    mailActionView: moveToSpamActionView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByRole('dialog')).toHaveTextContent(/move message/i)
    await expect(await body.findByText(/move to junk/i)).toBeInTheDocument()
    await userEvent.click(await body.findByRole('button', { name: /^move to junk$/i }))
    await expect(args.onMailMoveSubmit).toHaveBeenCalled()
  }
}

export const MessageMoveTargetSelection: Story = {
  name: 'message / move target selection',
  args: {
    mailActionView: moveToSpamActionView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole('dialog')

    await userEvent.click(await within(dialog).findByRole('combobox'))
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(args.onMailMoveTargetChange).toHaveBeenCalledWith('trash')
  }
}

export const MessageMoveDisabledTarget: Story = {
  name: 'message / move disabled target',
  args: {
    mailActionView: moveDisabledTargetActionView,
    sidebarView: accountSwitchingSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: /^move message$/i }))

    await expect(await dialog.findByRole('button', { name: /^move to inbox$/i })).toBeDisabled()
    await userEvent.click(await dialog.findByRole('combobox'))

    const inboxTarget = await body.findByRole('option', { name: /inbox/i })

    await expect(await body.findAllByText(/^message is already in inbox$/i)).toHaveLength(2)
    await expect(inboxTarget).toHaveAttribute('aria-disabled', 'true')
  }
}

export const MessageMoveSubmitting: Story = {
  name: 'message / move submitting',
  args: {
    mailActionView: moveActionSubmittingView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(getContainingButton(await body.findByText(/^Moving$/i))).toBeDisabled()
    await expect(await body.findByRole('button', { name: /^cancel$/i })).toBeDisabled()
  }
}

export const MessageMoveError: Story = {
  name: 'message / move error',
  args: {
    mailActionView: moveActionErrorView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByText(/message could not be moved/i)).toBeInTheDocument()
  }
}

export const MessageDeleteConfirm: Story = {
  name: 'message / delete confirm',
  args: {
    mailActionView: deleteMessageActionView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByRole('alertdialog')).toHaveTextContent(/delete this message/i)
    await userEvent.click(await body.findByRole('button', { name: /^delete message$/i }))
    await expect(args.onMailDeleteConfirm).toHaveBeenCalled()
  }
}

export const MessageDeleteSubmitting: Story = {
  name: 'message / delete submitting',
  args: {
    mailActionView: deleteMessageSubmittingActionView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(getContainingButton(await body.findByText(/^Delete message$/i))).toBeDisabled()
    await expect(await body.findByRole('button', { name: /^cancel$/i })).toBeDisabled()
  }
}

export const MessageOriginalSource: Story = {
  name: 'message / original source',
  args: {
    mailActionView: originalSourceActionView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByRole('dialog')).toHaveTextContent(/original source/i)
    await expect(await body.findByText(/storybook-original-source@example\.test/i)).toBeInTheDocument()
    await userEvent.click(await body.findByRole('button', { name: /^download \.eml$/i }))
    await expect(args.onMailOriginalSourceDownload).toHaveBeenCalled()
  }
}

export const MessageOriginalSourceEvidence: Story = {
  name: 'message / original source evidence',
  args: {
    mailActionView: originalSourceEvidenceActionView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole('dialog')

    await expect(dialog).toHaveTextContent(/cloudflare archived raw headers/i)
    await expect(dialog).toHaveTextContent(/final wildduck source headers/i)
    await expect(dialog).toHaveTextContent(/cloudflare edge evidence from verified archived raw\.eml/i)
    await expect(dialog).toHaveTextContent(/not original internet authentication/i)
    await expect((await within(dialog).findAllByText(/^X-CF-Trace$/i)).length).toBe(2)
    await userEvent.click(await body.findByRole('button', { name: /^download evidence bundle$/i }))
    await expect(args.onMailOriginalSourceDownload).toHaveBeenCalled()
  }
}

export const MessageOriginalSourceLoading: Story = {
  name: 'message / original source loading',
  args: {
    mailActionView: originalSourceLoadingActionView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByText(/loading source/i)).toBeInTheDocument()
    await expect(await body.findByRole('button', { name: /^download \.eml$/i })).toBeDisabled()
  }
}

export const MessageOriginalSourceError: Story = {
  name: 'message / original source error',
  args: {
    mailActionView: originalSourceErrorActionView,
    sidebarView: pendingActionSidebarView
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByText(/original source could not be loaded/i)).toBeInTheDocument()
    await expect(await body.findByRole('button', { name: /^download \.eml$/i })).toBeDisabled()
  }
}

export const MessageRowSelection: Story = {
  name: 'message / row selection',
  args: {
    sidebarView: emailPreviewSidebarView
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /appointment alert/i })).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /mailjet templates/i }))
    await expect(args.onMailboxMessageSelect).toHaveBeenCalledWith('welcome-email')
    await expect(await canvas.findByRole('heading', { name: /welcome aboard/i })).toBeInTheDocument()
  }
}

export const AccountMenu: Story = {
  name: 'account / user menu',
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await body.findByRole('button', { name: /^account$/i }))
    await expect(await body.findByRole('menuitem', { name: /^settings$/i })).toBeInTheDocument()
  }
}
