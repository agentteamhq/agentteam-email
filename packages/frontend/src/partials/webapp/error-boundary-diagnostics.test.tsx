/* eslint-disable no-console -- Tests assert browser error-boundary diagnostics. */
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IslandProviders } from './island-providers'
import { WebappProviders } from './webapp-providers'
import type { ReactNode } from 'react'
import type { PublicEnv } from '../../types'

interface ErrorBoundaryInfo {
  componentStack?: string | null
}

type ProviderKind = 'island' | 'webapp'

const providerTestState = vi.hoisted(() => ({
  error: new Error('test error'),
  info: {
    componentStack: 'at TestComponent'
  } satisfies ErrorBoundaryInfo
}))

vi.mock('react-error-boundary', () => ({
  ErrorBoundary: ({
    children,
    onError
  }: {
    children?: ReactNode
    onError?: (error: unknown, info: ErrorBoundaryInfo) => void
  }) => {
    onError?.(providerTestState.error, providerTestState.info)
    return children ?? null
  }
}))

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children?: ReactNode }) => children ?? null
}))

vi.mock('./better-auth-ui-provider', () => ({
  BetterAuthUIProvider: ({ children }: { children?: ReactNode }) => children ?? null
}))

vi.mock('../../components/ui/sonner', () => ({
  Toaster: () => null
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn()
  }
}))

const publicEnv = {
  DEV: false,
  NODE_ENV: 'test',
  PROD: false,
  PUBLIC_GOOGLE_CLIENT_ID: undefined,
  PUBLIC_HOSTNAME: 'https://mail.example.com',
  PUBLIC_HTTPS_PROTO: true,
  PUBLIC_LINKEDIN_CLIENT_ID: undefined,
  TEST: true
} satisfies PublicEnv

const providerKinds = ['webapp', 'island'] as const satisfies readonly ProviderKind[]
const boundaryNames = {
  island: 'island-providers',
  webapp: 'webapp-providers'
} as const satisfies Record<ProviderKind, string>
const restoreConsoleSpies: Array<() => void> = []

describe('webapp provider error-boundary diagnostics', () => {
  afterEach(() => {
    for (const restore of restoreConsoleSpies.splice(0)) {
      restore()
    }
  })

  it.each(providerKinds)('redacts sensitive semantic error names from %s diagnostics', (provider) => {
    expect.hasAssertions()
    const consoleErrorSpy = captureConsoleError()
    const sensitiveErrorNames = [
      'AuthenticationError',
      'OAuthCallbackError',
      'JWTAccessTokenError',
      'ApiKeyCredentialError',
      'AuthorizationCookieSessionError',
      'PasswordSecretError'
    ]

    for (const errorName of sensitiveErrorNames) {
      const error = new Error('sensitive error message must not be logged')
      error.name = errorName
      providerTestState.error = error
      consoleErrorSpy.mockClear()

      renderProvider(provider)

      const diagnostic = readConsoleDiagnostic(consoleErrorSpy)
      expect(diagnostic).toMatchObject({
        boundaryName: boundaryNames[provider],
        errorType: 'error',
        hasComponentStack: true
      })
      expect(diagnostic).not.toHaveProperty('errorName')
      expect(JSON.stringify(diagnostic)).not.toContain(errorName)
    }
  })

  it.each(providerKinds)('preserves ordinary safe error names in %s diagnostics', (provider) => {
    expect.hasAssertions()
    const consoleErrorSpy = captureConsoleError()
    const safeErrorNames = ['TypeError', 'ValidationError']

    for (const errorName of safeErrorNames) {
      const error = new Error('ordinary error message must not be logged')
      error.name = errorName
      providerTestState.error = error
      consoleErrorSpy.mockClear()

      renderProvider(provider)

      expect(readConsoleDiagnostic(consoleErrorSpy)).toMatchObject({
        boundaryName: boundaryNames[provider],
        errorName,
        errorType: 'error',
        hasComponentStack: true
      })
    }
  })
})

function renderProvider(provider: ProviderKind): void {
  if (provider === 'webapp') {
    renderToStaticMarkup(
      <WebappProviders publicEnv={publicEnv}>
        <span>child</span>
      </WebappProviders>
    )
    return
  }

  renderToStaticMarkup(
    <IslandProviders publicEnv={publicEnv}>
      <span>child</span>
    </IslandProviders>
  )
}

function captureConsoleError() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  restoreConsoleSpies.push(() => {
    spy.mockRestore()
  })
  return spy
}

function readConsoleDiagnostic(spy: ReturnType<typeof captureConsoleError>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1)

  if (!call) {
    throw new Error('Expected console.error to receive a provider diagnostic.')
  }

  expect(call[0]).toBe('Error boundary caught an error')

  const diagnostic = call[1]

  if (typeof diagnostic !== 'object' || diagnostic === null) {
    throw new Error('Expected provider diagnostic to be an object.')
  }

  return diagnostic as Record<string, unknown>
}
