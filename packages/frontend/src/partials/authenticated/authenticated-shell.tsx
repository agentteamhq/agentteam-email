import * as React from 'react'
import {
  ArchiveIcon,
  CommandIcon,
  FileIcon,
  PaperPlaneTiltIcon,
  TrayIcon,
  TrashIcon
} from '@phosphor-icons/react'
import type { WebappRouteUser } from '@main/backend/routes/webapp'

import { NavUser } from '../../components/nav-user'
import { Label } from '../../components/ui/label'
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
import {
  SettingsDialog,
  type SettingsDialogContentState,
  type SettingsSectionId
} from './settings-dialog'

type MailNavIcon = React.ComponentType<{ className?: string }>
export type AuthenticatedViewState = 'ready' | 'loading' | 'empty'

export interface AuthenticatedMailNavItem {
  icon: MailNavIcon
  id: string
  isActive?: boolean
  title: string
  url: string
}

export interface AuthenticatedMailItem {
  date: string
  email: string
  id: string
  name: string
  subject: string
  teaser: string
}

export interface AuthenticatedSidebarView {
  activeItemId: string
  emptyDescription: string
  emptyTitle: string
  mails: ReadonlyArray<AuthenticatedMailItem>
  navMain: ReadonlyArray<AuthenticatedMailNavItem>
  state: AuthenticatedViewState
}

export interface AuthenticatedDashboardView {
  emptyDescription: string
  emptyTitle: string
  state: AuthenticatedViewState
}

export const defaultAuthenticatedSidebarView = {
  activeItemId: 'inbox',
  emptyDescription: 'Messages matching this mailbox view will appear here.',
  emptyTitle: 'No messages',
  navMain: [
    {
      id: 'inbox',
      title: 'Inbox',
      url: '#',
      icon: TrayIcon,
      isActive: true
    },
    {
      id: 'drafts',
      title: 'Drafts',
      url: '#',
      icon: FileIcon,
      isActive: false
    },
    {
      id: 'sent',
      title: 'Sent',
      url: '#',
      icon: PaperPlaneTiltIcon,
      isActive: false
    },
    {
      id: 'junk',
      title: 'Junk',
      url: '#',
      icon: ArchiveIcon,
      isActive: false
    },
    {
      id: 'trash',
      title: 'Trash',
      url: '#',
      icon: TrashIcon,
      isActive: false
    }
  ],
  mails: [
    {
      id: 'william-smith-meeting-tomorrow',
      name: 'William Smith',
      email: 'williamsmith@example.com',
      subject: 'Meeting Tomorrow',
      date: '09:34 AM',
      teaser:
        'Hi team, just a reminder about our meeting tomorrow at 10 AM.\nPlease come prepared with your project updates.'
    },
    {
      id: 'alice-smith-project-update',
      name: 'Alice Smith',
      email: 'alicesmith@example.com',
      subject: 'Re: Project Update',
      date: 'Yesterday',
      teaser:
        "Thanks for the update. The progress looks great so far.\nLet's schedule a call to discuss the next steps."
    },
    {
      id: 'bob-johnson-weekend-plans',
      name: 'Bob Johnson',
      email: 'bobjohnson@example.com',
      subject: 'Weekend Plans',
      date: '2 days ago',
      teaser:
        "Hey everyone! I'm thinking of organizing a team outing this weekend.\nWould you be interested in a hiking trip or a beach day?"
    },
    {
      id: 'emily-davis-budget-question',
      name: 'Emily Davis',
      email: 'emilydavis@example.com',
      subject: 'Re: Question about Budget',
      date: '2 days ago',
      teaser:
        "I've reviewed the budget numbers you sent over.\nCan we set up a quick call to discuss some potential adjustments?"
    },
    {
      id: 'michael-wilson-announcement',
      name: 'Michael Wilson',
      email: 'michaelwilson@example.com',
      subject: 'Important Announcement',
      date: '1 week ago',
      teaser:
        "Please join us for an all-hands meeting this Friday at 3 PM.\nWe have some exciting news to share about the company's future."
    },
    {
      id: 'sarah-brown-feedback',
      name: 'Sarah Brown',
      email: 'sarahbrown@example.com',
      subject: 'Re: Feedback on Proposal',
      date: '1 week ago',
      teaser:
        "Thank you for sending over the proposal. I've reviewed it and have some thoughts.\nCould we schedule a meeting to discuss my feedback in detail?"
    },
    {
      id: 'david-lee-project-idea',
      name: 'David Lee',
      email: 'davidlee@example.com',
      subject: 'New Project Idea',
      date: '1 week ago',
      teaser:
        "I've been brainstorming and came up with an interesting project concept.\nDo you have time this week to discuss its potential impact and feasibility?"
    },
    {
      id: 'olivia-wilson-vacation',
      name: 'Olivia Wilson',
      email: 'oliviawilson@example.com',
      subject: 'Vacation Plans',
      date: '1 week ago',
      teaser:
        "Just a heads up that I'll be taking a two-week vacation next month.\nI'll make sure all my projects are up to date before I leave."
    },
    {
      id: 'james-martin-conference',
      name: 'James Martin',
      email: 'jamesmartin@example.com',
      subject: 'Re: Conference Registration',
      date: '1 week ago',
      teaser:
        "I've completed the registration for the upcoming tech conference.\nLet me know if you need any additional information from my end."
    },
    {
      id: 'sophia-white-team-dinner',
      name: 'Sophia White',
      email: 'sophiawhite@example.com',
      subject: 'Team Dinner',
      date: '1 week ago',
      teaser:
        "To celebrate our recent project success, I'd like to organize a team dinner.\nAre you available next Friday evening? Please let me know your preferences."
    }
  ],
  state: 'ready'
} satisfies AuthenticatedSidebarView

export const defaultAuthenticatedDashboardView = {
  emptyDescription: 'Dashboard modules will appear here once the workspace has data to review.',
  emptyTitle: 'No dashboard activity',
  state: 'ready'
} satisfies AuthenticatedDashboardView

export function withActiveSidebarItem(
  view: AuthenticatedSidebarView,
  activeItemId: string
): AuthenticatedSidebarView {
  return {
    ...view,
    activeItemId,
    navMain: view.navMain.map((item) => ({
      ...item,
      isActive: item.id === activeItemId
    }))
  }
}

export interface AuthenticatedShellProps {
  children: React.ReactNode
  onSettingsOpenChange: (open: boolean) => void
  onSettingsSectionChange: (section: SettingsSectionId) => void
  onSidebarItemSelect?: (itemId: string) => void
  settingsContentState?: SettingsDialogContentState
  settingsOpen: boolean
  settingsSection: SettingsSectionId
  sidebarView?: AuthenticatedSidebarView
  title?: string
  user: WebappRouteUser
}

export function AuthenticatedShell({
  children,
  onSettingsOpenChange,
  onSettingsSectionChange,
  onSidebarItemSelect,
  settingsContentState,
  settingsOpen,
  settingsSection,
  sidebarView = defaultAuthenticatedSidebarView,
  title = 'Inbox',
  user
}: AuthenticatedShellProps) {
  const openSettings = React.useCallback(() => {
    onSettingsOpenChange(true)
  }, [onSettingsOpenChange])

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '350px'
        } as React.CSSProperties
      }
    >
      <AuthenticatedSidebar
        onOpenSettings={openSettings}
        onSelectItem={onSidebarItemSelect}
        user={toNavUser(user)}
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
  onOpenSettings?: () => void
  onSelectItem?: (itemId: string) => void
  user: {
    avatar: string
    email: string
    name: string
  }
  view?: AuthenticatedSidebarView
}

export function AuthenticatedSidebar({
  onOpenSettings,
  onSelectItem,
  user,
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
                    <CommandIcon className='size-4' />
                  </div>
                  <div className='grid flex-1 text-left text-sm leading-tight'>
                    <span className='truncate font-medium'>Acme Inc</span>
                    <span className='truncate text-xs'>Enterprise</span>
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className='overflow-hidden [scrollbar-gutter:auto]'>
          <SidebarGroup>
            <SidebarGroupContent className='px-1.5 md:px-0'>
              {view.state === 'loading' ? (
                <SidebarRailLoading />
              ) : (
                <SidebarMenu>
                  {view.navMain.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        tooltip={{
                          children: item.title,
                          hidden: false
                        }}
                        onClick={() => {
                          onSelectItem?.(item.id)
                          setOpen(true)
                        }}
                        isActive={item.id === view.activeItemId || item.isActive}
                        className='px-2.5 md:px-2'
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <NavUser
            user={user}
            onOpenSettings={onOpenSettings}
          />
        </SidebarFooter>
      </Sidebar>

      <Sidebar
        collapsible='none'
        className='hidden min-w-0 flex-1 md:flex'
      >
        <SidebarHeader className='gap-3.5 border-b p-4'>
          <div className='flex w-full items-center justify-between'>
            <div className='text-foreground text-base font-medium'>{activeItem?.title ?? 'Inbox'}</div>
            <Label className='flex items-center gap-2 text-sm'>
              <span>Unreads</span>
              <Switch className='shadow-none' />
            </Label>
          </div>
          <SidebarInput placeholder='Type to search...' />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className='px-0'>
            <SidebarGroupContent>
              <MailboxList view={view} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </Sidebar>
  )
}

export function AuthenticatedDashboardContent({
  view = defaultAuthenticatedDashboardView
}: {
  view?: AuthenticatedDashboardView
}) {
  if (view.state === 'loading') {
    return (
      <main className='flex flex-1 flex-col gap-4 p-4'>
        <div className='grid auto-rows-min gap-4 md:grid-cols-3'>
          <Skeleton className='bg-muted/50 aspect-video rounded-xl' />
          <Skeleton className='bg-muted/50 aspect-video rounded-xl' />
          <Skeleton className='bg-muted/50 aspect-video rounded-xl' />
        </div>
        <Skeleton className='bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min' />
      </main>
    )
  }

  if (view.state === 'empty') {
    return (
      <main className='flex flex-1 flex-col gap-4 p-4'>
        <div className='grid auto-rows-min gap-4 md:grid-cols-3'>
          <div className='bg-muted/50 aspect-video rounded-xl' />
          <div className='bg-muted/50 aspect-video rounded-xl' />
          <div className='bg-muted/50 aspect-video rounded-xl' />
        </div>
        <div
          className='bg-muted/30 text-muted-foreground flex min-h-[100vh] flex-1 flex-col items-center
            justify-center gap-2 rounded-xl border border-dashed p-6 text-center md:min-h-min'
        >
          <p className='text-foreground font-medium'>{view.emptyTitle}</p>
          <p className='max-w-sm text-sm'>{view.emptyDescription}</p>
        </div>
      </main>
    )
  }

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <div className='grid auto-rows-min gap-4 md:grid-cols-3'>
        <div className='bg-muted/50 aspect-video rounded-xl' />
        <div className='bg-muted/50 aspect-video rounded-xl' />
        <div className='bg-muted/50 aspect-video rounded-xl' />
      </div>
      <div className='bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min' />
    </main>
  )
}

function MailboxList({ view }: { view: AuthenticatedSidebarView }) {
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

  if (view.state === 'empty' || view.mails.length === 0) {
    return (
      <div className='flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center'>
        <p className='font-medium'>{view.emptyTitle}</p>
        <p className='text-muted-foreground max-w-56 text-sm'>{view.emptyDescription}</p>
      </div>
    )
  }

  return view.mails.map((mail) => (
    <a
      href='#'
      key={mail.id}
      className='hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2
        border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0'
    >
      <div className='flex w-full items-center gap-2'>
        <span>{mail.name}</span> <span className='ml-auto text-xs'>{mail.date}</span>
      </div>
      <span className='font-medium'>{mail.subject}</span>
      <span className='line-clamp-2 w-[260px] text-xs whitespace-break-spaces'>{mail.teaser}</span>
    </a>
  ))
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

function toNavUser(user: WebappRouteUser): {
  avatar: string
  email: string
  name: string
} {
  return {
    avatar: user?.image ?? '',
    email: user?.email ?? 'm@example.com',
    name: user?.name ?? 'shadcn'
  }
}
