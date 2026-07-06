const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/
const SAFE_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/
const SAFE_ERROR_CODE_PATTERN = /^(?:[A-Z][A-Z0-9_:.]{0,79}|[a-z]+(?:[_.:][a-z0-9]+)+|\d{3})$/u
const SECRET_IDENTIFIER_PREFIX_PATTERN = /^(?:bearer|github_pat|gh[opsu]_|sk-|xox[abprs]-|ya29\.)/u
const SECRET_IDENTIFIER_SEGMENT_PATTERN =
  /(?:^|[_.:-])(?:access[_.:-]?token|api[_.:-]?key|auth[_.:-]?token|id[_.:-]?token|refresh[_.:-]?token|session[_.:-]?token|secret|password|token|key)(?:$|[_.:-])/u
const JWT_LIKE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u
const LONG_TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{24,}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/giu
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(?:authorization|callbackURL|callback_url|code|cookie|password|secret|token)=\S+/giu
const SENSITIVE_PHRASE_VALUE_PATTERN =
  /\b(?:access token|api key|authorization code|authorization header|callback url|callbackURL|cookie|id token|oauth code|password|refresh token|session token)\b\s*(?::|=|for|is|was|with)?\s+[A-Za-z0-9._~+/=-]{3,}/giu
const SECRET_VALUE_PATTERN = /\b(?:_secret_[A-Za-z0-9._~+/=-]+|[A-Za-z0-9+/=_-]{32,})\b/gu

const SENSITIVE_NEXT_SEGMENT_LABELS = new Map<string, string>([
  ['callback', ':providerId'],
  ['reset-password', ':token']
])

const SAFE_METADATA_KEYS = new Set([
  'code',
  'errorCode',
  'method',
  'name',
  'operation',
  'provider',
  'providerId',
  'status',
  'statusCode'
])
const SENSITIVE_DIAGNOSTIC_IDENTIFIER_TERMS = new Set([
  'auth',
  'authenticate',
  'authenticated',
  'authenticating',
  'authentication',
  'authorize',
  'authorized',
  'authorizes',
  'authorizing',
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
  'unauthenticated',
  'unauthorized',
  'authorization'
])

export interface SafeErrorLogDetails {
  code?: string
  name: string
  status?: string
  statusCode?: number
  type: string
}

export interface BetterAuthLogDetails {
  argumentCount: number
  argumentTypes: readonly string[]
  code?: string
  error?: SafeErrorLogDetails
  level: string
  operation: string
  provider?: string
  providerId?: string
  status?: string
  statusCode?: number
}

export function createSafeRequestLogDetails(request: Request): { method: string; path: string } {
  const url = new URL(request.url)
  return {
    method: sanitizeHttpMethod(request.method),
    path: sanitizePathnameForLogging(url.pathname)
  }
}

export function createSafeErrorLogDetails(error: unknown): SafeErrorLogDetails {
  const record = toRecord(error)
  const body = toRecord(record?.body)
  const code =
    safeCode(body?.code) ?? safeCode(record?.code) ?? safeCode(record?.errorCode) ?? safeCode(record?.status)
  const status = safeCode(record?.status)
  const statusCode = safeStatusCode(record?.statusCode) ?? safeStatusCode(record?.status)

  return {
    ...(code ? { code } : {}),
    name: createSafeDiagnosticErrorName(error),
    ...(status ? { status } : {}),
    ...(typeof statusCode === 'number' ? { statusCode } : {}),
    type: error === null ? 'null' : typeof error
  }
}

export function createSafeDiagnosticErrorName(error: unknown): string {
  const record = toRecord(error)
  return safeIdentifier(error instanceof Error ? error.name : record?.name, fallbackErrorName(error))
}

export function createBetterAuthLogDetails(
  level: string,
  message: string,
  args: readonly unknown[]
): BetterAuthLogDetails {
  const details = collectSafeMetadata(args)
  const error = findErrorLike(args)

  return {
    argumentCount: args.length,
    argumentTypes: args.map((arg) => (arg === null ? 'null' : typeof arg)),
    ...(details.code ? { code: details.code } : {}),
    ...(error ? { error: createSafeErrorLogDetails(error) } : {}),
    level: safeLabel(level) ?? 'info',
    operation: createSafeOperation(message),
    ...(details.provider ? { provider: details.provider } : {}),
    ...(details.providerId ? { providerId: details.providerId } : {}),
    ...(details.status ? { status: details.status } : {}),
    ...(typeof details.statusCode === 'number' ? { statusCode: details.statusCode } : {})
  }
}

export function sanitizePathnameForLogging(pathname: string): string {
  if (!pathname.startsWith('/')) {
    return '/'
  }

  const segments = pathname.split('/')
  const sanitizedSegments = segments.map((segment, index) => {
    if (index === 0) {
      return ''
    }

    const previousSegment = segments[index - 1]?.toLowerCase()
    const sensitiveLabel = previousSegment ? SENSITIVE_NEXT_SEGMENT_LABELS.get(previousSegment) : undefined
    if (sensitiveLabel) {
      return sensitiveLabel
    }

    return sanitizePathSegment(segment)
  })

  const sanitized = sanitizedSegments.join('/')
  return sanitized || '/'
}

export function safeParamKey(value: string): string {
  return safeLabel(value) ?? 'param'
}

function collectSafeMetadata(args: readonly unknown[]): {
  code?: string
  provider?: string
  providerId?: string
  status?: string
  statusCode?: number
} {
  const metadata: {
    code?: string
    provider?: string
    providerId?: string
    status?: string
    statusCode?: number
  } = {}

  for (const arg of args) {
    const record = toRecord(arg)
    if (!record) {
      continue
    }

    for (const key of SAFE_METADATA_KEYS) {
      const value = record[key]
      if (key === 'statusCode') {
        metadata.statusCode ??= safeStatusCode(value)
        continue
      }

      const safeValue = key === 'provider' || key === 'providerId' ? safeLabel(value) : safeCode(value)
      if (!safeValue) {
        continue
      }

      if (key === 'code' || key === 'errorCode') {
        metadata.code ??= safeValue
      } else if (key === 'provider') {
        metadata.provider ??= safeValue
      } else if (key === 'providerId') {
        metadata.providerId ??= safeValue
      } else if (key === 'status') {
        metadata.status ??= safeValue
        metadata.statusCode ??= safeStatusCode(value)
      }
    }
  }

  return metadata
}

function findErrorLike(args: readonly unknown[]): Error | Record<string, unknown> | null {
  for (const arg of args) {
    if (arg instanceof Error) {
      return arg
    }

    const record = toRecord(arg)
    if (record && ('name' in record || 'statusCode' in record || 'body' in record)) {
      return record
    }
  }

  return null
}

function createSafeOperation(message: string): string {
  const stablePrefix = message.split(/[:\n\r]/u)[0] ?? ''
  const redacted = stablePrefix
    .replace(URL_PATTERN, ' url_redacted ')
    .replace(EMAIL_PATTERN, ' email_redacted ')
    .replace(BEARER_PATTERN, ' bearer_redacted ')
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, ' secret_redacted ')
    .replace(SENSITIVE_PHRASE_VALUE_PATTERN, ' secret_redacted ')
    .replace(SECRET_VALUE_PATTERN, ' secret_redacted ')
    .split('')
    .map((character) => (isControlCharacter(character) ? ' ' : character))
    .join('')
    .slice(0, 160)

  const normalized = redacted
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 80)

  return normalized || 'better_auth_event'
}

function sanitizeHttpMethod(method: string): string {
  return safeLabel(method.toUpperCase()) ?? 'UNKNOWN'
}

function sanitizePathSegment(segment: string): string {
  if (segment.length === 0) {
    return ''
  }

  const lowercaseSegment = segment.toLowerCase()
  if (
    lowercaseSegment.includes('secret') ||
    (lowercaseSegment.includes('token') && lowercaseSegment !== 'token')
  ) {
    return ':value'
  }

  if (segment.length > 64 || UUID_PATTERN.test(segment) || LONG_TOKEN_PATTERN.test(segment)) {
    return ':value'
  }

  if (!/^[A-Za-z0-9._~-]+$/u.test(segment)) {
    return ':value'
  }

  return segment
}

function safeIdentifier(value: unknown, fallback: string): string {
  return typeof value === 'string' &&
    SAFE_IDENTIFIER_PATTERN.test(value) &&
    !isSensitiveDiagnosticIdentifier(value)
    ? value
    : fallback
}

function isSensitiveDiagnosticIdentifier(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    isSecretShapedIdentifier(value) ||
    diagnosticIdentifierTerms(value).some((term) => SENSITIVE_DIAGNOSTIC_IDENTIFIER_TERMS.has(term)) ||
    /(?:^|[._:-])(?:api-key|apikey|bearer|jwk|jwks|key|token)(?:$|[._:-])/u.test(normalized) ||
    /(?:api|decrypt|encrypt|encryption|oauth|private|public|refresh|secret|session|signing)key/u.test(
      normalized
    )
  )
}

function diagnosticIdentifierTerms(value: string): string[] {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((term) => term.toLowerCase())
}

function isSecretShapedIdentifier(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    JWT_LIKE_IDENTIFIER_PATTERN.test(value) ||
    SECRET_IDENTIFIER_PREFIX_PATTERN.test(normalized) ||
    SECRET_IDENTIFIER_SEGMENT_PATTERN.test(normalized)
  )
}

function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0)
  return code <= 0x1f || code === 0x7f
}

function safeCode(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return String(value)
  }

  if (typeof value !== 'string') {
    return undefined
  }

  return SAFE_ERROR_CODE_PATTERN.test(value) && !isSensitiveDiagnosticIdentifier(value) ? value : undefined
}

function safeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  return SAFE_LABEL_PATTERN.test(value) ? value : undefined
}

function safeStatusCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) {
    return value
  }

  return undefined
}

function fallbackErrorName(error: unknown): string {
  if (error === null) {
    return 'null'
  }

  return typeof error
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}
