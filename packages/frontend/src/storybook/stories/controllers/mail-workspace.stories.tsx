import {
  WebmailAccountSwitch as WebmailAccountSwitchStory,
  WebmailEmpty as WebmailEmptyStory,
  WebmailError as WebmailErrorStory,
  WebmailInbox as WebmailInboxStory,
  WebmailJunk as WebmailJunkStory,
  WebmailLoading as WebmailLoadingStory,
  WebmailPaginated as WebmailPaginatedStory,
  dashboardMailControllerStoryMeta
} from '../mail-dashboard-controller.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...dashboardMailControllerStoryMeta,
  title: 'Controllers/Mail Workspace'
} satisfies Meta<typeof dashboardMailControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const WebmailInbox: Story = {
  ...WebmailInboxStory,
  name: 'inbox'
}

export const WebmailPaginated: Story = {
  ...WebmailPaginatedStory,
  name: 'middle cursor page'
}

export const WebmailEmpty: Story = {
  ...WebmailEmptyStory,
  name: 'empty folder'
}

export const WebmailJunk: Story = {
  ...WebmailJunkStory,
  name: 'junk folder'
}

export const WebmailAccountSwitch: Story = {
  ...WebmailAccountSwitchStory,
  name: 'account switch'
}

export const WebmailLoading: Story = {
  ...WebmailLoadingStory,
  name: 'loading'
}

export const WebmailError: Story = {
  ...WebmailErrorStory,
  name: 'backend error'
}
