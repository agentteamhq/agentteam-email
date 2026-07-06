import process from 'node:process'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import debug from 'debug'
import send from 'send'
import { fetchNodeHandler, serve } from 'srvx/node'

import { createWebRequest, getRequestOrigin } from './http'
import { handleBackendPackageRequest } from './backend-package-handlers'
import startWebServer from './start-web-server.js'
import { resolveClientStaticAssetPath } from './static-assets'
import type { Server, ServerRequest } from 'srvx'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RedirectErrorDiagnosticLogDetails } from './lib/redirect-error-page'

const log = debug('app:frontend')
const clientDist = fileURLToPath(new URL('../client', import.meta.url))
const serviceName = 'web-server'
let nextRequestSequence = 0
const redactedPathSegment = ':redacted'
const truncatedPathSegment = ':truncated'
const maxSafePathSegments = 32
const maxSafePathSegmentLength = 80
const maxRequestIdLength = 64
const maxCfRayLength = 64
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
const safeSecretWordSegments = new Set([
  'access-token',
  'api-key',
  'change-password',
  'forgot-password',
  'get-access-token',
  'magic-link',
  'refresh-token',
  'request-password-reset',
  'reset-password',
  'send-verification-email',
  'token',
  'verify-email'
])

type SendError = NodeJS.ErrnoException & {
  status?: number
}

type LogValue = boolean | number | string | null | readonly string[] | undefined

type DefaultLogFields = Record<string, LogValue>

interface RequestLogContext {
  cfRay?: string
  method: string
  path: string
  requestSequence: number
  requestId?: string
  traceparent?: string
}

export interface StartFrontendServerOptions {
  host?: string
  port?: number
}

export function startFrontendServer(options: StartFrontendServerOptions = {}): Server {
  const host = options.host ?? resolveHost()
  const port = options.port ?? resolvePort()
  defaultInfoLog('web_server_starting', { host, port })
  const server = serve({
    fetch: handleServerRequest,
    hostname: host,
    manual: true,
    port,
    silent: true
  })

  Promise.resolve(server.serve())
    .then(() => {
      log('web server listening on %s:%d', host, port)
      defaultInfoLog('web_server_listening', { host, port })
    })
    .catch((error: unknown) => {
      defaultErrorLog('web_server_listen_failed', {
        host,
        port,
        ...safeErrorDiagnostic(error)
      })
      process.nextTick(() => {
        throw error
      })
    })

  return server
}

async function handleServerRequest(serverRequest: ServerRequest): Promise<Response> {
  const startedAt = performance.now()
  let requestLog: RequestLogContext = {
    method: 'UNKNOWN',
    path: '/',
    requestSequence: nextServerRequestSequence()
  }

  try {
    const nodeRequest = resolveNodeRequest(serverRequest)
    requestLog = requestLogContext(nodeRequest, requestLog.requestSequence)
    const response = await dispatchServerRequest(serverRequest, nodeRequest, requestLog)
    logRequestCompleted(requestLog, response.status, startedAt)
    return response
  } catch (error) {
    defaultErrorLog('web_server_request_unhandled_error', {
      ...requestLog,
      durationMs: elapsedMilliseconds(startedAt),
      ...safeErrorDiagnostic(error)
    })
    logRequestCompleted(requestLog, 500, startedAt)
    throw error
  }
}

async function dispatchServerRequest(
  serverRequest: ServerRequest,
  nodeRequest: IncomingMessage,
  requestLog: RequestLogContext
): Promise<Response> {
  const request = createWebRequest(nodeRequest, getRequestOrigin(nodeRequest))
  const backendPackageResponse = await handleBackendPackageRequest(request)

  if (backendPackageResponse) {
    return backendPackageResponse
  }

  const url = new URL(request.url)
  const staticAssetPath = await resolveStaticAssetRequestPath(nodeRequest, url)

  if (staticAssetPath) {
    const staticAssetHandler = (req: IncomingMessage, res: ServerResponse) =>
      sendStaticAsset(req, res, staticAssetPath)

    return fetchNodeHandler(staticAssetHandler, serverRequest)
  }

  let loggedRedirectError = false

  return startWebServer.fetch(request, {
    context: {
      logRedirectError: (details) => {
        if (loggedRedirectError) {
          return
        }

        loggedRedirectError = true
        logRedirectErrorHandled(requestLog, details)
      }
    }
  })
}

function nextServerRequestSequence(): number {
  nextRequestSequence += 1
  return nextRequestSequence
}

function requestLogContext(request: IncomingMessage, requestSequence: number): RequestLogContext {
  return {
    ...requestCorrelationFields(request),
    method: safeRequestMethod(request.method),
    path: safeRequestPathname(request),
    requestSequence
  }
}

function safeRequestPathname(request: IncomingMessage): string {
  try {
    return redactSensitivePathname(new URL(request.url ?? '/', 'http://localhost').pathname)
  } catch {
    return '/'
  }
}

function safeRequestMethod(method: string | undefined): string {
  const normalized = method?.trim().toUpperCase() ?? 'UNKNOWN'
  return /^[A-Z][A-Z0-9-]{0,15}$/.test(normalized) ? normalized : 'UNKNOWN'
}

function requestCorrelationFields(
  request: IncomingMessage
): Pick<RequestLogContext, 'cfRay' | 'requestId' | 'traceparent'> {
  return {
    cfRay: safeCfRayHeaderValue(firstHeaderValue(request.headers['cf-ray'])),
    requestId: safeRequestIdHeaderValue(firstHeaderValue(request.headers['x-request-id'])),
    traceparent: safeTraceparentHeaderValue(firstHeaderValue(request.headers.traceparent))
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function safeRequestIdHeaderValue(value: string | undefined): string | undefined {
  const normalized = normalizeHeaderValue(value)

  if (!normalized || normalized.length > maxRequestIdLength || isSuspiciousSecretValue(normalized)) {
    return undefined
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/@+-]*$/.test(normalized)) {
    return undefined
  }

  if (normalized.length > 32 && !/[-_:/.@]/.test(normalized)) {
    return undefined
  }

  return normalized
}

function safeTraceparentHeaderValue(value: string | undefined): string | undefined {
  const normalized = normalizeHeaderValue(value)?.toLowerCase()
  return normalized && /^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/.test(normalized)
    ? normalized
    : undefined
}

function safeCfRayHeaderValue(value: string | undefined): string | undefined {
  const normalized = normalizeHeaderValue(value)

  if (!normalized || normalized.length > maxCfRayLength || isSuspiciousSecretValue(normalized)) {
    return undefined
  }

  return /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(normalized) ? normalized : undefined
}

function normalizeHeaderValue(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function redactSensitivePathname(pathname: string): string {
  const segments = pathname.split('/')
  const lowerSegments = segments.map((segment) => segment.toLowerCase())
  const redactedSegments: string[] = []

  for (const [index, segment] of segments.entries()) {
    if (index >= maxSafePathSegments) {
      redactedSegments.push(truncatedPathSegment)
      break
    }

    if (segment === '') {
      redactedSegments.push(segment)
      continue
    }

    redactedSegments.push(
      shouldRedactPathSegment(segment, index, lowerSegments) ? redactedPathSegment : safePathSegment(segment)
    )
  }

  return redactedSegments.join('/') || '/'
}

function shouldRedactPathSegment(segment: string, index: number, lowerSegments: readonly string[]): boolean {
  return (
    isSensitiveRouteParameter(index, lowerSegments) ||
    segment.length > maxSafePathSegmentLength ||
    isSuspiciousSecretValue(segment)
  )
}

function isSensitiveRouteParameter(index: number, lowerSegments: readonly string[]): boolean {
  const previous = lowerSegments[index - 1]
  const beforePrevious = lowerSegments[index - 2]

  if (!previous) {
    return false
  }

  if (previous === 'claim' && beforePrevious === 'agent') {
    return true
  }

  if (previous === 'reset-password' || previous === 'verify-email') {
    return true
  }

  if (previous === 'verify' && beforePrevious === 'magic-link') {
    return true
  }

  if (previous === 'callback' && beforePrevious === 'delete-user') {
    return true
  }

  return isSensitivePathParameterLabel(previous)
}

function isSensitivePathParameterLabel(segment: string): boolean {
  return /^(?:access-token|api-key|code|credential|credentials|jwt|key|password|secret|session|state|token)$/u.test(
    segment
  )
}

function safePathSegment(segment: string): string {
  return /^[A-Za-z0-9._~!$&'()*+,;=:@%-]+$/.test(segment) ? segment : redactedPathSegment
}

function isSuspiciousSecretValue(value: string): boolean {
  const normalized = value.toLowerCase()

  if (safeSecretWordSegments.has(normalized)) {
    return false
  }

  return (
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) ||
    /^(?:bearer|github_pat|gh[opsu]_|sk-|xox[abprs]-|ya29\.)/u.test(normalized) ||
    (/^[A-Za-z0-9_-]{33,}$/.test(value) && !/[-_:/.@]/.test(value)) ||
    (normalized.includes('token') &&
      !/^(?:access-token|refresh-token|get-access-token|token)$/u.test(normalized)) ||
    normalized.includes('secret') ||
    normalized.includes('password')
  )
}

function logRequestCompleted(requestLog: RequestLogContext, status: number, startedAt: number): void {
  const fields = {
    ...requestLog,
    durationMs: elapsedMilliseconds(startedAt),
    status
  }

  if (status >= 500) {
    defaultErrorLog('web_server_request_completed', fields)
    return
  }

  defaultInfoLog('web_server_request_completed', fields)
}

function logRedirectErrorHandled(
  requestLog: RequestLogContext,
  details: RedirectErrorDiagnosticLogDetails
): void {
  defaultErrorLog('oauth_redirect_error', {
    ...requestLog,
    ...details,
    operation: 'oauth_redirect_error'
  })
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt))
}

function safeErrorDiagnostic(error: unknown): DefaultLogFields {
  return {
    errorCode: safeErrorProperty(error, 'code'),
    errorName: safeErrorName(error),
    errorStatus: safeErrorStatus(error),
    errorType: error === null ? 'null' : typeof error
  }
}

function safeErrorName(error: unknown): string | undefined {
  if (error instanceof Error && isSafeDiagnosticToken(error.name)) {
    return error.name
  }

  return undefined
}

function safeErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined
  }

  const status = error.status ?? error.statusCode
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined
}

function safeErrorProperty(error: unknown, property: string): string | undefined {
  if (!isRecord(error)) {
    return undefined
  }

  const value = error[property]
  return typeof value === 'string' && isSafeDiagnosticToken(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSafeDiagnosticToken(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(value) && !isSensitiveDiagnosticIdentifier(value)
}

function isSensitiveDiagnosticIdentifier(value: string): boolean {
  const normalized = value.toLowerCase()

  return (
    isSuspiciousSecretValue(value) ||
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

function defaultInfoLog(event: string, fields: DefaultLogFields = {}): void {
  writeDefaultLog('info', event, fields)
}

function defaultErrorLog(event: string, fields: DefaultLogFields = {}): void {
  writeDefaultLog('error', event, fields)
}

function writeDefaultLog(level: 'error' | 'info', event: string, fields: DefaultLogFields): void {
  const entry: Record<string, LogValue> = {
    event,
    level,
    service: serviceName,
    timestamp: new Date().toISOString()
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      entry[key] = value
    }
  }

  const line = `${JSON.stringify(entry)}\n`
  const stream = level === 'error' ? process.stderr : process.stdout
  stream.write(line)
}

async function sendStaticAsset(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    send(req, pathname, {
      index: false,
      root: clientDist
    })
      .on('error', (error: SendError) => {
        if (error.status === 404) {
          res.statusCode = 404
          res.end('Not Found')
          resolvePromise()
          return
        }

        reject(error)
      })
      .on('end', resolvePromise)
      .pipe(res)
  })
}

async function resolveStaticAssetRequestPath(req: IncomingMessage, url: URL): Promise<string | null> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return null
  }

  return resolveClientStaticAssetPath(clientDist, url.pathname)
}

function resolveNodeRequest(request: ServerRequest): IncomingMessage {
  const nodeContext = request.runtime?.node

  if (!nodeContext) {
    throw new Error('Frontend server requires the srvx Node runtime context.')
  }

  return nodeContext.req as IncomingMessage
}

function resolvePort(): number {
  const rawPort = process.env.PORT ?? process.env.FRONTEND_PORT ?? '4321'
  const port = Number.parseInt(rawPort, 10)

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid web server port: ${rawPort}`)
  }

  return port
}

function resolveHost(): string {
  return process.env.FRONTEND_HOST ?? process.env.HOST ?? '0.0.0.0'
}
