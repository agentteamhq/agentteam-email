import { StrictMode } from 'react'
import { ThemeProvider } from 'next-themes'
import { ErrorBoundary } from 'react-error-boundary'

import { UserButton } from '../../components/auth/user/user-button'
import { Toaster } from '../../components/ui/sonner'

import { BetterAuthUIProvider } from './better-auth-ui-provider'
import type { EnvContextValue } from './env-context'
import { EnvProvider } from './env-provider'
import { ErrorPage } from './error-page'

export interface BetterAuthMobileButtonProps extends EnvContextValue {}

export function BetterAuthMobileButton(props: BetterAuthMobileButtonProps) {
  return (
    <StrictMode>
      <EnvProvider publicEnv={props.publicEnv}>
        <ThemeProvider
          enableSystem
          attribute='data-theme'
          defaultTheme='dark'
          disableTransitionOnChange
        >
          <ErrorBoundary
            FallbackComponent={ErrorPage}
            onError={(error, info) => {
              // Additional logging or reporting can go here
              // eslint-disable-next-line no-console
              console.error('Error logged via onError:', error, info)
            }}
          >
            <BetterAuthUIProvider>
              <UserButton
                className='w-full justify-start'
                size='default'
                variant='outline'
              />
            </BetterAuthUIProvider>
            <Toaster />
          </ErrorBoundary>
        </ThemeProvider>
      </EnvProvider>
    </StrictMode>
  )
}
