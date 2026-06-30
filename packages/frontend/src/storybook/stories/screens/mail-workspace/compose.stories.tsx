import {
  ComposeForward as ComposeForwardStory,
  ComposeReplyAll as ComposeReplyAllStory,
  ComposeSelectedAccount as ComposeSelectedAccountStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Compose'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const ComposeSelectedAccount: Story = {
  ...ComposeSelectedAccountStory,
  name: 'Selected account'
}

export const ComposeReplyAll: Story = {
  ...ComposeReplyAllStory,
  name: 'Reply all'
}

export const ComposeForward: Story = {
  ...ComposeForwardStory,
  name: 'Forward'
}
