import type { Meta, StoryObj } from '@storybook/react'

import { SignOutView } from '../components/auth/sign-out'
import { BetterAuthViewFrame } from '../partials/webapp/better-auth-view-template'
import { AuthRouteStory } from '../storybook/auth-route-story'
import { protectedRouteSignInState, publicAuthRouteState, storyPublicEnv } from '../storybook/screen-fixtures'
import { AuthViewScreen } from './auth-view-screen'

const meta = {
  title: 'Screens/Auth/States',
  component: AuthRouteStory,
  args: {
    publicEnv: storyPublicEnv,
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
} satisfies Meta<typeof AuthRouteStory>

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
  }
}

export const SignUpLastUsedMagicLink: Story = {
  name: 'Sign up / last used magic link',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: 'magic-link',
    view: 'signUp'
  }
}

export const SignUpLastUsedGoogle: Story = {
  name: 'Sign up / last used Google',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: 'google',
    view: 'signUp'
  }
}

export const SignUpLastUsedLinkedIn: Story = {
  name: 'Sign up / last used LinkedIn',
  args: {
    routeState: publicAuthRouteState,
    lastUsedLoginMethod: 'linkedin',
    view: 'signUp'
  }
}

export const SignOutRedirecting: Story = {
  name: 'Sign out / redirecting to sign in',
  render: () => (
    <AuthViewScreen
      publicEnv={storyPublicEnv}
      routeState={publicAuthRouteState}
    >
      <BetterAuthViewFrame view='signOut'>
        <SignOutView className='border-secondary-card-border bg-surface w-full gap-4 shadow-sm' />
      </BetterAuthViewFrame>
    </AuthViewScreen>
  )
}
