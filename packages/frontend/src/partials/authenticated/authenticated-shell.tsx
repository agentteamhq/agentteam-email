import * as React from 'react'
import {
  AddressBookIcon,
  ArchiveIcon,
  ArrowBendDoubleUpLeftIcon,
  ArrowBendUpLeftIcon,
  ArrowBendUpRightIcon,
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  CodeIcon,
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  FileIcon,
  FlagPennantIcon,
  FolderIcon,
  ImageIcon,
  LinkIcon,
  PaperPlaneTiltIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  TrayIcon,
  UserIcon,
  UsersThreeIcon,
  WarningIcon,
  XIcon
} from '@phosphor-icons/react'

import { UserButton } from '../../components/auth/user/user-button'
import { LocalDateTime } from '../../components/local-date-time'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from '../../components/ui/alert-dialog'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Separator } from '../../components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '../../components/ui/sheet'
import { Skeleton } from '../../components/ui/skeleton'
import { Spinner } from '../../components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar
} from '../../components/ui/sidebar'
import { Textarea } from '../../components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip'
import {
  buildEmailContentSecurityPolicy,
  buildEmailIframeDocument,
  normalizeEmailAttachmentURL,
  normalizeEmailLink
} from '../../lib/email-safety'
import { cn } from '../../lib/utils'
import { CloudflareConnectButton, CloudflareLogo } from './cloudflare-brand'
import { OnboardingDomainSettingsPanel } from './onboarding-domain-settings-panel'
import { SettingsDialog } from './settings-dialog'
import { WorkspaceMailboxSwitcher } from './workspace-mailbox-switcher'
import {
  defaultAuthenticatedDashboardView,
  defaultAuthenticatedEmailToolbarActions
} from './authenticated-shell-models'
import type { EmailIframeThemeMode } from '../../lib/email-safety'
import type {
  AuthenticatedComposeField,
  AuthenticatedComposeView,
  AuthenticatedDashboardView,
  AuthenticatedEmailAction,
  AuthenticatedEmailActionIconKey,
  AuthenticatedEmailAttachment,
  AuthenticatedEmailBodySize,
  AuthenticatedEmailPreview,
  AuthenticatedEmailThreadMessage,
  AuthenticatedEmailToolbarAction,
  AuthenticatedExternalLink,
  AuthenticatedMailAccount,
  AuthenticatedMailActionDialogKind,
  AuthenticatedMailActionView,
  AuthenticatedMailCreateFolderView,
  AuthenticatedMailFolderAction,
  AuthenticatedMailItem,
  AuthenticatedMailNavIconKey,
  AuthenticatedMailOriginalSourceView,
  AuthenticatedMailPageChange,
  AuthenticatedMailPagination,
  AuthenticatedManagementNavGroup,
  AuthenticatedManagementNavIconKey,
  AuthenticatedManagementNavItem,
  AuthenticatedRemoteImage,
  AuthenticatedSidebarView,
  AuthenticatedWorkspaceSwitcherWorkspace,
  FirstMailboxSetupState
} from './authenticated-shell-models'
import type {
  WorkspaceMailboxSwitcherMailbox,
  WorkspaceMailboxSwitcherState
} from './workspace-mailbox-switcher'
import type {
  AgentAccessSettingsState,
  DomainSettingsState,
  IntegrationSettingsState,
  SettingsDialogContentState
} from './settings-dialog'
import type { SettingsSectionId } from './settings-dialog-sections'

export interface AuthenticatedShellProps {
  children: React.ReactNode
  agentAccessState?: AgentAccessSettingsState
  composeView?: AuthenticatedComposeView
  domainSettingsState?: DomainSettingsState
  integrationsState?: IntegrationSettingsState
  mailActionView?: AuthenticatedMailActionView
  onComposeAttachmentAdd?: (files: ReadonlyArray<File>) => void
  onComposeAttachmentRemove?: (attachmentId: string) => void
  onComposeDiscardDraft?: () => void
  onComposeFieldChange?: (field: AuthenticatedComposeField, value: string) => void
  onComposeOpenChange?: (open: boolean) => void
  onComposeSaveDraft?: () => void
  onComposeSubmit?: () => void
  onMailActionDialogOpenChange?: (dialog: AuthenticatedMailActionDialogKind, open: boolean) => void
  onMailDeleteConfirm?: () => void
  onMailMoveSubmit?: () => void
  onMailMoveTargetChange?: (folderId: string) => void
  onMailOriginalSourceDownload?: () => void
  onMailboxAccountSelect?: (accountId: string) => void
  onMailboxFolderCreateNameChange?: (name: string) => void
  onMailboxFolderCreateOpenChange?: (open: boolean) => void
  onMailboxFolderCreateSubmit?: () => void
  onMailboxFolderAction?: (
    action: AuthenticatedMailFolderAction,
    folder: AuthenticatedSidebarView['navMain'][number]
  ) => void
  onMailboxFolderDeleteConfirm?: () => void
  onMailboxFolderDeleteOpenChange?: (open: boolean) => void
  onMailboxFolderRenameNameChange?: (name: string) => void
  onMailboxFolderRenameOpenChange?: (open: boolean) => void
  onMailboxFolderRenameSubmit?: () => void
  onMailboxPageChange?: (pageChange: AuthenticatedMailPageChange) => void
  onMailboxRefresh?: () => void
  onMailboxRetry?: () => void
  onMailSelect?: (mailId: string) => void
  onSettingsOpenChange: (open: boolean) => void
  onSettingsSectionChange: (section: SettingsSectionId) => void
  onSidebarItemSelect?: (itemId: string) => void
  onSidebarSearchChange?: (query: string) => void
  onSidebarUnreadOnlyChange?: (unreadOnly: boolean) => void
  settingsContentState?: SettingsDialogContentState
  settingsOpen: boolean
  settingsSection: SettingsSectionId
  sidebarView: AuthenticatedSidebarView
  title?: string
}

export function AuthenticatedShell({
  children,
  agentAccessState,
  composeView,
  domainSettingsState,
  integrationsState,
  mailActionView,
  onComposeAttachmentRemove,
  onComposeAttachmentAdd,
  onComposeDiscardDraft,
  onComposeFieldChange,
  onComposeOpenChange,
  onComposeSaveDraft,
  onComposeSubmit,
  onMailActionDialogOpenChange,
  onMailDeleteConfirm,
  onMailMoveSubmit,
  onMailMoveTargetChange,
  onMailOriginalSourceDownload,
  onMailboxAccountSelect,
  onMailboxFolderCreateNameChange,
  onMailboxFolderCreateOpenChange,
  onMailboxFolderCreateSubmit,
  onMailboxFolderAction,
  onMailboxFolderDeleteConfirm,
  onMailboxFolderDeleteOpenChange,
  onMailboxFolderRenameNameChange,
  onMailboxFolderRenameOpenChange,
  onMailboxFolderRenameSubmit,
  onMailboxPageChange,
  onMailboxRetry,
  onMailSelect,
  onSettingsOpenChange,
  onSettingsSectionChange,
  onSidebarItemSelect,
  onSidebarSearchChange,
  settingsContentState,
  settingsOpen,
  settingsSection,
  sidebarView,
  title
}: AuthenticatedShellProps) {
  const hasActiveManagementItem = getSidebarManagementNavItems(sidebarView).some(
    (item) => item.id === sidebarView.activeItemId
  )
  const headerTitle = title ?? sidebarView.paneTitle

  return (
    <SidebarProvider
      className='h-svh min-h-0'
      open={hasActiveManagementItem ? false : undefined}
      style={
        {
          '--sidebar-width': '350px'
        } as React.CSSProperties
      }
    >
      <AuthenticatedSidebar
        onAccountSelect={onMailboxAccountSelect}
        onComposeOpen={() => {
          onComposeOpenChange?.(true)
        }}
        onFolderCreateNameChange={onMailboxFolderCreateNameChange}
        onFolderCreateOpenChange={onMailboxFolderCreateOpenChange}
        onFolderCreateSubmit={onMailboxFolderCreateSubmit}
        onFolderAction={onMailboxFolderAction}
        onFolderDeleteConfirm={onMailboxFolderDeleteConfirm}
        onFolderDeleteOpenChange={onMailboxFolderDeleteOpenChange}
        onFolderRenameNameChange={onMailboxFolderRenameNameChange}
        onFolderRenameOpenChange={onMailboxFolderRenameOpenChange}
        onFolderRenameSubmit={onMailboxFolderRenameSubmit}
        onMailSelect={onMailSelect}
        onPageChange={onMailboxPageChange}
        onRetry={onMailboxRetry}
        onSearchChange={onSidebarSearchChange}
        onSelectItem={onSidebarItemSelect}
        view={sidebarView}
      />
      <SidebarInset>
        <header className='bg-background sticky top-0 flex h-14 shrink-0 items-center gap-2 border-b px-4'>
          <SidebarTrigger />
          <span className='text-sm font-medium'>{headerTitle}</span>
        </header>
        {children}
      </SidebarInset>
      <SettingsDialog
        activeSection={settingsSection}
        agentAccessState={agentAccessState}
        contentState={settingsContentState}
        domainSettingsState={domainSettingsState}
        integrationsState={integrationsState}
        onActiveSectionChange={onSettingsSectionChange}
        onOpenChange={onSettingsOpenChange}
        open={settingsOpen}
        trigger={null}
      />
      <ComposeSheet
        onAttachmentAdd={onComposeAttachmentAdd}
        onAttachmentRemove={onComposeAttachmentRemove}
        onDiscardDraft={onComposeDiscardDraft}
        onFieldChange={onComposeFieldChange}
        onOpenChange={onComposeOpenChange}
        onSaveDraft={onComposeSaveDraft}
        onSubmit={onComposeSubmit}
        view={composeView}
      />
      <MailActionDialogs
        onDeleteConfirm={onMailDeleteConfirm}
        onDownloadOriginalSource={onMailOriginalSourceDownload}
        onMoveSubmit={onMailMoveSubmit}
        onMoveTargetChange={onMailMoveTargetChange}
        onOpenChange={onMailActionDialogOpenChange}
        view={mailActionView}
      />
    </SidebarProvider>
  )
}

const closedComposeView = {
  body: '',
  mode: 'new',
  state: 'closed',
  subject: '',
  title: 'New message',
  to: ''
} satisfies AuthenticatedComposeView

function ComposeSheet({
  onAttachmentAdd,
  onAttachmentRemove,
  onDiscardDraft,
  onFieldChange,
  onOpenChange,
  onSaveDraft,
  onSubmit,
  view = closedComposeView
}: {
  onAttachmentAdd?: (files: ReadonlyArray<File>) => void
  onAttachmentRemove?: (attachmentId: string) => void
  onDiscardDraft?: () => void
  onFieldChange?: (field: AuthenticatedComposeField, value: string) => void
  onOpenChange?: (open: boolean) => void
  onSaveDraft?: () => void
  onSubmit?: () => void
  view?: AuthenticatedComposeView
}) {
  const open = view.state === 'open'
  const fieldsDisabled = !onFieldChange || view.isSending
  const hasFieldErrors = Object.values(view.fieldErrors ?? {}).some(Boolean)
  const sendDisabled =
    view.canSend === false || view.isSending || view.isSavingDraft || !onSubmit || hasFieldErrors
  const saveDraftDisabled =
    view.canSaveDraft === false || view.isSavingDraft || view.isSending || !onSaveDraft

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        className='w-full sm:max-w-xl'
        side='right'
      >
        <SheetHeader>
          <SheetTitle>{view.title}</SheetTitle>
          <SheetDescription className='sr-only'>Compose email message</SheetDescription>
        </SheetHeader>
        <form
          className='flex min-h-0 flex-1 flex-col gap-3 px-4'
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit?.()
          }}
        >
          <ComposeSenderField
            address={view.fromAddress}
            label={view.fromLabel}
          />
          <ComposeField
            disabled={fieldsDisabled}
            label='To'
            onChange={(value) => {
              onFieldChange?.('to', value)
            }}
            errorMessage={view.fieldErrors?.to}
            value={view.to}
          />
          <div className='grid gap-3 sm:grid-cols-2'>
            <ComposeField
              disabled={fieldsDisabled}
              label='Cc'
              onChange={(value) => {
                onFieldChange?.('cc', value)
              }}
              errorMessage={view.fieldErrors?.cc}
              value={view.cc ?? ''}
            />
            <ComposeField
              disabled={fieldsDisabled}
              label='Bcc'
              onChange={(value) => {
                onFieldChange?.('bcc', value)
              }}
              errorMessage={view.fieldErrors?.bcc}
              value={view.bcc ?? ''}
            />
          </div>
          <ComposeField
            disabled={fieldsDisabled}
            label='Subject'
            onChange={(value) => {
              onFieldChange?.('subject', value)
            }}
            errorMessage={view.fieldErrors?.subject}
            value={view.subject}
          />
          <div className='grid min-h-0 flex-1 gap-1.5'>
            <Label htmlFor='authenticated-compose-body'>Body</Label>
            <Textarea
              aria-invalid={Boolean(view.fieldErrors?.body)}
              aria-describedby={view.fieldErrors?.body ? 'authenticated-compose-body-error' : undefined}
              className='min-h-56 flex-1 resize-none'
              disabled={fieldsDisabled}
              id='authenticated-compose-body'
              onChange={(event) => {
                onFieldChange?.('body', event.currentTarget.value)
              }}
              value={view.body}
            />
            {view.fieldErrors?.body ? (
              <p
                className='text-destructive text-xs'
                id='authenticated-compose-body-error'
              >
                {view.fieldErrors.body}
              </p>
            ) : null}
          </div>
          <ComposeAttachmentList
            attachments={view.attachments ?? []}
            disabled={view.isSending || view.isSavingDraft}
            onAttachmentAdd={onAttachmentAdd}
            onAttachmentRemove={onAttachmentRemove}
          />
          {view.errorMessage ? (
            <div
              className='text-destructive border-destructive/30 bg-destructive/5 rounded-md border px-3 py-2
                text-sm'
            >
              {view.errorMessage}
            </div>
          ) : null}
          <SheetFooter className='px-0'>
            <div className='flex flex-wrap justify-between gap-2'>
              <div className='flex min-w-0 flex-wrap items-center gap-2'>
                <Button
                  disabled={!onDiscardDraft || view.isSending || view.isSavingDraft}
                  onClick={onDiscardDraft}
                  type='button'
                  variant='ghost'
                >
                  Discard
                </Button>
                {view.draftStatusLabel ? (
                  <span className='text-muted-foreground min-w-0 truncate text-sm'>
                    {view.draftStatusLabel}
                  </span>
                ) : null}
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button
                  disabled={saveDraftDisabled}
                  onClick={onSaveDraft}
                  type='button'
                  variant='outline'
                >
                  {view.isSavingDraft ? <Spinner data-icon='inline-start' /> : null}
                  Save draft
                </Button>
                <Button
                  disabled={sendDisabled}
                  type='submit'
                >
                  {view.isSending ? (
                    <Spinner data-icon='inline-start' />
                  ) : (
                    <PaperPlaneTiltIcon data-icon='inline-start' />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function ComposeSenderField({ address, label }: { address?: string; label?: string }) {
  const value = getComposeSenderValue({ address, label })

  if (!value) {
    return null
  }

  return (
    <div className='grid gap-1.5'>
      <Label htmlFor='authenticated-compose-from'>From</Label>
      <Input
        id='authenticated-compose-from'
        readOnly
        value={value}
      />
    </div>
  )
}

function getComposeSenderValue({ address, label }: { address?: string; label?: string }) {
  const cleanAddress = address?.trim()
  const cleanLabel = label?.trim()

  if (cleanLabel && cleanAddress) {
    return `${cleanLabel} <${cleanAddress}>`
  }

  return cleanLabel || cleanAddress || ''
}

function ComposeAttachmentList({
  attachments,
  disabled,
  onAttachmentAdd,
  onAttachmentRemove
}: {
  attachments: ReadonlyArray<AuthenticatedEmailAttachment>
  disabled?: boolean
  onAttachmentAdd?: (files: ReadonlyArray<File>) => void
  onAttachmentRemove?: (attachmentId: string) => void
}) {
  const inputId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <div className='grid gap-1.5'>
      <div className='flex items-center justify-between gap-2'>
        <Label>Attachments</Label>
        <input
          aria-label='Attach files'
          className='sr-only'
          disabled={disabled || !onAttachmentAdd}
          id={inputId}
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            if (files.length > 0) {
              onAttachmentAdd?.(files)
            }
            event.currentTarget.value = ''
          }}
          ref={inputRef}
          type='file'
        />
        <Button
          disabled={disabled || !onAttachmentAdd}
          onClick={() => {
            inputRef.current?.click()
          }}
          size='sm'
          type='button'
          variant='outline'
        >
          <PaperclipIcon data-icon='inline-start' />
          Attach files
        </Button>
      </div>
      {attachments.length ? (
        <div className='grid gap-2'>
          {attachments.map((attachment) => (
            <div
              className='bg-muted/30 flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5'
              key={attachment.id}
            >
              <PaperclipIcon
                className='text-muted-foreground size-4 shrink-0'
                data-icon='inline-start'
              />
              <span className='text-foreground min-w-0 flex-1 truncate text-sm'>{attachment.filename}</span>
              {attachment.sizeLabel ? (
                <span className='text-muted-foreground shrink-0 text-xs'>{attachment.sizeLabel}</span>
              ) : null}
              <ComposeAttachmentStatus attachment={attachment} />
              <Button
                aria-label={`Remove attachment ${attachment.filename}`}
                className='size-7 shrink-0'
                disabled={disabled || !onAttachmentRemove || attachment.status === 'uploading'}
                onClick={() => {
                  onAttachmentRemove?.(attachment.id)
                }}
                size='icon'
                type='button'
                variant='ghost'
              >
                <XIcon data-icon='icon-only' />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ComposeAttachmentStatus({ attachment }: { attachment: AuthenticatedEmailAttachment }) {
  if (!attachment.statusLabel && (!attachment.status || attachment.status === 'ready')) {
    return null
  }

  if (attachment.status === 'uploading') {
    return (
      <span className='text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs'>
        <Spinner data-icon='inline-start' />
        {attachment.statusLabel ?? 'Uploading'}
      </span>
    )
  }

  if (attachment.status === 'error') {
    return <Badge variant='destructive'>{attachment.statusLabel ?? 'Upload failed'}</Badge>
  }

  return <span className='text-muted-foreground shrink-0 text-xs'>{attachment.statusLabel}</span>
}

function ComposeField({
  disabled,
  errorMessage,
  label,
  onChange,
  value
}: {
  disabled?: boolean
  errorMessage?: string
  label: string
  onChange: (value: string) => void
  value: string
}) {
  const id = `authenticated-compose-${label.toLowerCase()}`
  const errorId = `${id}-error`

  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={errorMessage ? errorId : undefined}
        aria-invalid={Boolean(errorMessage)}
        disabled={disabled}
        id={id}
        onChange={(event) => {
          onChange(event.currentTarget.value)
        }}
        value={value}
      />
      {errorMessage ? (
        <p
          className='text-destructive text-xs'
          id={errorId}
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}

function MailActionDialogs({
  onDeleteConfirm,
  onDownloadOriginalSource,
  onMoveSubmit,
  onMoveTargetChange,
  onOpenChange,
  view
}: {
  onDeleteConfirm?: () => void
  onDownloadOriginalSource?: () => void
  onMoveSubmit?: () => void
  onMoveTargetChange?: (folderId: string) => void
  onOpenChange?: (dialog: AuthenticatedMailActionDialogKind, open: boolean) => void
  view?: AuthenticatedMailActionView
}) {
  const moveView = view?.move
  const deleteView = view?.delete
  const originalSourceView = view?.originalSource
  const selectedMoveFolder = moveView?.folders.find((folder) => folder.id === moveView.selectedFolderId)
  const moveSubmitDisabled =
    !onMoveSubmit || !moveView?.selectedFolderId || moveView.isSubmitting || selectedMoveFolder?.disabled

  return (
    <>
      <Dialog
        open={moveView?.state === 'open'}
        onOpenChange={(open) => {
          onOpenChange?.('move', open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{moveView?.title ?? 'Move message'}</DialogTitle>
            {moveView?.description ? <DialogDescription>{moveView.description}</DialogDescription> : null}
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='authenticated-mail-move-target'>Folder</Label>
            <Select
              disabled={!onMoveTargetChange || moveView?.isSubmitting}
              onValueChange={onMoveTargetChange}
              value={moveView?.selectedFolderId ?? ''}
            >
              <SelectTrigger
                id='authenticated-mail-move-target'
                className='w-full'
              >
                <SelectValue placeholder='Select folder' />
              </SelectTrigger>
              <SelectContent>
                {(moveView?.folders ?? []).map((folder) => (
                  <SelectItem
                    disabled={folder.disabled}
                    key={folder.id}
                    title={folder.disabledReason}
                    value={folder.id}
                  >
                    <span className='flex min-w-0 flex-col items-start gap-0.5'>
                      <span className='flex min-w-0 items-center gap-2'>
                        <span className='truncate'>{folder.title}</span>
                        {folder.unreadCountLabel ? (
                          <Badge variant='secondary'>{folder.unreadCountLabel}</Badge>
                        ) : null}
                      </span>
                      {folder.description ? (
                        <span className='text-muted-foreground truncate text-xs'>{folder.description}</span>
                      ) : null}
                      {folder.disabledReason ? (
                        <span className='text-muted-foreground truncate text-xs'>
                          {folder.disabledReason}
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {moveView?.errorMessage ? (
            <div
              className='text-destructive bg-destructive/5 border-destructive/30 rounded-md border px-3 py-2
                text-sm'
            >
              {moveView.errorMessage}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                disabled={moveView?.isSubmitting}
                type='button'
                variant='outline'
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={moveSubmitDisabled}
              onClick={onMoveSubmit}
              type='button'
            >
              {moveView?.isSubmitting ? (
                <Spinner data-icon='inline-start' />
              ) : (
                <FolderIcon data-icon='inline-start' />
              )}
              {moveView?.submitLabel ?? 'Move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={originalSourceView?.state === 'open'}
        onOpenChange={(open) => {
          onOpenChange?.('originalSource', open)
        }}
      >
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>{originalSourceView?.title ?? 'Original source'}</DialogTitle>
            {originalSourceView?.description ? (
              <DialogDescription>{originalSourceView.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <OriginalSourceDialogBody view={originalSourceView} />
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type='button'
                variant='outline'
              >
                Close
              </Button>
            </DialogClose>
            <Button
              disabled={
                !onDownloadOriginalSource ||
                originalSourceView?.isLoading ||
                !hasOriginalSourceDownload(originalSourceView)
              }
              onClick={onDownloadOriginalSource}
              type='button'
            >
              <FileIcon data-icon='inline-start' />
              {originalSourceView?.downloadLabel ?? 'Download source'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteView?.state === 'open'}
        onOpenChange={(open) => {
          onOpenChange?.('delete', open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TrashIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>{deleteView?.title ?? 'Delete message?'}</AlertDialogTitle>
            <AlertDialogDescription>{deleteView?.description ?? ''}</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteView?.errorMessage ? (
            <div
              className='text-destructive bg-destructive/5 border-destructive/30 rounded-md border px-3 py-2
                text-sm'
            >
              {deleteView.errorMessage}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteView?.isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!onDeleteConfirm || deleteView?.isSubmitting}
              onClick={(event) => {
                event.preventDefault()
                onDeleteConfirm?.()
              }}
              variant='destructive'
            >
              {deleteView?.isSubmitting ? <Spinner data-icon='inline-start' /> : null}
              {deleteView?.confirmLabel ?? 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function OriginalSourceDialogBody({ view }: { view?: AuthenticatedMailOriginalSourceView }) {
  if (view?.isLoading) {
    return (
      <div className='bg-muted/40 max-h-[55vh] overflow-auto rounded-md border p-3'>
        <div className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Spinner data-icon='inline-start' />
          Loading source
        </div>
      </div>
    )
  }

  if (view?.errorMessage) {
    return (
      <div className='bg-muted/40 max-h-[55vh] overflow-auto rounded-md border p-3'>
        <div className='text-destructive text-sm'>{view.errorMessage}</div>
      </div>
    )
  }

  if (!hasStructuredOriginalSource(view)) {
    return (
      <div className='bg-muted/40 max-h-[55vh] overflow-auto rounded-md border p-3'>
        <pre className='text-foreground font-mono text-xs break-words whitespace-pre-wrap'>
          {view?.source ?? ''}
        </pre>
      </div>
    )
  }

  return (
    <div className='max-h-[55vh] space-y-4 overflow-auto rounded-md border p-3'>
      <OriginalSourceEvidenceGrid evidence={view?.evidence ?? []} />
      <OriginalSourceAuthenticationHeaders headers={view?.authenticationHeaders ?? []} />
      {(view?.headerSections ?? []).map((section) => (
        <OriginalSourceHeaderSection
          key={section.id}
          section={section}
        />
      ))}
      {(view?.rawSources ?? []).map((rawSource) => (
        <OriginalSourceRawSection
          key={rawSource.id}
          rawSource={rawSource}
        />
      ))}
    </div>
  )
}

function OriginalSourceEvidenceGrid({
  evidence
}: {
  evidence: NonNullable<AuthenticatedMailOriginalSourceView['evidence']>
}) {
  if (!evidence.length) {
    return null
  }

  return (
    <section className='grid gap-2'>
      <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>Evidence</h3>
      <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
        {evidence.map((item) => (
          <div
            className='bg-muted/30 rounded-md border p-2'
            key={item.id}
          >
            <div className='text-muted-foreground text-xs'>{item.label}</div>
            <div className='mt-1 flex min-w-0 items-center gap-2'>
              {item.status ? <OriginalSourceStatusBadge status={item.status} /> : null}
              <div className='text-foreground min-w-0 font-mono text-xs break-words'>{item.value}</div>
            </div>
            {item.description ? (
              <div className='text-muted-foreground mt-1 text-xs'>{item.description}</div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function OriginalSourceStatusBadge({
  status
}: {
  status: NonNullable<AuthenticatedMailOriginalSourceView['evidence']>[number]['status']
}) {
  if (!status) {
    return null
  }

  return (
    <Badge variant={status === 'fail' ? 'destructive' : status === 'pass' ? 'secondary' : 'outline'}>
      {status}
    </Badge>
  )
}

function OriginalSourceAuthenticationHeaders({
  headers
}: {
  headers: NonNullable<AuthenticatedMailOriginalSourceView['authenticationHeaders']>
}) {
  if (!headers.length) {
    return null
  }

  return (
    <section className='grid gap-2'>
      <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        Authentication Headers
      </h3>
      {headers.map((header) => (
        <article
          className='rounded-md border p-3'
          key={header.id}
        >
          <div className='flex min-w-0 flex-wrap items-start justify-between gap-2'>
            <div className='text-foreground text-sm font-medium'>{header.title}</div>
            {header.sourceLabel ? (
              <Badge
                className='max-w-full'
                variant='outline'
              >
                <span className='truncate'>{header.sourceLabel}</span>
              </Badge>
            ) : null}
          </div>
          {header.methods?.length ? (
            <div className='mt-2 flex flex-wrap gap-1'>
              {header.methods.map((method) => (
                <Badge
                  key={method.id}
                  variant='secondary'
                >
                  {method.method}={method.result}
                </Badge>
              ))}
            </div>
          ) : null}
          <pre
            className='bg-muted/30 text-foreground mt-2 rounded-md p-2 font-mono text-xs break-words
              whitespace-pre-wrap'
          >
            {header.raw}
          </pre>
        </article>
      ))}
    </section>
  )
}

function OriginalSourceHeaderSection({
  section
}: {
  section: NonNullable<AuthenticatedMailOriginalSourceView['headerSections']>[number]
}) {
  return (
    <section className='grid gap-2'>
      <div className='grid gap-1'>
        <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          {section.title}
        </h3>
        {section.description ? <p className='text-muted-foreground text-xs'>{section.description}</p> : null}
      </div>
      {section.headers.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-40'>Header</TableHead>
              <TableHead className='w-44'>Layer</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {section.headers.map((header, index) => (
              <TableRow key={`${header.name}-${index}`}>
                <TableCell className='text-foreground font-mono text-xs whitespace-normal'>
                  {header.name}
                </TableCell>
                <TableCell className='text-muted-foreground text-xs whitespace-normal'>
                  {header.layer ?? ''}
                </TableCell>
                <TableCell className='font-mono text-xs break-words whitespace-pre-wrap'>
                  {header.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className='text-muted-foreground text-sm'>{section.emptyMessage ?? 'No headers available.'}</p>
      )}
    </section>
  )
}

function OriginalSourceRawSection({
  rawSource
}: {
  rawSource: NonNullable<AuthenticatedMailOriginalSourceView['rawSources']>[number]
}) {
  return (
    <section className='grid gap-2'>
      <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        {rawSource.title}
      </h3>
      {rawSource.source ? (
        <pre
          className='bg-muted/30 text-foreground rounded-md border p-3 font-mono text-xs break-words
            whitespace-pre-wrap'
        >
          {rawSource.source}
        </pre>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {rawSource.emptyMessage ?? 'Source is not available.'}
        </p>
      )}
    </section>
  )
}

function hasStructuredOriginalSource(view?: AuthenticatedMailOriginalSourceView) {
  return Boolean(
    view?.evidence?.length ||
    view?.authenticationHeaders?.length ||
    view?.headerSections?.length ||
    view?.rawSources?.length
  )
}

function hasOriginalSourceDownload(view?: AuthenticatedMailOriginalSourceView) {
  return Boolean(view?.source || view?.rawSources?.some((rawSource) => rawSource.source))
}

export interface AuthenticatedSidebarProps {
  onAccountSelect?: (accountId: string) => void
  onComposeOpen?: () => void
  onFolderAction?: (
    action: AuthenticatedMailFolderAction,
    folder: AuthenticatedSidebarView['navMain'][number]
  ) => void
  onFolderCreateNameChange?: (name: string) => void
  onFolderCreateOpenChange?: (open: boolean) => void
  onFolderCreateSubmit?: () => void
  onFolderDeleteConfirm?: () => void
  onFolderDeleteOpenChange?: (open: boolean) => void
  onFolderRenameNameChange?: (name: string) => void
  onFolderRenameOpenChange?: (open: boolean) => void
  onFolderRenameSubmit?: () => void
  onMailSelect?: (mailId: string) => void
  onPageChange?: (pageChange: AuthenticatedMailPageChange) => void
  onRetry?: () => void
  onSearchChange?: (query: string) => void
  onSelectItem?: (itemId: string) => void
  view: AuthenticatedSidebarView
}

export function AuthenticatedSidebar({
  onAccountSelect,
  onComposeOpen,
  onFolderAction,
  onFolderCreateNameChange,
  onFolderCreateOpenChange,
  onFolderCreateSubmit,
  onFolderDeleteConfirm,
  onFolderDeleteOpenChange,
  onFolderRenameNameChange,
  onFolderRenameOpenChange,
  onFolderRenameSubmit,
  onMailSelect,
  onPageChange,
  onRetry,
  onSearchChange,
  onSelectItem,
  view
}: AuthenticatedSidebarProps) {
  const { setOpen } = useSidebar()
  const managementNavGroups = getSidebarManagementNavGroups(view)
  const activeManagementItem = getSidebarManagementNavItems(view).find(
    (item) => item.id === view.activeItemId
  )
  const hasExplicitlyNoAccounts = view.mailboxMode === 'no-mailbox'
  const workspaceSwitcherWorkspaces = getSidebarWorkspaceSwitcherWorkspaces(view)
  const workspaceSwitcherActiveWorkspaceId =
    view.workspaceSwitcher?.activeWorkspaceId ?? workspaceSwitcherWorkspaces[0]?.id
  const workspaceSwitcherMailboxes = getSidebarWorkspaceSwitcherMailboxes(view.accounts ?? [])
  const workspaceSwitcherState = getSidebarWorkspaceSwitcherState(view)
  const activeMailNavItem = view.navMain.find((item) => item.id === view.activeItemId)
  const activeFolderActions = activeMailNavItem?.actions ?? []

  return (
    <>
      <Sidebar
        collapsible='icon'
        className='overflow-hidden *:data-[sidebar=sidebar]:flex-row'
      >
        <Sidebar
          collapsible='none'
          className='w-[calc(var(--sidebar-width-icon)+1px)]! border-r'
        >
          <SidebarHeader>
            <WorkspaceMailboxSwitcher
              activeMailboxId={view.activeAccountId}
              activeWorkspaceId={workspaceSwitcherActiveWorkspaceId}
              className='md:h-8 md:p-0'
              iconOnly
              mailboxes={workspaceSwitcherMailboxes}
              onMailboxSelect={onAccountSelect}
              state={workspaceSwitcherState}
              workspaces={workspaceSwitcherWorkspaces}
            />
          </SidebarHeader>
          <SidebarContent className='[scrollbar-gutter:auto] overflow-hidden'>
            <SidebarGroup>
              <SidebarGroupContent className='px-1.5 md:px-0'>
                {view.state === 'loading' ? (
                  <SidebarRailLoading />
                ) : (
                  <SidebarMenu>
                    {view.navMain.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <MailNavButton
                          item={item}
                          isActive={item.id === view.activeItemId}
                          onSelect={() => {
                            onSelectItem?.(item.id)
                            setOpen(true)
                          }}
                        />
                      </SidebarMenuItem>
                    ))}
                    {view.folderCreate ? (
                      <SidebarMenuItem>
                        <CreateMailFolderButton
                          disabled={!onFolderCreateOpenChange}
                          label={view.folderCreate.triggerLabel ?? 'Create folder'}
                          onOpen={() => {
                            onFolderCreateOpenChange?.(true)
                            setOpen(true)
                          }}
                        />
                      </SidebarMenuItem>
                    ) : null}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            {managementNavGroups.length ? (
              <div className='grid gap-1'>
                {managementNavGroups.map((group, index) => (
                  <React.Fragment key={group.id}>
                    {index > 0 ? <SidebarSeparator className='my-0.5' /> : null}
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.id}>
                          <ManagementNavButton
                            item={item}
                            isActive={item.id === view.activeItemId}
                            onSelect={() => {
                              onSelectItem?.(item.id)
                              setOpen(false)
                            }}
                          />
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </React.Fragment>
                ))}
              </div>
            ) : null}
            <UserButton
              align='start'
              sideOffset={8}
              size='icon'
            />
          </SidebarFooter>
        </Sidebar>

        {!activeManagementItem ? (
          <Sidebar
            collapsible='none'
            className='hidden min-w-0 flex-1 md:flex'
          >
            <SidebarHeader className='gap-3 border-b p-3'>
              <div className='flex w-full items-center justify-between gap-2'>
                <div className='flex min-w-0 items-center gap-1.5'>
                  <div className='text-foreground truncate text-base font-medium'>{view.paneTitle}</div>
                  {activeMailNavItem && activeFolderActions.length ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`${activeMailNavItem.title} folder options`}
                          className='size-7 shrink-0'
                          disabled={!onFolderAction}
                          size='icon'
                          type='button'
                          variant='ghost'
                        >
                          <DotsThreeIcon data-icon='icon-only' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align='start'
                        side='bottom'
                      >
                        {activeFolderActions.map((action) => {
                          const ActionIcon = folderActionIcons[action.action]

                          return (
                            <DropdownMenuItem
                              disabled={action.disabled || action.pending || !onFolderAction}
                              key={action.action}
                              onSelect={() => {
                                onFolderAction?.(action.action, activeMailNavItem)
                              }}
                              variant={action.action === 'delete-folder' ? 'destructive' : 'default'}
                            >
                              {action.pending ? (
                                <Spinner data-icon='inline-start' />
                              ) : (
                                <ActionIcon data-icon='inline-start' />
                              )}
                              <span className='grid min-w-0 gap-0.5'>
                                <span className='truncate'>{action.label}</span>
                                {action.disabledReason ? (
                                  <span className='text-muted-foreground truncate text-xs'>
                                    {action.disabledReason}
                                  </span>
                                ) : null}
                              </span>
                            </DropdownMenuItem>
                          )
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
                <Button
                  className='shrink-0'
                  disabled={!onComposeOpen || hasExplicitlyNoAccounts}
                  onClick={onComposeOpen}
                  size='sm'
                  type='button'
                >
                  <PencilSimpleIcon data-icon='inline-start' />
                  Compose
                </Button>
              </div>
              <SidebarInput
                onChange={(event) => {
                  onSearchChange?.(event.currentTarget.value)
                }}
                placeholder='Type to search...'
                readOnly={!onSearchChange}
                value={view.searchQuery ?? ''}
              />
            </SidebarHeader>
            <SidebarContent className='gap-0 overflow-hidden'>
              <SidebarGroup className='min-h-0 flex-1 p-0'>
                <SidebarGroupContent className='flex min-h-0 flex-1 flex-col'>
                  <div className='min-h-0 flex-1 overflow-auto'>
                    <MailboxList
                      onSelectMail={onMailSelect}
                      onRetry={onRetry}
                      view={view}
                    />
                  </div>
                  <MailboxPagination
                    onPageChange={onPageChange}
                    pagination={view.pagination}
                  />
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        ) : null}
      </Sidebar>
      <CreateMailFolderDialog
        onNameChange={onFolderCreateNameChange}
        onOpenChange={onFolderCreateOpenChange}
        onSubmit={onFolderCreateSubmit}
        view={view.folderCreate}
      />
      <RenameMailFolderDialog
        onNameChange={onFolderRenameNameChange}
        onOpenChange={onFolderRenameOpenChange}
        onSubmit={onFolderRenameSubmit}
        view={view.folderRename}
      />
      <DeleteMailFolderDialog
        onConfirm={onFolderDeleteConfirm}
        onOpenChange={onFolderDeleteOpenChange}
        view={view.folderDelete}
      />
    </>
  )
}

function CreateMailFolderButton({
  disabled,
  label,
  onOpen
}: {
  disabled?: boolean
  label: string
  onOpen: () => void
}) {
  return (
    <SidebarMenuButton
      className='px-2.5 md:px-2'
      disabled={disabled}
      onClick={onOpen}
      tooltip={{
        children: label,
        hidden: false
      }}
    >
      <PlusIcon />
      <span className='sr-only'>{label}</span>
    </SidebarMenuButton>
  )
}

function CreateMailFolderDialog({
  onNameChange,
  onOpenChange,
  onSubmit,
  view
}: {
  onNameChange?: (name: string) => void
  onOpenChange?: (open: boolean) => void
  onSubmit?: () => void
  view?: AuthenticatedMailCreateFolderView
}) {
  if (!view) {
    return null
  }

  const isOpen = view.state === 'open'
  const isSubmitting = view.isSubmitting === true
  const folderName = view.name.trim()
  const submitDisabled = !onSubmit || isSubmitting || folderName.length === 0

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <form
          className='grid gap-4'
          onSubmit={(event) => {
            event.preventDefault()
            if (!submitDisabled) {
              onSubmit?.()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{view.title}</DialogTitle>
            {view.description ? <DialogDescription>{view.description}</DialogDescription> : null}
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='authenticated-mail-folder-name'>Folder name</Label>
            <Input
              disabled={isSubmitting || !onNameChange}
              id='authenticated-mail-folder-name'
              onChange={(event) => {
                onNameChange?.(event.currentTarget.value)
              }}
              placeholder={view.placeholder ?? 'Projects'}
              value={view.name}
            />
          </div>
          {view.errorMessage ? (
            <div
              className='text-destructive bg-destructive/5 border-destructive/30 rounded-md border px-3 py-2
                text-sm'
            >
              {view.errorMessage}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                disabled={isSubmitting}
                type='button'
                variant='outline'
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={submitDisabled}
              type='submit'
            >
              {isSubmitting ? <Spinner data-icon='inline-start' /> : <PlusIcon data-icon='inline-start' />}
              {view.submitLabel ?? 'Create folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RenameMailFolderDialog({
  onNameChange,
  onOpenChange,
  onSubmit,
  view
}: {
  onNameChange?: (name: string) => void
  onOpenChange?: (open: boolean) => void
  onSubmit?: () => void
  view?: AuthenticatedSidebarView['folderRename']
}) {
  if (!view) {
    return null
  }

  const isOpen = view.state === 'open'
  const isSubmitting = view.isSubmitting === true
  const folderName = view.name.trim()
  const submitDisabled = !onSubmit || isSubmitting || folderName.length === 0

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <form
          className='grid gap-4'
          onSubmit={(event) => {
            event.preventDefault()
            if (!submitDisabled) {
              onSubmit?.()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{view.title}</DialogTitle>
            {view.description ? <DialogDescription>{view.description}</DialogDescription> : null}
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='authenticated-mail-folder-rename-name'>Folder name</Label>
            <Input
              disabled={isSubmitting || !onNameChange}
              id='authenticated-mail-folder-rename-name'
              onChange={(event) => {
                onNameChange?.(event.currentTarget.value)
              }}
              placeholder={view.placeholder ?? 'Archive'}
              value={view.name}
            />
          </div>
          {view.errorMessage ? (
            <div
              className='text-destructive bg-destructive/5 border-destructive/30 rounded-md border px-3 py-2
                text-sm'
            >
              {view.errorMessage}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                disabled={isSubmitting}
                type='button'
                variant='outline'
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={submitDisabled}
              type='submit'
            >
              {isSubmitting ? (
                <Spinner data-icon='inline-start' />
              ) : (
                <PencilSimpleIcon data-icon='inline-start' />
              )}
              {view.submitLabel ?? 'Rename folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteMailFolderDialog({
  onConfirm,
  onOpenChange,
  view
}: {
  onConfirm?: () => void
  onOpenChange?: (open: boolean) => void
  view?: AuthenticatedSidebarView['folderDelete']
}) {
  if (!view) {
    return null
  }

  return (
    <AlertDialog
      open={view.state === 'open'}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TrashIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{view.title}</AlertDialogTitle>
          <AlertDialogDescription>{view.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {view.errorMessage ? (
          <div
            className='text-destructive bg-destructive/5 border-destructive/30 rounded-md border px-3 py-2
              text-sm'
          >
            {view.errorMessage}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={view.isSubmitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!onConfirm || view.isSubmitting}
            onClick={(event) => {
              event.preventDefault()
              onConfirm?.()
            }}
            variant='destructive'
          >
            {view.isSubmitting ? <Spinner data-icon='inline-start' /> : null}
            {view.confirmLabel ?? 'Delete folder'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const mailNavIcons = {
  drafts: FileIcon,
  folder: FolderIcon,
  inbox: TrayIcon,
  junk: ArchiveIcon,
  sent: PaperPlaneTiltIcon,
  trash: TrashIcon
} satisfies Record<AuthenticatedMailNavIconKey, React.ComponentType<{ className?: string }>>

const managementNavIcons = {
  accounts: AddressBookIcon,
  agents: UserIcon,
  groups: UsersThreeIcon,
  setup: FlagPennantIcon
} satisfies Record<AuthenticatedManagementNavIconKey, React.ComponentType<{ className?: string }>>

function MailNavButton({
  isActive,
  item,
  onSelect
}: {
  isActive: boolean
  item: AuthenticatedSidebarView['navMain'][number]
  onSelect: () => void
}) {
  const Icon = mailNavIcons[item.iconKey]
  const disabled = item.disabled || item.selectable === false
  const tooltip = item.disabledReason ? `${item.title}: ${item.disabledReason}` : item.title

  return (
    <>
      <SidebarMenuButton
        aria-disabled={disabled ? 'true' : undefined}
        data-disabled={disabled ? 'true' : undefined}
        tooltip={{
          children: tooltip,
          hidden: false
        }}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault()
            return
          }
          onSelect()
        }}
        isActive={isActive}
        className={
          disabled
            ? `hover:text-sidebar-foreground active:text-sidebar-foreground cursor-not-allowed px-2.5
              opacity-50 hover:bg-transparent active:bg-transparent aria-disabled:pointer-events-auto md:px-2`
            : 'px-2.5 md:px-2'
        }
        title={disabled ? tooltip : undefined}
        type='button'
      >
        <Icon />
        <span className='sr-only'>{item.title}</span>
        {item.badgeLabel ? <span className='sr-only'>{item.badgeLabel}</span> : null}
      </SidebarMenuButton>
    </>
  )
}

const folderActionIcons = {
  'delete-folder': TrashIcon,
  'rename-folder': PencilSimpleIcon
} satisfies Record<
  AuthenticatedMailFolderAction,
  React.ComponentType<{ 'data-icon'?: string; className?: string }>
>

function getSidebarWorkspaceSwitcherWorkspaces(
  view: AuthenticatedSidebarView
): ReadonlyArray<AuthenticatedWorkspaceSwitcherWorkspace> {
  return view.workspaceSwitcher?.workspaces ?? []
}

function getSidebarWorkspaceSwitcherMailboxes(
  accounts: ReadonlyArray<AuthenticatedMailAccount>
): ReadonlyArray<WorkspaceMailboxSwitcherMailbox> {
  return accounts.map((account) => ({
    address: account.address,
    badgeLabel: getMailboxAccountBadgeLabel(account),
    disabled: account.disabled || account.state === 'loading',
    disabledReason: account.disabledReason ?? (account.state === 'loading' ? 'Loading' : undefined),
    id: account.id,
    name: account.name,
    status: account.state === 'attention' ? 'attention' : 'ready'
  }))
}

function getMailboxAccountBadgeLabel(account: AuthenticatedMailAccount) {
  if (account.state === 'attention') {
    return 'Attention'
  }

  if (account.state === 'loading') {
    return 'Loading'
  }

  return undefined
}

function getSidebarWorkspaceSwitcherState(view: AuthenticatedSidebarView): WorkspaceMailboxSwitcherState {
  if (view.state === 'loading') {
    return 'loading'
  }

  if (view.accounts && view.accounts.length === 0) {
    return 'empty'
  }

  return 'ready'
}

function getSidebarManagementNavGroups(
  view: AuthenticatedSidebarView
): ReadonlyArray<AuthenticatedManagementNavGroup> {
  if (view.managementNavGroups) {
    return view.managementNavGroups.filter((group) => group.items.length > 0)
  }

  return view.managementNav?.length
    ? [
        {
          id: 'management',
          items: view.managementNav
        }
      ]
    : []
}

function getSidebarManagementNavItems(
  view: AuthenticatedSidebarView
): ReadonlyArray<AuthenticatedManagementNavItem> {
  return getSidebarManagementNavGroups(view).flatMap((group) => group.items)
}

function ManagementNavButton({
  isActive,
  item,
  onSelect
}: {
  isActive: boolean
  item: AuthenticatedManagementNavItem
  onSelect: () => void
}) {
  const Icon = managementNavIcons[item.iconKey]

  return (
    <SidebarMenuButton
      tooltip={{
        children: item.title,
        hidden: false
      }}
      onClick={onSelect}
      isActive={isActive}
      className={cn(
        'px-2.5 md:px-2',
        item.tone === 'accent' &&
          `text-primary ring-primary/65 hover:bg-primary/5 hover:text-primary data-[active=true]:text-primary
          bg-transparent font-medium ring-1 ring-inset data-[active=true]:bg-transparent`
      )}
    >
      <Icon />
      <span className='sr-only'>{item.title}</span>
    </SidebarMenuButton>
  )
}

export function AuthenticatedDashboardContent({
  firstMailboxSetupState,
  onAttachmentPreview,
  onEmailAction,
  domainSettingsState,
  onOnboardingConnect,
  onRetry,
  view = defaultAuthenticatedDashboardView
}: {
  firstMailboxSetupState?: FirstMailboxSetupState
  onAttachmentPreview?: (attachment: AuthenticatedEmailAttachment, email: AuthenticatedEmailPreview) => void
  domainSettingsState?: DomainSettingsState
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
  onOnboardingConnect?: () => void
  onRetry?: () => void
  view?: AuthenticatedDashboardView
}) {
  if (view.state === 'loading') {
    return <EmailPreviewLoadingPane />
  }

  if (view.state === 'error') {
    return (
      <EmailPreviewErrorPane
        description={view.errorDescription ?? 'Message details could not be loaded.'}
        onRetry={onRetry}
        retryLabel={view.retryLabel}
        title={view.errorTitle ?? 'Message unavailable'}
      />
    )
  }

  if (view.state === 'empty') {
    if (view.onboardingPrompt) {
      return (
        <DashboardOnboardingPrompt
          domainSettingsState={domainSettingsState}
          firstMailboxSetupState={firstMailboxSetupState}
          onConnect={onOnboardingConnect}
          view={view.onboardingPrompt}
        />
      )
    }

    return (
      <EmailPreviewEmptyPane
        description={view.emptyDescription}
        title={view.emptyTitle}
      />
    )
  }

  if (view.selectedEmail) {
    return (
      <EmailPreviewPane
        email={view.selectedEmail}
        onAttachmentPreview={onAttachmentPreview}
        onEmailAction={onEmailAction}
      />
    )
  }

  return (
    <EmailPreviewEmptyPane
      description='Choose a message from the mailbox to read it here.'
      title='Select a message'
    />
  )
}

function DashboardOnboardingPrompt({
  domainSettingsState,
  firstMailboxSetupState,
  onConnect,
  view
}: {
  domainSettingsState?: DomainSettingsState
  firstMailboxSetupState?: FirstMailboxSetupState
  onConnect?: () => void
  view: NonNullable<AuthenticatedDashboardView['onboardingPrompt']>
}) {
  const isConnecting = view.state === 'connecting'
  const onboardingDomainSettingsState =
    view.mode === 'configureDomain'
      ? toOnboardingDomainSettingsState(domainSettingsState, isConnecting)
      : domainSettingsState

  if (view.mode === 'createMailbox') {
    return (
      <div className='flex min-h-[calc(100dvh-3.5rem)] items-center justify-center p-6'>
        <FirstMailboxSetupCard state={firstMailboxSetupState} />
      </div>
    )
  }

  if (view.mode === 'configureDomain') {
    return (
      <div className='flex min-h-[calc(100dvh-3.5rem)] items-center justify-center p-6'>
        <OnboardingDomainSettingsPanel
          className='w-full max-w-2xl'
          state={onboardingDomainSettingsState}
        />
      </div>
    )
  }

  return (
    <div className='flex min-h-[calc(100dvh-3.5rem)] items-center justify-center p-6'>
      <Card className='w-full max-w-md shadow-none'>
        <CardHeader>
          <CloudflareLogo className='mb-2 h-8 w-auto' />
          <CardTitle>{view.title}</CardTitle>
          <CardDescription>{view.description}</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3'>
          {view.state === 'error' ? (
            <div className='text-destructive flex items-start gap-2 text-sm'>
              <WarningIcon data-icon='inline-start' />
              <span>{view.errorDescription ?? 'Cloudflare could not be connected.'}</span>
            </div>
          ) : null}
          {view.helperText ? (
            <p className='text-muted-foreground text-sm leading-6'>{view.helperText}</p>
          ) : null}
        </CardContent>
        <CardFooter>
          <CloudflareConnectButton
            busy={isConnecting}
            disabled={isConnecting || !onConnect}
            onClick={onConnect}
          >
            {isConnecting ? 'Connecting Cloudflare' : view.actionLabel}
          </CloudflareConnectButton>
        </CardFooter>
      </Card>
    </div>
  )
}

function toOnboardingDomainSettingsState(
  state: DomainSettingsState | undefined,
  isConnecting: boolean
): DomainSettingsState | undefined {
  if (!state || !isConnecting) {
    return state
  }

  const pendingDomain = state.status?.connections.find(
    (connection) => connection.status === 'provisioning' || connection.provisioningStatus === 'pending'
  )

  return {
    ...state,
    busy: true,
    draftDomain: state.draftDomain || pendingDomain?.domain || '',
    mode: 'addDomain',
    selectedAccountId: state.selectedAccountId || pendingDomain?.cloudflareAccountId || '',
    selectedDomainPublicId: null,
    selectedZoneId: state.selectedZoneId || pendingDomain?.cloudflareZoneId || ''
  }
}

function FirstMailboxSetupCard({ state }: { state?: FirstMailboxSetupState }) {
  const isCreating = state?.state === 'creating'
  const address = state?.addressLocalPart
    ? `${state.addressLocalPart}@${state.domain}`
    : `@${state?.domain ?? ''}`

  return (
    <Card className='mx-auto w-full max-w-md overflow-hidden shadow-none'>
      <form
        className='flex flex-col gap-6'
        onSubmit={(event) => {
          event.preventDefault()
          if (state?.canSubmit && !isCreating && !state.readOnly) {
            state.onSubmit?.()
          }
        }}
      >
        <CardHeader className='flex flex-col items-center px-6 text-center'>
          <div
            className='bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full
              border'
          >
            <UserIcon className='size-7' />
          </div>
          <Badge variant='secondary'>Domain ready</Badge>
          <CardTitle className='text-xl'>Create your first mailbox</CardTitle>
          <CardDescription className='max-w-md'>
            Start with your owner mailbox. You can add team and agent mailboxes later.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-5 px-6'>
          <div className='grid gap-2'>
            <Label htmlFor='first-mailbox-address'>Mailbox address</Label>
            <div
              className='grid grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden rounded-md border'
            >
              <Input
                aria-label='Mailbox local part'
                className='border-0 shadow-none focus-visible:ring-0'
                disabled={isCreating || state?.readOnly}
                id='first-mailbox-address'
                value={state?.addressLocalPart ?? ''}
                onChange={(event) => {
                  state?.onAddressLocalPartChange?.(event.currentTarget.value)
                }}
              />
              <span className='text-muted-foreground bg-muted/50 border-l px-3 py-2 text-sm'>
                @{state?.domain ?? 'domain'}
              </span>
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='first-mailbox-name'>Display name</Label>
            <Input
              disabled={isCreating || state?.readOnly}
              id='first-mailbox-name'
              value={state?.displayName ?? ''}
              onChange={(event) => {
                state?.onDisplayNameChange?.(event.currentTarget.value)
              }}
            />
          </div>
          <div className='rounded-md border px-4 py-3 text-sm'>
            <p className='font-medium'>{address}</p>
            <p className='text-muted-foreground mt-1'>
              This mailbox becomes the first active account for the domain.
            </p>
          </div>
          {state?.errorDescription ? (
            <div className='text-destructive flex items-start gap-2 text-sm'>
              <WarningIcon data-icon='inline-start' />
              <span>{state.errorDescription}</span>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className='flex-col gap-2'>
          <Button
            className='w-full'
            disabled={!state?.canSubmit || isCreating || state?.readOnly}
            type='submit'
          >
            {isCreating ? <Spinner data-icon='inline-start' /> : null}
            {isCreating ? 'Creating mailbox' : 'Create mailbox'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function EmailPreviewLoadingPane() {
  return (
    <main className='bg-background flex min-h-0 flex-1 flex-col overflow-hidden'>
      <div className='flex h-10 shrink-0 items-center justify-between gap-2 border-b px-2'>
        <div className='flex items-center gap-2'>
          <Skeleton className='size-8 rounded-md' />
          <Skeleton className='size-8 rounded-md' />
          <Skeleton className='size-8 rounded-md' />
          <Skeleton className='size-8 rounded-md' />
        </div>
        <div className='flex items-center gap-2'>
          <Skeleton className='size-8 rounded-md' />
          <Skeleton className='size-8 rounded-md' />
        </div>
      </div>
      <header className='border-b px-4 py-3'>
        <Skeleton className='h-5 w-72 max-w-full' />
        <div className='mt-3 flex items-start justify-between gap-3'>
          <div className='flex min-w-0 items-start gap-2.5'>
            <Skeleton className='size-8 shrink-0 rounded-full' />
            <div className='grid gap-2'>
              <Skeleton className='h-3 w-44' />
              <Skeleton className='h-3 w-32' />
            </div>
          </div>
          <Skeleton className='h-3 w-24 shrink-0' />
        </div>
      </header>
      <div className='bg-background flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-6'>
        <Skeleton className='h-4 w-48' />
        <Skeleton className='h-4 w-full max-w-3xl' />
        <Skeleton className='h-4 w-full max-w-4xl' />
        <Skeleton className='h-4 w-2/3 max-w-2xl' />
        <Skeleton className='mt-4 h-32 w-full max-w-xl' />
      </div>
    </main>
  )
}

function EmailPreviewEmptyPane({ description, title }: { description: string; title: string }) {
  return (
    <main className='bg-background flex min-h-0 flex-1 flex-col overflow-hidden'>
      <div className='bg-background flex min-h-0 flex-1 items-center justify-center border-b px-6 py-10'>
        <div className='flex max-w-sm flex-col items-center text-center'>
          <div
            className='bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full'
            aria-hidden='true'
          >
            <EnvelopeSimpleIcon data-icon='icon-only' />
          </div>
          <h2 className='text-foreground mt-4 text-sm font-semibold'>{title}</h2>
          <p className='text-muted-foreground mt-2 text-sm leading-6'>{description}</p>
        </div>
      </div>
    </main>
  )
}

function EmailPreviewErrorPane({
  description,
  onRetry,
  retryLabel = 'Retry',
  title
}: {
  description: string
  onRetry?: () => void
  retryLabel?: string
  title: string
}) {
  return (
    <main className='bg-background flex min-h-0 flex-1 flex-col overflow-hidden'>
      <div className='bg-background flex min-h-0 flex-1 items-center justify-center border-b px-6 py-10'>
        <div className='flex max-w-sm flex-col items-center text-center'>
          <div
            className='bg-destructive/10 text-destructive flex size-10 items-center justify-center
              rounded-full'
            aria-hidden='true'
          >
            <WarningIcon data-icon='icon-only' />
          </div>
          <h2 className='text-foreground mt-4 text-sm font-semibold'>{title}</h2>
          <p className='text-muted-foreground mt-2 text-sm leading-6'>{description}</p>
          <Button
            className='mt-4'
            disabled={!onRetry}
            onClick={onRetry}
            size='sm'
            type='button'
            variant='outline'
          >
            {retryLabel}
          </Button>
        </div>
      </div>
    </main>
  )
}

function EmailPreviewPane({
  email,
  onAttachmentPreview,
  onEmailAction
}: {
  email: AuthenticatedEmailPreview
  onAttachmentPreview?: (attachment: AuthenticatedEmailAttachment, email: AuthenticatedEmailPreview) => void
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
}) {
  const [selectedExternalLink, setSelectedExternalLink] = React.useState<AuthenticatedExternalLink | null>(
    null
  )
  const hasAttachments = Boolean(email.attachments?.length)
  const hasThread = Boolean(email.thread?.length)
  const selectedThreadMessage = email.thread?.find((message) => isSelectedThreadMessage(email, message))

  return (
    <main className='bg-background flex min-h-0 flex-1 flex-col overflow-hidden'>
      <EmailActionToolbar
        email={email}
        onEmailAction={onEmailAction}
      />
      <EmailDisplaySecurityBar
        email={email}
        onEmailAction={onEmailAction}
        onExternalLinkSelect={setSelectedExternalLink}
      />
      {hasThread ? (
        <div
          className='bg-background min-h-0 flex-1 overflow-auto'
          data-email-thread-scroll-region='thread'
        >
          <EmailPreviewHeader
            email={email}
            onEmailAction={onEmailAction}
            selectedThreadMessage={selectedThreadMessage}
          />
          {selectedThreadMessage?.state === 'collapsed' ? null : (
            <EmailSelectedThreadMessageBody
              email={email}
              message={selectedThreadMessage}
              onAttachmentPreview={onAttachmentPreview}
              onExternalLinkSelect={setSelectedExternalLink}
            />
          )}
          <EmailThreadView
            email={email}
            onAttachmentPreview={onAttachmentPreview}
            onEmailAction={onEmailAction}
            onExternalLinkSelect={setSelectedExternalLink}
          />
        </div>
      ) : (
        <>
          <EmailPreviewHeader email={email} />
          <div className='bg-background min-h-0 flex-1 overflow-auto'>
            <EmailMessageBodyFrame
              allowRemoteImages={email.remoteImagesAllowed}
              className={hasAttachments ? undefined : getEmailBodyFrameClass(email.bodySize ?? 'fill')}
              externalLinks={email.externalLinks ?? []}
              fitContent={hasAttachments}
              html={email.html}
              loading='lazy'
              onExternalLinkSelect={setSelectedExternalLink}
              title={`${email.subject} email body`}
            />
            <EmailAttachmentList
              attachments={email.attachments ?? []}
              onAttachmentPreview={
                onAttachmentPreview
                  ? (attachment) => {
                      onAttachmentPreview(attachment, email)
                    }
                : undefined
              }
            />
          </div>
        </>
      )}
      <ExternalLinkWarningDialog
        link={selectedExternalLink}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedExternalLink(null)
          }
        }}
      />
    </main>
  )
}

function EmailPreviewHeader({
  email,
  onEmailAction,
  selectedThreadMessage
}: {
  email: AuthenticatedEmailPreview
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
  selectedThreadMessage?: AuthenticatedEmailThreadMessage
}) {
  const selectedThreadActionTarget = selectedThreadMessage
    ? getThreadMessageActionTarget(email, selectedThreadMessage)
    : undefined
  const selectedThreadMessageIsCollapsed = selectedThreadMessage?.state === 'collapsed'
  const selectedThreadMessageAction: AuthenticatedEmailAction = selectedThreadMessageIsCollapsed
    ? 'expand-thread-message'
    : 'collapse-thread-message'
  const headerContent = (
    <div className='flex min-w-0 flex-1 items-center gap-3'>
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <h1 className='text-foreground min-w-0 truncate text-sm leading-5 font-semibold'>
            {email.subject}
          </h1>
          <EmailStateBadges email={email} />
        </div>
        <EmailMessageMeta
          className='mt-2 min-w-0'
          receivedAt={email.receivedAt}
          recipientEmail={email.recipientEmail}
          senderEmail={email.senderEmail}
          senderName={email.senderName}
          showDate={false}
        />
      </div>
    </div>
  )

  return (
    <header className='border-b'>
      {selectedThreadMessage && selectedThreadActionTarget ? (
        <div
          className={cn(
            'group/thread-row flex min-w-0 items-stretch transition-colors duration-150 ease-out',
            'hover:bg-muted/25 focus-within:bg-muted/25 active:bg-muted/30 motion-reduce:transition-none',
            'dark:hover:bg-muted/25 dark:focus-within:bg-muted/25 dark:active:bg-muted/30',
            !selectedThreadMessageIsCollapsed && 'bg-muted/15 dark:bg-muted/20'
          )}
        >
          <Button
            aria-label={`${
              selectedThreadMessageIsCollapsed ? 'Expand' : 'Collapse'
            } ${selectedThreadMessage.senderName} message`}
            aria-expanded={!selectedThreadMessageIsCollapsed}
            className='h-auto min-w-0 flex-1 shrink justify-start whitespace-normal rounded-none !bg-transparent
              px-4 py-3 text-left hover:!bg-transparent hover:text-inherit active:!bg-transparent
              focus-visible:!bg-transparent focus-visible:border-transparent focus-visible:ring-0'
            onClick={() => {
              onEmailAction?.(selectedThreadMessageAction, selectedThreadActionTarget)
            }}
            type='button'
            variant='ghost'
          >
            {headerContent}
          </Button>
          <EmailThreadRowActions
            actions={selectedThreadActionTarget.actions ?? []}
            cluster='selected'
            isStarred={selectedThreadActionTarget.isStarred}
            onAction={(action) => {
              onEmailAction?.(action, selectedThreadActionTarget)
            }}
            receivedAt={selectedThreadActionTarget.receivedAt}
            senderName={selectedThreadActionTarget.senderName}
          />
        </div>
      ) : (
        <div className='flex min-w-0 items-center justify-between gap-3 px-4 py-3'>
          {headerContent}
          <div
            className='flex shrink-0 items-center gap-1.5'
            data-email-thread-date-cluster='selected'
          >
            <LocalDateTime
              className='text-muted-foreground shrink-0 text-xs whitespace-nowrap'
              value={email.receivedAt}
            />
          </div>
        </div>
      )}
    </header>
  )
}

function EmailStateBadges({ email }: { email: AuthenticatedEmailPreview }) {
  if (!email.isDraft && !email.isStarred && !email.isUnread) {
    return null
  }

  return (
    <span className='flex min-w-0 flex-wrap gap-1'>
      {email.isDraft ? <Badge variant='secondary'>Draft</Badge> : null}
      {email.isStarred ? <Badge variant='outline'>Starred</Badge> : null}
      {email.isUnread ? <Badge variant='outline'>Unread</Badge> : null}
    </span>
  )
}

function EmailThreadRowActions({
  actions,
  cluster,
  isStarred,
  onAction,
  receivedAt,
  senderName
}: {
  actions: ReadonlyArray<AuthenticatedEmailToolbarAction>
  cluster: 'selected' | 'message' | 'collapsed'
  isStarred?: boolean
  onAction: (action: AuthenticatedEmailAction) => void
  receivedAt: string
  senderName: string
}) {
  const starAction = actions.find((action) => action.action === 'star' || action.action === 'unstar')
  const starIsActive = starAction?.action === 'unstar' || Boolean(isStarred)
  const menuActions = actions.filter(isThreadOverflowAction)

  return (
    <div
      className='flex shrink-0 items-center gap-1.5 py-3 pr-3 pl-1'
      data-email-thread-date-cluster={cluster}
    >
      {starAction ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={`${starAction.label} ${senderName} message`}
              aria-pressed={starIsActive}
              className={cn(
                'size-8 shrink-0 text-muted-foreground opacity-70 transition-opacity',
                'hover:text-foreground hover:opacity-100 focus-visible:opacity-100',
                'group-hover/thread-row:opacity-100 motion-reduce:transition-none',
                starIsActive && 'text-foreground opacity-100'
              )}
              disabled={starAction.disabled || starAction.pending}
              onClick={() => {
                onAction(starAction.action)
              }}
              size='icon'
              title={actionTitle(starAction)}
              type='button'
              variant='ghost'
            >
              {starAction.pending ? (
                <Spinner data-icon='icon-only' />
              ) : (
                <StarIcon
                  data-icon='icon-only'
                  weight={starIsActive ? 'fill' : 'regular'}
                />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{actionTitle(starAction)}</TooltipContent>
        </Tooltip>
      ) : null}
      <LocalDateTime
        className='text-muted-foreground shrink-0 text-xs whitespace-nowrap'
        value={receivedAt}
      />
      {menuActions.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`More actions for ${senderName} message`}
              className='size-8 shrink-0 text-muted-foreground opacity-70 transition-opacity
                hover:text-foreground hover:opacity-100 focus-visible:opacity-100
                group-hover/thread-row:opacity-100 motion-reduce:transition-none'
              size='icon'
              title={`More actions for ${senderName} message`}
              type='button'
              variant='ghost'
            >
              <DotsThreeIcon data-icon='icon-only' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            side='bottom'
          >
            {menuActions.map((action, index) => {
              const Icon = emailActionIcons[action.iconKey]

              return (
                <React.Fragment key={action.action}>
                  {index > 0 && action.group !== menuActions[index - 1]?.group ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  <DropdownMenuItem
                    disabled={action.disabled || action.pending}
                    onSelect={() => {
                      onAction(action.action)
                    }}
                    title={actionTitle(action)}
                    variant={isDestructiveEmailAction(action.action) ? 'destructive' : 'default'}
                  >
                    {action.pending ? <Spinner data-icon='inline-start' /> : <Icon data-icon='inline-start' />}
                    {action.label}
                  </DropdownMenuItem>
                </React.Fragment>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

function isThreadOverflowAction(action: AuthenticatedEmailToolbarAction) {
  switch (action.action) {
    case 'back':
    case 'collapse-thread-message':
    case 'expand-thread-message':
    case 'show-remote-images':
    case 'star':
    case 'unstar':
      return false
    default:
      return true
  }
}

function isDestructiveEmailAction(action: AuthenticatedEmailAction) {
  return action === 'delete' || action === 'discard-draft'
}

function actionTitle(action: AuthenticatedEmailToolbarAction) {
  return action.disabledReason ? `${action.label}: ${action.disabledReason}` : action.label
}

function EmailMessageMeta({
  className,
  isDraft = false,
  receivedAt,
  recipientEmail,
  senderEmail,
  senderName,
  showDate = true
}: {
  className?: string
  isDraft?: boolean
  receivedAt: string
  recipientEmail: string
  senderEmail: string
  senderName: string
  showDate?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-3', className)}>
      <div className='flex min-w-0 items-center gap-2.5'>
        <div
          className='bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center
            rounded-full text-xs font-semibold'
          aria-hidden='true'
        >
          {getSenderInitial(senderName)}
        </div>
        <div className='min-w-0'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <span className='text-foreground min-w-0 truncate text-xs font-medium'>
              {senderName} <span className='text-muted-foreground font-normal'>{senderEmail}</span>
            </span>
            {isDraft ? (
              <Badge
                className='shrink-0'
                variant='secondary'
              >
                Draft
              </Badge>
            ) : null}
          </div>
          <div className='text-muted-foreground text-xs'>To: {recipientEmail}</div>
        </div>
      </div>
      {showDate ? (
        <LocalDateTime
          className='text-muted-foreground shrink-0 text-xs whitespace-nowrap'
          value={receivedAt}
        />
      ) : null}
    </div>
  )
}

function isSelectedThreadMessage(
  email: AuthenticatedEmailPreview,
  message: AuthenticatedEmailThreadMessage
) {
  return message.id === email.id && message.folderId === email.folderId
}

function EmailSelectedThreadMessageBody({
  email,
  message,
  onAttachmentPreview,
  onExternalLinkSelect
}: {
  email: AuthenticatedEmailPreview
  message: AuthenticatedEmailThreadMessage | undefined
  onAttachmentPreview?: (attachment: AuthenticatedEmailAttachment, email: AuthenticatedEmailPreview) => void
  onExternalLinkSelect?: (link: AuthenticatedExternalLink) => void
}) {
  if (!message) {
    return null
  }

  const messageActionTarget = getThreadMessageActionTarget(email, message)

  return (
    <article
      className='border-b'
      data-email-message-state='expanded'
    >
      <EmailMessageBodyFrame
        allowRemoteImages={message.remoteImagesAllowed}
        externalLinks={message.externalLinks ?? []}
        fitContent
        html={message.html}
        loading='eager'
        onExternalLinkSelect={onExternalLinkSelect}
        title={`${message.senderName} message body`}
      />
      <EmailAttachmentList
        attachments={message.attachments ?? []}
        onAttachmentPreview={
          onAttachmentPreview
            ? (attachment) => {
                onAttachmentPreview(attachment, messageActionTarget)
              }
            : undefined
        }
      />
      <EmailCollapsedQuoteList quotes={message.collapsedQuotes ?? []} />
    </article>
  )
}

function EmailMessageBodyFrame({
  allowRemoteImages = false,
  className,
  externalLinks = [],
  fitContent = false,
  html,
  loading,
  onExternalLinkSelect,
  title
}: {
  allowRemoteImages?: boolean
  className?: string
  externalLinks?: ReadonlyArray<AuthenticatedExternalLink>
  fitContent?: boolean
  html: string
  loading: 'eager' | 'lazy'
  onExternalLinkSelect?: (link: AuthenticatedExternalLink) => void
  title: string
}) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const cleanupFrameRef = React.useRef<() => void>(() => {})
  const baseURL = getCurrentBrowserHref()
  const externalLinkMap = React.useMemo(() => {
    const map = new Map<string, AuthenticatedExternalLink>()
    for (const link of externalLinks) {
      map.set(link.id, link)
    }
    return map
  }, [externalLinks])
  const emailDocumentThemeMode = useEmailDocumentThemeMode()
  const srcDoc = React.useMemo(
    () =>
      buildEmailIframeDocument({
        bodyHTML: html,
        csp: buildEmailContentSecurityPolicy({
          allowRemoteImages,
          sameOrigin: getCurrentBrowserOrigin()
        }),
        themeMode: emailDocumentThemeMode
      }),
    [allowRemoteImages, emailDocumentThemeMode, html]
  )
  const installFrameHandlers = React.useCallback(() => {
    const iframe = iframeRef.current
    const iframeDocument = iframe?.contentDocument
    if (!iframe || !iframeDocument?.body) {
      return
    }

    cleanupFrameRef.current()
    const cleanupCallbacks: Array<() => void> = []

    if (fitContent) {
      const resizeFrameToContent = () => {
        const documentElement = iframeDocument.documentElement
        const bodyHeight = Math.max(
          iframeDocument.body.getBoundingClientRect().height,
          iframeDocument.body.offsetHeight,
          iframeDocument.body.scrollHeight
        )
        const documentHeight = Math.max(
          documentElement.getBoundingClientRect().height,
          documentElement.offsetHeight,
          documentElement.scrollHeight
        )
        const nextHeight = Math.ceil(Math.max(bodyHeight, documentHeight, 1))

        iframe.height = String(nextHeight)
      }
      const FrameResizeObserver = iframeDocument.defaultView?.ResizeObserver

      resizeFrameToContent()

      if (FrameResizeObserver) {
        const resizeObserver = new FrameResizeObserver(resizeFrameToContent)
        resizeObserver.observe(iframeDocument.documentElement)
        resizeObserver.observe(iframeDocument.body)
        cleanupCallbacks.push(() => {
          resizeObserver.disconnect()
        })
      }
    }

    const findLinkTarget = (target: EventTarget | null) => {
      const frameElement = iframeDocument.defaultView?.Element
      let node: Element | null = frameElement && target instanceof frameElement ? target : null
      while (node && node !== iframeDocument.body) {
        if (node.tagName.toLowerCase() === 'a' && node.hasAttribute('data-agent-mail-external-link-id')) {
          return node
        }
        node = node.parentElement
      }
      return null
    }
    const openLinkWarning = (link: Element) => {
      const linkId = link.getAttribute('data-agent-mail-external-link-id') ?? ''
      const mappedLink = linkId ? externalLinkMap.get(linkId) : null
      if (mappedLink) {
        onExternalLinkSelect?.(mappedLink)
        return
      }

      const normalizedUrl = normalizeEmailLink(link.getAttribute('href'), baseURL)
      if (normalizedUrl) {
        onExternalLinkSelect?.({
          host: getUrlHost(normalizedUrl),
          id: linkId || normalizedUrl,
          url: normalizedUrl
        })
      }
    }
    const handleClick = (event: MouseEvent) => {
      const link = findLinkTarget(event.target)
      if (!link) {
        return
      }
      event.preventDefault()
      openLinkWarning(link)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }
      const link = findLinkTarget(event.target)
      if (!link) {
        return
      }
      event.preventDefault()
      openLinkWarning(link)
    }

    iframeDocument.addEventListener('click', handleClick)
    iframeDocument.addEventListener('keydown', handleKeyDown)
    cleanupFrameRef.current = () => {
      iframeDocument.removeEventListener('click', handleClick)
      iframeDocument.removeEventListener('keydown', handleKeyDown)
      for (const cleanupCallback of cleanupCallbacks) {
        cleanupCallback()
      }
    }
  }, [baseURL, externalLinkMap, fitContent, onExternalLinkSelect])

  React.useEffect(
    () => () => {
      cleanupFrameRef.current()
    },
    []
  )

  return (
    <iframe
      ref={iframeRef}
      className={cn('bg-background block w-full border-0', fitContent ? 'min-h-0' : className)}
      height={fitContent ? 1 : undefined}
      loading={loading}
      onLoad={installFrameHandlers}
      referrerPolicy='no-referrer'
      sandbox='allow-same-origin'
      srcDoc={srcDoc}
      title={title}
    />
  )
}

function EmailAttachmentList({
  attachments,
  onAttachmentPreview
}: {
  attachments: ReadonlyArray<AuthenticatedEmailAttachment>
  onAttachmentPreview?: (attachment: AuthenticatedEmailAttachment) => void
}) {
  if (!attachments.length) {
    return null
  }

  const baseURL = getCurrentBrowserHref()

  return (
    <div className='bg-muted/20 flex flex-wrap gap-2 border-b px-4 py-2'>
      {attachments.map((attachment) => {
        const safeAttachmentUrl = normalizeEmailAttachmentURL(attachment.url, baseURL)
        const canPreview = Boolean(
          safeAttachmentUrl && onAttachmentPreview && attachment.mimetype?.startsWith('image/')
        )
        const content = (
          <>
            {canPreview ? <ImageIcon data-icon='inline-start' /> : <PaperclipIcon data-icon='inline-start' />}
            <span className='max-w-48 truncate'>{attachment.filename}</span>
            {attachment.sizeLabel ? (
              <span className='text-muted-foreground shrink-0 text-xs'>{attachment.sizeLabel}</span>
            ) : null}
          </>
        )

        if (canPreview) {
          return (
            <Button
              aria-label={`Preview attachment ${attachment.filename}`}
              className='h-7 max-w-full gap-1.5 px-2 text-xs'
              key={attachment.id}
              onClick={() => {
                onAttachmentPreview?.(attachment)
              }}
              type='button'
              variant='outline'
            >
              {content}
            </Button>
          )
        }

        return safeAttachmentUrl ? (
          <Button
            asChild
            className='h-7 max-w-full gap-1.5 px-2 text-xs'
            key={attachment.id}
            variant='outline'
          >
            <a
              download={attachment.filename}
              href={safeAttachmentUrl}
            >
              {content}
            </a>
          </Button>
        ) : (
          <Badge
            className='max-w-full gap-1.5'
            key={attachment.id}
            title={attachment.url ? 'Attachment download unavailable' : undefined}
            variant='outline'
          >
            {content}
          </Badge>
        )
      })}
    </div>
  )
}

function EmailDisplaySecurityBar({
  email,
  onEmailAction,
  onExternalLinkSelect
}: {
  email: AuthenticatedEmailPreview
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
  onExternalLinkSelect: (link: AuthenticatedExternalLink) => void
}) {
  const blockedRemoteImageCount = email.remoteImagesAllowed ? 0 : (email.remoteImages?.length ?? 0)
  const externalLinks = email.externalLinks ?? []

  if (blockedRemoteImageCount === 0 && externalLinks.length === 0) {
    return null
  }

  return (
    <div
      className='bg-muted/30 text-muted-foreground flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2
        border-b px-4 py-2 text-xs'
    >
      {blockedRemoteImageCount > 0 ? (
        <div className='flex min-w-0 items-center gap-2'>
          <ImageIcon data-icon='inline-start' />
          <span>
            Remote images blocked from {blockedRemoteImageCount}{' '}
            {blockedRemoteImageCount === 1 ? 'source' : 'sources'}.
          </span>
          <Button
            className='h-6 px-2 text-xs'
            onClick={() => {
              onEmailAction?.('show-remote-images', email)
            }}
            size='sm'
            type='button'
            variant='outline'
          >
            Show images
          </Button>
        </div>
      ) : null}

      {externalLinks.length ? (
        <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
          <LinkIcon data-icon='inline-start' />
          <span>{externalLinks.length === 1 ? 'External link:' : 'External links:'}</span>
          {externalLinks.map((link) => (
            <button
              aria-label={`External link: ${link.host ?? link.text ?? link.url}`}
              className='hover:text-foreground max-w-56 truncate text-left underline-offset-2 hover:underline'
              key={link.id}
              onClick={() => {
                onExternalLinkSelect(link)
              }}
              type='button'
            >
              {link.host ?? link.text ?? link.url}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ExternalLinkWarningDialog({
  link,
  onOpenChange
}: {
  link: AuthenticatedExternalLink | null
  onOpenChange: (open: boolean) => void
}) {
  const normalizedUrl = React.useMemo(
    () => (link ? normalizeEmailLink(link.url, getCurrentBrowserHref()) : null),
    [link]
  )
  const displayHost = normalizedUrl ? (getUrlHost(normalizedUrl) ?? link?.host) : link?.host
  const displayUrl = normalizedUrl ?? link?.url

  return (
    <Dialog
      open={Boolean(link)}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <WarningIcon data-icon='inline-start' />
            Continue to external site?
          </DialogTitle>
          <DialogDescription>
            This link leaves AgentTeam Email. Verify the destination before continuing.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className='bg-muted/40 grid gap-1 rounded-md border p-3 text-sm'>
            <div className='text-foreground font-medium'>{displayHost || 'External destination'}</div>
            {displayUrl ? <div className='text-muted-foreground break-all'>{displayUrl}</div> : null}
            {!normalizedUrl ? (
              <div className='text-destructive text-xs'>
                This link cannot be opened because the destination is not a supported external URL.
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button
              type='button'
              variant='outline'
            >
              Cancel
            </Button>
          </DialogClose>
          {normalizedUrl ? (
            <Button asChild>
              <a
                href={normalizedUrl}
                rel='noreferrer noopener'
                target='_blank'
              >
                Continue
              </a>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmailActionToolbar({
  email,
  onEmailAction
}: {
  email: AuthenticatedEmailPreview
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
}) {
  const actions = email.actions ?? defaultAuthenticatedEmailToolbarActions
  const startActions = actions.filter((action) => action.section === 'start')
  const endActions = actions.filter((action) => action.section === 'end')
  const triggerAction = React.useCallback(
    (action: AuthenticatedEmailAction) => {
      onEmailAction?.(action, email)
    },
    [email, onEmailAction]
  )

  return (
    <div className='flex h-10 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b px-2'>
      <EmailToolbarButtonList
        actions={startActions}
        onAction={triggerAction}
      />

      <EmailToolbarButtonList
        actions={endActions}
        onAction={triggerAction}
      />
    </div>
  )
}

function EmailThreadView({
  email,
  onAttachmentPreview,
  onEmailAction,
  onExternalLinkSelect
}: {
  email: AuthenticatedEmailPreview
  onAttachmentPreview?: (attachment: AuthenticatedEmailAttachment, email: AuthenticatedEmailPreview) => void
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
  onExternalLinkSelect?: (link: AuthenticatedExternalLink) => void
}) {
  const visibleThreadMessages =
    email.thread?.filter((message) => !isSelectedThreadMessage(email, message)) ?? []

  return (
    <div className='bg-background flex flex-col'>
      {visibleThreadMessages.map((message, index) => (
        <EmailThreadMessageItem
          email={email}
          index={index}
          key={message.id}
          message={message}
          onAttachmentPreview={onAttachmentPreview}
          onEmailAction={onEmailAction}
          onExternalLinkSelect={onExternalLinkSelect}
        />
      ))}
      <div className='flex gap-2 px-4 py-3'>
        <Button
          onClick={() => {
            onEmailAction?.('reply', email)
          }}
          size='sm'
          type='button'
          variant='outline'
        >
          <ArrowBendUpLeftIcon data-icon='inline-start' />
          Reply
        </Button>
        <Button
          onClick={() => {
            onEmailAction?.('forward', email)
          }}
          size='sm'
          type='button'
          variant='outline'
        >
          <ArrowBendUpRightIcon data-icon='inline-start' />
          Forward
        </Button>
      </div>
    </div>
  )
}

function EmailThreadMessageItem({
  email,
  index,
  message,
  onAttachmentPreview,
  onEmailAction,
  onExternalLinkSelect
}: {
  email: AuthenticatedEmailPreview
  index: number
  message: NonNullable<AuthenticatedEmailPreview['thread']>[number]
  onAttachmentPreview?: (attachment: AuthenticatedEmailAttachment, email: AuthenticatedEmailPreview) => void
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
  onExternalLinkSelect?: (link: AuthenticatedExternalLink) => void
}) {
  const messageActionTarget = React.useMemo(
    () => getThreadMessageActionTarget(email, message),
    [email, message]
  )
  const triggerMessageAction = (action: AuthenticatedEmailAction) => {
    onEmailAction?.(action, messageActionTarget)
  }

  if (message.state === 'collapsed') {
    return (
      <EmailCollapsedThreadMessage
        message={message}
        onAction={triggerMessageAction}
        onExpand={() => {
          triggerMessageAction('expand-thread-message')
        }}
      />
    )
  }

  return (
    <article
      className='border-b last:border-b-0'
      data-email-message-state='expanded'
    >
      <div
        className='group/thread-row bg-muted/15 flex min-w-0 items-stretch transition-colors duration-150 ease-out
          hover:bg-muted/25 focus-within:bg-muted/25 active:bg-muted/30 motion-reduce:transition-none
          dark:bg-muted/20 dark:hover:bg-muted/25 dark:focus-within:bg-muted/25 dark:active:bg-muted/30'
      >
        <Button
          aria-label={`Collapse ${message.senderName} message`}
          aria-expanded
          className='h-auto min-w-0 flex-1 shrink justify-start whitespace-normal rounded-none !bg-transparent
            px-4 py-3 text-left hover:!bg-transparent hover:text-inherit active:!bg-transparent
            focus-visible:!bg-transparent focus-visible:border-transparent focus-visible:ring-0'
          onClick={() => {
            triggerMessageAction('collapse-thread-message')
          }}
          type='button'
          variant='ghost'
        >
          <EmailMessageMeta
            className='min-w-0 flex-1'
            isDraft={message.isDraft}
            receivedAt={message.receivedAt}
            recipientEmail={message.recipientEmail}
            senderEmail={message.senderEmail}
            senderName={message.senderName}
            showDate={false}
          />
        </Button>
        <EmailThreadRowActions
          actions={message.actions ?? []}
          cluster='message'
          isStarred={message.isStarred}
          onAction={triggerMessageAction}
          receivedAt={message.receivedAt}
          senderName={message.senderName}
        />
      </div>
      <EmailMessageBodyFrame
        allowRemoteImages={message.remoteImagesAllowed}
        externalLinks={message.externalLinks ?? []}
        fitContent
        html={message.html}
        loading={index === 0 ? 'eager' : 'lazy'}
        onExternalLinkSelect={onExternalLinkSelect}
        title={`${message.senderName} message body`}
      />
      <EmailAttachmentList
        attachments={message.attachments ?? []}
        onAttachmentPreview={
          onAttachmentPreview
            ? (attachment) => {
                onAttachmentPreview(attachment, messageActionTarget)
              }
            : undefined
        }
      />
      <EmailCollapsedQuoteList quotes={message.collapsedQuotes ?? []} />
    </article>
  )
}

function getThreadMessageActionTarget(
  email: AuthenticatedEmailPreview,
  message: AuthenticatedEmailThreadMessage
) {
  return {
    actions: message.actions,
    attachments: message.attachments,
    bodySize: message.bodySize,
    externalLinks: message.externalLinks,
    folderId: message.folderId,
    html: message.html,
    id: message.id,
    isDraft: message.isDraft,
    isStarred: message.isStarred,
    isUnread: message.isUnread,
    receivedAt: message.receivedAt,
    recipientEmail: message.recipientEmail,
    remoteImages: message.remoteImages,
    remoteImagesAllowed: message.remoteImagesAllowed,
    senderEmail: message.senderEmail,
    senderName: message.senderName,
    subject: email.subject,
    threadId: email.threadId ?? email.id
  } satisfies AuthenticatedEmailPreview
}

function EmailCollapsedThreadMessage({
  message,
  onAction,
  onExpand
}: {
  message: NonNullable<AuthenticatedEmailPreview['thread']>[number]
  onAction: (action: AuthenticatedEmailAction) => void
  onExpand: () => void
}) {
  return (
    <article
      className='border-b last:border-b-0'
      data-email-message-state='collapsed'
    >
      <div
        className='group/thread-row flex min-w-0 items-stretch transition-colors duration-150 ease-out
          hover:bg-muted/25 focus-within:bg-muted/25 active:bg-muted/30 motion-reduce:transition-none
          dark:hover:bg-muted/25 dark:focus-within:bg-muted/25 dark:active:bg-muted/30'
      >
        <Button
          aria-label={`Expand ${message.senderName} message`}
          aria-expanded={false}
          className='h-auto min-w-0 flex-1 shrink justify-start whitespace-normal rounded-none !bg-transparent
            px-4 py-3 text-left hover:!bg-transparent hover:text-inherit active:!bg-transparent
            focus-visible:!bg-transparent focus-visible:border-transparent focus-visible:ring-0'
          onClick={onExpand}
          type='button'
          variant='ghost'
        >
          <span className='flex min-w-0 flex-1 items-center gap-2.5'>
            <span
              className='bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center
                rounded-full text-xs font-semibold'
              aria-hidden='true'
            >
              {getSenderInitial(message.senderName)}
            </span>
            <span className='flex min-w-0 flex-1 flex-col gap-1'>
              <span className='flex min-w-0 items-center gap-1.5'>
                <span className='flex min-w-0 items-center gap-1.5'>
                  <span className='text-foreground min-w-0 truncate text-xs font-medium'>
                    {message.senderName}{' '}
                    <span className='text-muted-foreground font-normal'>{message.senderEmail}</span>
                  </span>
                  {message.isDraft ? (
                    <Badge
                      className='shrink-0'
                      variant='secondary'
                    >
                      Draft
                    </Badge>
                  ) : null}
                </span>
              </span>
              <span className='text-muted-foreground truncate text-xs'>To: {message.recipientEmail}</span>
              {message.teaser ? (
                <span className='text-muted-foreground mt-1 line-clamp-1 text-xs'>{message.teaser}</span>
              ) : null}
            </span>
          </span>
        </Button>
        <EmailThreadRowActions
          actions={message.actions ?? []}
          cluster='collapsed'
          isStarred={message.isStarred}
          onAction={onAction}
          receivedAt={message.receivedAt}
          senderName={message.senderName}
        />
      </div>
    </article>
  )
}

function EmailCollapsedQuoteList({
  quotes
}: {
  quotes: NonNullable<AuthenticatedEmailPreview['thread']>[number]['collapsedQuotes']
}) {
  if (!quotes?.length) {
    return null
  }

  return (
    <div className='border-t px-4 py-2'>
      {quotes.map((quote) => (
        <div
          className='text-muted-foreground flex min-w-0 items-center gap-2 pl-10 text-xs'
          key={quote.id}
        >
          <span
            className='bg-muted flex size-6 shrink-0 items-center justify-center rounded-full'
            aria-hidden='true'
          >
            <DotsThreeIcon data-icon='icon-only' />
          </span>
          <span className='min-w-0 truncate'>
            {quote.attribution ? `${quote.attribution}: ` : null}
            {quote.preview}
          </span>
        </div>
      ))}
    </div>
  )
}

function getSenderInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?'
}

function getCurrentBrowserHref() {
  return typeof globalThis.document === 'undefined'
    ? 'https://agent-mail.invalid/'
    : globalThis.document.baseURI
}

function getCurrentBrowserOrigin() {
  try {
    return new URL(getCurrentBrowserHref()).origin
  } catch {
    return undefined
  }
}

function useEmailDocumentThemeMode() {
  const [themeMode, setThemeMode] = React.useState<EmailIframeThemeMode | undefined>(
    readEmailDocumentThemeMode
  )

  React.useEffect(() => {
    if (typeof globalThis.document === 'undefined' || typeof globalThis.MutationObserver === 'undefined') {
      return undefined
    }

    const root = globalThis.document.documentElement
    const syncThemeMode = () => {
      setThemeMode(readEmailDocumentThemeMode())
    }
    const observer = new globalThis.MutationObserver(syncThemeMode)

    syncThemeMode()
    observer.observe(root, {
      attributeFilter: ['class', 'data-theme'],
      attributes: true
    })

    return () => {
      observer.disconnect()
    }
  }, [])

  return themeMode
}

function readEmailDocumentThemeMode(): EmailIframeThemeMode | undefined {
  if (typeof globalThis.document === 'undefined') {
    return undefined
  }

  const root = globalThis.document.documentElement
  const dataTheme = root.getAttribute('data-theme')
  if (dataTheme === 'dark' || dataTheme === 'light') {
    return dataTheme
  }
  if (root.classList.contains('dark')) {
    return 'dark'
  }
  if (root.classList.contains('light')) {
    return 'light'
  }
  return undefined
}

function getUrlHost(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol === 'mailto:') {
      return decodeURIComponent(url.pathname)
    }
    return url.host || undefined
  } catch {
    return undefined
  }
}

function getEmailBodyFrameClass(size: AuthenticatedEmailBodySize) {
  switch (size) {
    case 'compact':
      return 'h-[160px]'
    case 'standard':
      return 'h-[240px]'
    case 'tall':
      return 'h-[360px]'
    case 'fill':
      return 'h-full min-h-[calc(100svh-12.5rem)]'
  }
}

const emailActionIcons = {
  archive: ArchiveIcon,
  back: ArrowLeftIcon,
  'collapse-thread-message': CaretUpIcon,
  delete: TrashIcon,
  'discard-draft': TrashIcon,
  'edit-draft': PencilSimpleIcon,
  'expand-thread-message': CaretDownIcon,
  forward: ArrowBendUpRightIcon,
  'mark-not-spam': EnvelopeSimpleIcon,
  'mark-read': EnvelopeSimpleIcon,
  'mark-spam': WarningIcon,
  'mark-unread': EnvelopeSimpleIcon,
  more: DotsThreeIcon,
  move: FolderIcon,
  reply: ArrowBendUpLeftIcon,
  'reply-all': ArrowBendDoubleUpLeftIcon,
  restore: ArrowsClockwiseIcon,
  'send-draft': PaperPlaneTiltIcon,
  'show-remote-images': ImageIcon,
  snooze: DotsThreeIcon,
  star: StarIcon,
  unstar: StarIcon,
  'view-original': CodeIcon
} satisfies Record<
  AuthenticatedEmailActionIconKey,
  React.ComponentType<{ 'data-icon'?: string; className?: string }>
>

function EmailToolbarButtonList({
  actions,
  onAction
}: {
  actions: ReadonlyArray<AuthenticatedEmailToolbarAction>
  onAction: (action: AuthenticatedEmailAction) => void
}) {
  return (
    <div className='flex items-center gap-0.5'>
      {actions.map((action, index) => (
        <React.Fragment key={action.action}>
          {index > 0 && action.group !== actions[index - 1]?.group ? (
            <Separator
              className='mx-1 h-5'
              orientation='vertical'
            />
          ) : null}
          <EmailToolbarButton
            action={action}
            onAction={onAction}
          />
        </React.Fragment>
      ))}
    </div>
  )
}

function EmailToolbarButton({
  action,
  onAction
}: {
  action: AuthenticatedEmailToolbarAction
  onAction: (action: AuthenticatedEmailAction) => void
}) {
  const Icon = emailActionIcons[action.iconKey]
  const title = action.disabledReason ? `${action.label}: ${action.disabledReason}` : action.label
  const disabled = action.disabled || action.pending

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={action.label}
          className={cn('size-8', action.action === 'back' && 'md:hidden')}
          disabled={disabled}
          onClick={() => {
            onAction(action.action)
          }}
          size='icon'
          title={title}
          type='button'
          variant='ghost'
        >
          {action.pending ? <Spinner data-icon='icon-only' /> : <Icon data-icon='icon-only' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

function MailboxList({
  onSelectMail,
  onRetry,
  view
}: {
  onSelectMail?: (mailId: string) => void
  onRetry?: () => void
  view: AuthenticatedSidebarView
}) {
  const visibleMails = getVisibleMails(view)
  const isFiltered = Boolean(view.searchQuery?.trim()) || Boolean(view.unreadOnly)

  if (view.state === 'loading') {
    return (
      <div className='grid'>
        {Array.from({ length: 8 }, (_, index) => (
          <div
            className='flex flex-col items-start gap-2 border-b p-4 last:border-b-0'
            key={index}
          >
            <div className='flex w-full items-center gap-2'>
              <Skeleton className='h-4 w-28' />
              <Skeleton className='ml-auto h-3 w-14' />
            </div>
            <Skeleton className='h-4 w-40' />
            <Skeleton className='h-8 w-[260px]' />
          </div>
        ))}
      </div>
    )
  }

  if (view.state === 'error') {
    return (
      <div className='flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center'>
        <div
          className='bg-destructive/10 text-destructive flex size-9 items-center justify-center rounded-full'
          aria-hidden='true'
        >
          <WarningIcon data-icon='icon-only' />
        </div>
        <div className='grid gap-1'>
          <p className='font-medium'>{view.errorTitle ?? 'Mailbox unavailable'}</p>
          <p className='text-muted-foreground max-w-56 text-sm'>
            {view.errorDescription ?? 'Messages could not be loaded.'}
          </p>
        </div>
        <Button
          disabled={!onRetry}
          onClick={onRetry}
          size='sm'
          type='button'
          variant='outline'
        >
          {view.retryLabel ?? 'Retry'}
        </Button>
      </div>
    )
  }

  if (view.state === 'empty' || visibleMails.length === 0) {
    return (
      <div className='flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center'>
        <p className='font-medium'>
          {isFiltered && view.mails.length > 0 ? 'No matching messages' : view.emptyTitle}
        </p>
        <p className='text-muted-foreground max-w-56 text-sm'>
          {isFiltered && view.mails.length > 0
            ? 'Try another search or turn off the unread filter.'
            : view.emptyDescription}
        </p>
      </div>
    )
  }

  return visibleMails.map((mail) => (
    <div
      key={mail.id}
      data-mail-row-id={mail.id}
      className={cn(
        `group/mail-row hover:bg-sidebar-accent hover:text-sidebar-accent-foreground relative border-b text-sm
        leading-tight last:border-b-0`,
        mail.id === view.selectedMailId && 'bg-sidebar-accent text-sidebar-accent-foreground'
      )}
    >
      <button
        type='button'
        aria-current={mail.id === view.selectedMailId ? 'true' : undefined}
        onClick={() => {
          onSelectMail?.(mail.id)
        }}
        className='flex w-full flex-col items-start gap-2 p-4 text-left'
      >
        <div className='flex w-full min-w-0 items-center gap-2'>
          <span className={cn('min-w-0 truncate', mail.isUnread && 'font-semibold')}>
            {mail.isUnread ? (
              <span
                className='bg-primary mr-2 inline-block size-1.5 rounded-full align-middle'
                aria-hidden='true'
              />
            ) : null}
            {mail.name}
          </span>
          {mail.threadCountLabel ? (
            <Badge
              className='h-5 shrink-0 px-1.5 text-[0.6875rem]'
              variant='secondary'
            >
              {mail.threadCountLabel}
              <span className='sr-only'> messages</span>
            </Badge>
          ) : null}
          {mail.attachmentCountLabel ? (
            <span
              className='text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs'
              title={mail.attachmentCountLabel}
            >
              <PaperclipIcon
                className='size-3.5'
                data-icon='inline-start'
              />
              <span>{mail.attachmentCountLabel}</span>
            </span>
          ) : null}
          <LocalDateTime
            className='text-muted-foreground ml-auto shrink-0 text-xs'
            value={mail.date}
          />
        </div>
        <span className={cn('line-clamp-1 max-w-full font-medium', mail.isUnread && 'font-semibold')}>
          {mail.subject}
        </span>
        {mail.isDraft || mail.hasDraft || mail.isStarred || mail.needsReply ? (
          <span className='flex max-w-full flex-wrap gap-1'>
            {mail.isDraft ? <Badge variant='secondary'>Draft</Badge> : null}
            {mail.hasDraft ? <Badge variant='secondary'>Draft in thread</Badge> : null}
            {mail.isStarred ? <Badge variant='outline'>Starred</Badge> : null}
            {mail.needsReply ? (
              <Badge variant='outline'>
                <ArrowBendUpLeftIcon data-icon='inline-start' />
                Needs reply
              </Badge>
            ) : null}
          </span>
        ) : null}
        <span className='text-muted-foreground line-clamp-2 max-w-full text-xs whitespace-break-spaces'>
          {mail.teaser}
        </span>
      </button>
    </div>
  ))
}

function getVisibleMails(view: AuthenticatedSidebarView) {
  if (view.filterMode === 'server') {
    return view.mails
  }

  const query = view.searchQuery?.trim().toLocaleLowerCase()

  return view.mails.filter((mail) => {
    if (view.unreadOnly && !mail.isUnread) {
      return false
    }

    if (!query) {
      return true
    }

    return [mail.name, mail.email, mail.subject, mail.teaser].some((value) =>
      value.toLocaleLowerCase().includes(query)
    )
  })
}

function MailboxPagination({
  onPageChange,
  pagination
}: {
  onPageChange?: (pageChange: AuthenticatedMailPageChange) => void
  pagination?: AuthenticatedMailPagination
}) {
  if (!pagination) {
    return null
  }

  const isLoading = pagination.state === 'loading'

  return (
    <div className='bg-sidebar flex items-center justify-between gap-2 border-t p-3'>
      <div className='min-w-0'>
        <div className='text-foreground truncate text-xs font-medium'>{pagination.rangeLabel}</div>
        {pagination.totalLabel ? (
          <div className='text-muted-foreground truncate text-xs'>{pagination.totalLabel}</div>
        ) : null}
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        <Button
          aria-label='Previous page'
          className='size-8'
          disabled={!pagination.canGoPrevious || isLoading || !onPageChange}
          onClick={() => {
            onPageChange?.({
              cursor: pagination.previousCursor,
              direction: 'previous'
            })
          }}
          size='icon'
          type='button'
          variant='outline'
        >
          <CaretLeftIcon data-icon='icon-only' />
        </Button>
        <Button
          aria-label='Next page'
          className='size-8'
          disabled={!pagination.canGoNext || isLoading || !onPageChange}
          onClick={() => {
            onPageChange?.({
              cursor: pagination.nextCursor,
              direction: 'next'
            })
          }}
          size='icon'
          type='button'
          variant='outline'
        >
          {isLoading ? <Spinner data-icon='icon-only' /> : <CaretRightIcon data-icon='icon-only' />}
        </Button>
      </div>
    </div>
  )
}

function SidebarRailLoading() {
  return (
    <div className='grid gap-1'>
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton
          className='size-8 rounded-md'
          key={index}
        />
      ))}
    </div>
  )
}
