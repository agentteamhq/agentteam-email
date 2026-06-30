import {
  MessageAppointment as MessageAppointmentStory,
  MessageAttachments as MessageAttachmentsStory,
  MessageError as MessageErrorStory,
  MessageInlineAttachments as MessageInlineAttachmentsStory,
  MessageStarred as MessageStarredStory,
  MessageUnread as MessageUnreadStory,
  MessageWelcome as MessageWelcomeStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Message'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MessageAppointment: Story = {
  ...MessageAppointmentStory,
  name: 'Appointment'
}

export const MessageError: Story = {
  ...MessageErrorStory,
  name: 'Loader error'
}

export const MessageWelcome: Story = {
  ...MessageWelcomeStory,
  name: 'Welcome'
}

export const MessageStarred: Story = {
  ...MessageStarredStory,
  name: 'Starred'
}

export const MessageUnread: Story = {
  ...MessageUnreadStory,
  name: 'Unread'
}

export const MessageAttachments: Story = {
  ...MessageAttachmentsStory,
  name: 'Attachments'
}

export const MessageInlineAttachments: Story = {
  ...MessageInlineAttachmentsStory,
  name: 'Inline attachments'
}
