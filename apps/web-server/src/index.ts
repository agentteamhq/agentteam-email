/* eslint-disable no-restricted-syntax -- Runtime entrypoint starts backend jobs before loading the frontend side-effect server. */
import { startScheduledJobs } from '@main/backend'
import debug from 'debug'

const log = debug('app:web-server')

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
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(error.name)) {
    return error.name
  }
  if (error === null) {
    return 'null'
  }
  return typeof error
}

// Start backend-owned background work before importing the frontend package,
// which starts the HTTP server as a package side effect.
await runStartupPhase('scheduled-jobs', startScheduledJobs)
await runStartupPhase('frontend-import', () => import('@main/frontend'))
