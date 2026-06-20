/* eslint-disable no-restricted-syntax -- Runtime entrypoint starts backend jobs before loading the frontend side-effect server. */
import { startScheduledJobs } from '@main/backend'

// Start backend-owned background work before importing the frontend package,
// which starts the HTTP server as a package side effect.
await startScheduledJobs()
await import('@main/frontend')
