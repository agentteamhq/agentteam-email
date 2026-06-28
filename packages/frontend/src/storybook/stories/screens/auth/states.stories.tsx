import { expect, within } from 'storybook/test'

import { defaultAuthRouteArgs } from 'src/storybook/auth-route-fixtures'
import { protectedRouteSignInState, publicAuthRouteState } from 'src/storybook/screen-fixtures'
import { AuthRoutePage } from 'src/screens/auth-route-page'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Screens/Auth/States',
  component: AuthRoutePage,
  args: {
    ...defaultAuthRouteArgs,
    routeState: protectedRouteSignInState,
    lastUsedLoginMethod: null,
    view: 'signIn'
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Authentication screen states rendered through the real route screen with explicit view props.'
      }
    }
  }
} satisfies Meta<typeof AuthRoutePage>

export default meta

type Story = StoryObj<typeof meta>

export const SignInDefault: Story = {
  name: 'Sign in / default',
  args: {
    routeState: protectedRouteSignInState,
    lastUsedLoginMethod: null,
    view: 'signIn'
  }
}

export const SignInLastUsedEmail: Story = {
  name: 'Sign in / last used email',
  args: {
    routeState: protectedRouteSignInState,
    lastUsedLoginMethod: 'email',
    view: 'signIn'
  }
}

export const SignInLastUsedMagicLink: Story = {
  name: 'Sign in / last used magic link',
  args: {
    routeState: protectedRouteSignInState,
    lastUsedLoginMethod: 'magic-link',
    view: 'signIn'
  }
}

export const SignInLastUsedGoogle: Story = {
  name: 'Sign in / last used Google',
  args: {
    routeState: protectedRouteSignInState,
    lastUsedLoginMethod: 'google',
    view: 'signIn'
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByText('Last used')).toBeInTheDocument()
  }
}

export const SignInLastUsedLinkedIn: Story = {
  name: 'Sign in / last used LinkedIn',
  args: {
    routeState: protectedRouteSignInState,
    lastUsedLoginMethod: 'linkedin',
    view: 'signIn'
  }
}

export const SignUpDefault: Story = {
  name: 'Sign up / default',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: null,
    view: 'signUp'
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await canvas.findByRole('heading', { name: 'Sign Up' })
    await expect(canvas.queryByText('Last used')).not.toBeInTheDocument()
  }
}

export const SignOutRedirecting: Story = {
  name: 'Sign out / redirecting to sign in',
  args: {
    routeState: publicAuthRouteState,
    view: 'signOut'
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)

    await expect(await canvas.findByRole('heading', { name: 'Signing out' })).toBeInTheDocument()
    await expect(await canvas.findByRole('status', { name: 'Loading' })).toBeInTheDocument()
  }
}
