import {
  BackendError as BackendErrorStory,
  Empty as EmptyStory,
  Forbidden as ForbiddenStory,
  Loading as LoadingStory,
  mailAdminMockStoryMeta
} from '../../mail-admin-mocks.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailAdminMockStoryMeta,
  title: 'Screens/Mail Admin/Global States'
} satisfies Meta<typeof mailAdminMockStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Loading: Story = {
  ...LoadingStory,
  name: 'Loading'
}

export const Empty: Story = {
  ...EmptyStory,
  name: 'Empty'
}

export const BackendError: Story = {
  ...BackendErrorStory,
  name: 'Backend error'
}

export const Forbidden: Story = {
  ...ForbiddenStory,
  name: 'Forbidden'
}
