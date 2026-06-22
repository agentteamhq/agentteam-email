import { StrictMode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { ThemeProvider } from 'next-themes'

import { Toaster } from '../../components/ui/sonner'

import { BetterAuthUIProvider } from './better-auth-ui-provider'
import { BetterAuthViewTemplate } from './better-auth-view-template'
import { EnvProvider } from './env-provider'
import { ErrorPage } from './error-page'
import { NotFoundPage } from './not-found-page'
import type { BetterAuthViewTemplateProps } from './better-auth-view-template'
import type { EnvContextValue } from './env-context'
import type { PropsWithChildren } from 'react'
import type { AuthProviderProps } from '@better-auth-ui/react'

export interface WebappProvidersProps extends EnvContextValue {
  authClient?: AuthProviderProps['authClient']
  redirectTo?: string
  sessionCleanupEnabled?: boolean
}

export function WebappProviders(props: PropsWithChildren<WebappProvidersProps>) {
  return (
    <StrictMode>
      <EnvProvider
        publicEnv={props.publicEnv}
        flash={props.flash}
      >
        <ErrorBoundary
          FallbackComponent={ErrorPage}
          onError={(error, info) => {
            // Additional logging or reporting can go here
            // eslint-disable-next-line no-console
            console.error('Error logged via onError:', error, info)
          }}
        >
          <ThemeProvider
            attribute='class'
            defaultTheme='system'
            disableTransitionOnChange
            enableSystem
          >
            <BetterAuthUIProvider
              authClient={props.authClient}
              redirectTo={props.redirectTo}
              sessionCleanupEnabled={props.sessionCleanupEnabled}
            >
              {props.children}
            </BetterAuthUIProvider>
          </ThemeProvider>
          <Toaster />
        </ErrorBoundary>
      </EnvProvider>
    </StrictMode>
  )
}
