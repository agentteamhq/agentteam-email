import {
  MessageOriginalSourceError as MessageOriginalSourceErrorStory,
  MessageOriginalSourceEvidence as MessageOriginalSourceEvidenceStory,
  MessageOriginalSourceLoading as MessageOriginalSourceLoadingStory,
  MessageOriginalSource as MessageOriginalSourceStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Message - Source'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MessageOriginalSource: Story = {
  ...MessageOriginalSourceStory,
  name: 'Original source'
}

export const MessageOriginalSourceEvidence: Story = {
  ...MessageOriginalSourceEvidenceStory,
  name: 'Original source evidence'
}

export const MessageOriginalSourceLoading: Story = {
  ...MessageOriginalSourceLoadingStory,
  name: 'Original source loading'
}

export const MessageOriginalSourceError: Story = {
  ...MessageOriginalSourceErrorStory,
  name: 'Original source error'
}
