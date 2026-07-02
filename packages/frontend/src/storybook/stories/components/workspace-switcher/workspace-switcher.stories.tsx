import * as React from 'react'
import { AddressBookIcon, ArchiveIcon, PaperPlaneTiltIcon, TrayIcon } from '@phosphor-icons/react'
import { expect, fn, userEvent, within } from 'storybook/test'

import {
  longWorkspaceSwitcherMailboxes,
  multiWorkspaceSwitcherWorkspaces,
  workspaceSwitcherMailboxes,
  workspaceSwitcherWorkspaces
} from 'src/storybook/workspace-mailbox-switcher-fixtures'
import { WorkspaceMailboxSwitcher } from 'src/partials/authenticated/workspace-mailbox-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail
} from 'src/components/ui/sidebar'
import type { Meta, StoryObj } from '@storybook/react'
import type { WorkspaceMailboxSwitcherProps } from 'src/partials/authenticated/workspace-mailbox-switcher'

const meta = {
  title: 'Components/Workspace Switcher',
  component: WorkspaceMailboxSwitcher,
  args: {
    activeMailboxId: 'support',
    activeWorkspaceId: 'northstar-ops',
    defaultOpen: true,
    mailboxes: workspaceSwitcherMailboxes,
    onMailboxSelect: fn(),
    onWorkspaceSelect: fn(),
    workspaces: workspaceSwitcherWorkspaces
  },
  parameters: {
    layout: 'fullscreen'
  },
  render: (args) => <WorkspaceSwitcherMockFrame {...args} />
} satisfies Meta<typeof WorkspaceMailboxSwitcher>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  name: 'Default',
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector('button[aria-label="Open workspace and mailbox switcher"]')

    await expect(trigger).not.toBeNull()
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new TypeError('Expected workspace switcher trigger to render as a button.')
    }

    const logoSvgs = trigger.querySelectorAll('svg[viewBox="0 0 512 512"]')

    await expect(trigger.querySelector('img')).toBeNull()
    await expect(logoSvgs).toHaveLength(2)
    await expect(logoSvgs[0]).toHaveClass('hidden', 'size-8', 'dark:block')
    await expect(logoSvgs[1]).toHaveClass('block', 'size-8', 'dark:hidden')
  }
}

export const LongMailboxList: Story = {
  name: 'Long mailbox list',
  args: {
    activeMailboxId: 'abuse',
    mailboxes: longWorkspaceSwitcherMailboxes
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect((await body.findAllByText('Abuse review')).length).toBeGreaterThanOrEqual(1)
    await expect((await body.findAllByText('Notifications')).length).toBeGreaterThanOrEqual(1)
  }
}

export const MultipleWorkspaces: Story = {
  name: 'Multiple workspaces',
  args: {
    activeWorkspaceId: 'northstar-ops',
    mailboxes: workspaceSwitcherMailboxes,
    workspaces: multiWorkspaceSwitcherWorkspaces
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect((await body.findAllByText('Partner Mail Ops')).length).toBeGreaterThanOrEqual(1)
    const switcherTrigger = canvasElement.querySelector(
      'button[aria-label="Open workspace and mailbox switcher"]'
    )
    if (!(switcherTrigger instanceof HTMLButtonElement)) {
      throw new TypeError('Expected workspace switcher trigger to render as a button.')
    }

    let targetWorkspace = body.queryByRole('menuitem', { name: /partner mail ops/i })
    let targetWorkspaceId = 'partner-mail-ops'
    if (!targetWorkspace) {
      targetWorkspace = body.queryByRole('menuitem', { name: /northstar ops/i })
      targetWorkspaceId = 'northstar-ops'
    }
    if (!targetWorkspace) {
      await userEvent.click(switcherTrigger)
      targetWorkspace = body.queryByRole('menuitem', { name: /partner mail ops/i })
      targetWorkspaceId = 'partner-mail-ops'
    }
    if (!targetWorkspace) {
      throw new Error('Expected a switchable workspace menu item.')
    }

    await userEvent.click(targetWorkspace)
    await expect(args.onWorkspaceSelect).toHaveBeenCalledWith(targetWorkspaceId)
  }
}

export const Empty: Story = {
  name: 'Empty',
  args: {
    activeMailboxId: undefined,
    mailboxes: [],
    state: 'empty'
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect((await body.findAllByText('No mailboxes')).length).toBeGreaterThanOrEqual(1)
  }
}

export const Loading: Story = {
  name: 'Loading',
  args: {
    activeMailboxId: undefined,
    mailboxes: [],
    state: 'loading'
  }
}

function WorkspaceSwitcherMockFrame(args: WorkspaceMailboxSwitcherProps) {
  const [activeMailboxId, setActiveMailboxId] = React.useState(args.activeMailboxId)
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState(args.activeWorkspaceId)

  return (
    <SidebarProvider defaultOpen={false}>
      <Sidebar collapsible='icon'>
        <SidebarHeader>
          <WorkspaceMailboxSwitcher
            {...args}
            activeMailboxId={activeMailboxId}
            activeWorkspaceId={activeWorkspaceId}
            onMailboxSelect={(mailboxId) => {
              setActiveMailboxId(mailboxId)
              args.onMailboxSelect?.(mailboxId)
            }}
            onWorkspaceSelect={(workspaceId) => {
              setActiveWorkspaceId(workspaceId)
              args.onWorkspaceSelect?.(workspaceId)
            }}
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive
                    tooltip='Inbox'
                  >
                    <TrayIcon />
                    <span>Inbox</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip='Contacts'>
                    <AddressBookIcon />
                    <span>Contacts</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip='Sent'>
                    <PaperPlaneTiltIcon />
                    <span>Sent</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip='Archive'>
                    <ArchiveIcon />
                    <span>Archive</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter />
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <div className='bg-background flex h-svh min-w-0'>
          <section className='hidden w-80 shrink-0 border-r md:flex md:flex-col'>
            <div className='flex h-14 items-center border-b px-4'>
              <h1 className='truncate text-sm font-medium'>Inbox</h1>
            </div>
            <div className='grid'>
              {workspaceSwitcherMailboxes.slice(0, 3).map((mailbox) => (
                <button
                  className='hover:bg-accent flex min-w-0 flex-col gap-1 border-b px-4 py-3 text-left text-sm'
                  key={mailbox.id}
                  type='button'
                >
                  <span className='truncate font-medium'>{mailbox.name}</span>
                  <span className='text-muted-foreground truncate text-xs'>{mailbox.address}</span>
                </button>
              ))}
            </div>
          </section>
          <main className='min-w-0 flex-1'>
            <header className='flex h-14 items-center border-b px-4'>
              <span className='truncate text-sm font-medium'>Re: Agent Mail smoke - 20260601-044348Z</span>
            </header>
            <div className='grid gap-3 p-4'>
              <div className='bg-muted h-6 w-72 rounded-md' />
              <div className='bg-muted h-4 w-full max-w-3xl rounded-md' />
              <div className='bg-muted h-4 w-full max-w-2xl rounded-md' />
              <div className='bg-muted h-4 w-full max-w-4xl rounded-md' />
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
