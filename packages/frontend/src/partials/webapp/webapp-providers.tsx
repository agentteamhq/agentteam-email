import { StrictMode, useEffect } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { ThemeProvider } from 'next-themes'
import { toast } from 'sonner'

import { Toaster } from '../../components/ui/sonner'

import { BetterAuthUIProvider } from './better-auth-ui-provider'
import { EnvProvider } from './env-provider'
import { ErrorPage } from './error-page'
import type { EnvContextValue } from './env-context'
import type { PropsWithChildren } from 'react'
import type { AuthProviderProps } from '@better-auth-ui/react'

export interface WebappProvidersProps extends EnvContextValue {
  authClient?: AuthProviderProps['authClient']
  redirectTo?: string
  sessionCleanupEnabled?: boolean
}

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

function logWebappProviderError(error: unknown, info: ErrorBoundaryInfo) {
  const diagnostic = {
    boundaryName: 'webapp-providers',
    errorName: getErrorName(error),
    errorType: getErrorType(error),
    hasComponentStack: Boolean(info.componentStack)
  }

  // eslint-disable-next-line no-console
  console.error('Error boundary caught an error', diagnostic)
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
            logWebappProviderError(error, info)
          }}
        >
          <ThemeProvider
            attribute='data-theme'
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
          <FlashToast flash={props.flash} />
        </ErrorBoundary>
      </EnvProvider>
    </StrictMode>
  )
}

function FlashToast({ flash }: { flash?: string | null }) {
  useEffect(() => {
    if (flash) {
      toast.success(flash, { id: 'route-flash' })
    }
  }, [flash])

  return null
}
