import { AccountMenu as AccountMenuStory, mailWorkspaceStoryMeta } from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceStoryMeta,
  title: 'Screens/Mail Workspace/Account'
} satisfies Meta<typeof mailWorkspaceStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const AccountMenu: Story = {
  ...AccountMenuStory,
  name: 'user menu'
}
