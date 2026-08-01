import {
  MailboxAdminAccountsEmptyRoute as MailboxAdminAccountsEmptyRouteStory,
  MailboxAdminAccountsErrorRoute as MailboxAdminAccountsErrorRouteStory,
  MailboxAdminAccountsPendingRoute as MailboxAdminAccountsPendingRouteStory,
  MailboxAdminAccountsRoute as MailboxAdminAccountsRouteStory,
  SettingsCloseKeepsMailboxAdminSection as SettingsCloseKeepsMailboxAdminSectionStory,
  authenticatedShellRouteStoryMeta
} from '../../authenticated-shell-route.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...authenticatedShellRouteStoryMeta,
  title: 'Screens/Mail Admin/Integration - Routes'
} satisfies Meta<typeof authenticatedShellRouteStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MailboxAdminAccountsRoute: Story = {
  ...MailboxAdminAccountsRouteStory,
  name: 'Shell route accounts surface'
}

export const MailboxAdminAccountsEmptyRoute: Story = {
  ...MailboxAdminAccountsEmptyRouteStory,
  name: 'Shell route accounts empty surface'
}

export const MailboxAdminAccountsPendingRoute: Story = {
  ...MailboxAdminAccountsPendingRouteStory,
  name: 'Shell route accounts pending surface'
}

export const MailboxAdminAccountsErrorRoute: Story = {
  ...MailboxAdminAccountsErrorRouteStory,
  name: 'Shell route accounts error surface'
}

export const SettingsCloseKeepsMailboxAdminSection: Story = {
  ...SettingsCloseKeepsMailboxAdminSectionStory,
  name: 'Shell route settings close keeps admin surface'
}
