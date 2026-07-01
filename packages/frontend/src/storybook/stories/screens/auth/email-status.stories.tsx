import { useEffect } from 'react'
import { expect, within } from 'storybook/test'

import {
  VERIFY_EMAIL_STORAGE_KEY,
  verifyEmailGateCopy
} from 'src/lib/auth/better-auth-ui-localization'
import { defaultAuthRouteArgs } from 'src/storybook/auth-route-fixtures'
import { publicAuthRouteState } from 'src/storybook/screen-fixtures'
import { AuthRoutePage } from 'src/screens/auth-route-page'
import { EmailStatusScreen } from 'src/screens/email-status-screen'
import type { PropsWithChildren } from 'react'
import type { Meta, StoryObj } from '@storybook/react'

const storyVerifyEmail = 'marin.patel@northstar-ops.example.test'

function VerifyEmailStorage({ children }: PropsWithChildren) {
  useEffect(() => {
    const previousEmail = globalThis.window.sessionStorage.getItem(VERIFY_EMAIL_STORAGE_KEY)
    globalThis.window.sessionStorage.setItem(VERIFY_EMAIL_STORAGE_KEY, storyVerifyEmail)

    return () => {
      if (previousEmail === null) {
        globalThis.window.sessionStorage.removeItem(VERIFY_EMAIL_STORAGE_KEY)
      } else {
        globalThis.window.sessionStorage.setItem(VERIFY_EMAIL_STORAGE_KEY, previousEmail)
      }
    }
  }, [])

  return <>{children}</>
}

const meta = {
  title: 'Screens/Auth/Email Status',
  component: AuthRoutePage,
  args: {
    ...defaultAuthRouteArgs,
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'verifyEmail'
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AuthRoutePage>

export default meta

type Story = StoryObj<typeof meta>

export const VerifyEmailGate: Story = {
  name: 'Verify email gate',
  decorators: [
    (StoryComponent) => (
      <VerifyEmailStorage>
        <StoryComponent />
      </VerifyEmailStorage>
    )
  ],
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'verifyEmail'
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText(verifyEmailGateCopy.title)).toBeInTheDocument()
    await expect(await canvas.findByText(verifyEmailGateCopy.description)).toBeInTheDocument()
  }
}

export const RecoveryEmailSent: Story = {
  name: 'Recovery email sent',
  render: () => <EmailStatusScreen />
}
