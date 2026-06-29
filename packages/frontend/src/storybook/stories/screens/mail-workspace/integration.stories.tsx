import {
  WebmailAccountSwitch as WebmailAccountSwitchStory,
  WebmailEmpty as WebmailEmptyStory,
  WebmailError as WebmailErrorStory,
  WebmailInbox as WebmailInboxStory,
  WebmailJunk as WebmailJunkStory,
  WebmailLoading as WebmailLoadingStory,
  WebmailPaginated as WebmailPaginatedStory,
  dashboardMailControllerStoryMeta
} from '../../mail-dashboard-controller.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...dashboardMailControllerStoryMeta,
  title: 'Screens/Mail Workspace/Integration'
} satisfies Meta<typeof dashboardMailControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const WebmailInbox: Story = {
  ...WebmailInboxStory,
  name: 'RPC inbox load'
}

export const WebmailPaginated: Story = {
  ...WebmailPaginatedStory,
  name: 'Route search cursor pagination'
}

export const WebmailEmpty: Story = {
  ...WebmailEmptyStory,
  name: 'RPC empty folder'
}

export const WebmailJunk: Story = {
  ...WebmailJunkStory,
  name: 'Folder route search'
}

export const WebmailAccountSwitch: Story = {
  ...WebmailAccountSwitchStory,
  name: 'Account route search'
}

export const WebmailLoading: Story = {
  ...WebmailLoadingStory,
  name: 'RPC pending'
}

export const WebmailError: Story = {
  ...WebmailErrorStory,
  name: 'RPC backend error'
}
