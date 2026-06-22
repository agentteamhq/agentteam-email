import * as React from 'react'
import {
  ArchiveIcon,
  ArrowBendDoubleUpLeftIcon,
  ArrowBendUpLeftIcon,
  ArrowBendUpRightIcon,
  ArrowLeftIcon,
  CodeIcon,
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  FileIcon,
  FolderIcon,
  ImageIcon,
  LinkIcon,
  PaperPlaneTiltIcon,
  StarIcon,
  TrashIcon,
  TrayIcon,
  WarningIcon,
  XIcon
} from '@phosphor-icons/react'

import { OrganizationSwitcher } from '../../components/auth/organization/organization-switcher'
import { UserButton } from '../../components/auth/user/user-button'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import { Label } from '../../components/ui/label'
import { Separator } from '../../components/ui/separator'
import { Skeleton } from '../../components/ui/skeleton'
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
  SidebarTrigger,
  useSidebar
} from '../../components/ui/sidebar'
import { Switch } from '../../components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip'
import { cn } from '../../lib/utils'
import { SettingsDialog } from './settings-dialog'
import {
  defaultAuthenticatedDashboardView,
  defaultAuthenticatedEmailToolbarActions,
  defaultAuthenticatedSidebarView
} from './authenticated-shell-models'
import type {
  AuthenticatedDashboardView,
  AuthenticatedEmailAction,
  AuthenticatedEmailActionIconKey,
  AuthenticatedEmailBodySize,
  AuthenticatedEmailPreview,
  AuthenticatedEmailToolbarAction,
  AuthenticatedExternalLink,
  AuthenticatedMailNavIconKey,
  AuthenticatedSidebarView
} from './authenticated-shell-models'
import type { CloudflareOAuthCallbackState, SettingsDialogContentState } from './settings-dialog'
import type { SettingsSectionId } from './settings-dialog-sections'

export interface AuthenticatedShellProps {
  children: React.ReactNode
  cloudflareOAuthCallback?: CloudflareOAuthCallbackState | null
  onMailSelect?: (mailId: string) => void
  onSettingsOpenChange: (open: boolean) => void
  onSettingsSectionChange: (section: SettingsSectionId) => void
  onSidebarItemSelect?: (itemId: string) => void
  onSidebarSearchChange?: (query: string) => void
  onSidebarUnreadOnlyChange?: (unreadOnly: boolean) => void
  settingsContentState?: SettingsDialogContentState
  settingsOpen: boolean
  settingsSection: SettingsSectionId
  sidebarView?: AuthenticatedSidebarView
  title?: string
}

export function AuthenticatedShell({
  children,
  cloudflareOAuthCallback,
  onMailSelect,
  onSettingsOpenChange,
  onSettingsSectionChange,
  onSidebarItemSelect,
  onSidebarSearchChange,
  onSidebarUnreadOnlyChange,
  settingsContentState,
  settingsOpen,
  settingsSection,
  sidebarView = defaultAuthenticatedSidebarView,
  title = 'Inbox'
}: AuthenticatedShellProps) {
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '350px'
        } as React.CSSProperties
      }
    >
      <AuthenticatedSidebar
        onMailSelect={onMailSelect}
        onSearchChange={onSidebarSearchChange}
        onSelectItem={onSidebarItemSelect}
        onUnreadOnlyChange={onSidebarUnreadOnlyChange}
        view={sidebarView}
      />
      <SidebarInset>
        <header className='bg-background sticky top-0 flex h-14 shrink-0 items-center gap-2 border-b px-4'>
          <SidebarTrigger />
          <span className='text-sm font-medium'>{title}</span>
        </header>
        {children}
      </SidebarInset>
      <SettingsDialog
        activeSection={settingsSection}
        cloudflareOAuthCallback={cloudflareOAuthCallback}
        contentState={settingsContentState}
        onActiveSectionChange={onSettingsSectionChange}
        onOpenChange={onSettingsOpenChange}
        open={settingsOpen}
        trigger={null}
      />
    </SidebarProvider>
  )
}

export interface AuthenticatedSidebarProps {
  onMailSelect?: (mailId: string) => void
  onSearchChange?: (query: string) => void
  onSelectItem?: (itemId: string) => void
  onUnreadOnlyChange?: (unreadOnly: boolean) => void
  view?: AuthenticatedSidebarView
}

export function AuthenticatedSidebar({
  onMailSelect,
  onSearchChange,
  onSelectItem,
  onUnreadOnlyChange,
  view = defaultAuthenticatedSidebarView
}: AuthenticatedSidebarProps) {
  const { setOpen } = useSidebar()
  const activeItem = view.navMain.find((item) => item.id === view.activeItemId) ?? view.navMain[0]

  return (
    <Sidebar
      collapsible='icon'
      className='overflow-hidden *:data-[sidebar=sidebar]:flex-row'
    >
      <Sidebar
        collapsible='none'
        className='w-[calc(var(--sidebar-width-icon)+1px)]! border-r'
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size='lg'
                asChild
                className='md:h-8 md:p-0'
              >
                <a href='#'>
                  <div
                    className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8
                      items-center justify-center rounded-lg'
                  >
                    <EnvelopeSimpleIcon className='size-4' />
                  </div>
                  <div className='grid flex-1 text-left text-sm leading-tight'>
                    <span className='truncate font-medium'>AgentTeam Email</span>
                    <span className='truncate text-xs'>Mail client</span>
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
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
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <UserButton
            align='start'
            sideOffset={8}
            size='icon'
          />
        </SidebarFooter>
      </Sidebar>

      <Sidebar
        collapsible='none'
        className='hidden min-w-0 flex-1 md:flex'
      >
        <SidebarHeader className='gap-3 border-b p-3'>
          <OrganizationSwitcher
            align='start'
            className='w-full justify-between border px-2'
            hideSlug={false}
          />
          <div className='flex w-full items-center justify-between'>
            <div className='text-foreground text-base font-medium'>{activeItem?.title ?? 'Inbox'}</div>
            <Label className='flex items-center gap-2 text-sm'>
              <span>Unreads</span>
              <Switch
                aria-label='Show unread messages only'
                checked={view.unreadOnly ?? false}
                className='shadow-none'
                onCheckedChange={onUnreadOnlyChange}
              />
            </Label>
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
        <SidebarContent>
          <SidebarGroup className='px-0'>
            <SidebarGroupContent>
              <MailboxList
                onSelectMail={onMailSelect}
                view={view}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </Sidebar>
  )
}

const mailNavIcons = {
  drafts: FileIcon,
  inbox: TrayIcon,
  junk: ArchiveIcon,
  sent: PaperPlaneTiltIcon,
  trash: TrashIcon
} satisfies Record<AuthenticatedMailNavIconKey, React.ComponentType<{ className?: string }>>

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

  return (
    <SidebarMenuButton
      tooltip={{
        children: item.title,
        hidden: false
      }}
      onClick={onSelect}
      isActive={isActive}
      className='px-2.5 md:px-2'
    >
      <Icon />
      <span>{item.title}</span>
    </SidebarMenuButton>
  )
}

export function AuthenticatedDashboardContent({
  onEmailAction,
  view = defaultAuthenticatedDashboardView
}: {
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
  view?: AuthenticatedDashboardView
}) {
  if (view.state === 'loading') {
    return <EmailPreviewLoadingPane />
  }

  if (view.state === 'empty') {
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
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-white px-5 py-6'>
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
      <div className='flex min-h-0 flex-1 items-center justify-center border-b bg-white px-6 py-10'>
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

function EmailPreviewPane({
  email,
  onEmailAction
}: {
  email: AuthenticatedEmailPreview
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
}) {
  const [selectedExternalLink, setSelectedExternalLink] = React.useState<AuthenticatedExternalLink | null>(
    null
  )

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
      <EmailPreviewHeader email={email} />
      <div className='min-h-0 flex-1 overflow-auto bg-white'>
        {email.thread?.length ? (
          <EmailThreadView
            email={email}
            onEmailAction={onEmailAction}
          />
        ) : (
          <EmailMessageBodyFrame
            className={getEmailBodyFrameClass(email.bodySize ?? 'fill')}
            html={email.html}
            loading='lazy'
            title={`${email.subject} email body`}
          />
        )}
      </div>
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

function EmailPreviewHeader({ email }: { email: AuthenticatedEmailPreview }) {
  return (
    <header className='border-b px-4 py-3'>
      <h1 className='text-foreground truncate text-sm leading-5 font-semibold'>{email.subject}</h1>
      <EmailMessageMeta
        className='mt-2'
        receivedAt={email.receivedAt}
        recipientEmail={email.recipientEmail}
        senderEmail={email.senderEmail}
        senderName={email.senderName}
      />
    </header>
  )
}

function EmailMessageMeta({
  className,
  receivedAt,
  recipientEmail,
  senderEmail,
  senderName
}: {
  className?: string
  receivedAt: string
  recipientEmail: string
  senderEmail: string
  senderName: string
}) {
  return (
    <div className={cn('flex min-w-0 items-start justify-between gap-3', className)}>
      <div className='flex min-w-0 items-start gap-2.5'>
        <div
          className='bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center
            rounded-full text-xs font-semibold'
          aria-hidden='true'
        >
          {getSenderInitial(senderName)}
        </div>
        <div className='min-w-0'>
          <div className='text-foreground truncate text-xs font-medium'>
            {senderName} <span className='text-muted-foreground font-normal'>{senderEmail}</span>
          </div>
          <div className='text-muted-foreground text-xs'>To: {recipientEmail}</div>
        </div>
      </div>
      <time className='text-muted-foreground shrink-0 text-xs whitespace-nowrap'>{receivedAt}</time>
    </div>
  )
}

function EmailMessageBodyFrame({
  className,
  html,
  loading,
  title
}: {
  className?: string
  html: string
  loading: 'eager' | 'lazy'
  title: string
}) {
  return (
    <iframe
      className={cn('block w-full border-0 bg-white', className)}
      loading={loading}
      referrerPolicy='no-referrer'
      sandbox=''
      srcDoc={html}
      title={title}
    />
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
            <div className='text-foreground font-medium'>{link.host ?? 'External destination'}</div>
            <div className='text-muted-foreground break-all'>{link.url}</div>
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
          {link ? (
            <Button asChild>
              <a
                href={link.url}
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
  onEmailAction
}: {
  email: AuthenticatedEmailPreview
  onEmailAction?: (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => void
}) {
  return (
    <div className='flex min-h-full flex-col bg-white'>
      {email.thread?.map((message, index) => (
        <EmailThreadMessageItem
          index={index}
          key={message.id}
          message={message}
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
  index,
  message
}: {
  index: number
  message: NonNullable<AuthenticatedEmailPreview['thread']>[number]
}) {
  if (message.state === 'collapsed') {
    return <EmailCollapsedThreadMessage message={message} />
  }

  return (
    <article
      className='border-b last:border-b-0'
      data-email-message-state='expanded'
    >
      <EmailMessageMeta
        className='px-4 py-3'
        receivedAt={message.receivedAt}
        recipientEmail={message.recipientEmail}
        senderEmail={message.senderEmail}
        senderName={message.senderName}
      />
      <EmailMessageBodyFrame
        className={getEmailBodyFrameClass(message.bodySize ?? 'standard')}
        html={message.html}
        loading={index === 0 ? 'eager' : 'lazy'}
        title={`${message.senderName} message body`}
      />
      <EmailCollapsedQuoteList quotes={message.collapsedQuotes ?? []} />
    </article>
  )
}

function EmailCollapsedThreadMessage({
  message
}: {
  message: NonNullable<AuthenticatedEmailPreview['thread']>[number]
}) {
  return (
    <article
      className='hover:bg-muted/25 border-b px-4 py-3 last:border-b-0'
      data-email-message-state='collapsed'
    >
      <EmailMessageMeta
        receivedAt={message.receivedAt}
        recipientEmail={message.recipientEmail}
        senderEmail={message.senderEmail}
        senderName={message.senderName}
      />
      {message.teaser ? (
        <p className='text-muted-foreground mt-2 line-clamp-1 pl-10 text-xs'>{message.teaser}</p>
      ) : null}
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
  back: ArrowLeftIcon,
  close: XIcon,
  delete: TrashIcon,
  forward: ArrowBendUpRightIcon,
  'mark-unread': EnvelopeSimpleIcon,
  more: DotsThreeIcon,
  move: FolderIcon,
  reply: ArrowBendUpLeftIcon,
  'reply-all': ArrowBendDoubleUpLeftIcon,
  'show-remote-images': ImageIcon,
  snooze: DotsThreeIcon,
  star: StarIcon,
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

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={action.label}
          className='size-8'
          disabled={action.disabled}
          onClick={() => {
            onAction(action.action)
          }}
          size='icon'
          title={title}
          type='button'
          variant='ghost'
        >
          <Icon data-icon='icon-only' />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

function MailboxList({
  onSelectMail,
  view
}: {
  onSelectMail?: (mailId: string) => void
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
    <button
      type='button'
      key={mail.id}
      aria-current={mail.id === view.selectedMailId ? 'true' : undefined}
      onClick={() => {
        onSelectMail?.(mail.id)
      }}
      className={cn(
        `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full flex-col items-start gap-2
        border-b p-4 text-left text-sm leading-tight last:border-b-0`,
        mail.id === view.selectedMailId && 'bg-sidebar-accent text-sidebar-accent-foreground'
      )}
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
        <span className='text-muted-foreground ml-auto shrink-0 text-xs'>{mail.date}</span>
      </div>
      <span className={cn('line-clamp-1 max-w-full font-medium', mail.isUnread && 'font-semibold')}>
        {mail.subject}
      </span>
      <span className='text-muted-foreground line-clamp-2 max-w-full text-xs whitespace-break-spaces'>
        {mail.teaser}
      </span>
    </button>
  ))
}

function getVisibleMails(view: AuthenticatedSidebarView) {
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
