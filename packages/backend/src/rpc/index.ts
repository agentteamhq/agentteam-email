import { HttpStatusCode } from '@main/common'
import debug from 'debug'
import { Elysia } from 'elysia'

import { globals } from '../globals'
import { handleAgentMailForwardingGroupDeliveryRequest } from '../agent-mail/forwarding-group-delivery'
import { handleAgentMailIngestRequest } from '../agent-mail/ingest'
import { handleAgentMailRuntimeSnapshotRequest } from '../agent-mail/runtime-projection'
import { createSafeErrorLogDetails, createSafeRequestLogDetails } from '../auth/log-redaction'
import { handleBetterAuthProtocolRequest } from '../auth/protocol-handler'
import { handleCloudflareControlSendRawRequest } from '../cloudflare/internal-send'
import {
  createPublicErrorResponse,
  createSafeRequestCorrelationLogDetails,
  mapPublicErrorResponse
} from '../public-error-response'

import { PRIVATE_VARS } from '../vars.private'
import admin from './admin'
import adminSetup from './admin-setup'
import agentAccess from './agent-access'
import cloudflare from './cloudflare'
import e2eTestSupport from './e2e-test-support'
import integrations from './integrations'
import mail from './mail'
import whoami from './whoami'

const apiLog = debug('api:backend')
const rpcLog = debug('app:rpc')

const internalRpcApp = new Elysia({ name: 'rpc-internal', prefix: '/internal' })
  .get('/agent-mail/runtime/snapshot', ({ request }) => handleAgentMailRuntimeSnapshotRequest(request))
  .post('/agent-mail/cloudflare/send-raw', ({ request }) => handleCloudflareControlSendRawRequest(request))
  .post('/agent-mail/forwarding-groups/deliveries', ({ request }) =>
    handleAgentMailForwardingGroupDeliveryRequest(request)
  )

if (PRIVATE_VARS.E2E_TEST_SUPPORT_ENABLED) {
  internalRpcApp.use(e2eTestSupport)
}

/**
 * Internal app/control/auth RPC route collection.
 */
export const backendRpcApp = new Elysia({ name: 'rpc', prefix: '/rpc', normalize: false, strictPath: false })
  .onRequest(({ request, set }) => {
    apiLog('rpc_request %o', {
      operation: 'rpc_request',
      ...createSafeRequestLogDetails(request)
    })
    set.headers['cache-control'] = 'private, no-cache, no-store'
  })
  .onError(({ code, error, request, set }) => {
    const publicError = mapPublicErrorResponse({ code, error, request })
    const errorLogDetails = createSafeErrorLogDetails(error)
    rpcLog('rpc_unhandled_error %o', {
      error: errorLogDetails,
      ...(errorLogDetails.code ? { errorCode: errorLogDetails.code } : {}),
      operation: 'rpc_unhandled_error',
      publicError: {
        code: publicError.body.code,
        status: publicError.status,
        ...(publicError.body.supportReference ? { supportReference: publicError.body.supportReference } : {})
      },
      ...createSafeRequestCorrelationLogDetails(request),
      ...createSafeRequestLogDetails(request)
    })
    set.status = publicError.status
    return publicError.body
  })
  .get('/health', async ({ status }) => {
    await globals()
    return status(HttpStatusCode.Ok, { message: 'Backend is healthy' })
  })
  .all('/agent-mail/ingest/v1/:connectionPublicId', ({ params, request }) =>
    handleAgentMailIngestRequest(request, params.connectionPublicId)
  )
  .all('/auth/api/admin/oauth2', ({ request }) => createRpcPublicNotFoundResponse(request))
  .all('/auth/api/admin/oauth2/*', ({ request }) => createRpcPublicNotFoundResponse(request))
  .all('/auth/api/agent/approve-capability', ({ request }) => createRpcPublicNotFoundResponse(request))
  .all('/auth/api/agent/grant-capability', ({ request }) => createRpcPublicNotFoundResponse(request))
  .all('/auth/api/agent/revoke-capability', ({ request }) => createRpcPublicNotFoundResponse(request))
  // The Better Auth audit-log plugin exposes a generic insert endpoint for
  // authenticated users. Audit records in this app are server-owned evidence, so
  // user-submitted audit events must not reach the Better Auth mount.
  .all('/auth/api/audit-log/insert', ({ request }) => createRpcPublicNotFoundResponse(request))
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
  .use(integrations)
  .use(mail)
  .use(whoami)

function createRpcPublicNotFoundResponse(request: Request): Response {
  return createPublicErrorResponse({
    code: HttpStatusCode.NotFound,
    error: { status: HttpStatusCode.NotFound },
    request
  })
}

export type BackendRpcAppType = typeof backendRpcApp
