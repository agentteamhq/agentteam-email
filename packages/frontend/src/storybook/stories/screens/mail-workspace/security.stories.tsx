import {
  SecurityDocumentResourceTagsBlocked as SecurityDocumentResourceTagsBlockedStory,
  SecurityExternalLinkGeneratedIdCollision as SecurityExternalLinkGeneratedIdCollisionStory,
  SecurityFormContentRemoved as SecurityFormContentRemovedStory,
  SecurityMailtoLinkInteraction as SecurityMailtoLinkInteractionStory,
  SecurityRemoteBackgroundImagesBlocked as SecurityRemoteBackgroundImagesBlockedStory,
  SecurityRemoteContentAccountScoped as SecurityRemoteContentAccountScopedStory,
  SecurityRemoteContentBlocked as SecurityRemoteContentBlockedStory,
  SecurityRemoteContentInteraction as SecurityRemoteContentInteractionStory,
  SecurityUnsafeControllerLink as SecurityUnsafeControllerLinkStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Security'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const SecurityRemoteContentBlocked: Story = {
  ...SecurityRemoteContentBlockedStory,
  name: 'remote content blocked'
}

export const SecurityRemoteContentInteraction: Story = {
  ...SecurityRemoteContentInteractionStory,
  name: 'remote content interaction'
}

export const SecurityRemoteContentAccountScoped: Story = {
  ...SecurityRemoteContentAccountScopedStory,
  name: 'remote content account scoped'
}

export const SecurityRemoteBackgroundImagesBlocked: Story = {
  ...SecurityRemoteBackgroundImagesBlockedStory,
  name: 'remote background images blocked'
}

export const SecurityDocumentResourceTagsBlocked: Story = {
  ...SecurityDocumentResourceTagsBlockedStory,
  name: 'document resource tags blocked'
}

export const SecurityUnsafeControllerLink: Story = {
  ...SecurityUnsafeControllerLinkStory,
  name: 'unsafe controller link'
}

export const SecurityMailtoLinkInteraction: Story = {
  ...SecurityMailtoLinkInteractionStory,
  name: 'mailto link interaction'
}

export const SecurityExternalLinkGeneratedIdCollision: Story = {
  ...SecurityExternalLinkGeneratedIdCollisionStory,
  name: 'external link generated id collision'
}

export const SecurityFormContentRemoved: Story = {
  ...SecurityFormContentRemovedStory,
  name: 'form content removed'
}
