import {
  DraftEditing as DraftEditingStory,
  DraftToolbarActions as DraftToolbarActionsStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Message - Drafts'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const DraftEditing: Story = {
  ...DraftEditingStory,
  name: 'Draft edit'
}

export const DraftToolbarActions: Story = {
  ...DraftToolbarActionsStory,
  name: 'Draft toolbar actions'
}
