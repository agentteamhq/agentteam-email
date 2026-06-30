import {
  DraftEditing as DraftEditingStory,
  DraftToolbarActions as DraftToolbarActionsStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Message - Drafts'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

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
