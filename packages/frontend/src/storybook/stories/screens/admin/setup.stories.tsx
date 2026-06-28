import { getStoryWebAppManifestIconUrl } from 'src/storybook/screen-fixtures'
import { AdminSetupPage } from 'src/screens/admin-setup/admin-setup-route-screen'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Screens/Admin/Setup',
  component: AdminSetupPage,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AdminSetupPage>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    logoSrc: getStoryWebAppManifestIconUrl(192)
  }
}

export const Error: Story = {
  args: {
    logoSrc: getStoryWebAppManifestIconUrl(192),
    screenProps: {
      errorMessage: 'Admin account could not be created.'
    }
  }
}

export const Submitting: Story = {
  args: {
    logoSrc: getStoryWebAppManifestIconUrl(192),
    screenProps: {
      isSubmitting: true
    }
  }
}
