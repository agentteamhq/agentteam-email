/* eslint-disable react-refresh/only-export-components */
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { agentAccessActionableState } from '../agent-access-fixtures'
import {
  authenticatedSectionBaseArgs,
  domainSettingsEmptyFirstUseState
} from '../authenticated-section-fixtures'
import {
  mailWorkspaceScreenAccountPermissionsView,
  mailWorkspaceScreenAccountSwitchingView,
  mailWorkspaceScreenAttachmentView,
  mailWorkspaceScreenBillingAccountView,
  mailWorkspaceScreenBlockedImagesView,
  mailWorkspaceScreenConversationView,
  mailWorkspaceScreenCustomFolderView,
  mailWorkspaceScreenDocumentResourceView,
  mailWorkspaceScreenDraftView,
  mailWorkspaceScreenEmptyView,
  mailWorkspaceScreenExternalLinkView,
  mailWorkspaceScreenFolderIds,
  mailWorkspaceScreenFormView,
  mailWorkspaceScreenInlineAttachmentView,
  mailWorkspaceScreenJunkView,
  mailWorkspaceScreenLongMailboxListView,
  mailWorkspaceScreenMailtoView,
  mailWorkspaceScreenNoAccountsView,
  mailWorkspaceScreenPaginatedView,
  mailWorkspaceScreenReadyView,
  mailWorkspaceScreenRemoteBackgroundView,
  mailWorkspaceScreenSearchEmptyView,
  mailWorkspaceScreenSearchFilteredView,
  mailWorkspaceScreenSentView,
  mailWorkspaceScreenTrashView,
  mailWorkspaceScreenUnreadOnlyView,
  mailWorkspaceScreenViewsByFolderId,
  mailWorkspaceScreenViewsByMessageId
} from '../mail-workspace-screen-fixtures'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import { MailWorkspaceControllerStoryFrame } from './mail-workspace-story-frame'
import type { MailWorkspaceQuery } from '../../lib/mail-rpc'
import type { AgentMailAdminNavigation, AgentMailWebWorkspace } from '@main/backend'
import type { Meta, StoryObj } from '@storybook/react'
import type { ComponentProps } from 'react'

export const mailWorkspaceControllerStoryMeta = {
  component: DashboardMailController,
  args: {
    authClient: authenticatedSectionBaseArgs.authClient,
    domainSettingsState: domainSettingsEmptyFirstUseState,
    publicEnv: authenticatedSectionBaseArgs.publicEnv,
    routeSearch: {},
    routeState: authenticatedSectionBaseArgs.routeState,
    sessionCleanupEnabled: authenticatedSectionBaseArgs.sessionCleanupEnabled,
    settingsOpen: false
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Mail Workspace screen states rendered through DashboardMailController with route search and loader-shaped data.'
      }
    }
  }
} satisfies Meta<typeof DashboardMailController>

type Story = StoryObj<typeof mailWorkspaceControllerStoryMeta>
type DashboardMailControllerArgs = ComponentProps<typeof DashboardMailController>

const storyMailboxAdminNavigation = {
  allowedSections: ['accounts', 'groups', 'agents']
} satisfies AgentMailAdminNavigation

export const MailboxDefault: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: /appointment alert/i })).toBeInTheDocument()
    await expect(await canvas.findByText('4 shown')).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^compose$/i }))
    await expect(await body.findByRole('dialog')).toHaveTextContent(/new message/i)
  }
}

export const MailboxLoading: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      pending: true
    })
}

export const MailboxEmpty: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenEmptyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(/inbox is empty/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/select a message/i)).toBeInTheDocument()
  }
}

export const MailboxError: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      error: new Error('The mail workspace RPC returned HTTP 403.')
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(/mailbox unavailable/i)).toBeInTheDocument()
    await expect(await canvas.findAllByText(/the mail workspace rpc returned http 403/i)).toHaveLength(2)
  }
}

export const MailboxSearchFiltered: Story = {
  args: {
    routeSearch: { mailQuery: 'welcome' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenSearchFilteredView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /welcome aboard/i })).toBeInTheDocument()
    await expect(await canvas.findByPlaceholderText(/type to search/i)).toHaveValue('welcome')
  }
}

export const MailboxSearchEmpty: Story = {
  args: {
    routeSearch: { mailQuery: 'missing provider invoice', unreadOnly: true }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenSearchEmptyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(/no matching messages/i)).toBeInTheDocument()
    await expect(
      await canvas.findByText(/try another search or turn off the unread filter/i)
    ).toBeInTheDocument()
  }
}

export const MailboxUnreadOnly: Story = {
  args: {
    routeSearch: { unreadOnly: true }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenUnreadOnlyView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('switch', { name: /show unread messages only/i })).toBeChecked()
    await expect(await canvas.findByRole('heading', { name: /appointment alert/i })).toBeInTheDocument()
  }
}

export const MailboxPagination: Story = {
  args: {
    routeSearch: {
      cursor: 'middle-page-cursor',
      direction: 'next'
    }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenPaginatedView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('4 shown')).toBeInTheDocument()
    await expect(await canvas.findByText(/235 messages/i)).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /previous page/i })).toBeEnabled()
    await expect(await canvas.findByRole('button', { name: /next page/i })).toBeEnabled()
  }
}

export const MailboxPaginationLoading: Story = {
  args: {
    routeSearch: {
      cursor: 'middle-page-cursor',
      direction: 'next'
    }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      pending: true,
      view: mailWorkspaceScreenPaginatedView
    })
}

export const MessageAppointment: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) => renderMailWorkspaceStory(args)
}

export const MessageWelcome: Story = {
  args: {
    routeSearch: { messageId: 'welcome-email' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenSearchFilteredView
    })
}

export const MessageStarred: Story = {
  args: {
    routeSearch: { messageId: 'welcome-email' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenSearchFilteredView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /welcome aboard/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^unstar$/i })).toBeInTheDocument()
  }
}

export const MessageUnread: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /appointment alert/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^mark as read$/i })).toBeInTheDocument()
  }
}

export const MessageError: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      error: new Error('Message data could not be loaded.')
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(/message unavailable/i)).toBeInTheDocument()
  }
}

export const MessageAttachments: Story = {
  args: {
    routeSearch: { messageId: 'attachment-message' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenAttachmentView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const manifestLink = await canvas.findByRole('link', { name: /manifest\.json/i })

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
  args: {
    routeSearch: { messageId: 'inline-attachment-message' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenInlineAttachmentView
    }),
  play: async ({ canvasElement }) => {
    const iframeSource = await findEmailFrameSource(
      canvasElement,
      /inline attachment rendering email body/i,
      'inline attachment email body'
    )

    await expect(iframeSource).toContain(
      '/rpc/mail/accounts/agent-support/mailboxes/inbox/messages/attachment-message/attachments/inline-provider-logo'
    )
    await expect(iframeSource).toContain('Inline image unavailable')
    await expect(iframeSource).not.toContain('cid:provider-logo')
    await expect(iframeSource).not.toContain('wildduck.example.test')
  }
}

export const ConversationThread: Story = {
  args: {
    routeSearch: { messageId: 'conversation-thread' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenConversationView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /agent mail smoke/i })).toBeInTheDocument()
    await expect(
      await canvas.findByText(/drafting reply from the selected wildduck drafts/i)
    ).toBeInTheDocument()
  }
}

export const DraftEditing: Story = {
  args: {
    routeSearch: {
      folderId: mailWorkspaceScreenFolderIds.drafts,
      messageId: 'draft-reply'
    }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenDraftView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^edit draft$/i }))
    await expect(await body.findByLabelText(/^subject$/i)).toHaveValue(
      'Re: Deployment checklist and routing review'
    )
  }
}

export const DraftToolbarActions: Story = {
  args: {
    routeSearch: {
      folderId: mailWorkspaceScreenFolderIds.drafts,
      messageId: 'draft-reply'
    }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenDraftView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^send draft$/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^edit draft$/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^discard draft$/i })).toBeInTheDocument()
  }
}

export const MailboxJunk: Story = {
  args: {
    routeSearch: { folderId: mailWorkspaceScreenFolderIds.junk }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenJunkView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /junk/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^not spam$/i })).toBeInTheDocument()
  }
}

export const MailboxSent: Story = {
  args: {
    routeSearch: { folderId: mailWorkspaceScreenFolderIds.sent }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenSentView
    })
}

export const MailboxTrash: Story = {
  args: {
    routeSearch: { folderId: mailWorkspaceScreenFolderIds.trash }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenTrashView
    })
}

export const MailboxFolderNavigation: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      viewResolver: mailWorkspaceViewForQuery
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /sent/i }))
    await expect(
      await canvas.findByRole('heading', { name: /deployment checklist and routing review/i })
    ).toBeInTheDocument()
  }
}

export const MailboxCustomFolder: Story = {
  args: {
    routeSearch: { folderId: mailWorkspaceScreenFolderIds.archive }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenCustomFolderView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^archive\s+42$/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('heading', { name: /archived routing review/i })).toBeInTheDocument()
  }
}

export const MailboxCreateFolder: Story = {
  args: {
    routeSearch: { folderId: mailWorkspaceScreenFolderIds.archive }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenCustomFolderView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^create folder$/i }))
    await expect(await body.findByRole('dialog', { name: /^create folder$/i })).toBeInTheDocument()
  }
}

export const MailboxFolderActions: Story = {
  args: {
    routeSearch: { folderId: mailWorkspaceScreenFolderIds.archive }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenCustomFolderView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^archive folder actions$/i }))
    await userEvent.click(await body.findByRole('menuitem', { name: /^rename folder$/i }))
    await expect(await body.findByRole('dialog', { name: /^rename archive$/i })).toBeInTheDocument()
  }
}

export const MailboxRenameFolderOpen: Story = MailboxFolderActions

export const MailboxDeleteFolderConfirm: Story = {
  args: {
    routeSearch: { folderId: mailWorkspaceScreenFolderIds.archive }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenCustomFolderView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^archive folder actions$/i }))
    await userEvent.click(await body.findByRole('menuitem', { name: /^delete folder$/i }))
    await expect(await body.findByRole('alertdialog')).toHaveTextContent(/delete archive/i)
  }
}

export const MailboxAccountSwitching: Story = {
  args: {
    routeSearch: { accountId: 'agent-billing' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      viewResolver: mailWorkspaceViewForQuery
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('heading', { name: /billing account handoff/i })).toBeInTheDocument()
  }
}

export const MailboxAccountPermissions: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenAccountPermissionsView
    }),
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByRole('menuitem', { name: /finance agent/i })).toHaveAttribute(
      'data-disabled'
    )
  }
}

export const MessageToolbarControllerActions: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^reply$/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^reply all$/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^forward$/i })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^move to folder$/i })).toBeInTheDocument()
  }
}

export const MessageArchiveAction: Story = {
  args: {
    routeSearch: { messageId: 'blocked-images' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenBlockedImagesView
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^archive$/i })).toBeInTheDocument()
  }
}

export const MessageMarkNotSpam: Story = MailboxJunk

export const MessageMoveToSpam: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^move to folder$/i }))
    await expect(await body.findByRole('dialog', { name: /^move message$/i })).toBeInTheDocument()
  }
}

export const MessageMoveTargetSelection: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^move to folder$/i }))
    await userEvent.click(await body.findByRole('combobox'))
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(await body.findByRole('dialog', { name: /^move message$/i })).toBeInTheDocument()
  }
}

export const MessageMoveDisabledTarget: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^move to folder$/i }))
    await expect(await body.findByRole('button', { name: /^move$/i })).toBeDisabled()
  }
}

export const MessageDeleteConfirm: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^delete$/i }))
    await expect(await body.findByRole('alertdialog')).toHaveTextContent(/delete this message/i)
  }
}

export const ComposeSelectedAccount: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^compose$/i }))
    await expect(await body.findByLabelText(/^from$/i)).toHaveValue('Support Agent <support@agentteam.test>')
  }
}

export const ComposeReplyAll: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^reply all$/i }))
    await expect(await body.findByRole('dialog')).toHaveTextContent(/reply all/i)
    await expect(await body.findByLabelText(/^subject$/i)).toHaveValue('Re: Appointment alert')
  }
}

export const ComposeForward: Story = {
  args: {
    routeSearch: { messageId: 'appointment-alert' }
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await canvas.findByRole('button', { name: /^forward$/i }))
    await expect(await body.findByRole('dialog')).toHaveTextContent(/forward message/i)
    await expect(await body.findByLabelText(/^subject$/i)).toHaveValue('Fwd: Appointment alert')
  }
}

export const SecurityRemoteContentBlocked: Story = {
  args: {
    routeSearch: { messageId: 'blocked-images' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenBlockedImagesView
    }),
  play: async ({ canvasElement }) => {
    const iframeSource = await findEmailFrameSource(
      canvasElement,
      /deployment checklist and routing review email body/i,
      'email body'
    )

    await expect(iframeSource).toContain('Remote image blocked')
    await expect(iframeSource).not.toContain('assets.provider.example/launch-banner.png')
  }
}

export const SecurityRemoteContentInteraction: Story = {
  args: {
    routeSearch: { messageId: 'blocked-images' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenBlockedImagesView
    }),
  play: async ({ canvasElement }) => {
    const iframeSource = await findEmailFrameSource(
      canvasElement,
      /deployment checklist and routing review email body/i,
      'email body'
    )

    await expect(iframeSource).toContain('the provider portal')
    await expect(iframeSource).toContain('data-agent-mail-external-link-id')
    await expect(iframeSource).not.toContain('href="https://dash.cloudflare.com')
  }
}

export const SecurityRemoteBackgroundImagesBlocked: Story = {
  args: {
    routeSearch: { messageId: 'remote-background-images-message' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenRemoteBackgroundView
    }),
  play: async ({ canvasElement }) => {
    const iframeSource = await findEmailFrameSource(
      canvasElement,
      /background image tracking email body/i,
      'background image email body'
    )

    await expect(iframeSource).toContain('Background image content')
    await expect(iframeSource).not.toContain('assets.provider.example')
    await expect(iframeSource).not.toContain('background-image')
  }
}

export const SecurityDocumentResourceTagsBlocked: Story = {
  args: {
    routeSearch: { messageId: 'document-resource-message' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenDocumentResourceView
    }),
  play: async ({ canvasElement }) => {
    const iframeSource = await findEmailFrameSource(
      canvasElement,
      /document resource controls email body/i,
      'document resource email body'
    )

    await expect(iframeSource).toContain('Document resource content')
    await expect(iframeSource).not.toContain('wildduck.example.test')
    await expect(iframeSource).not.toContain('<base')
    await expect(iframeSource).not.toContain('<link')
    await expect(iframeSource).not.toContain('<script')
    await expect(iframeSource).not.toContain('<iframe')
    await expect(iframeSource).not.toContain('<object')
    await expect(iframeSource).not.toContain('<embed')
  }
}

export const SecurityMailtoLinkInteraction: Story = {
  args: {
    routeSearch: { messageId: 'mailto-link-message' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenMailtoView
    }),
  play: async ({ canvasElement }) => {
    const iframeSource = await findEmailFrameSource(
      canvasElement,
      /contact support by email email body/i,
      'mailto email body'
    )

    await expect(iframeSource).toContain('Email support')
    await expect(iframeSource).toContain('data-agent-mail-external-link-id')
    await expect(iframeSource).not.toContain('href="mailto:support@example.test')
  }
}

export const SecurityExternalLinkGenerated: Story = {
  args: {
    routeSearch: { messageId: 'external-link-message' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenExternalLinkView
    }),
  play: async ({ canvasElement }) => {
    const iframeSource = await findEmailFrameSource(
      canvasElement,
      /external link handling email body/i,
      'external link email body'
    )

    await expect(iframeSource).toContain('Generated docs link')
    await expect(iframeSource).toContain('data-agent-mail-external-link-id')
    await expect(iframeSource).not.toContain('href="https://docs.example.test')
  }
}

export const SecurityFormContentRemoved: Story = {
  args: {
    routeSearch: { messageId: 'form-message' }
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenFormView
    }),
  play: async ({ canvasElement }) => {
    const iframeSource = await findEmailFrameSource(
      canvasElement,
      /form in email body email body/i,
      'form email body'
    )

    await expect(iframeSource).not.toContain('<form')
    await expect(iframeSource).not.toContain('<input')
    await expect(iframeSource).not.toContain('<button')
    await expect(iframeSource).not.toContain('phish.example.test')
  }
}

export const WorkspaceSwitcherDefault: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      viewResolver: mailWorkspaceViewForQuery
    }),
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByRole('menuitem', { name: /support agent/i })).toBeInTheDocument()
    await expect(await body.findByRole('menuitem', { name: /billing agent/i })).toBeInTheDocument()
  }
}

export const WorkspaceSwitcherLongMailboxList: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenLongMailboxListView
    }),
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByRole('menuitem', { name: /abuse review/i })).toBeInTheDocument()
    await expect(await body.findByRole('menuitem', { name: /notifications/i })).toHaveAttribute(
      'data-disabled'
    )
  }
}

export const WorkspaceSwitcherEmpty: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) =>
    renderMailWorkspaceStory(args, {
      view: mailWorkspaceScreenNoAccountsView
    }),
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByText('No mailboxes')).toBeInTheDocument()
  }
}

export const WorkspaceSwitcherSingleWorkspace: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const body = await openWorkspaceMailboxSwitcher(canvasElement)

    await expect(await body.findByText('Current workspace')).toBeInTheDocument()
    await expect(await body.findByRole('menuitem', { name: /support agent/i })).toBeInTheDocument()
    await expect(body.queryByText(/^Workspaces$/i)).not.toBeInTheDocument()
  }
}

export const AccountMenu: Story = {
  args: {
    routeSearch: {}
  },
  render: (args) => renderMailWorkspaceStory(args),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await userEvent.click(await body.findByRole('button', { name: /^account$/i }))
    await expect(await body.findByRole('menuitem', { name: /^settings$/i })).toBeInTheDocument()
  }
}

async function openWorkspaceMailboxSwitcher(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)

  await userEvent.click(await canvas.findByRole('button', { name: /open workspace and mailbox switcher/i }))

  return within(canvasElement.ownerDocument.body)
}

async function findEmailFrameSource(
  canvasElement: HTMLElement,
  title: RegExp,
  description: string
): Promise<string> {
  const iframeElement = await within(canvasElement).findByTitle(title)

  if (!(iframeElement instanceof globalThis.HTMLIFrameElement)) {
    throw new TypeError(`Expected ${description} to render in an iframe`)
  }

  await waitFor(
    () => {
      if (!iframeElement.srcdoc) {
        throw new Error(`Expected ${description} iframe source to be available`)
      }
    },
    { timeout: 5_000 }
  )

  if (!iframeElement.srcdoc) {
    throw new Error(`Expected ${description} iframe source to be available`)
  }

  return iframeElement.srcdoc
}

function renderMailWorkspaceStory(
  args: DashboardMailControllerArgs,
  options: {
    error?: Error
    pending?: boolean
    view?: AgentMailWebWorkspace
    viewResolver?: (query: MailWorkspaceQuery) => AgentMailWebWorkspace
  } = {}
) {
  return (
    <MailWorkspaceControllerStoryFrame
      {...args}
      mailboxAdminNavigationLoader={createStoryMailboxAdminNavigationLoader(storyMailboxAdminNavigation)}
      mailWorkspaceLoader={createStoryMailWorkspaceLoader({
        error: options.error,
        pending: options.pending,
        view: options.view ?? mailWorkspaceScreenReadyView,
        viewResolver: options.viewResolver
      })}
    />
  )
}

function createStoryMailWorkspaceLoader({
  error,
  pending,
  view,
  viewResolver
}: {
  error?: Error
  pending?: boolean
  view: AgentMailWebWorkspace
  viewResolver?: (query: MailWorkspaceQuery) => AgentMailWebWorkspace
}) {
  return async (query: MailWorkspaceQuery) => {
    if (pending) {
      await new Promise(() => {})
    }

    if (error) {
      throw error
    }

    return mailWorkspaceForQuery(viewResolver?.(query) ?? view, query)
  }
}

function createStoryMailboxAdminNavigationLoader(navigation: AgentMailAdminNavigation) {
  return async () => navigation
}

function mailWorkspaceViewForQuery(query: MailWorkspaceQuery) {
  if (query.accountId === 'agent-billing') {
    return mailWorkspaceScreenBillingAccountView
  }

  if (query.query?.trim() === 'welcome') {
    return mailWorkspaceScreenSearchFilteredView
  }

  if (query.query?.trim()) {
    return mailWorkspaceScreenSearchEmptyView
  }

  if (query.unreadOnly) {
    return mailWorkspaceScreenUnreadOnlyView
  }

  const folderView = query.folderId ? mailWorkspaceScreenViewsByFolderId[query.folderId] : undefined
  if (folderView) {
    return folderView
  }

  const messageView = query.messageId ? mailWorkspaceScreenViewsByMessageId[query.messageId] : undefined
  if (messageView) {
    return messageView
  }

  return mailWorkspaceScreenAccountSwitchingView
}

function mailWorkspaceForQuery(
  view: AgentMailWebWorkspace,
  query: MailWorkspaceQuery
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
