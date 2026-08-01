import {
  DashboardRoute as DashboardRouteStory,
  FolderTransitionKeepsRenderedMailbox as FolderTransitionKeepsRenderedMailboxStory,
  SettingsCloseKeepsMailboxFolder as SettingsCloseKeepsMailboxFolderStory,
  SettingsRoundTripKeepsComposeDraft as SettingsRoundTripKeepsComposeDraftStory,
  SettingsSectionChangeKeepsMailboxFolder as SettingsSectionChangeKeepsMailboxFolderStory,
  SettingsSectionRoute as SettingsSectionRouteStory,
  UserMenuSettingsRoundTripKeepsMailboxFolder as UserMenuSettingsRoundTripKeepsMailboxFolderStory,
  authenticatedShellRouteStoryMeta
} from '../../authenticated-shell-route.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...authenticatedShellRouteStoryMeta,
  title: 'Screens/Mail Workspace/Integration'
} satisfies Meta<typeof authenticatedShellRouteStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const DashboardRoute: Story = {
  ...DashboardRouteStory,
  name: 'Shell route dashboard'
}

export const SettingsSectionRoute: Story = {
  ...SettingsSectionRouteStory,
  name: 'Shell route settings section'
}

export const SettingsRoundTripKeepsComposeDraft: Story = {
  ...SettingsRoundTripKeepsComposeDraftStory,
  name: 'Shell route settings round trip keeps compose draft'
}

export const FolderTransitionKeepsRenderedMailbox: Story = {
  ...FolderTransitionKeepsRenderedMailboxStory,
  name: 'Shell route folder transition keeps rendered mailbox'
}

export const SettingsCloseKeepsMailboxFolder: Story = {
  ...SettingsCloseKeepsMailboxFolderStory,
  name: 'Shell route settings close keeps mailbox folder'
}

export const SettingsSectionChangeKeepsMailboxFolder: Story = {
  ...SettingsSectionChangeKeepsMailboxFolderStory,
  name: 'Shell route settings section change keeps mailbox folder'
}

export const UserMenuSettingsRoundTripKeepsMailboxFolder: Story = {
  ...UserMenuSettingsRoundTripKeepsMailboxFolderStory,
  name: 'Shell route user menu settings round trip keeps mailbox folder'
}
