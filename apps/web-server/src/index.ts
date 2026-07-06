/* eslint-disable no-restricted-syntax -- Runtime entrypoint starts backend jobs before loading the frontend side-effect server. */
import { startScheduledJobs } from '@main/backend'
import debug from 'debug'

const log = debug('app:web-server')
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

async function runStartupPhase(phase: 'frontend-import' | 'scheduled-jobs', task: () => Promise<unknown>) {
  log('startup phase starting', { phase })
  try {
    await task()
    log('startup phase completed', { phase })
  } catch (error) {
    log('startup phase failed', { phase, errorType: safeErrorType(error) })
    throw error
  }
}

function safeErrorType(error: unknown): string {
  if (error instanceof Error && isSafeDiagnosticIdentifier(error.name)) {
    return error.name
  }
  if (error === null) {
    return 'null'
  }
  return typeof error
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

// Start backend-owned background work before importing the frontend package,
// which starts the HTTP server as a package side effect.
await runStartupPhase('scheduled-jobs', startScheduledJobs)
await runStartupPhase('frontend-import', () => import('@main/frontend'))
