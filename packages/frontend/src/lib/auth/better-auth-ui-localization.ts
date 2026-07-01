import type { AuthProviderProps } from '@better-auth-ui/react'

export const VERIFY_EMAIL_STORAGE_KEY = 'better-auth-ui.verify-email'

export const verifyEmailGateCopy = {
  title: 'Verify your email',
  description:
    'An activation link has been sent to your email address. Please check your inbox and click the link to complete activation.'
} as const

export const betterAuthUILocalization = {
  auth: {
    verifyEmail: verifyEmailGateCopy.title,
    checkYourEmail: verifyEmailGateCopy.description
  }
} satisfies NonNullable<AuthProviderProps['localization']>
