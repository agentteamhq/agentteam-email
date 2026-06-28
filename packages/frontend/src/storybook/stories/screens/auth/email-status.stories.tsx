import { storyPublicEnv } from 'src/storybook/screen-fixtures'
import { EmailStatusScreen } from 'src/screens/email-status-screen'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Auth/Email Status',
  component: EmailStatusScreen,
  args: {
    publicEnv: storyPublicEnv
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof EmailStatusScreen>

export default meta

type Story = StoryObj<typeof meta>

export const VerificationEmailSent: Story = {
  name: 'verification email sent',
  args: {
    type: 'verification'
  }
}

export const RecoveryEmailSent: Story = {
  name: 'recovery email sent',
  args: {
    type: 'recovery'
  }
}
