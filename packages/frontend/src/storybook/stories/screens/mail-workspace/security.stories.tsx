import {
  SecurityDocumentResourceTagsBlocked as SecurityDocumentResourceTagsBlockedStory,
  SecurityExternalLinkGenerated as SecurityExternalLinkGeneratedStory,
  SecurityFormContentRemoved as SecurityFormContentRemovedStory,
  SecurityMailtoLinkInteraction as SecurityMailtoLinkInteractionStory,
  SecurityRemoteBackgroundImagesBlocked as SecurityRemoteBackgroundImagesBlockedStory,
  SecurityRemoteContentBlocked as SecurityRemoteContentBlockedStory,
  SecurityRemoteContentInteraction as SecurityRemoteContentInteractionStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Security'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const SecurityRemoteContentBlocked: Story = {
  ...SecurityRemoteContentBlockedStory,
  name: 'Remote content blocked'
}

export const SecurityRemoteContentInteraction: Story = {
  ...SecurityRemoteContentInteractionStory,
  name: 'Remote content interaction'
}

export const SecurityRemoteBackgroundImagesBlocked: Story = {
  ...SecurityRemoteBackgroundImagesBlockedStory,
  name: 'Remote background images blocked'
}

export const SecurityDocumentResourceTagsBlocked: Story = {
  ...SecurityDocumentResourceTagsBlockedStory,
  name: 'Document resource tags blocked'
}

export const SecurityMailtoLinkInteraction: Story = {
  ...SecurityMailtoLinkInteractionStory,
  name: 'Mailto link interaction'
}

export const SecurityExternalLinkGenerated: Story = {
  ...SecurityExternalLinkGeneratedStory,
  name: 'External link generated'
}

export const SecurityFormContentRemoved: Story = {
  ...SecurityFormContentRemovedStory,
  name: 'Form content removed'
}
