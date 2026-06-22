import * as React from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

import {
  createMailFolder,
  deleteMailFolder,
  deleteMailMessage,
  fetchMailWorkspace,
  moveMailMessage,
  saveMailDraft,
  sendMailDraft,
  sendMailMessage,
  updateMailMessage
} from '../lib/mail-rpc'
import {
  defaultAuthenticatedDashboardView,
  defaultAuthenticatedEmailToolbarActions,
  defaultAuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'
import { DashboardScreen } from './dashboard-screen'
import type {
  AgentMailComposeInput,
  AgentMailMessageActionInput,
  AgentMailWebFolder,
  AgentMailWebMessageDetail,
  AgentMailWebMessageSummary,
  AgentMailWebThreadMessage,
  AgentMailWebWorkspace
} from '@main/backend'
import type {
  AuthenticatedComposeField,
  AuthenticatedComposeMode,
  AuthenticatedComposeView,
  AuthenticatedDashboardView,
  AuthenticatedEmailAction,
  AuthenticatedEmailPreview,
  AuthenticatedEmailToolbarAction,
  AuthenticatedMailActionDialogKind,
  AuthenticatedMailActionView,
  AuthenticatedMailFolderAction,
  AuthenticatedMailItem,
  AuthenticatedMailNavIconKey,
  AuthenticatedMailPageChange,
  AuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'
import type { DashboardSearch } from '../routes/_authenticated/dashboard'
import type { DashboardScreenProps } from './dashboard-screen'

const MAIL_QUERY_LIMIT = 25

function mailWorkspaceQueryOptions(routeSearch: DashboardSearch | undefined) {
  return queryOptions({
    queryFn: () =>
      fetchMailWorkspace({
        accountId: routeSearch?.accountId,
        cursor: routeSearch?.cursor,
        direction: routeSearch?.direction,
        folderId: routeSearch?.folderId,
        limit: MAIL_QUERY_LIMIT,
        messageId: routeSearch?.messageId,
        query: routeSearch?.mailQuery,
        unreadOnly: routeSearch?.unreadOnly
      }),
    queryKey: ['mail', 'workspace', routeSearch] as const
  })
}

function runAsync(promise: Promise<unknown>) {
  promise.catch(ignoreAsyncError)
}

function ignoreAsyncError() {}

function cleanDashboardSearch(search: DashboardSearch): DashboardSearch {
  return {
    accountId: cleanSearchValue(search.accountId),
    cloudflareIntentId: cleanSearchValue(search.cloudflareIntentId),
    cloudflareOAuthError: cleanSearchValue(search.cloudflareOAuthError),
    cursor: cleanSearchValue(search.cursor),
    direction: search.direction,
    folderId: cleanSearchValue(search.folderId),
    mailQuery: cleanSearchValue(search.mailQuery),
    messageId: cleanSearchValue(search.messageId),
    settings: search.settings,
    unreadOnly: search.unreadOnly === true ? true : undefined
  }
}

function cleanSearchValue(value: string | undefined) {
  return value === undefined || value === '' ? undefined : value
}

interface ComposeState {
  bcc: string
  body: string
  cc: string
  draftId?: string
  draftMailboxId?: string
  errorMessage?: string
  fromAddress?: string
  fromLabel?: string
  mode: AuthenticatedComposeMode
  reference?: AgentMailComposeInput['reference']
  state: 'closed' | 'open'
  subject: string
  title: string
  to: string
}

interface DashboardMailControllerProps extends Pick<
  DashboardScreenProps,
  | 'authClient'
  | 'cliAccessState'
  | 'defaultSettingsOpen'
  | 'defaultSettingsSection'
  | 'domainSettingsState'
  | 'publicEnv'
  | 'routeState'
  | 'sessionCleanupEnabled'
  | 'settingsContentState'
  | 'settingsOpen'
  | 'settingsSection'
> {
  routeSearch?: DashboardSearch
}

export function DashboardMailController({ routeSearch, ...screenProps }: DashboardMailControllerProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [composeState, setComposeState] = React.useState<ComposeState>(() => closedComposeState())
  const [moveDialog, setMoveDialog] = React.useState<{
    actionInput?: AgentMailMessageActionInput
    errorMessage?: string
    isSubmitting?: boolean
    selectedFolderId?: string
    state: 'closed' | 'open'
  }>({ state: 'closed' })
  const [deleteDialog, setDeleteDialog] = React.useState<{
    actionInput?: AgentMailMessageActionInput
    errorMessage?: string
    isSubmitting?: boolean
    isDraft?: boolean
    state: 'closed' | 'open'
  }>({ state: 'closed' })
  const [originalSourceDialog, setOriginalSourceDialog] = React.useState<{
    errorMessage?: string
    isLoading?: boolean
    source?: string
    state: 'closed' | 'open'
  }>({ state: 'closed' })
  const [folderCreate, setFolderCreate] = React.useState<{
    errorMessage?: string
    isSubmitting?: boolean
    name: string
    state: 'closed' | 'open'
  }>({ name: '', state: 'closed' })
  const [folderDelete, setFolderDelete] = React.useState<{
    errorMessage?: string
    folderId?: string
    isSubmitting?: boolean
    state: 'closed' | 'open'
    title?: string
  }>({ state: 'closed' })

  const workspaceQueryOptions = React.useMemo(() => mailWorkspaceQueryOptions(routeSearch), [routeSearch])
  const workspaceQuery = useQuery(workspaceQueryOptions)
  const workspace = workspaceQuery.data
  const selectedMessage = workspace?.selectedMessage ?? null
  const selectedMessageActionInput = React.useMemo(
    () =>
      selectedMessage && workspace?.activeAccountId
        ? {
            accountId: workspace.activeAccountId,
            mailboxId: selectedMessage.mailboxId,
            messageId: selectedMessage.id
          }
        : null,
    [selectedMessage, workspace?.activeAccountId]
  )

  const invalidateMail = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: workspaceQueryOptions.queryKey })
  }, [queryClient, workspaceQueryOptions])

  const { mutateAsync: updateMessage } = useMutation({
    mutationFn: updateMailMessage,
    onSuccess: invalidateMail
  })
  const { mutateAsync: moveMessage } = useMutation({
    mutationFn: moveMailMessage,
    onSuccess: invalidateMail
  })
  const { mutateAsync: deleteMessage } = useMutation({
    mutationFn: deleteMailMessage,
    onSuccess: invalidateMail
  })
  const { isPending: isSendingMessage, mutateAsync: sendMessage } = useMutation({
    mutationFn: sendMailMessage,
    onSuccess: invalidateMail
  })
  const { isPending: isSavingDraft, mutateAsync: saveDraft } = useMutation({
    mutationFn: saveMailDraft,
    onSuccess: invalidateMail
  })
  const { isPending: isSendingDraft, mutateAsync: sendDraft } = useMutation({
    mutationFn: sendMailDraft,
    onSuccess: invalidateMail
  })
  const { mutateAsync: createFolder } = useMutation({
    mutationFn: createMailFolder,
    onSuccess: invalidateMail
  })
  const { mutateAsync: deleteFolder } = useMutation({
    mutationFn: deleteMailFolder,
    onSuccess: invalidateMail
  })

  const sidebarView = React.useMemo(
    () =>
      toSidebarView(
        workspace,
        workspaceQuery.status,
        workspaceQuery.error,
        folderCreate,
        folderDelete,
        routeSearch
      ),
    [folderCreate, folderDelete, routeSearch, workspace, workspaceQuery.error, workspaceQuery.status]
  )
  const selectedPreview = React.useMemo(
    () =>
      workspace?.selectedMessage ? toEmailPreview(workspace.selectedMessage, workspace.folders) : undefined,
    [workspace?.folders, workspace?.selectedMessage]
  )
  const emailPreviewsById = React.useMemo(
    () => (selectedPreview ? { [selectedPreview.id]: selectedPreview } : {}),
    [selectedPreview]
  )
  const dashboardView = React.useMemo(
    () => toDashboardView(workspaceQuery.status, workspaceQuery.error, selectedPreview),
    [selectedPreview, workspaceQuery.error, workspaceQuery.status]
  )
  const mailActionView = React.useMemo(
    () =>
      toMailActionView({
        deleteDialog,
        folders: workspace?.folders ?? [],
        moveDialog,
        originalSourceDialog,
        selectedMessage
      }),
    [deleteDialog, moveDialog, originalSourceDialog, selectedMessage, workspace?.folders]
  )
  const composeView = React.useMemo(
    () =>
      toComposeView(composeState, {
        isSavingDraft,
        isSending: isSendingDraft || isSendingMessage
      }),
    [composeState, isSavingDraft, isSendingDraft, isSendingMessage]
  )

  const navigateMail = React.useCallback(
    (patch: Partial<DashboardSearch>) => {
      const nextSearch: DashboardSearch = {
        ...routeSearch,
        ...patch
      }

      router
        .navigate({
          search: cleanDashboardSearch(nextSearch),
          to: '/dashboard/'
        })
        .catch(ignoreAsyncError)
    },
    [routeSearch, router]
  )

  const handleComposeOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        setComposeState(closedComposeState())
        return
      }
      const account = workspace?.accounts.find((candidate) => candidate.id === workspace.activeAccountId)
      setComposeState({
        ...closedComposeState(),
        fromAddress: account?.address,
        fromLabel: account?.name,
        state: 'open'
      })
    },
    [workspace?.accounts, workspace?.activeAccountId]
  )
  const handleComposeFieldChange = React.useCallback((field: AuthenticatedComposeField, value: string) => {
    setComposeState((current) => ({
      ...current,
      [field === 'body' ? 'body' : field]: value,
      errorMessage: undefined
    }))
  }, [])
  const handleComposeSaveDraft = React.useCallback(async () => {
    if (!workspace?.activeAccountId) {
      setComposeState((current) => ({ ...current, errorMessage: 'Select a mailbox before saving.' }))
      return
    }
    try {
      const result = await saveDraft(composePayload(workspace.activeAccountId, composeState))
      setComposeState((current) => ({
        ...current,
        draftId: result.draftId,
        draftMailboxId: result.mailboxId,
        errorMessage: undefined
      }))
    } catch (error) {
      setComposeState((current) => ({
        ...current,
        errorMessage: errorMessage(error, 'Draft could not be saved.')
      }))
    }
  }, [composeState, saveDraft, workspace?.activeAccountId])
  const handleComposeSubmit = React.useCallback(async () => {
    if (!workspace?.activeAccountId) {
      setComposeState((current) => ({ ...current, errorMessage: 'Select a mailbox before sending.' }))
      return
    }
    try {
      if (composeState.draftId && composeState.draftMailboxId) {
        const draft = await saveDraft(composePayload(workspace.activeAccountId, composeState))
        await sendDraft({
          accountId: workspace.activeAccountId,
          mailboxId: draft.mailboxId,
          messageId: draft.draftId
        })
      } else {
        await sendMessage(composePayload(workspace.activeAccountId, composeState))
      }
      setComposeState(closedComposeState())
    } catch (error) {
      setComposeState((current) => ({
        ...current,
        errorMessage: errorMessage(error, 'Message could not be sent.')
      }))
    }
  }, [composeState, saveDraft, sendDraft, sendMessage, workspace?.activeAccountId])
  const handleComposeDiscardDraft = React.useCallback(async () => {
    if (workspace?.activeAccountId && composeState.draftId && composeState.draftMailboxId) {
      await deleteMessage({
        accountId: workspace.activeAccountId,
        mailboxId: composeState.draftMailboxId,
        messageId: composeState.draftId
      })
    }
    setComposeState(closedComposeState())
  }, [composeState.draftId, composeState.draftMailboxId, deleteMessage, workspace?.activeAccountId])

  const handleEmailAction = React.useCallback(
    (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => {
      if (
        action === 'show-remote-images' ||
        action === 'collapse-thread-message' ||
        action === 'expand-thread-message'
      ) {
        return
      }

      const targetMessage = findActionMessage(selectedMessage, email)
      const actionInput =
        targetMessage && workspace?.activeAccountId
          ? {
              accountId: workspace.activeAccountId,
              mailboxId: targetMessage.mailboxId,
              messageId: targetMessage.id
            }
          : null

      if (!actionInput || !targetMessage) {
        return
      }

      switch (action) {
        case 'reply':
        case 'reply-all':
        case 'forward':
          setComposeState(composeFromMessage(action, targetMessage, workspace?.activeAccountId))
          break
        case 'star':
        case 'unstar':
          runAsync(
            updateMessage({
              ...actionInput,
              flagged: action === 'star'
            })
          )
          break
        case 'mark-read':
        case 'mark-unread':
          runAsync(
            updateMessage({
              ...actionInput,
              seen: action === 'mark-read'
            })
          )
          break
        case 'mark-spam':
        case 'mark-not-spam': {
          const targetMailbox = findFolderBySpecialUse(
            workspace?.folders ?? [],
            action === 'mark-spam' ? '\\Junk' : '\\Inbox'
          )
          if (targetMailbox) {
            runAsync(
              moveMessage({
                ...actionInput,
                targetMailboxId: targetMailbox.id
              })
            )
          }
          break
        }
        case 'move':
          setMoveDialog({
            actionInput,
            selectedFolderId: targetMessage.mailboxId,
            state: 'open'
          })
          break
        case 'delete':
        case 'discard-draft':
          setDeleteDialog({ actionInput, isDraft: targetMessage.isDraft, state: 'open' })
          break
        case 'edit-draft':
          setComposeState(composeFromDraft(targetMessage, workspace?.activeAccountId))
          break
        case 'send-draft':
          runAsync(sendDraft(actionInput))
          break
        case 'view-original':
          setOriginalSourceDialog({ isLoading: true, state: 'open' })
          runAsync(
            fetch(targetMessage.sourceUrl)
              .then((response) => {
                if (!response.ok) {
                  throw new Error(`Source request failed with HTTP ${response.status}`)
                }
                return response.text()
              })
              .then((source) => {
                setOriginalSourceDialog({ source, state: 'open' })
              })
              .catch((error: unknown) => {
                setOriginalSourceDialog({
                  errorMessage: errorMessage(error, 'Original source could not be loaded.'),
                  state: 'open'
                })
              })
          )
          break
        case 'back':
        case 'close':
          navigateMail({ messageId: undefined })
          break
        case 'archive':
        case 'restore':
        case 'snooze':
          break
      }
    },
    [
      moveMessage,
      navigateMail,
      selectedMessage,
      sendDraft,
      updateMessage,
      workspace?.activeAccountId,
      workspace?.folders
    ]
  )

  const handleMailDeleteConfirm = React.useCallback(async () => {
    const actionInput = deleteDialog.actionInput ?? selectedMessageActionInput
    if (!actionInput) {
      return
    }
    setDeleteDialog((current) => ({ ...current, isSubmitting: true }))
    try {
      await deleteMessage(actionInput)
      setDeleteDialog({ state: 'closed' })
      if (actionInput.messageId === selectedMessage?.id) {
        navigateMail({ messageId: undefined })
      }
    } catch (error) {
      setDeleteDialog({
        actionInput,
        errorMessage: errorMessage(error, 'Message could not be deleted.'),
        isDraft: deleteDialog.isDraft,
        state: 'open'
      })
    }
  }, [
    deleteDialog.actionInput,
    deleteDialog.isDraft,
    deleteMessage,
    navigateMail,
    selectedMessage?.id,
    selectedMessageActionInput
  ])

  const handleMailMoveSubmit = React.useCallback(async () => {
    const actionInput = moveDialog.actionInput ?? selectedMessageActionInput
    if (!actionInput || !moveDialog.selectedFolderId) {
      return
    }
    setMoveDialog((current) => ({ ...current, isSubmitting: true }))
    try {
      await moveMessage({
        ...actionInput,
        targetMailboxId: moveDialog.selectedFolderId
      })
      setMoveDialog({ state: 'closed' })
    } catch (error) {
      setMoveDialog({
        actionInput,
        errorMessage: errorMessage(error, 'Message could not be moved.'),
        selectedFolderId: moveDialog.selectedFolderId,
        state: 'open'
      })
    }
  }, [moveDialog.actionInput, moveDialog.selectedFolderId, moveMessage, selectedMessageActionInput])

  const handleMailboxFolderCreateSubmit = React.useCallback(async () => {
    if (!workspace?.activeAccountId) {
      return
    }
    setFolderCreate((current) => ({ ...current, isSubmitting: true }))
    try {
      await createFolder({
        accountId: workspace.activeAccountId,
        name: folderCreate.name
      })
      setFolderCreate({ name: '', state: 'closed' })
    } catch (error) {
      setFolderCreate((current) => ({
        ...current,
        errorMessage: errorMessage(error, 'Folder could not be created.'),
        isSubmitting: false,
        state: 'open'
      }))
    }
  }, [createFolder, folderCreate.name, workspace?.activeAccountId])

  const handleMailboxFolderDeleteConfirm = React.useCallback(async () => {
    if (!workspace?.activeAccountId || !folderDelete.folderId) {
      return
    }
    setFolderDelete((current) => ({ ...current, isSubmitting: true }))
    try {
      await deleteFolder({
        accountId: workspace.activeAccountId,
        mailboxId: folderDelete.folderId
      })
      setFolderDelete({ state: 'closed' })
      if (routeSearch?.folderId === folderDelete.folderId) {
        navigateMail({ folderId: undefined, messageId: undefined })
      }
    } catch (error) {
      setFolderDelete((current) => ({
        ...current,
        errorMessage: errorMessage(error, 'Folder could not be deleted.'),
        isSubmitting: false,
        state: 'open'
      }))
    }
  }, [deleteFolder, folderDelete.folderId, navigateMail, routeSearch?.folderId, workspace?.activeAccountId])

  return (
    <DashboardScreen
      {...screenProps}
      composeView={composeView}
      dashboardView={dashboardView}
      emailPreviewsById={emailPreviewsById}
      mailActionView={mailActionView}
      onComposeDiscardDraft={() => {
        runAsync(handleComposeDiscardDraft())
      }}
      onComposeFieldChange={handleComposeFieldChange}
      onComposeOpenChange={handleComposeOpenChange}
      onComposeSaveDraft={() => {
        runAsync(handleComposeSaveDraft())
      }}
      onComposeSubmit={() => {
        runAsync(handleComposeSubmit())
      }}
      onEmailAction={handleEmailAction}
      onMailActionDialogOpenChange={(dialog, open) => {
        handleDialogOpenChange(dialog, open, setMoveDialog, setDeleteDialog, setOriginalSourceDialog)
      }}
      onMailDeleteConfirm={() => {
        runAsync(handleMailDeleteConfirm())
      }}
      onMailMoveSubmit={() => {
        runAsync(handleMailMoveSubmit())
      }}
      onMailMoveTargetChange={(folderId) => {
        setMoveDialog((current) => ({ ...current, selectedFolderId: folderId }))
      }}
      onMailOriginalSourceDownload={() => {
        downloadOriginalSource(selectedMessage, originalSourceDialog.source)
      }}
      onMailboxAccountSelect={(accountId) => {
        navigateMail({
          accountId,
          cursor: undefined,
          direction: undefined,
          folderId: undefined,
          messageId: undefined
        })
      }}
      onMailboxFolderAction={(action, folder) => {
        if (action === 'delete-folder') {
          setFolderDelete({
            folderId: folder.id,
            state: 'open',
            title: `Delete ${folder.title}?`
          })
        }
      }}
      onMailboxFolderCreateNameChange={(name) => {
        setFolderCreate((current) => ({ ...current, errorMessage: undefined, name }))
      }}
      onMailboxFolderCreateOpenChange={(open) => {
        setFolderCreate((current) => ({
          ...current,
          errorMessage: undefined,
          state: open ? 'open' : 'closed'
        }))
      }}
      onMailboxFolderCreateSubmit={() => {
        runAsync(handleMailboxFolderCreateSubmit())
      }}
      onMailboxFolderDeleteConfirm={() => {
        runAsync(handleMailboxFolderDeleteConfirm())
      }}
      onMailboxFolderDeleteOpenChange={(open) => {
        setFolderDelete((current) => ({
          ...current,
          errorMessage: undefined,
          state: open ? 'open' : 'closed'
        }))
      }}
      onMailboxFolderSelect={(folderId) => {
        navigateMail({
          cursor: undefined,
          direction: undefined,
          folderId,
          messageId: undefined
        })
      }}
      onMailboxMessageAction={(action, mail) => {
        if (mail.id !== selectedMessage?.id) {
          navigateMail({ messageId: mail.id })
          return
        }
        if (selectedPreview) {
          handleEmailAction(action, selectedPreview)
        }
      }}
      onMailboxMessageSelect={(mailId) => {
        navigateMail({ messageId: mailId })
      }}
      onMailboxPageChange={(pageChange: AuthenticatedMailPageChange) => {
        navigateMail({
          cursor: pageChange.cursor ?? undefined,
          direction: pageChange.direction
        })
      }}
      onMailboxRefresh={() => {
        runAsync(workspaceQuery.refetch())
      }}
      onMailboxRetry={() => {
        runAsync(workspaceQuery.refetch())
      }}
      onMailboxSearchChange={(mailQuery) => {
        navigateMail({
          cursor: undefined,
          direction: undefined,
          mailQuery,
          messageId: undefined
        })
      }}
      onMailboxUnreadOnlyChange={(unreadOnly) => {
        navigateMail({
          cursor: undefined,
          direction: undefined,
          messageId: undefined,
          unreadOnly
        })
      }}
      onMessageRetry={() => {
        runAsync(workspaceQuery.refetch())
      }}
      routeSearch={routeSearch}
      sidebarView={sidebarView}
    />
  )
}

function toSidebarView(
  workspace: AgentMailWebWorkspace | undefined,
  status: 'error' | 'pending' | 'success',
  error: Error | null,
  folderCreate: { errorMessage?: string; isSubmitting?: boolean; name: string; state: 'closed' | 'open' },
  folderDelete: {
    errorMessage?: string
    folderId?: string
    isSubmitting?: boolean
    state: 'closed' | 'open'
    title?: string
  },
  routeSearch: DashboardSearch | undefined
): AuthenticatedSidebarView {
  if (status === 'pending') {
    return {
      ...defaultAuthenticatedSidebarView,
      state: 'loading'
    }
  }

  if (status === 'error') {
    return {
      ...defaultAuthenticatedSidebarView,
      errorDescription: errorMessage(error, 'Mailbox data could not be loaded.'),
      errorTitle: 'Mailbox unavailable',
      retryLabel: 'Retry',
      state: 'error'
    }
  }

  const activeFolderId = workspace?.activeFolderId ?? defaultAuthenticatedSidebarView.activeItemId
  const folders = workspace?.folders ?? []
  const messages = workspace?.messages ?? []

  return {
    activeAccountId: workspace?.activeAccountId ?? undefined,
    activeItemId: activeFolderId,
    accounts: workspace?.accounts.map((account) => ({
      address: account.address,
      description: account.description,
      id: account.id,
      name: account.name,
      state: account.state
    })),
    emptyDescription: 'Messages matching this mailbox view will appear here.',
    emptyTitle: 'No messages',
    filterMode: 'server',
    folderCreate: {
      errorMessage: folderCreate.errorMessage,
      isSubmitting: folderCreate.isSubmitting,
      name: folderCreate.name,
      placeholder: 'Folder name',
      state: folderCreate.state,
      submitLabel: folderCreate.isSubmitting ? 'Creating folder' : 'Create folder',
      title: 'Create folder',
      triggerLabel: 'Create folder'
    },
    folderDelete: folderDelete.folderId
      ? {
          description: 'This deletes the selected WildDuck folder.',
          errorMessage: folderDelete.errorMessage,
          folderId: folderDelete.folderId,
          isSubmitting: folderDelete.isSubmitting,
          state: folderDelete.state,
          title: folderDelete.title ?? 'Delete folder?'
        }
      : undefined,
    mails: messages.map(toMailItem),
    navMain: folders.map(toNavItem),
    pagination: toPagination(workspace),
    refreshLabel: 'Refresh',
    retryLabel: 'Retry',
    searchQuery: routeSearch?.mailQuery ?? '',
    selectedMailId: workspace?.selectedMessage?.id,
    unreadOnly: routeSearch?.unreadOnly,
    state: messages.length ? 'ready' : 'empty'
  }
}

function toDashboardView(
  status: 'error' | 'pending' | 'success',
  error: Error | null,
  selectedEmail: AuthenticatedEmailPreview | undefined
): AuthenticatedDashboardView {
  if (status === 'pending') {
    return {
      ...defaultAuthenticatedDashboardView,
      state: 'loading'
    }
  }

  if (status === 'error') {
    return {
      ...defaultAuthenticatedDashboardView,
      errorDescription: errorMessage(error, 'Message data could not be loaded.'),
      errorTitle: 'Message unavailable',
      retryLabel: 'Retry',
      state: 'error'
    }
  }

  return {
    ...defaultAuthenticatedDashboardView,
    selectedEmail,
    state: selectedEmail ? 'ready' : 'empty'
  }
}

function toNavItem(folder: AgentMailWebFolder): AuthenticatedSidebarView['navMain'][number] {
  return {
    actions: folder.protected
      ? undefined
      : [
          {
            action: 'delete-folder',
            label: 'Delete folder'
          }
        ],
    badgeLabel: folder.unread ? String(folder.unread) : undefined,
    iconKey: folderIcon(folder),
    id: folder.id,
    title: folder.name,
    url: '#'
  }
}

function toMailItem(message: AgentMailWebMessageSummary): AuthenticatedMailItem {
  return {
    actions: actionsForMessage(message, []),
    attachmentCountLabel: message.attachmentCount ? String(message.attachmentCount) : undefined,
    date: formatMessageDate(message.receivedAt),
    email: message.from,
    folderId: message.mailboxId,
    id: message.id,
    isDraft: message.isDraft,
    isStarred: message.isStarred,
    isUnread: message.unread,
    name: displayName(message.from),
    subject: message.subject,
    teaser: message.teaser,
    threadId: message.threadId
  }
}

function toEmailPreview(
  message: AgentMailWebMessageDetail,
  folders: ReadonlyArray<AgentMailWebFolder>
): AuthenticatedEmailPreview {
  return {
    actions: actionsForMessage(message, folders),
    attachments: message.attachments.map(toEmailAttachment),
    folderId: message.mailboxId,
    html: message.html,
    id: message.id,
    isDraft: message.isDraft,
    isStarred: message.isStarred,
    isUnread: message.unread,
    receivedAt: formatMessageDate(message.receivedAt),
    recipientEmail: message.to.join(', '),
    senderEmail: emailAddress(message.from),
    senderName: displayName(message.from),
    subject: message.subject,
    thread: message.thread?.map((threadMessage) =>
      toEmailThreadMessage(
        threadMessage,
        folders,
        threadMessage.id === message.id && threadMessage.mailboxId === message.mailboxId
          ? 'expanded'
          : 'collapsed'
      )
    ),
    threadId: message.threadId
  }
}

function toEmailThreadMessage(
  message: AgentMailWebThreadMessage,
  folders: ReadonlyArray<AgentMailWebFolder>,
  state: 'collapsed' | 'expanded'
): NonNullable<AuthenticatedEmailPreview['thread']>[number] {
  return {
    actions: threadActionsForMessage(message, folders),
    attachments: message.attachments.map(toEmailAttachment),
    folderId: message.mailboxId,
    html: message.html,
    id: message.id,
    isDraft: message.isDraft,
    receivedAt: formatMessageDate(message.receivedAt),
    recipientEmail: message.to.join(', '),
    senderEmail: emailAddress(message.from),
    senderName: displayName(message.from),
    state,
    teaser: message.teaser
  }
}

function toEmailAttachment(
  attachment: AgentMailWebThreadMessage['attachments'][number]
): NonNullable<AuthenticatedEmailPreview['attachments']>[number] {
  return {
    contentId: attachment.contentId,
    disposition: attachment.disposition,
    filename: attachment.filename,
    id: attachment.id,
    mimetype: attachment.mimetype,
    sizeLabel: attachment.size === undefined ? undefined : formatBytes(attachment.size),
    status: 'ready',
    url: attachment.url
  }
}

function actionsForMessage(
  message: Pick<AgentMailWebMessageSummary, 'isDraft' | 'isStarred' | 'mailboxId' | 'unread'>,
  folders: ReadonlyArray<AgentMailWebFolder>
): ReadonlyArray<AuthenticatedEmailToolbarAction> {
  if (message.isDraft) {
    return [
      toolbarAction('back', 'navigation', 'start', 'Back to list'),
      toolbarAction('send-draft', 'response', 'start', 'Send draft'),
      toolbarAction('edit-draft', 'response', 'start', 'Edit draft'),
      toolbarAction('view-original', 'utility', 'end', 'View original'),
      toolbarAction('discard-draft', 'utility', 'end', 'Discard draft')
    ]
  }

  const currentFolder = folders.find((folder) => folder.id === message.mailboxId)
  const isJunk = currentFolder?.specialUse?.toLowerCase() === '\\junk'

  return defaultAuthenticatedEmailToolbarActions.map((action) => {
    if (action.action === 'star' && message.isStarred) {
      return { ...action, action: 'unstar', iconKey: 'unstar', label: 'Unstar' }
    }
    if (action.action === 'mark-unread' && message.unread) {
      return { ...action, action: 'mark-read', iconKey: 'mark-read', label: 'Mark as read' }
    }
    if (action.action === 'mark-spam' && isJunk) {
      return { ...action, action: 'mark-not-spam', iconKey: 'mark-not-spam', label: 'Not spam' }
    }
    return action
  })
}

function threadActionsForMessage(
  message: Pick<AgentMailWebMessageSummary, 'isDraft' | 'isStarred' | 'mailboxId' | 'unread'>,
  folders: ReadonlyArray<AgentMailWebFolder>
): ReadonlyArray<AuthenticatedEmailToolbarAction> {
  if (message.isDraft) {
    return actionsForMessage(message, folders)
  }
  return [toolbarAction('view-original', 'utility', 'end', 'View original')]
}

function toolbarAction(
  action: AuthenticatedEmailAction,
  group: AuthenticatedEmailToolbarAction['group'],
  section: AuthenticatedEmailToolbarAction['section'],
  label: string
): AuthenticatedEmailToolbarAction {
  return {
    action,
    group,
    iconKey: action,
    label,
    section
  }
}

function toPagination(workspace: AgentMailWebWorkspace | undefined): AuthenticatedSidebarView['pagination'] {
  if (!workspace) {
    return undefined
  }

  const messageCount = workspace.messages.length
  return {
    canGoNext: Boolean(workspace.pagination.nextCursor),
    canGoPrevious: Boolean(workspace.pagination.previousCursor),
    nextCursor: workspace.pagination.nextCursor,
    previousCursor: workspace.pagination.previousCursor,
    rangeLabel: messageCount ? `1-${messageCount}` : '0',
    totalLabel:
      workspace.pagination.total === null
        ? undefined
        : `${workspace.pagination.total.toLocaleString()} messages`
  }
}

function toMailActionView({
  deleteDialog,
  folders,
  moveDialog,
  originalSourceDialog,
  selectedMessage
}: {
  deleteDialog: {
    actionInput?: AgentMailMessageActionInput
    errorMessage?: string
    isDraft?: boolean
    isSubmitting?: boolean
    state: 'closed' | 'open'
  }
  folders: ReadonlyArray<AgentMailWebFolder>
  moveDialog: {
    actionInput?: AgentMailMessageActionInput
    errorMessage?: string
    isSubmitting?: boolean
    selectedFolderId?: string
    state: 'closed' | 'open'
  }
  originalSourceDialog: {
    errorMessage?: string
    isLoading?: boolean
    source?: string
    state: 'closed' | 'open'
  }
  selectedMessage: AgentMailWebMessageDetail | null
}): AuthenticatedMailActionView {
  const deleteTargetIsDraft = deleteDialog.isDraft ?? selectedMessage?.isDraft
  const moveSourceMailboxId = moveDialog.actionInput?.mailboxId ?? selectedMessage?.mailboxId
  return {
    delete: {
      confirmLabel: deleteTargetIsDraft ? 'Discard draft' : 'Delete message',
      description: deleteTargetIsDraft
        ? 'This removes the saved draft from the WildDuck Drafts folder.'
        : 'This removes the message from the selected WildDuck folder.',
      errorMessage: deleteDialog.errorMessage,
      isSubmitting: deleteDialog.isSubmitting,
      state: deleteDialog.state,
      title: deleteTargetIsDraft ? 'Discard this draft?' : 'Delete this message?'
    },
    move: {
      description: 'Choose the WildDuck folder that should receive this message.',
      errorMessage: moveDialog.errorMessage,
      folders: folders.map((folder) => ({
        disabled: folder.id === moveSourceMailboxId,
        disabledReason: folder.id === moveSourceMailboxId ? 'Message is already in this folder' : undefined,
        id: folder.id,
        title: folder.name,
        unreadCountLabel: folder.unread ? String(folder.unread) : undefined
      })),
      isSubmitting: moveDialog.isSubmitting,
      selectedFolderId: moveDialog.selectedFolderId,
      state: moveDialog.state,
      submitLabel: moveDialog.isSubmitting ? 'Moving' : 'Move',
      title: 'Move message'
    },
    originalSource: {
      description: 'WildDuck RFC822 source for the selected message.',
      downloadLabel: 'Download .eml',
      errorMessage: originalSourceDialog.errorMessage,
      isLoading: originalSourceDialog.isLoading,
      rawSources: [
        {
          id: 'wildduck-source',
          source: originalSourceDialog.source,
          title: 'Final WildDuck Raw Source'
        }
      ],
      source: originalSourceDialog.source,
      state: originalSourceDialog.state,
      title: 'Original source'
    }
  }
}

function toComposeView(
  state: ComposeState,
  status: { isSavingDraft?: boolean; isSending?: boolean }
): AuthenticatedComposeView {
  return {
    bcc: state.bcc,
    body: state.body,
    canSaveDraft: state.state === 'open',
    canSend: state.state === 'open',
    cc: state.cc,
    draftId: state.draftId,
    draftStatusLabel: state.draftId ? 'Saved to WildDuck Drafts' : undefined,
    errorMessage: state.errorMessage,
    fromAddress: state.fromAddress,
    fromLabel: state.fromLabel,
    isSavingDraft: status.isSavingDraft,
    isSending: status.isSending,
    mode: state.mode,
    state: state.state,
    subject: state.subject,
    title: state.title,
    to: state.to
  }
}

function closedComposeState(): ComposeState {
  return {
    bcc: '',
    body: '',
    cc: '',
    mode: 'new',
    state: 'closed',
    subject: '',
    title: 'New message',
    to: ''
  }
}

function composePayload(accountId: string, state: ComposeState): AgentMailComposeInput {
  return {
    accountId,
    bcc: state.bcc,
    body: state.body,
    cc: state.cc,
    draftMailboxId: state.draftMailboxId,
    draftMessageId: state.draftId,
    reference: state.reference,
    subject: state.subject,
    to: state.to
  }
}

function findActionMessage(
  selectedMessage: AgentMailWebMessageDetail | null,
  email: AuthenticatedEmailPreview
): AgentMailWebThreadMessage | null {
  if (!selectedMessage) {
    return null
  }
  if (selectedMessage.id === email.id && (!email.folderId || selectedMessage.mailboxId === email.folderId)) {
    return selectedMessage
  }
  return (
    selectedMessage.thread?.find(
      (message) => message.id === email.id && (!email.folderId || message.mailboxId === email.folderId)
    ) ?? null
  )
}

function composeFromMessage(
  action: 'forward' | 'reply' | 'reply-all',
  message: AgentMailWebThreadMessage,
  accountId: string | null | undefined
): ComposeState {
  const mode = action === 'reply-all' ? 'reply-all' : action
  return {
    ...closedComposeState(),
    body: action === 'forward' ? forwardedBody(message) : '',
    fromAddress: accountId ?? undefined,
    mode,
    reference: {
      action: action === 'reply-all' ? 'replyAll' : action,
      mailboxId: message.mailboxId,
      messageId: message.id
    },
    state: 'open',
    subject: prefixedSubject(action === 'forward' ? 'Fwd' : 'Re', message.subject),
    title: action === 'forward' ? 'Forward message' : action === 'reply-all' ? 'Reply all' : 'Reply',
    to: action === 'forward' ? '' : emailAddress(message.from)
  }
}

function composeFromDraft(
  message: AgentMailWebThreadMessage,
  accountId: string | null | undefined
): ComposeState {
  return {
    ...closedComposeState(),
    body: stripHTML(message.html),
    draftId: message.id,
    draftMailboxId: message.mailboxId,
    fromAddress: accountId ?? undefined,
    mode: 'draft',
    state: 'open',
    subject: message.subject,
    title: 'Draft message',
    to: message.to.join(', ')
  }
}

function prefixedSubject(prefix: 'Fwd' | 'Re', subject: string) {
  return subject.startsWith(`${prefix}:`) ? subject : `${prefix}: ${subject}`
}

function forwardedBody(message: AgentMailWebThreadMessage) {
  return [
    '',
    '',
    '---------- Forwarded message ---------',
    `From: ${message.from}`,
    `To: ${message.to.join(', ')}`,
    `Subject: ${message.subject}`,
    '',
    stripHTML(message.html)
  ].join('\n')
}

function folderIcon(folder: AgentMailWebFolder): AuthenticatedMailNavIconKey {
  const specialUse = folder.specialUse?.toLowerCase()
  if (specialUse === '\\drafts') {
    return 'drafts'
  }
  if (specialUse === '\\junk') {
    return 'junk'
  }
  if (specialUse === '\\sent') {
    return 'sent'
  }
  if (specialUse === '\\trash') {
    return 'trash'
  }
  if (specialUse === '\\inbox' || folder.path.toLowerCase() === 'inbox') {
    return 'inbox'
  }
  return 'folder'
}

function findFolderBySpecialUse(folders: ReadonlyArray<AgentMailWebFolder>, specialUse: string) {
  return folders.find((folder) => folder.specialUse?.toLowerCase() === specialUse.toLowerCase())
}

function formatMessageDate(value: string | undefined) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(date)
    : value
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function displayName(value: string) {
  const angleIndex = value.indexOf('<')
  return angleIndex > 0 ? value.slice(0, angleIndex).trim() : value
}

function emailAddress(value: string) {
  const match = /<([^>]+)>/u.exec(value)
  return match?.[1]?.trim() ?? value
}

function stripHTML(value: string) {
  return value
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/p>/giu, '\n')
    .replace(/<[^>]*>/gu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function handleDialogOpenChange(
  dialog: AuthenticatedMailActionDialogKind,
  open: boolean,
  setMoveDialog: React.Dispatch<
    React.SetStateAction<{
      actionInput?: AgentMailMessageActionInput
      errorMessage?: string
      isSubmitting?: boolean
      selectedFolderId?: string
      state: 'closed' | 'open'
    }>
  >,
  setDeleteDialog: React.Dispatch<
    React.SetStateAction<{
      actionInput?: AgentMailMessageActionInput
      errorMessage?: string
      isDraft?: boolean
      isSubmitting?: boolean
      state: 'closed' | 'open'
    }>
  >,
  setOriginalSourceDialog: React.Dispatch<
    React.SetStateAction<{
      errorMessage?: string
      isLoading?: boolean
      source?: string
      state: 'closed' | 'open'
    }>
  >
) {
  if (dialog === 'move') {
    setMoveDialog((current) => ({ ...current, state: open ? 'open' : 'closed' }))
  } else if (dialog === 'delete') {
    setDeleteDialog((current) => ({ ...current, state: open ? 'open' : 'closed' }))
  } else {
    setOriginalSourceDialog((current) => ({ ...current, state: open ? 'open' : 'closed' }))
  }
}

function downloadOriginalSource(message: AgentMailWebMessageDetail | null, source: string | undefined) {
  if (!message || !source || typeof globalThis.document === 'undefined') {
    return
  }

  const link = globalThis.document.createElement('a')
  link.download = `${message.id}.eml`
  link.href = globalThis.URL.createObjectURL(new Blob([source], { type: 'message/rfc822' }))
  link.click()
  globalThis.URL.revokeObjectURL(link.href)
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
