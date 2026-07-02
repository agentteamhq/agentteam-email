import { HttpStatusCode } from '@main/common'
import debug from 'debug'
import { Elysia } from 'elysia'

import { globals } from '../globals'
import { handleAgentMailIngestRequest } from '../agent-mail/ingest'
import { handleAgentMailRuntimeSnapshotRequest } from '../agent-mail/runtime-projection'
import { handleBetterAuthProtocolRequest } from '../auth/protocol-handler'
import { handleCloudflareControlSendRawRequest } from '../cloudflare/internal-send'

import { PRIVATE_VARS } from '../vars.private'
import admin from './admin'
import adminSetup from './admin-setup'
import agentAccess from './agent-access'
import cloudflare from './cloudflare'
import e2eTestSupport from './e2e-test-support'
import mail from './mail'
import whoami from './whoami'

const apiLog = debug('api:backend')

const internalRpcApp = new Elysia({ name: 'rpc-internal', prefix: '/internal' })
  .get('/agent-mail/runtime/snapshot', ({ request }) => handleAgentMailRuntimeSnapshotRequest(request))
  .post('/agent-mail/cloudflare/send-raw', ({ request }) => handleCloudflareControlSendRawRequest(request))

if (PRIVATE_VARS.E2E_TEST_SUPPORT_ENABLED) {
  internalRpcApp.use(e2eTestSupport)
}

/**
 * Internal app/control/auth RPC route collection.
 */
export const backendRpcApp = new Elysia({ name: 'rpc', prefix: '/rpc', normalize: false, strictPath: false })
  .onRequest(({ request, set }) => {
    const url = new URL(request.url)
    apiLog(`${request.method} ${url.pathname}`)
    set.headers['cache-control'] = 'private, no-cache, no-store'
  })
  .get('/health', async ({ status }) => {
    await globals()
    return status(HttpStatusCode.Ok, { message: 'Backend is healthy' })
  })
  .all('/agent-mail/ingest/v1/:connectionPublicId', ({ params, request }) =>
    handleAgentMailIngestRequest(request, params.connectionPublicId)
  )
  .all('/auth/api/admin/oauth2', ({ status }) => status(404, { error: 'Not found' }))
  .all('/auth/api/admin/oauth2/*', ({ status }) => status(404, { error: 'Not found' }))
  .all('/auth/api/agent/approve-capability', ({ status }) => status(404, { error: 'Not found' }))
  .all('/auth/api/agent/grant-capability', ({ status }) => status(404, { error: 'Not found' }))
  .all('/auth/api/agent/revoke-capability', ({ status }) => status(404, { error: 'Not found' }))
  // The Better Auth audit-log plugin exposes a generic insert endpoint for
  // authenticated users. Audit records in this app are server-owned evidence, so
  // user-submitted audit events must not reach the Better Auth mount.
  .all('/auth/api/audit-log/insert', ({ status }) => status(404, { error: 'Not found' }))
  // Better Auth is mounted at /rpc/auth for browser/internal auth protocol
  // traffic. The handler keeps Better Auth's logical /api base path internal to
  // the mounted request.
  .mount('/auth', handleBetterAuthProtocolRequest)
  // Mount route modules
  .use(internalRpcApp)
  .use(admin)
  .use(adminSetup)
  .use(agentAccess)
  .use(cloudflare)
  .use(mail)
  .use(whoami)

export type BackendRpcAppType = typeof backendRpcApp
