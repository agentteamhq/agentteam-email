'use client'

import { KeyIcon } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { Auth } from '../../components/auth/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Spinner } from '../../components/ui/spinner'
import { cn, tw } from '../../lib/utils'
import type { ReactNode } from 'react'
import type { TailwindClass } from '../../lib/utils'
import type { AuthView } from '@better-auth-ui/core'

export type BetterAuthRouteView =
  | AuthView
  | 'magicLink'
  | 'callback'
  | 'acceptInvitation'
  | 'recoverAccount'
  | 'emailOtp'
  | 'twoFactor'

export type BetterAuthLastUsedLoginMethod = 'email' | 'magic-link' | 'google' | 'linkedin'

export interface BetterAuthViewTemplateProps {
  view: BetterAuthRouteView
  redirectTo?: string
  flash?: string | null
  lastUsedLoginMethod?: BetterAuthLastUsedLoginMethod | null
  resetPasswordToken?: string
}

export interface BetterAuthViewFrameProps {
  children: ReactNode
  view: BetterAuthRouteView
  lastUsedLoginMethod?: BetterAuthLastUsedLoginMethod | null
}

interface AuthPathConfig {
  title: string
  subtitle: string
}

/**
 * Route-level copy for views that do not currently have a registry form.
 * Built-in Better Auth UI forms own their own titles and controls.
 */
const authConfig = {
  signIn: {
    title: 'Sign in',
    subtitle: 'Sign in to continue to your dashboard.'
  },
  signUp: {
    title: 'Create your account',
    subtitle: 'Create an AgentTeam Email account to manage your workspace.'
  },
  signOut: {
    title: 'Sign out',
    subtitle: 'Are you sure you want to sign out?'
  },
  forgotPassword: {
    title: 'Forgot password',
    subtitle: 'Enter your email to receive a reset link.'
  },
  resetPassword: {
    title: 'Reset password',
    subtitle: 'Enter your new password below.'
  },
  recoverAccount: {
    title: 'Recover your account',
    subtitle: 'Use your backup code to regain access.'
  },
  callback: {
    title: 'Signing you in',
    subtitle: 'Please wait while we complete authentication.'
  },
  magicLink: {
    title: 'Sign in with magic link',
    subtitle: 'Enter your email to receive a sign-in link.'
  },
  acceptInvitation: {
    title: 'Accept invitation',
    subtitle: 'Sign in to accept the organization invitation.'
  },
  verifyEmail: {
    title: 'Verify your email',
    subtitle: 'Please check your inbox for a verification link.'
  },
  emailOtp: {
    title: 'Enter verification code',
    subtitle: 'We sent a code to your email address.'
  },
  twoFactor: {
    title: 'Two-factor authentication',
    subtitle: 'Enter the code from your authenticator app.'
  }
} satisfies Record<BetterAuthRouteView, AuthPathConfig>

const supportedAuthViewValues = [
  'signIn',
  'signUp',
  'forgotPassword',
  'resetPassword',
  'verifyEmail',
  'magicLink'
] as const satisfies readonly AuthView[]

type SupportedAuthView = (typeof supportedAuthViewValues)[number]

const supportedAuthViews = new Set<string>(supportedAuthViewValues)

function isSupportedAuthView(view: BetterAuthRouteView): view is SupportedAuthView {
  return supportedAuthViews.has(view)
}

const lastUsedAnchors = {
  email: tw('anchor-to-[--login-email]'),
  google: tw('anchor-to-[--login-google]'),
  linkedin: tw('anchor-to-[--login-linkedin]'),
  'magic-link': tw('anchor-to-[--login-magic-link]')
} satisfies Record<BetterAuthLastUsedLoginMethod, TailwindClass>

function getLastMethodClass(
  view: BetterAuthRouteView,
  lastUsedLoginMethod: BetterAuthLastUsedLoginMethod | null | undefined
) {
  if (view !== 'signIn' || !lastUsedLoginMethod) {
    return undefined
  }

  return lastUsedAnchors[lastUsedLoginMethod]
}

export function BetterAuthViewTemplate({ view, flash, lastUsedLoginMethod }: BetterAuthViewTemplateProps) {
  const config = view in authConfig ? authConfig[view] : null

  useEffect(() => {
    if (flash) {
      toast.success(flash)
    }
  }, [flash])

  return (
    <BetterAuthViewFrame
      view={view}
      lastUsedLoginMethod={lastUsedLoginMethod}
    >
      {view === 'signOut' ? (
        <AuthSignOutCard />
      ) : isSupportedAuthView(view) ? (
        <Auth
          socialLayout={view === 'signIn' || view === 'signUp' ? 'vertical' : 'auto'}
          view={view}
          className='border-secondary-card-border bg-surface w-full gap-4 shadow-sm'
        />
      ) : (
        <AuthStatusCard
          title={config?.title ?? 'Authentication'}
          subtitle={config?.subtitle ?? 'Complete authentication to continue.'}
        />
      )}
    </BetterAuthViewFrame>
  )
}

function AuthSignOutCard() {
  return (
    <Card
      className='border-secondary-card-border bg-surface min-h-48 w-full justify-center gap-5 py-8 shadow-sm'
    >
      <CardHeader className='items-center px-8 text-center'>
        <CardTitle className='text-xl font-semibold'>Signing out</CardTitle>
        <CardDescription>Redirecting you to sign in.</CardDescription>
      </CardHeader>
      <CardContent className='flex justify-center px-8 pb-0'>
        <Spinner className='text-muted-foreground size-5' />
      </CardContent>
    </Card>
  )
}

export function BetterAuthViewFrame({ children, view, lastUsedLoginMethod }: BetterAuthViewFrameProps) {
  const lastMethodClass = getLastMethodClass(view, lastUsedLoginMethod)

  return (
    <div
      id={view === 'signIn' || view === 'signUp' ? 'signinup-page' : undefined}
      className='relative flex w-full justify-center'
    >
      <div className='flex w-full max-w-sm flex-col items-center'>
        {children}
        {lastMethodClass && (
          <div
            id='last-used'
            className={cn(
              'anchor-right-of absolute ml-2 flex transform items-center max-sm:hidden',
              lastMethodClass
            )}
          >
            <div
              className='border-r-primary mr-[-1px] h-0 w-0 border-t-[7px] border-r-[7px] border-b-[7px]
                border-t-transparent border-b-transparent will-change-transform'
            />
            <div
              className='bg-primary text-primary-foreground flex shrink-0 items-center rounded-md px-2.5 py-1
                text-xs font-medium whitespace-nowrap will-change-transform'
            >
              <KeyIcon className='text-primary-foreground/90 mr-1 size-3 transform-gpu will-change-transform' />
              Last used
            </div>
          </div>
        )}
        {lastMethodClass && (
          <div
            id='last-used-sm'
            className={cn(
              'anchor-above absolute mb-1.5 flex transform flex-col items-center sm:hidden',
              lastMethodClass
            )}
          >
            <div
              className='bg-primary text-primary-foreground flex shrink-0 items-center rounded-md px-2.5 py-1
                text-xs font-medium whitespace-nowrap will-change-transform'
            >
              <KeyIcon className='text-primary-foreground/90 mr-1 size-3 transform-gpu will-change-transform' />
              Last used
            </div>
            <div
              className='border-t-primary mt-[-1px] h-0 w-0 border-t-[7px] border-r-[7px] border-l-[7px]
                border-r-transparent border-l-transparent will-change-transform'
            />
          </div>
        )}
      </div>
    </div>
  )
}

function AuthStatusCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Card className='border-secondary-card-border bg-surface w-full gap-4 shadow-sm'>
      <CardHeader>
        <CardTitle className='text-xl font-semibold'>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className='text-muted-foreground text-sm'>
          Continue through the authentication link that opened this page.
        </p>
      </CardContent>
    </Card>
  )
}
