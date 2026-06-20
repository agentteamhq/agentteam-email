import { type PropsWithChildren, StrictMode } from 'react'
import { ThemeProvider } from 'next-themes'
import { ErrorBoundary } from 'react-error-boundary'

import type { EnvContextValue } from './env-context'
import { EnvProvider } from './env-provider'
import { ErrorPage } from './error-page'

export interface IslandProvidersProps extends EnvContextValue {}

export function IslandProviders(props: PropsWithChildren<IslandProvidersProps>) {
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
            {props.children}
          </ErrorBoundary>
        </ThemeProvider>
      </EnvProvider>
    </StrictMode>
  )
}
