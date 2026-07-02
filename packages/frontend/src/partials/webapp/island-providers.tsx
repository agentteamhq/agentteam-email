import { StrictMode } from 'react'
import { ThemeProvider } from 'next-themes'
import { ErrorBoundary } from 'react-error-boundary'

import { EnvProvider } from './env-provider'
import { ErrorPage } from './error-page'
import type { PropsWithChildren } from 'react'
import type { EnvContextValue } from './env-context'

export interface IslandProvidersProps extends EnvContextValue {}

const SAFE_ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/

interface ErrorBoundaryInfo {
  componentStack?: string | null
}

function getErrorName(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined
  }

  return SAFE_ERROR_NAME_PATTERN.test(error.name) ? error.name : 'Error'
}

function getErrorType(error: unknown) {
  if (error === null) {
    return 'null'
  }

  if (Array.isArray(error)) {
    return 'array'
  }

  if (error instanceof Error) {
    return 'error'
  }

  return typeof error
}

function logIslandProviderError(error: unknown, info: ErrorBoundaryInfo) {
  const diagnostic = {
    boundaryName: 'island-providers',
    errorName: getErrorName(error),
    errorType: getErrorType(error),
    hasComponentStack: Boolean(info.componentStack)
  }

  // eslint-disable-next-line no-console
  console.error('Error boundary caught an error', diagnostic)
}

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
              logIslandProviderError(error, info)
            }}
          >
            {props.children}
          </ErrorBoundary>
        </ThemeProvider>
      </EnvProvider>
    </StrictMode>
  )
}
