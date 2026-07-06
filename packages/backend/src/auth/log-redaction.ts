import type { BetterAuthProtocolDiagnosticLogDetails } from './protocol-diagnostics'

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/
const SAFE_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/
const SAFE_ERROR_CODE_PATTERN = /^(?:[A-Z][A-Z0-9_:.]{0,79}|[a-z]+(?:[_.:][a-z0-9]+)+|\d{3})$/u
const KNOWN_SECRET_PREFIX_PATTERN =
  /^(?:_secret_|bearer(?:[\s:._-]|$)|github_pat|gh[opsu]_|sk-|xox[abprs]-|ya29\.)/iu
const KNOWN_SECRET_VALUE_PATTERN =
  /\b(?:_secret_[A-Za-z0-9._~+/=-]+|github_pat_[A-Za-z0-9_]+|gh[opsu]_[A-Za-z0-9_]+|sk-[A-Za-z0-9._-]+|xox[abprs]-[A-Za-z0-9-]+|ya29\.[A-Za-z0-9._-]+)\b/giu
const JWT_LIKE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u
const JWT_LIKE_VALUE_PATTERN = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/giu
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu
const AUTHORIZATION_BEARER_ASSIGNMENT_PATTERN =
  /\b(authorization)(\s*[:=]\s*)Bearer\s+[A-Za-z0-9._~+/=-]+/giu
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(admissionToken|admission_token|authorization|accessToken|access_token|clientSecret|client_secret|cookie|idToken|id_token|oauth-code|oauthCode|oauth_code|password|refreshToken|refresh_token|secret|sessionState|session_state|sessionToken|session_token|token)\b\s*[:=]\s*\S+/giu
const SENSITIVE_PHRASE_VALUE_PATTERN =
  /\b(access token|admission token|api key|authorization code|authorization header|claim token|cookie|id token|oauth code|password|refresh token|session token)\b\s*(?::|=|for|is|was|with)?\s+([A-Za-z0-9._~+/=-]*(?:[0-9._~+/=-])[A-Za-z0-9._~+/=-]{2,})/giu
const PROTOCOL_CREDENTIAL_ASSIGNMENT_PATTERN =
  /\b([A-Za-z][A-Za-z0-9_.-]*)(\s*[:=]\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'&;,)}\]]+))/gu

const SENSITIVE_NEXT_SEGMENT_LABELS = new Map<string, string>([
  ['claim', ':token'],
  ['reset-password', ':token']
])
const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 500

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
const KNOWN_CREDENTIAL_QUERY_KEYS = new Set([
  'accesstoken',
  'admissiontoken',
  'assertion',
  'authorization',
  'apikey',
  'bearer',
  'clientsecret',
  'code',
  'codeverifier',
  'cookie',
  'credential',
  'idtoken',
  'jwt',
  'oauthcode',
  'oauthtoken',
  'password',
  'pkceverifier',
  'refreshtoken',
  'secret',
  'sessionstate',
  'sessiontoken',
  'state',
  'token',
  'verifier'
])

export interface SafeErrorLogDetails {
  code?: string
  message?: string
  name: string
  status?: string
  statusCode?: number
  type: string
}

export type ProtocolDiagnosticLogValue =
  | boolean
  | null
  | number
  | string
  | ProtocolDiagnosticLogValue[]
  | { [key: string]: ProtocolDiagnosticLogValue }

export interface ProtocolDiagnosticErrorLogDetails extends SafeErrorLogDetails {
  body?: Record<string, ProtocolDiagnosticLogValue>
}

export interface BetterAuthLogDetails {
  argumentCount: number
  argumentTypes: readonly string[]
  code?: string
  error?: ProtocolDiagnosticErrorLogDetails | SafeErrorLogDetails
  level: string
  message?: string
  operation: string
  provider?: string
  providerId?: string
  protocol?: BetterAuthProtocolDiagnosticLogDetails
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
  const body = diagnosticErrorPayloadRecord(record)
  const code =
    safeCode(body?.code) ??
    safeCode(body?.error) ??
    safeCode(record?.code) ??
    safeCode(record?.errorCode) ??
    safeCode(record?.status)
  const message = createSafeDiagnosticMessage(error)
  const status = safeCode(record?.status)
  const statusCode = safeStatusCode(record?.statusCode) ?? safeStatusCode(record?.status)

  return {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
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

export function createSafeDiagnosticMessage(error: unknown): string | undefined {
  const record = toRecord(error)
  const message = error instanceof Error ? error.message : record?.message
  return sanitizeDiagnosticMessageForLogging(message)
}

export function sanitizeDiagnosticValueForLogging(value: unknown, maxLength = 1200): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const redacted = sanitizeProtocolDiagnosticTextForLogging(value).trim()
  return redacted ? redacted.slice(0, maxLength) : undefined
}

export function sanitizeDiagnosticUrlForLogging(value: string, base?: string): string {
  return sanitizeProtocolDiagnosticUrlForLogging(value, base)
}

export function sanitizeProtocolDiagnosticTextForLogging(value: string, maxLength?: number): string {
  const redacted = redactCredentialValuesInDiagnosticString(value, true)
  return typeof maxLength === 'number' ? redacted.slice(0, maxLength) : redacted
}

export function sanitizeProtocolDiagnosticUrlForLogging(
  value: string,
  base?: string,
  maxLength?: number
): string {
  const parsed = parseDiagnosticUrl(value, base)
  if (!parsed) {
    const redacted = redactCredentialValuesInDiagnosticString(value, false)
    return typeof maxLength === 'number' ? redacted.slice(0, maxLength) : redacted
  }

  redactUrlUserInfo(parsed.url)
  redactKnownCredentialQueryValues(parsed.url.searchParams)
  const serialized = parsed.absolute
    ? parsed.url.toString()
    : relativeUrlString(parsed.url, parsed.keepLeadingSlash)
  const redacted = redactCredentialValuesInDiagnosticString(serialized, false)
  return typeof maxLength === 'number' ? redacted.slice(0, maxLength) : redacted
}

export function createProtocolDiagnosticErrorLogDetails(
  error: unknown
): ProtocolDiagnosticErrorLogDetails {
  const record = toRecord(error)
  const rawBody = diagnosticErrorPayloadRecord(record)
  const body = sanitizeProtocolDiagnosticRecord(rawBody)
  const message = createProtocolDiagnosticMessage(error)
  const statusCode = safeStatusCode(record?.statusCode) ?? safeStatusCode(record?.status)
  const status = protocolDiagnosticString(record?.status)
  const code =
    protocolDiagnosticString(record?.code) ??
    protocolDiagnosticString(rawBody?.code) ??
    protocolDiagnosticString(rawBody?.error)

  return {
    ...(body ? { body } : {}),
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    name: createSafeDiagnosticErrorName(error),
    ...(status ? { status } : {}),
    ...(typeof statusCode === 'number' ? { statusCode } : {}),
    type: error === null ? 'null' : typeof error
  }
}

export function createBetterAuthLogDetails(
  level: string,
  message: string,
  args: readonly unknown[],
  protocol?: BetterAuthProtocolDiagnosticLogDetails
): BetterAuthLogDetails {
  const details = collectSafeMetadata(args)
  const error = findErrorLike(args)

  return {
    argumentCount: args.length,
    argumentTypes: args.map((arg) => (arg === null ? 'null' : typeof arg)),
    ...(details.code ? { code: details.code } : {}),
    ...(error
      ? { error: protocol ? createProtocolDiagnosticErrorLogDetails(error) : createSafeErrorLogDetails(error) }
      : {}),
    level: safeLabel(level) ?? 'info',
    ...(protocol ? { message: sanitizeProtocolDiagnosticTextForLogging(message) } : {}),
    operation: createSafeOperation(message),
    ...(details.provider ? { provider: details.provider } : {}),
    ...(details.providerId ? { providerId: details.providerId } : {}),
    ...(protocol ? { protocol } : {}),
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

    const body = diagnosticErrorPayloadRecord(record)
    metadata.code ??= safeCode(body?.code) ?? safeCode(body?.error)

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

function diagnosticErrorPayloadRecord(
  record: Record<string, unknown> | null
): Record<string, unknown> | undefined {
  return toRecord(record?.body) ?? toRecord(record?.error) ?? undefined
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
  const redacted = redactKnownSecretValues(stablePrefix).slice(0, 160)

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

  if (isKnownSecretValue(segment)) {
    return ':value'
  }

  if (!/^[A-Za-z0-9._~-]+$/u.test(segment)) {
    return ':value'
  }

  return segment
}

function safeIdentifier(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_IDENTIFIER_PATTERN.test(value) && !isKnownSecretValue(value)
    ? value
    : fallback
}

function sanitizeDiagnosticMessageForLogging(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const redacted = redactKnownSecretValues(value).trim()
  return redacted ? redacted.slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH) : undefined
}

function redactKnownSecretValues(value: string): string {
  return value
    .replace(URL_PATTERN, ' url_redacted ')
    .replace(EMAIL_PATTERN, ' email_redacted ')
    .replace(BEARER_PATTERN, ' bearer_redacted ')
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, '$1=secret_redacted')
    .replace(SENSITIVE_PHRASE_VALUE_PATTERN, '$1 secret_redacted')
    .replace(JWT_LIKE_VALUE_PATTERN, 'jwt_redacted')
    .replace(KNOWN_SECRET_VALUE_PATTERN, 'secret_redacted')
    .split('')
    .map((character) => (isControlCharacter(character) ? ' ' : character))
    .join('')
}

function redactCredentialValuesInDiagnosticString(value: string, sanitizeUrls: boolean): string {
  const urlSanitized = sanitizeUrls
    ? value.replace(URL_PATTERN, (url) => sanitizeProtocolDiagnosticUrlForLogging(url))
    : value

  return replaceControlCharacters(
    urlSanitized
      .replace(AUTHORIZATION_BEARER_ASSIGNMENT_PATTERN, '$1$2Bearer secret_redacted')
      .replace(BEARER_PATTERN, 'Bearer secret_redacted')
      .replace(
        PROTOCOL_CREDENTIAL_ASSIGNMENT_PATTERN,
        (
          match: string,
          key: string,
          separator: string,
          doubleQuotedValue: string | undefined,
          singleQuotedValue: string | undefined,
          bareValue: string | undefined
        ) => {
          if (!isKnownCredentialQueryKey(key)) {
            return match
          }

          if (typeof bareValue === 'string' && bareValue.toLowerCase() === 'bearer') {
            return match
          }

          if (typeof doubleQuotedValue === 'string') {
            return `${key}${separator}"secret_redacted"`
          }

          if (typeof singleQuotedValue === 'string') {
            return `${key}${separator}'secret_redacted'`
          }

          return `${key}${separator}secret_redacted`
        }
      )
      .replace(SENSITIVE_PHRASE_VALUE_PATTERN, '$1 secret_redacted')
      .replace(JWT_LIKE_VALUE_PATTERN, 'jwt_redacted')
      .replace(KNOWN_SECRET_VALUE_PATTERN, 'secret_redacted')
  )
}

function redactUrlUserInfo(url: URL): void {
  if (url.username) {
    url.username = 'secret_redacted'
  }
  if (url.password) {
    url.password = 'secret_redacted'
  }
}

function redactKnownCredentialQueryValues(searchParams: URLSearchParams): void {
  for (const key of [...new Set(searchParams.keys())]) {
    const values = searchParams.getAll(key)
    searchParams.delete(key)

    if (isKnownCredentialQueryKey(key)) {
      for (const _value of values) {
        searchParams.append(key, 'secret_redacted')
      }
      continue
    }

    for (const value of values) {
      searchParams.append(key, sanitizeNestedDiagnosticQueryValue(value))
    }
  }
}

function sanitizeNestedDiagnosticQueryValue(value: string): string {
  const nestedUrl = parseDiagnosticUrl(value)
  if (nestedUrl) {
    redactKnownCredentialQueryValues(nestedUrl.url.searchParams)
    return nestedUrl.absolute ? nestedUrl.url.toString() : relativeUrlString(nestedUrl.url, true)
  }

  return redactCredentialValuesInDiagnosticString(value, true)
}

function isKnownCredentialQueryKey(key: string): boolean {
  return KNOWN_CREDENTIAL_QUERY_KEYS.has(normalizeCredentialKey(key))
}

function normalizeCredentialKey(key: string): string {
  return key
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .toLowerCase()
    .replace(/[\s._-]+/gu, '')
}

function parseDiagnosticUrl(
  value: string,
  base?: string
): { absolute: boolean; keepLeadingSlash: boolean; url: URL } | null {
  const isAbsoluteInput = /^[a-z][a-z0-9+.-]*:/iu.test(value)
  try {
    if (isAbsoluteInput) {
      return { absolute: true, keepLeadingSlash: true, url: new URL(value) }
    }

    if (base) {
      return { absolute: false, keepLeadingSlash: value.startsWith('/'), url: new URL(value, base) }
    }

    return { absolute: true, keepLeadingSlash: true, url: new URL(value) }
  } catch {
    if (!base && !value.startsWith('/')) {
      return null
    }

    if (!base) {
      try {
        return { absolute: false, keepLeadingSlash: true, url: new URL(value, 'https://relative.invalid') }
      } catch {
        return null
      }
    }

    return null
  }
}

function relativeUrlString(url: URL, keepLeadingSlash: boolean): string {
  const value = `${url.pathname}${url.search}${url.hash}`
  return keepLeadingSlash ? value : value.replace(/^\//u, '')
}

function replaceControlCharacters(value: string): string {
  return value
    .split('')
    .map((character) => (isControlCharacter(character) ? ' ' : character))
    .join('')
}

function createProtocolDiagnosticMessage(error: unknown): string | undefined {
  const record = toRecord(error)
  const message = error instanceof Error ? error.message : record?.message
  return typeof message === 'string'
    ? sanitizeProtocolDiagnosticTextForLogging(message).trim() || undefined
    : undefined
}

function protocolDiagnosticString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const sanitized = sanitizeProtocolDiagnosticTextForLogging(value).trim()
  return sanitized || undefined
}

export function sanitizeProtocolDiagnosticValueForLogging(
  value: unknown
): ProtocolDiagnosticLogValue | undefined {
  return sanitizeProtocolDiagnosticValue(value, new WeakSet<object>())
}

function sanitizeProtocolDiagnosticRecord(
  value: unknown
): Record<string, ProtocolDiagnosticLogValue> | undefined {
  const record = toRecord(value)
  if (!record) {
    return undefined
  }

  const sanitized = sanitizeProtocolDiagnosticObject(record, new WeakSet<object>())
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function sanitizeProtocolDiagnosticValue(
  value: unknown,
  seen: WeakSet<object>
): ProtocolDiagnosticLogValue | undefined {
  if (typeof value === 'string') {
    return sanitizeProtocolDiagnosticTextForLogging(value)
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value)
  }

  if (typeof value === 'boolean' || value === null) {
    return value
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[circular]'
    }

    seen.add(value)
    const sanitizedArray: ProtocolDiagnosticLogValue[] = []
    for (const entry of value) {
      const sanitizedEntry = sanitizeProtocolDiagnosticValue(entry, seen)
      if (sanitizedEntry !== undefined) {
        sanitizedArray.push(sanitizedEntry)
      }
    }
    seen.delete(value)
    return sanitizedArray
  }

  const record = toRecord(value)
  if (!record) {
    return undefined
  }

  if (seen.has(record)) {
    return '[circular]'
  }

  seen.add(record)
  const sanitized = sanitizeProtocolDiagnosticObject(record, seen)
  seen.delete(record)
  return sanitized
}

function sanitizeProtocolDiagnosticObject(
  record: Record<string, unknown>,
  seen: WeakSet<object>
): Record<string, ProtocolDiagnosticLogValue> {
  const sanitized: Record<string, ProtocolDiagnosticLogValue> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (isKnownCredentialRecordKey(key)) {
      sanitized[key] = 'secret_redacted'
      continue
    }

    const sanitizedEntry = sanitizeProtocolDiagnosticValue(entry, seen)
    if (sanitizedEntry !== undefined) {
      sanitized[key] = sanitizedEntry
    }
  }

  return sanitized
}

function isKnownCredentialRecordKey(key: string): boolean {
  const normalized = normalizeCredentialKey(key)
  return normalized !== 'code' && KNOWN_CREDENTIAL_QUERY_KEYS.has(normalized)
}

function isKnownSecretValue(value: string): boolean {
  return JWT_LIKE_IDENTIFIER_PATTERN.test(value) || KNOWN_SECRET_PREFIX_PATTERN.test(value)
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

  return SAFE_ERROR_CODE_PATTERN.test(value) && !isKnownSecretValue(value) ? value : undefined
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
