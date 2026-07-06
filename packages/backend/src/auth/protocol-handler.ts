import { HttpStatusCode } from '@main/common'
import debug from 'debug'

import { globals } from '../globals'
import { isValidAgentMailCapabilityRequestBody } from './agent-auth-config'
import { hasBearerCredential, hasBearerJwt, parseBearerAuthorization } from './authorization-header'
import { rewritePublicOAuthMetadataResponse } from './oauth-metadata'
import {
  createBetterAuthProtocolDiagnosticContext,
  createBetterAuthProtocolErrorLogDetails,
  createBetterAuthProtocolResponseLogDetails,
  runWithBetterAuthProtocolDiagnosticContext
} from './protocol-diagnostics'
import type { BetterAuthProtocolRequestContext } from './protocol-diagnostics'

const BETTER_AUTH_LOGICAL_BASE_PATH = '/api'
const AGENT_AUTH_CAPABILITY_REQUEST_PATHS = new Set(['/api/agent/register', '/api/agent/request-capability'])
const AGENT_AUTH_BEARER_CREDENTIAL_PATHS = new Set([
  '/api/agent/register',
  '/api/agent/request-capability',
  '/api/agent/revoke',
  '/api/agent/revoke-capability',
  '/api/agent/status'
])
const OAUTH_METADATA_PATHS = new Set([
  '/api/.well-known/oauth-authorization-server',
  '/api/.well-known/openid-configuration'
])
const HTTP_STATUS_UNAUTHORIZED: number = HttpStatusCode.Unauthorized
const log = debug('app:auth:protocol')

export async function handleBetterAuthProtocolRequest(
  request: Request,
  context: BetterAuthProtocolRequestContext = {}
): Promise<Response> {
  const authRequest = betterAuthLogicalRequest(request)
  const diagnostics = createBetterAuthProtocolDiagnosticContext(request, authRequest, context)
  const invalidBearerCredentialResponse = invalidAgentAuthBearerCredentialResponse(authRequest)
  if (invalidBearerCredentialResponse) {
    if (diagnostics) {
      log('better_auth_oauth_callback_rejected %o', {
        ...diagnostics,
        phase: 'bearer_validation_failed',
        response: { status: invalidBearerCredentialResponse.status }
      })
    }
    return invalidBearerCredentialResponse
  }

  const invalidCapabilityRequestResponse = await invalidAgentMailCapabilityRequestResponse(authRequest)
  if (invalidCapabilityRequestResponse) {
    if (diagnostics) {
      log('better_auth_oauth_callback_rejected %o', {
        ...diagnostics,
        phase: 'capability_request_validation_failed',
        response: { status: invalidCapabilityRequestResponse.status }
      })
    }
    return invalidCapabilityRequestResponse
  }

  const { auth } = await globals()
  if (diagnostics) {
    log('better_auth_oauth_callback_received %o', {
      ...diagnostics,
      phase: 'handler_entry'
    })
  }

  let authResponse: Response
  try {
    authResponse = await runWithBetterAuthProtocolDiagnosticContext(diagnostics, () =>
      auth.handler(authRequest)
    )
  } catch (error) {
    if (diagnostics) {
      const errorLogDetails = createBetterAuthProtocolErrorLogDetails(error)
      log('better_auth_oauth_callback_exception %o', {
        ...diagnostics,
        error: errorLogDetails,
        ...(errorLogDetails.code ? { errorCode: errorLogDetails.code } : {}),
        phase: 'handler_exception'
      })
    }
    throw error
  }

  const response = agentAuthBearerChallengeResponse(authRequest, authResponse)
  if (diagnostics) {
    log(
      'better_auth_oauth_callback_completed %o',
      await createBetterAuthProtocolResponseLogDetails(diagnostics, response)
    )
  }
  if (OAUTH_METADATA_PATHS.has(new URL(authRequest.url).pathname)) {
    return rewritePublicOAuthMetadataResponse(response)
  }
  return response
}

function betterAuthLogicalRequest(request: Request): Request {
  const url = new URL(request.url)
  if (
    url.pathname === BETTER_AUTH_LOGICAL_BASE_PATH ||
    url.pathname.startsWith(`${BETTER_AUTH_LOGICAL_BASE_PATH}/`)
  ) {
    return request
  }

  url.pathname =
    url.pathname === '/' ? BETTER_AUTH_LOGICAL_BASE_PATH : `${BETTER_AUTH_LOGICAL_BASE_PATH}${url.pathname}`
  return new Request(url, request)
}

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
    response.status !== HTTP_STATUS_UNAUTHORIZED ||
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
