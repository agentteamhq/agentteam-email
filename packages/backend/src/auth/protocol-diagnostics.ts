import { AsyncLocalStorage } from 'node:async_hooks'

import { createSafeRequestCorrelationLogDetails } from '../public-error-response'
import {
  createProtocolDiagnosticErrorLogDetails,
  sanitizeProtocolDiagnosticTextForLogging,
  sanitizeProtocolDiagnosticValueForLogging,
  sanitizeProtocolDiagnosticUrlForLogging
} from './log-redaction'
import type { ProtocolDiagnosticLogValue } from './log-redaction'

export interface BetterAuthProtocolDiagnosticContext {
  basePath: string
  callbackPath: string
  callbackUri?: string
  callbackURL?: string
  cfRay?: string
  cloudflareIntentId?: string
  consumerClass?: string
  flow: 'oauth_callback'
  logicalBetterAuthRequestUrl: string
  logicalPath: string
  logicalQueryParameterNames: readonly string[]
  method: string
  mountPath: string
  mountedRequestUrl: string
  operation: 'better_auth_protocol_request'
  provider?: string
  providerError?: string
  providerErrorDescription?: string
  providerErrorMessage?: string
  providerId?: string
  publicMountPath?: string
  publicRequestUrl?: string
  redirectUri?: string
  requestId?: string
  requestPath: string
  requestQueryParameterNames: readonly string[]
  requestUrl: string
  returnTarget?: string
  traceparent?: string
}

export interface BetterAuthProtocolDiagnosticLogDetails extends BetterAuthProtocolDiagnosticContext {
  phase: string
}

export interface BetterAuthProtocolRequestContext {
  consumerClass?: string
  mountedRequestUrl?: string
  publicMountPath?: string
  publicRequestUrl?: string
}

export interface BetterAuthProtocolErrorLogDetails {
  body?: Record<string, ProtocolDiagnosticLogValue>
  code?: string
  message?: string
  name: string
  status?: string
  statusCode?: number
  type: string
}

type BetterAuthProtocolResponseBodyLogDetails = {
  responseBody?: string
  responseBodyJson?: ProtocolDiagnosticLogValue
  responseBodyReadError?: BetterAuthProtocolErrorLogDetails
  responseContentType?: string
}

const diagnosticContext = new AsyncLocalStorage<BetterAuthProtocolDiagnosticContext>()

export function runWithBetterAuthProtocolDiagnosticContext<T>(
  context: BetterAuthProtocolDiagnosticContext | null,
  operation: () => T
): T {
  return context ? diagnosticContext.run(context, operation) : operation()
}

export function getBetterAuthProtocolDiagnosticContext(): BetterAuthProtocolDiagnosticLogDetails | undefined {
  return getActiveBetterAuthProtocolDiagnosticLogDetails('better_auth_internal')
}

export function getActiveBetterAuthProtocolDiagnosticLogDetails(
  phase: string
): BetterAuthProtocolDiagnosticLogDetails | undefined {
  const context = diagnosticContext.getStore()
  return context ? createBetterAuthProtocolDiagnosticLogDetails(context, phase) : undefined
}

function createBetterAuthProtocolDiagnosticContextFromInput({
  basePath,
  context,
  logicalRequest,
  request
}: {
  basePath: string
  context?: BetterAuthProtocolRequestContext
  logicalRequest: Request
  request: Request
}): BetterAuthProtocolDiagnosticContext | null {
  const logicalUrl = new URL(logicalRequest.url)
  if (!isOAuthCallbackPath(logicalUrl.pathname)) {
    return null
  }

  const requestUrl = new URL(request.url)
  const publicRequestUrl = publicRequestUrlFromMount(requestUrl, context?.publicMountPath)
  const providerId = providerIdFromOAuthCallbackPath(logicalUrl.pathname)
  const provider = providerId
  const logicalSearch = logicalUrl.searchParams
  const requestSearch = requestUrl.searchParams
  const callbackUri = firstSanitizedUrlParameter(logicalSearch, requestSearch, 'callbackUri')
  const callbackURL = firstSanitizedUrlParameter(logicalSearch, requestSearch, 'callbackURL')
  const cloudflareIntentId = firstSanitizedTextParameter(
    logicalSearch,
    requestSearch,
    'cloudflareIntentId'
  )
  const redirectUri = firstSanitizedUrlParameter(logicalSearch, requestSearch, 'redirect_uri')
  const providerError = firstSanitizedTextParameter(logicalSearch, requestSearch, 'error')
  const providerErrorDescription = firstSanitizedTextParameter(
    logicalSearch,
    requestSearch,
    'error_description'
  )
  const providerErrorMessage =
    firstSanitizedTextParameter(logicalSearch, requestSearch, 'error_message') ??
    firstSanitizedTextParameter(logicalSearch, requestSearch, 'message')
  const returnTarget = firstSanitizedTextParameter(logicalSearch, requestSearch, 'returnTarget')

  return {
    basePath,
    callbackPath: publicRequestUrl.pathname,
    ...(callbackUri ? { callbackUri } : {}),
    ...(callbackURL ? { callbackURL } : {}),
    ...(cloudflareIntentId ? { cloudflareIntentId } : {}),
    ...(context?.consumerClass ? { consumerClass: context.consumerClass } : {}),
    flow: 'oauth_callback',
    logicalBetterAuthRequestUrl: sanitizeUrlForProtocolLogging(logicalRequest.url),
    logicalPath: logicalUrl.pathname,
    logicalQueryParameterNames: queryParameterNames(logicalUrl),
    method: logicalRequest.method.toUpperCase(),
    mountPath: context?.publicMountPath ?? inferMountPath(requestUrl.pathname, logicalUrl.pathname, basePath),
    mountedRequestUrl: sanitizeUrlForProtocolLogging(context?.mountedRequestUrl ?? request.url),
    operation: 'better_auth_protocol_request',
    ...(provider ? { provider } : {}),
    ...(providerError ? { providerError } : {}),
    ...(providerErrorDescription ? { providerErrorDescription } : {}),
    ...(providerErrorMessage ? { providerErrorMessage } : {}),
    ...(providerId ? { providerId } : {}),
    ...(context?.publicMountPath ? { publicMountPath: context.publicMountPath } : {}),
    publicRequestUrl: sanitizeUrlForProtocolLogging(context?.publicRequestUrl ?? publicRequestUrl.toString()),
    ...(redirectUri ? { redirectUri } : {}),
    ...createSafeRequestCorrelationLogDetails(request),
    requestPath: requestUrl.pathname,
    requestQueryParameterNames: queryParameterNames(requestUrl),
    requestUrl: sanitizeUrlForProtocolLogging(context?.publicRequestUrl ?? publicRequestUrl.toString()),
    ...(returnTarget ? { returnTarget } : {})
  }
}

export async function createBetterAuthProtocolResponseLogDetails(
  context: BetterAuthProtocolDiagnosticContext,
  response: Response
): Promise<BetterAuthProtocolDiagnosticLogDetails & {
  redirectLocation?: string
  redirectLocationOrigin?: string
  redirectLocationPath?: string
  redirectQueryParameterNames?: readonly string[]
  responseStatus: number
} & BetterAuthProtocolResponseBodyLogDetails> {
  const redirectLocation = response.headers.get('Location')
  const redirectUrl = redirectLocation ? parsedUrl(redirectLocation, context.requestUrl) : null
  const responseBodyDetails = await createBetterAuthProtocolResponseBodyLogDetails(response)
  return {
    ...createBetterAuthProtocolDiagnosticLogDetails(context, 'handler_response'),
    ...(redirectLocation
      ? {
          redirectLocation: sanitizeLocationForProtocolLogging(
            redirectLocation,
            context.logicalBetterAuthRequestUrl
          )
        }
      : {}),
    ...(redirectUrl
      ? {
          redirectLocationOrigin: redirectUrl.origin,
          redirectLocationPath: redirectUrl.pathname,
          redirectQueryParameterNames: queryParameterNames(redirectUrl)
        }
      : {}),
    ...responseBodyDetails,
    responseStatus: response.status
  }
}

export function createBetterAuthProtocolDiagnosticContext(
  request: Request,
  logicalRequest: Request,
  context?: BetterAuthProtocolRequestContext
): BetterAuthProtocolDiagnosticContext | null
export function createBetterAuthProtocolDiagnosticContext({
  basePath,
  context,
  logicalRequest,
  request
}: {
  basePath: string
  context?: BetterAuthProtocolRequestContext
  logicalRequest: Request
  request: Request
}): BetterAuthProtocolDiagnosticContext | null
export function createBetterAuthProtocolDiagnosticContext(
  inputOrRequest:
    | Request
    | {
        basePath: string
        context?: BetterAuthProtocolRequestContext
        logicalRequest: Request
        request: Request
      },
  maybeLogicalRequest?: Request,
  maybeContext?: BetterAuthProtocolRequestContext
): BetterAuthProtocolDiagnosticContext | null {
  const input =
    inputOrRequest instanceof Request
      ? {
          basePath: '/api',
          context: maybeContext,
          logicalRequest: maybeLogicalRequest,
          request: inputOrRequest
        }
      : inputOrRequest

  if (!input.logicalRequest) {
    return null
  }

  return createBetterAuthProtocolDiagnosticContextFromInput({
    ...input,
    logicalRequest: input.logicalRequest
  })
}

export function createBetterAuthProtocolDiagnosticLogDetails(
  context: BetterAuthProtocolDiagnosticContext,
  phase: string,
  request?: Request
): BetterAuthProtocolDiagnosticLogDetails {
  return {
    ...context,
    phase,
    ...(request ? createSafeRequestCorrelationLogDetails(request) : {})
  }
}

export function createBetterAuthProtocolErrorLogDetails(error: unknown): BetterAuthProtocolErrorLogDetails {
  return createProtocolDiagnosticErrorLogDetails(error)
}

export function sanitizeUrlForProtocolLogging(value: string): string {
  return sanitizeProtocolDiagnosticUrlForLogging(value)
}

export function sanitizeLocationForProtocolLogging(value: string, baseUrl: string): string {
  return sanitizeProtocolDiagnosticUrlForLogging(value, baseUrl)
}

function isOAuthCallbackPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  const callbackIndex = segments.indexOf('callback')
  return callbackIndex > 0 && segments[callbackIndex - 1] === 'oauth2' && Boolean(segments[callbackIndex + 1])
}

function providerIdFromOAuthCallbackPath(pathname: string): string | undefined {
  const segments = pathname.split('/').filter(Boolean)
  const callbackIndex = segments.indexOf('callback')
  return callbackIndex >= 0 ? segments[callbackIndex + 1] : undefined
}

function inferMountPath(requestPath: string, logicalPath: string, basePath: string): string {
  if (requestPath === logicalPath && requestPath.startsWith(basePath)) {
    return basePath
  }

  if (logicalPath === `${basePath}${requestPath === '/' ? '' : requestPath}`) {
    return requestPath === '/' ? '/' : ''
  }

  return requestPath
}

function publicRequestUrlFromMount(requestUrl: URL, publicMountPath?: string): URL {
  const publicRequestUrl = new URL(requestUrl)
  if (!publicMountPath) {
    return publicRequestUrl
  }

  const normalizedMountPath = publicMountPath.startsWith('/') ? publicMountPath : `/${publicMountPath}`
  publicRequestUrl.pathname = `${normalizedMountPath}${requestUrl.pathname === '/' ? '' : requestUrl.pathname}`
  return publicRequestUrl
}

function parsedUrl(value: string, base?: string): URL | null {
  try {
    return base ? new URL(value, base) : new URL(value)
  } catch {
    return null
  }
}

function queryParameterNames(url: URL): readonly string[] {
  return [...new Set(url.searchParams.keys())].sort()
}

function firstParameterValue(
  primary: URLSearchParams,
  secondary: URLSearchParams,
  name: string
): string | undefined {
  return primary.get(name) ?? secondary.get(name) ?? undefined
}

function firstSanitizedUrlParameter(
  primary: URLSearchParams,
  secondary: URLSearchParams,
  name: string
): string | undefined {
  const value = firstParameterValue(primary, secondary, name)
  return value ? sanitizeProtocolDiagnosticUrlForLogging(value) : undefined
}

function firstSanitizedTextParameter(
  primary: URLSearchParams,
  secondary: URLSearchParams,
  name: string
): string | undefined {
  const value = firstParameterValue(primary, secondary, name)
  return value ? sanitizeProtocolDiagnosticTextForLogging(value) : undefined
}

async function createBetterAuthProtocolResponseBodyLogDetails(
  response: Response
): Promise<BetterAuthProtocolResponseBodyLogDetails> {
  if (response.status < 400 || !response.body) {
    return {}
  }

  const contentType = response.headers.get('content-type') ?? undefined
  try {
    const bodyText = await response.clone().text()
    if (!bodyText) {
      return contentType ? { responseContentType: contentType } : {}
    }

    const jsonBody = parseProtocolResponseJson(bodyText)
    if (jsonBody) {
      const sanitizedJson = sanitizeProtocolDiagnosticValueForLogging(jsonBody.value)
      return {
        responseBody:
          sanitizedJson === undefined
            ? sanitizeProtocolDiagnosticTextForLogging(bodyText)
            : JSON.stringify(sanitizedJson),
        ...(sanitizedJson !== undefined ? { responseBodyJson: sanitizedJson } : {}),
        ...(contentType ? { responseContentType: contentType } : {})
      }
    }

    return {
      responseBody: sanitizeProtocolDiagnosticTextForLogging(bodyText),
      ...(contentType ? { responseContentType: contentType } : {})
    }
  } catch (error) {
    return {
      responseBodyReadError: createBetterAuthProtocolErrorLogDetails(error),
      ...(contentType ? { responseContentType: contentType } : {})
    }
  }
}

function parseProtocolResponseJson(value: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(value) as unknown }
  } catch {
    return null
  }
}
