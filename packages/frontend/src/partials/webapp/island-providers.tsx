import { StrictMode } from 'react'
import { ThemeProvider } from 'next-themes'
import { ErrorBoundary } from 'react-error-boundary'

import { EnvProvider } from './env-provider'
import { ErrorPage } from './error-page'
import type { PropsWithChildren } from 'react'
import type { EnvContextValue } from './env-context'

export interface IslandProvidersProps extends EnvContextValue {}

const safeDiagnosticIdentifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/
const sensitiveDiagnosticIdentifierTerms = new Set([
  'api-key',
  'apikey',
  'auth',
  'authentication',
  'authorization',
  'authorized',
  'bearer',
  'cookie',
  'credential',
  'credentials',
  'jwk',
  'jwks',
  'jwt',
  'key',
  'oauth',
  'password',
  'secret',
  'session',
  'token',
  'unauthorized'
])

interface ErrorBoundaryInfo {
  componentStack?: string | null
}

interface ErrorBoundaryDiagnostic {
  boundaryName: 'island-providers'
  errorName?: string
  errorType: string
  hasComponentStack: boolean
}

function getErrorName(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined
  }

  return isSafeDiagnosticIdentifier(error.name) ? error.name : undefined
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

function getIslandProviderErrorDiagnostic(error: unknown, info: ErrorBoundaryInfo): ErrorBoundaryDiagnostic {
  const diagnostic: ErrorBoundaryDiagnostic = {
    boundaryName: 'island-providers',
    errorType: getErrorType(error),
    hasComponentStack: Boolean(info.componentStack)
  }
  const errorName = getErrorName(error)

  if (errorName) {
    diagnostic.errorName = errorName
  }

  return diagnostic
}

function logIslandProviderError(error: unknown, info: ErrorBoundaryInfo) {
  const diagnostic = getIslandProviderErrorDiagnostic(error, info)

  // eslint-disable-next-line no-console
  console.error('Error boundary caught an error', diagnostic)
}

function isSafeDiagnosticIdentifier(value: string): boolean {
  return safeDiagnosticIdentifierPattern.test(value) && !isSensitiveDiagnosticIdentifier(value)
}

function isSensitiveDiagnosticIdentifier(value: string): boolean {
  const normalized = value.toLowerCase()

  return (
    diagnosticIdentifierTerms(value).some((term) => sensitiveDiagnosticIdentifierTerms.has(term)) ||
    /(?:^|[._:-])(?:api-key|apikey|bearer|jwk|jwks|key|token)(?:$|[._:-])/u.test(normalized) ||
    /(?:api|decrypt|encrypt|encryption|oauth|private|public|refresh|secret|session|signing)key/u.test(
      normalized
    )
  )
}

function diagnosticIdentifierTerms(value: string): string[] {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9-]+/u)
    .filter(Boolean)
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
