import { authenticatedSectionBaseArgs } from '../storybook/authenticated-section-fixtures'
import { DashboardScreen } from './dashboard-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Settings',
  component: DashboardScreen,
  args: {
    ...authenticatedSectionBaseArgs,
    settingsOpen: true
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Account: Story = {
  name: 'settings / account',
  args: {
    settingsSection: 'account'
  }
}

export const Security: Story = {
  name: 'settings / security',
  args: {
    settingsSection: 'security'
  }
}

export const Organizations: Story = {
  name: 'settings / organizations',
  args: {
    settingsSection: 'organizations'
  }
}

export const OrganizationSettings: Story = {
  name: 'organization / settings',
  args: {
    settingsSection: 'organizationSettings'
  }
}

export const OrganizationPeople: Story = {
  name: 'organization / people',
  args: {
    settingsSection: 'organizationPeople'
  }
}

export const ConnectedAccountsEmpty: Story = {
  name: 'settings / connected accounts empty',
  args: {
    settingsContentState: 'empty',
    settingsSection: 'connectedAccounts'
  }
}
