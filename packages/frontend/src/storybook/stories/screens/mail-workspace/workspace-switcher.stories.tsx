import {
  WorkspaceSwitcherDefault as WorkspaceSwitcherDefaultStory,
  WorkspaceSwitcherEmpty as WorkspaceSwitcherEmptyStory,
  WorkspaceSwitcherLongMailboxList as WorkspaceSwitcherLongMailboxListStory,
  WorkspaceSwitcherSingleWorkspace as WorkspaceSwitcherSingleWorkspaceStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Workspace Switcher'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  ...WorkspaceSwitcherDefaultStory,
  name: 'Default'
}

export const LongMailboxList: Story = {
  ...WorkspaceSwitcherLongMailboxListStory,
  name: 'Long mailbox list'
}

export const Empty: Story = {
  ...WorkspaceSwitcherEmptyStory,
  name: 'Empty'
}

export const SingleWorkspace: Story = {
  ...WorkspaceSwitcherSingleWorkspaceStory,
  name: 'Single workspace'
}
