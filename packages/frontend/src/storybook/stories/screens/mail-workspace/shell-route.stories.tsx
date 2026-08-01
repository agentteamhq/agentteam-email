import {
  DashboardRoute as DashboardRouteStory,
  FolderTransitionKeepsRenderedMailbox as FolderTransitionKeepsRenderedMailboxStory,
  SettingsRoundTripKeepsComposeDraft as SettingsRoundTripKeepsComposeDraftStory,
  SettingsSectionRoute as SettingsSectionRouteStory,
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
