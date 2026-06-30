import {
  AccountMenu as AccountMenuStory,
  mailWorkspaceControllerStoryMeta
} from '../../mail-workspace.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailWorkspaceControllerStoryMeta,
  title: 'Screens/Mail Workspace/Account'
} satisfies Meta<typeof mailWorkspaceControllerStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const AccountMenu: Story = {
  ...AccountMenuStory,
  name: 'User menu'
}
