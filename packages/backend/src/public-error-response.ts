import { HttpStatusCode } from '@main/common'
import { t } from 'elysia'

const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503
const MAX_REQUEST_ID_LENGTH = 64
const MAX_CF_RAY_LENGTH = 64

const internalServerErrorDefinition = {
  code: 'INTERNAL_SERVER_ERROR',
  error: 'Internal server error.'
}

const publicErrorDefinitions = new Map<number, { code: string; error: string }>([
  [HttpStatusCode.BadRequest, { code: 'BAD_REQUEST', error: 'Invalid request.' }],
  [HttpStatusCode.Unauthorized, { code: 'UNAUTHORIZED', error: 'Authentication is required.' }],
  [HttpStatusCode.Forbidden, { code: 'FORBIDDEN', error: 'Access denied.' }],
  [HttpStatusCode.NotFound, { code: 'NOT_FOUND', error: 'Not found.' }],
  [HttpStatusCode.MethodNotAllowed, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' }],
  [HttpStatusCode.Conflict, { code: 'CONFLICT', error: 'Request conflict.' }],
  [HttpStatusCode.Gone, { code: 'GONE', error: 'Resource is no longer available.' }],
  [HttpStatusCode.PayloadTooLarge, { code: 'PAYLOAD_TOO_LARGE', error: 'Request body too large.' }],
  [HttpStatusCode.UnsupportedMediaType, { code: 'UNSUPPORTED_MEDIA_TYPE', error: 'Unsupported media type.' }],
  [HttpStatusCode.UnprocessableEntity, { code: 'INVALID_REQUEST', error: 'Invalid request.' }],
  [HttpStatusCode.TooManyRequests, { code: 'TOO_MANY_REQUESTS', error: 'Too many requests.' }],
  [HTTP_STATUS_INTERNAL_SERVER_ERROR, internalServerErrorDefinition],
  [HttpStatusCode.BadGateway, { code: 'BAD_GATEWAY', error: 'Upstream service unavailable.' }],
  [HTTP_STATUS_SERVICE_UNAVAILABLE, { code: 'SERVICE_UNAVAILABLE', error: 'Service unavailable.' }],
  [HttpStatusCode.GatewayTimeout, { code: 'GATEWAY_TIMEOUT', error: 'Upstream service timed out.' }]
])

const elysiaStatusByCode = new Map<unknown, number>([
  ['VALIDATION', HttpStatusCode.UnprocessableEntity],
  ['PARSE', HttpStatusCode.BadRequest],
  ['NOT_FOUND', HttpStatusCode.NotFound],
  ['INTERNAL_SERVER_ERROR', HTTP_STATUS_INTERNAL_SERVER_ERROR],
  ['INVALID_COOKIE_SIGNATURE', HttpStatusCode.BadRequest],
  ['INVALID_FILE_TYPE', HttpStatusCode.UnprocessableEntity]
])

const safeSecretWordSegments = new Set(['access-token', 'api-key', 'refresh-token', 'request-id', 'token'])

export interface PublicErrorResponseBody {
  code?: string
  error: string
  supportReference?: string
}

export interface PublicErrorResponse {
  body: PublicErrorResponseBody
  status: number
}

export interface MapPublicErrorResponseInput {
  code?: unknown
  error: unknown
  request?: Request
}

export interface SafeRequestCorrelationLogDetails {
  cfRay?: string
  requestId?: string
  traceparent?: string
}

export const publicErrorResponseBodySchema = t.Object(
  {
    code: t.Optional(t.String()),
    error: t.String(),
    supportReference: t.Optional(t.String())
  },
  { additionalProperties: false }
)

export function mapPublicErrorResponse({
  code,
  error,
  request
}: MapPublicErrorResponseInput): PublicErrorResponse {
  const status = publicStatusForError(error, code)
  const definition = publicErrorDefinitionForStatus(status)
  const supportReference = request ? createPublicSupportReference(request) : undefined

  return {
    body: {
      code: definition.code,
      error: definition.error,
      ...(supportReference ? { supportReference } : {})
    },
    status
  }
}

export function createPublicErrorResponse(input: MapPublicErrorResponseInput): Response {
  const response = mapPublicErrorResponse(input)
  return Response.json(response.body, { status: response.status })
}

export function createSafeRequestCorrelationLogDetails(request: Request): SafeRequestCorrelationLogDetails {
  const cfRay = safeCfRayHeaderValue(request.headers.get('cf-ray'))
  const requestId = safeRequestIdHeaderValue(request.headers.get('x-request-id'))
  const traceparent = safeTraceparentHeaderValue(request.headers.get('traceparent'))

  return {
    ...(cfRay ? { cfRay } : {}),
    ...(requestId ? { requestId } : {}),
    ...(traceparent ? { traceparent } : {})
  }
}

function publicStatusForError(error: unknown, code: unknown): number {
  return (
    safePublicErrorStatusCode(code) ??
    elysiaStatusByCode.get(code) ??
    elysiaStatusByCode.get(recordValue(error, 'code')) ??
    safeLowerLayerPublicErrorStatusCode(recordValue(error, 'status')) ??
    safeLowerLayerPublicErrorStatusCode(recordValue(error, 'statusCode')) ??
    HTTP_STATUS_INTERNAL_SERVER_ERROR
  )
}

function publicErrorDefinitionForStatus(status: number): { code: string; error: string } {
  const definition = publicErrorDefinitions.get(status)
  if (definition) {
    return definition
  }

  if (status >= 500) {
    return internalServerErrorDefinition
  }

  return { code: 'REQUEST_FAILED', error: 'Request failed.' }
}

function createPublicSupportReference(request: Request): string | undefined {
  const correlation = createSafeRequestCorrelationLogDetails(request)

  if (correlation.requestId) {
    return `request-id:${correlation.requestId}`
  }

  if (correlation.cfRay) {
    return `cf-ray:${correlation.cfRay}`
  }

  if (correlation.traceparent) {
    return `traceparent:${correlation.traceparent}`
  }

  return undefined
}

function safeRequestIdHeaderValue(value: string | null): string | undefined {
  const normalized = normalizeHeaderValue(value)

  if (!normalized || normalized.length > MAX_REQUEST_ID_LENGTH || isSuspiciousSecretValue(normalized)) {
    return undefined
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/@+-]*$/u.test(normalized)) {
    return undefined
  }

  if (normalized.length > 32 && !/[-_:/.@]/u.test(normalized)) {
    return undefined
  }

  return normalized
}

function safeTraceparentHeaderValue(value: string | null): string | undefined {
  const normalized = normalizeHeaderValue(value)?.toLowerCase()
  return normalized && /^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/u.test(normalized)
    ? normalized
    : undefined
}

function safeCfRayHeaderValue(value: string | null): string | undefined {
  const normalized = normalizeHeaderValue(value)

  if (!normalized || normalized.length > MAX_CF_RAY_LENGTH || isSuspiciousSecretValue(normalized)) {
    return undefined
  }

  return /^[A-Za-z0-9][A-Za-z0-9-]*$/u.test(normalized) ? normalized : undefined
}

function normalizeHeaderValue(value: string | null): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function isSuspiciousSecretValue(value: string): boolean {
  const normalized = value.toLowerCase()

  if (safeSecretWordSegments.has(normalized)) {
    return false
  }

  return (
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value) ||
    /^(?:bearer|github_pat|gh[opsu]_|sk-|xox[abprs]-|ya29\.)/u.test(normalized) ||
    (/^[A-Za-z0-9_-]{33,}$/u.test(value) && !/[-_:/.@]/u.test(value)) ||
    (normalized.includes('token') &&
      !/^(?:access-token|refresh-token|get-access-token|token)$/u.test(normalized)) ||
    normalized.includes('secret') ||
    normalized.includes('password')
  )
}

function safePublicErrorStatusCode(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return undefined
  }

  return value >= 400 && value <= 599 ? value : undefined
}

function safeLowerLayerPublicErrorStatusCode(value: unknown): number | undefined {
  const status = safePublicErrorStatusCode(value)

  if (status === HttpStatusCode.Unauthorized || status === HttpStatusCode.Forbidden) {
    return undefined
  }

  return status
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}
