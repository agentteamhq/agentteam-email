import { type PropsWithChildren, StrictMode } from 'react'
import type { AuthProviderProps } from '@better-auth-ui/react'
import { ErrorBoundary } from 'react-error-boundary'

import { Toaster } from '../../components/ui/sonner'

import { BetterAuthUIProvider } from './better-auth-ui-provider'
import { BetterAuthViewTemplate, type BetterAuthViewTemplateProps } from './better-auth-view-template'
import type { EnvContextValue } from './env-context'
import { EnvProvider } from './env-provider'
import { ErrorPage } from './error-page'
import { NotFoundPage } from './not-found-page'

export interface WebappProvidersProps extends EnvContextValue {
  authClient?: AuthProviderProps['authClient']
  redirectTo?: string
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
          <BetterAuthUIProvider
            authClient={props.authClient}
            redirectTo={props.redirectTo}
          >
            {props.children}
          </BetterAuthUIProvider>
          <Toaster />
        </ErrorBoundary>
      </EnvProvider>
    </StrictMode>
  )
}
