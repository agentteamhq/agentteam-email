import { HttpStatusCode } from '@main/common'
import debug from 'debug'
import { Elysia } from 'elysia'

import { globals } from '../globals'
import { handleAgentMailIngestRequest } from '../agent-mail/ingest'
import { handleAgentMailRuntimeSnapshotRequest } from '../agent-mail/runtime-projection'
import { isValidAgentMailCapabilityRequestBody } from '../auth/agent-auth-config'
import { hasBearerCredential, hasBearerJwt, parseBearerAuthorization } from '../auth/authorization-header'
import { handleCloudflareControlSendRawRequest } from '../cloudflare/internal-send'
import { rewritePublicOAuthMetadataResponse } from '../auth/oauth-metadata'
import { PUBLIC_VARS } from '../vars.public'

import { PRIVATE_VARS } from '../vars.private'
import admin from './admin'
import adminSetup from './admin-setup'
import agentAccess from './agent-access'
import cloudflare from './cloudflare'
import debugRoute from './debug'
import e2eTestSupport from './e2e-test-support'
import mail from './mail'
import test from './test'
import whoami from './whoami'

const apiLog = debug('api:backend')

const AGENT_AUTH_CAPABILITY_REQUEST_PATHS = new Set([
  '/api/agent/register',
  '/api/agent/request-capability',
  '/rpc/auth/api/agent/register',
  '/rpc/auth/api/agent/request-capability'
])
const AGENT_AUTH_BEARER_CREDENTIAL_PATHS = new Set([
  '/api/agent/register',
  '/api/agent/request-capability',
  '/api/agent/revoke',
  '/api/agent/revoke-capability',
  '/api/agent/status',
  '/rpc/auth/api/agent/register',
  '/rpc/auth/api/agent/request-capability',
  '/rpc/auth/api/agent/revoke',
  '/rpc/auth/api/agent/revoke-capability',
  '/rpc/auth/api/agent/status'
])

const internalRpcApp = new Elysia({ name: 'rpc-internal', prefix: '/internal' })
  .get('/agent-mail/runtime/snapshot', ({ request }) => handleAgentMailRuntimeSnapshotRequest(request))
  .post('/agent-mail/cloudflare/send-raw', ({ request }) => handleCloudflareControlSendRawRequest(request))

if (PUBLIC_VARS.DEV) {
  internalRpcApp.use(debugRoute).use(test)
}

if (PRIVATE_VARS.E2E_TEST_SUPPORT_ENABLED) {
  internalRpcApp.use(e2eTestSupport)
}

/**
 * Main Routes app with /api prefix
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
  .get('/auth/api/.well-known/oauth-authorization-server', async ({ request }) => {
    const { auth } = await globals()
    return rewritePublicOAuthMetadataResponse(await auth.handler(request))
  })
  .get('/auth/api/.well-known/openid-configuration', async ({ request }) => {
    const { auth } = await globals()
    return rewritePublicOAuthMetadataResponse(await auth.handler(request))
  })
  .all('/auth/api/admin/oauth2', ({ status }) => status(404, { error: 'Not found' }))
  .all('/auth/api/admin/oauth2/*', ({ status }) => status(404, { error: 'Not found' }))
  .all('/auth/api/agent/approve-capability', ({ status }) => status(404, { error: 'Not found' }))
  .all('/auth/api/agent/grant-capability', ({ status }) => status(404, { error: 'Not found' }))
  .all('/auth/api/agent/revoke-capability', ({ status }) => status(404, { error: 'Not found' }))
  // The Better Auth audit-log plugin exposes a generic insert endpoint for
  // authenticated users. Audit records in this app are server-owned evidence, so
  // user-submitted audit events must not reach the Better Auth mount.
  .all('/auth/api/audit-log/insert', ({ status }) => status(404, { error: 'Not found' }))
  // Better Auth is mounted at /rpc/auth while keeping /api as its logical
  // Better Auth basePath. Public OAuth metadata routes above rewrite generated
  // /api URLs back to this public /rpc/auth/api mount.
  .mount('/auth', async (req) => {
    const invalidBearerCredentialResponse = invalidAgentAuthBearerCredentialResponse(req)
    if (invalidBearerCredentialResponse) {
      return invalidBearerCredentialResponse
    }

    const invalidCapabilityRequestResponse = await invalidAgentMailCapabilityRequestResponse(req)
    if (invalidCapabilityRequestResponse) {
      return invalidCapabilityRequestResponse
    }

    const { auth } = await globals()
    return agentAuthBearerChallengeResponse(req, await auth.handler(req))
  })
  // Mount route modules
  .use(internalRpcApp)
  .use(admin)
  .use(adminSetup)
  .use(agentAccess)
  .use(cloudflare)
  .use(mail)
  .use(whoami)

export type BackendRpcAppType = typeof backendRpcApp

function invalidAgentAuthBearerCredentialResponse(request: Request): Response | null {
  if (!AGENT_AUTH_BEARER_CREDENTIAL_PATHS.has(new URL(request.url).pathname)) {
    return null
  }

  if (parseBearerAuthorization(request.headers).status !== 'malformed') {
    return null
  }

  return Response.json(
    {
      error: 'invalid_token'
    },
    {
      headers: {
        'WWW-Authenticate': 'Bearer realm="agentteam-agent-auth"'
      },
      status: HttpStatusCode.Unauthorized
    }
  )
}

async function invalidAgentMailCapabilityRequestResponse(request: Request): Promise<Response | null> {
  if (request.method !== 'POST' || !AGENT_AUTH_CAPABILITY_REQUEST_PATHS.has(new URL(request.url).pathname)) {
    return null
  }

  if (!hasBearerJwt(request.headers)) {
    return null
  }

  let body: unknown
  try {
    body = await request.clone().json()
  } catch {
    return null
  }

  if (isValidAgentMailCapabilityRequestBody(body)) {
    return null
  }

  return Response.json(
    {
      error: 'invalid_request'
    },
    {
      status: HttpStatusCode.BadRequest
    }
  )
}

function agentAuthBearerChallengeResponse(request: Request, response: Response): Response {
  if (
    response.status !== 401 ||
    !hasBearerCredential(request.headers) ||
    !AGENT_AUTH_BEARER_CREDENTIAL_PATHS.has(new URL(request.url).pathname)
  ) {
    return response
  }

  const existingChallenge = response.headers.get('WWW-Authenticate')
  if (existingChallenge && /\bBearer\b/iu.test(existingChallenge)) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set(
    'WWW-Authenticate',
    existingChallenge
      ? `${existingChallenge}, Bearer realm="agentteam-agent-auth"`
      : 'Bearer realm="agentteam-agent-auth"'
  )
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  })
}
