import {
  MessageAppointment as MessageAppointmentStory,
  MessageAttachments as MessageAttachmentsStory,
  MessageError as MessageErrorStory,
  MessageInlineAttachments as MessageInlineAttachmentsStory,
  MessageRowSelection as MessageRowSelectionStory,
  MessageStarred as MessageStarredStory,
  MessageUnread as MessageUnreadStory,
  MessageWelcome as MessageWelcomeStory,
  mailWorkspaceStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Message'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const MessageAppointment: Story = {
  ...MessageAppointmentStory,
  name: 'Appointment'
}

export const MessageError: Story = {
  ...MessageErrorStory,
  name: 'Error'
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

export const MessageRowSelection: Story = {
  ...MessageRowSelectionStory,
  name: 'Row selection'
}
