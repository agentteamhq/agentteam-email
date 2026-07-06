import { HttpStatusCode } from '@main/common'
import debug from 'debug'
import { Elysia } from 'elysia'

import { globals } from './globals'
import {
  handleAgentAuthConfigurationRequest,
  isAgentAuthConfigurationRequestPath
} from './auth/agent-auth-metadata'
import { handleAtEmailMetadataRequest, isAtEmailMetadataRequestPath } from './auth/at-email-metadata'
import { handleOAuthMetadataRequest, isOAuthMetadataRequestPath } from './auth/oauth-metadata'
import { backendApiApp } from './api'
import { backendRpcApp } from './rpc'
import { createSafeErrorLogDetails, createSafeRequestLogDetails } from './auth/log-redaction'
import {
  createPublicErrorResponse,
  createSafeRequestCorrelationLogDetails,
  mapPublicErrorResponse
} from './public-error-response'

const log = debug('app:http')

function isRoutePath(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`)
}

export function isBackendHttpRequestPath(pathname: string): boolean {
  return (
    isRoutePath(pathname, '/api') ||
    isRoutePath(pathname, '/rpc') ||
    pathname === '/health' ||
    isOAuthMetadataRequestPath(pathname) ||
    isAgentAuthConfigurationRequestPath(pathname) ||
    isAtEmailMetadataRequestPath(pathname)
  )
}

export const backendHttpApp = new Elysia({
  name: 'backend-http',
  normalize: false,
  strictPath: false
})
  .onError(({ code, error, request, set }) => {
    const publicError = mapPublicErrorResponse({ code, error, request })
    const errorLogDetails = createSafeErrorLogDetails(error)
    log('backend_http_unhandled_error %o', {
      error: errorLogDetails,
      ...(errorLogDetails.code ? { errorCode: errorLogDetails.code } : {}),
      operation: 'backend_http_unhandled_error',
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
  .use(backendApiApp)
  .use(backendRpcApp)
  .all('/.well-known/oauth-authorization-server', ({ request }) =>
    requireBackendResponse(handleOAuthMetadataRequest(request), request)
  )
  .all('/.well-known/openid-configuration', ({ request }) =>
    requireBackendResponse(handleOAuthMetadataRequest(request), request)
  )
  .all('/.well-known/oauth-protected-resource/api', ({ request }) =>
    requireBackendResponse(handleOAuthMetadataRequest(request), request)
  )
  .all('/.well-known/agent-configuration', ({ request }) =>
    requireBackendResponse(handleAgentAuthConfigurationRequest(request), request)
  )
  .all('/.well-known/at-email.json', ({ request }) =>
    requireBackendResponse(handleAtEmailMetadataRequest(request), request)
  )
  .get('/health', () => handleHealthRequest())

async function requireBackendResponse(
  response: Promise<Response | null>,
  request: Request
): Promise<Response> {
  const resolved = await response
  return (
    resolved ??
    createPublicErrorResponse({
      code: HttpStatusCode.NotFound,
      error: { status: HttpStatusCode.NotFound },
      request
    })
  )
}

async function handleHealthRequest(): Promise<Response> {
  await globals()
  const body =
    '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Health Check</title></head><body><h1>Backend is healthy</h1></body></html>'

  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8'
    },
    status: HttpStatusCode.Ok
  })
}

export type BackendHttpAppType = typeof backendHttpApp
