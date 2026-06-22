import { getStoryWebAppManifestIconUrl } from '../../storybook/screen-fixtures'
import { OnboardingPage } from './onboarding-route-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Onboarding/Admin Setup',
  component: OnboardingPage,
  args: {
    logoSrc: getStoryWebAppManifestIconUrl(192)
  }
} satisfies Meta<typeof OnboardingPage>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
