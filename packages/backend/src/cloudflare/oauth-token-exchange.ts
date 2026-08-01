import {
  applyDefaultAccessTokenExpiry,
  getOAuth2Tokens,
  refreshAccessTokenRequest
} from '@better-auth/core/oauth2'
import debug from 'debug'

import { CLOUDFLARE_OAUTH_PROVIDER_ID } from './constants'
import type { OAuth2Tokens, OAuthProvider } from '@better-auth/core/oauth2'
import type { GenericOAuthConfig } from 'better-auth/plugins'

const log = debug('app:cloudflare:oauth-token')
const MAX_DIAGNOSTIC_BODY_LENGTH = 16_384

/**
 * Per-leg deadline for a Cloudflare token call. Token renewal runs inside
 * request handling and the daily Worker credential refresh job, so a hung
 * `dash.cloudflare.com` or an unreachable service Worker must fail fast instead
 * of holding those callers open.
 */
const CLOUDFLARE_TOKEN_REQUEST_TIMEOUT_MS = 10_000

let workerRequiredForProcess = false

/**
 * Cloudflare token-endpoint call kinds. Cloudflare serves bot challenges to
 * server-side traffic for every `dash.cloudflare.com` OAuth token grant, so the
 * authorization-code exchange and the refresh-token grant share one
 * direct-first/Worker-fallback transport and are told apart in diagnostics by
 * this discriminator.
 */
export type CloudflareOAuthTokenOperation = 'authorization_code' | 'refresh_token'

/**
 * Transport-level failure kinds. These are reported when no HTTP response was
 * produced at all, so they are never confused with a Cloudflare bot challenge.
 */
export type CloudflareOAuthTokenTransportFailureKind = 'network' | 'timeout'

export interface CloudflareOAuthTokenTransportErrorShape {
  kind: CloudflareOAuthTokenTransportFailureKind
  message: string
  name: string
}

export interface CloudflareOAuthTokenExchangeWorkerConfig {
  directFirst: boolean
  password: string
  tokenExchangeUrl: string
}

export interface CreateCloudflareOAuthTokenExchangerInput {
  clientId: string
  redirectURI: string
  tokenEndpoint: string
  worker: CloudflareOAuthTokenExchangeWorkerConfig
}

export interface CreateCloudflareOAuthTokenRefresherInput {
  /**
   * Provider fallback access-token lifetime. Better Auth applies this to the
   * authorization-code path, so the refresh path must apply it too or a
   * configured fallback would silently only cover one grant.
   */
  accessTokenExpiresIn: number | undefined
  clientId: string
  tokenEndpoint: string
  worker: CloudflareOAuthTokenExchangeWorkerConfig
}

export interface TokenRequest {
  bodyText: string
  headers: Headers
}

interface TokenHttpResponse {
  bodyText: string
  headers: Headers
  ok: boolean
  status: number
  statusText: string
  url: string
  via: 'direct' | 'worker'
}

export type BetterAuthErrorShape = Record<string, unknown> | string | number | boolean | null

export interface TokenExchangeDiagnostic {
  authMethod: 'none'
  betterAuthErrorShape: BetterAuthErrorShape
  body: unknown
  bodyTruncated: boolean
  callbackRedirectURI: string | null
  cfMitigated: string | null
  cfRay: string | null
  classification: string
  contentType: string | null
  operation: CloudflareOAuthTokenOperation
  pkceVerifierPresent: boolean
  providerId: typeof CLOUDFLARE_OAUTH_PROVIDER_ID
  redirectURI: string | null
  workerTokenExchangeUrl: string | null
  status: number
  statusText: string
  tokenEndpoint: string
  transportError: CloudflareOAuthTokenTransportErrorShape | null
  via: 'direct' | 'worker'
}

/**
 * Request-shaped diagnostic fields carried through one token call. The
 * authorization-code grant fills the redirect and PKCE fields; the
 * refresh-token grant has no redirect or verifier and reports them as absent.
 */
interface CloudflareTokenCallContext {
  callbackRedirectURI: string | null
  operation: CloudflareOAuthTokenOperation
  pkceVerifierPresent: boolean
  redirectURI: string | null
  tokenEndpoint: string
}

export class CloudflareOAuthTokenExchangeError extends Error {
  readonly diagnostic: TokenExchangeDiagnostic

  constructor(diagnostic: TokenExchangeDiagnostic) {
    super('Cloudflare OAuth token exchange failed')
    this.name = 'CloudflareOAuthTokenExchangeError'
    this.diagnostic = diagnostic
  }
}

/**
 * Raised when one transport leg produced no HTTP response. It carries the leg
 * and failure kind so the caller can decide whether another leg is still worth
 * attempting; it never leaves this module.
 */
class CloudflareOAuthTokenTransportError extends Error {
  readonly cause: unknown
  readonly kind: CloudflareOAuthTokenTransportFailureKind
  readonly via: 'direct' | 'worker'

  constructor(via: 'direct' | 'worker', kind: CloudflareOAuthTokenTransportFailureKind, cause: unknown) {
    super(`Cloudflare OAuth token request failed on the ${via} transport`)
    this.name = 'CloudflareOAuthTokenTransportError'
    this.kind = kind
    this.via = via
    Object.defineProperty(this, 'cause', {
      configurable: true,
      enumerable: false,
      value: cause
    })
  }
}

export function createCloudflareOAuthTokenExchanger({
  clientId,
  redirectURI,
  tokenEndpoint,
  worker
}: CreateCloudflareOAuthTokenExchangerInput): NonNullable<GenericOAuthConfig['getToken']> {
  return async (data) =>
    exchangeCloudflareAuthorizationCode({
      clientId,
      code: data.code,
      codeVerifier: data.codeVerifier,
      callbackRedirectURI: data.redirectURI,
      redirectURI,
      tokenEndpoint,
      worker
    })
}

/**
 * Builds the Cloudflare refresh-token grant used by Better Auth's connected
 * account renewal. Better Auth calls it through the resolved OAuth provider for
 * both `/refresh-token` and the expired-token path of `/get-access-token`.
 */
export function createCloudflareOAuthTokenRefresher({
  accessTokenExpiresIn,
  clientId,
  tokenEndpoint,
  worker
}: CreateCloudflareOAuthTokenRefresherInput): NonNullable<OAuthProvider['refreshAccessToken']> {
  return async (refreshToken) =>
    applyDefaultAccessTokenExpiry(
      await refreshCloudflareAccessToken({
        clientId,
        refreshToken,
        tokenEndpoint,
        worker
      }),
      accessTokenExpiresIn
    )
}

export async function exchangeCloudflareAuthorizationCode({
  callbackRedirectURI,
  clientId,
  code,
  codeVerifier,
  redirectURI,
  tokenEndpoint,
  worker
}: {
  callbackRedirectURI: string
  clientId: string
  code: string
  codeVerifier?: string | undefined
  redirectURI: string
  tokenEndpoint: string
  worker: CloudflareOAuthTokenExchangeWorkerConfig
}): Promise<OAuth2Tokens> {
  return requestCloudflareOAuthTokens({
    context: {
      callbackRedirectURI,
      operation: 'authorization_code',
      pkceVerifierPresent: Boolean(codeVerifier),
      redirectURI,
      tokenEndpoint
    },
    request: createAuthorizationCodeTokenRequest({
      clientId,
      code,
      codeVerifier,
      redirectURI
    }),
    worker
  })
}

export async function refreshCloudflareAccessToken({
  clientId,
  refreshToken,
  tokenEndpoint,
  worker
}: {
  clientId: string
  refreshToken: string
  tokenEndpoint: string
  worker: CloudflareOAuthTokenExchangeWorkerConfig
}): Promise<OAuth2Tokens> {
  return requestCloudflareOAuthTokens({
    context: {
      callbackRedirectURI: null,
      operation: 'refresh_token',
      pkceVerifierPresent: false,
      redirectURI: null,
      tokenEndpoint
    },
    request: await createRefreshTokenRequest({ clientId, refreshToken }),
    worker
  })
}

/**
 * Runs one Cloudflare token grant.
 *
 * Direct egress is tried first unless a challenge already forced this process
 * onto the Worker. A challenged direct response falls back to the trusted
 * service Worker and pins every later token call in this process to that path.
 *
 * A direct leg that never produced an HTTP response - timeout, DNS, TLS, or
 * connection failure - is deliberately handled differently: it is logged, the
 * Worker leg is still attempted for this call, and the process is *not* pinned.
 * A transport failure is not evidence that Cloudflare is challenging this
 * deployment's egress, so the next call must be free to try direct again.
 * A failed Worker leg has nowhere left to fall back to and raises the module's
 * classified error, which Better Auth reports as a credential failure so the
 * grant degrades and the caller answers `401`.
 */
async function requestCloudflareOAuthTokens({
  context,
  request,
  worker
}: {
  context: CloudflareTokenCallContext
  request: TokenRequest
  worker: CloudflareOAuthTokenExchangeWorkerConfig
}): Promise<OAuth2Tokens> {
  if (worker.directFirst && !workerRequiredForProcess) {
    const directContext = { ...context, workerTokenExchangeUrl: null }
    let directResponse: TokenHttpResponse | null

    try {
      directResponse = await postTokenRequest(context.tokenEndpoint, request, 'direct')
    } catch (error) {
      directResponse = null
      logTokenTransportFailure({
        context: directContext,
        endpoint: context.tokenEndpoint,
        error,
        fallbackAvailable: true,
        via: 'direct',
        workerRequiredForProcess
      })
      logTokenResponse(createTransportFailureDiagnostic({ ...directContext, error, via: 'direct' }))
    }

    if (directResponse) {
      logTokenResponse(
        createTokenExchangeDiagnostic({
          ...directContext,
          response: directResponse
        })
      )

      if (!isCloudflareChallengeEgressBlock(directResponse)) {
        return parseTokenResponse(directResponse, directContext)
      }

      workerRequiredForProcess = true
      log('cloudflare_oauth_token_exchange_direct_challenge_detected %o', {
        cfMitigated: directResponse.headers.get('cf-mitigated'),
        cfRay: directResponse.headers.get('cf-ray'),
        contentType: directResponse.headers.get('content-type'),
        operation: context.operation,
        providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
        workerTokenExchangeUrl: worker.tokenExchangeUrl,
        status: directResponse.status,
        tokenEndpoint: context.tokenEndpoint
      })
    }
  }

  const workerContext = { ...context, workerTokenExchangeUrl: worker.tokenExchangeUrl }
  let workerResponse: TokenHttpResponse

  try {
    workerResponse = await postTokenRequest(
      worker.tokenExchangeUrl,
      withWorkerAuthorization(request, worker.password),
      'worker'
    )
  } catch (error) {
    logTokenTransportFailure({
      context: workerContext,
      endpoint: worker.tokenExchangeUrl,
      error,
      fallbackAvailable: false,
      via: 'worker',
      workerRequiredForProcess
    })
    const diagnostic = createTransportFailureDiagnostic({ ...workerContext, error, via: 'worker' })
    logTokenResponse(diagnostic)
    throw new CloudflareOAuthTokenExchangeError(diagnostic)
  }

  logTokenResponse(
    createTokenExchangeDiagnostic({
      ...workerContext,
      response: workerResponse
    })
  )
  return parseTokenResponse(workerResponse, workerContext)
}

export function createAuthorizationCodeTokenRequest({
  clientId,
  code,
  codeVerifier,
  redirectURI
}: {
  clientId: string
  code: string
  codeVerifier?: string | undefined
  redirectURI: string
}): TokenRequest {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  if (codeVerifier) {
    body.set('code_verifier', codeVerifier)
  }
  body.set('redirect_uri', redirectURI)
  body.set('client_id', clientId)

  return {
    bodyText: body.toString(),
    headers: new Headers({
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    })
  }
}

/**
 * Builds the public-client refresh-token grant body through the Better Auth
 * OAuth2 request builder so the wire format stays owned by the OAuth
 * implementation rather than this transport.
 */
export async function createRefreshTokenRequest({
  clientId,
  refreshToken
}: {
  clientId: string
  refreshToken: string
}): Promise<TokenRequest> {
  const { body, headers } = await refreshAccessTokenRequest({
    authentication: 'post',
    options: { clientId },
    refreshToken
  })

  return {
    bodyText: body.toString(),
    headers: new Headers(headers)
  }
}

export function resetCloudflareOAuthTokenExchangeStateForTest(): void {
  workerRequiredForProcess = false
}

async function postTokenRequest(
  url: string,
  request: TokenRequest,
  via: 'direct' | 'worker'
): Promise<TokenHttpResponse> {
  try {
    const response = await fetch(url, {
      body: request.bodyText,
      headers: request.headers,
      method: 'POST',
      signal: AbortSignal.timeout(CLOUDFLARE_TOKEN_REQUEST_TIMEOUT_MS)
    })

    return {
      bodyText: await response.text(),
      headers: response.headers,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url,
      via
    }
  } catch (error) {
    throw new CloudflareOAuthTokenTransportError(via, classifyTransportFailure(error), error)
  }
}

function classifyTransportFailure(error: unknown): CloudflareOAuthTokenTransportFailureKind {
  const name = error instanceof Error ? error.name : ''

  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network'
}

function withWorkerAuthorization(request: TokenRequest, password: string): TokenRequest {
  const headers = new Headers(request.headers)
  headers.set('authorization', `Bearer ${password}`)
  return {
    bodyText: request.bodyText,
    headers
  }
}

function parseTokenResponse(
  response: TokenHttpResponse,
  context: CloudflareTokenCallContext & { workerTokenExchangeUrl: string | null }
): OAuth2Tokens {
  if (!response.ok) {
    throw new CloudflareOAuthTokenExchangeError(
      createTokenExchangeDiagnostic({
        ...context,
        response
      })
    )
  }

  let body: unknown
  try {
    body = JSON.parse(response.bodyText)
  } catch {
    throw new CloudflareOAuthTokenExchangeError(
      createTokenExchangeDiagnostic({
        ...context,
        response
      })
    )
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CloudflareOAuthTokenExchangeError(
      createTokenExchangeDiagnostic({
        ...context,
        response
      })
    )
  }

  try {
    return getOAuth2Tokens(body as Record<string, unknown>)
  } catch (error) {
    const diagnostic = createTokenExchangeDiagnostic({
      ...context,
      betterAuthErrorShape: createBetterAuthErrorShape(error),
      response
    })
    logTokenResponse(diagnostic)
    throw new CloudflareOAuthTokenExchangeError(diagnostic)
  }
}

function isCloudflareChallengeEgressBlock(response: TokenHttpResponse): boolean {
  const cfMitigated = response.headers.get('cf-mitigated')?.toLowerCase()
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  return (
    cfMitigated === 'challenge' ||
    (response.status === 403 &&
      contentType.includes('text/html') &&
      /cloudflare|challenge/iu.test(response.bodyText.slice(0, 4096)))
  )
}

function createTokenExchangeDiagnostic({
  betterAuthErrorShape = null,
  callbackRedirectURI,
  operation,
  pkceVerifierPresent,
  redirectURI,
  response,
  tokenEndpoint,
  workerTokenExchangeUrl
}: CloudflareTokenCallContext & {
  betterAuthErrorShape?: BetterAuthErrorShape
  response: TokenHttpResponse
  workerTokenExchangeUrl: string | null
}): TokenExchangeDiagnostic {
  const { body, truncated } = createDiagnosticBody(response)

  return {
    authMethod: 'none',
    betterAuthErrorShape,
    body,
    bodyTruncated: truncated,
    callbackRedirectURI,
    cfMitigated: response.headers.get('cf-mitigated'),
    cfRay: response.headers.get('cf-ray'),
    classification: classifyTokenResponse(response),
    contentType: response.headers.get('content-type'),
    operation,
    pkceVerifierPresent,
    providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
    redirectURI,
    status: response.status,
    statusText: response.statusText,
    tokenEndpoint,
    transportError: null,
    via: response.via,
    workerTokenExchangeUrl
  }
}

/**
 * Diagnostic for a leg that produced no HTTP response. `status` is `0` and the
 * response-derived fields are absent so a transport failure can never be read
 * as a Cloudflare challenge or an OAuth error response.
 */
function createTransportFailureDiagnostic({
  callbackRedirectURI,
  error,
  operation,
  pkceVerifierPresent,
  redirectURI,
  tokenEndpoint,
  via,
  workerTokenExchangeUrl
}: CloudflareTokenCallContext & {
  error: unknown
  via: 'direct' | 'worker'
  workerTokenExchangeUrl: string | null
}): TokenExchangeDiagnostic {
  const transportError = createTransportErrorShape(error)

  return {
    authMethod: 'none',
    betterAuthErrorShape: null,
    body: null,
    bodyTruncated: false,
    callbackRedirectURI,
    cfMitigated: null,
    cfRay: null,
    classification: `transport_${transportError.kind}`,
    contentType: null,
    operation,
    pkceVerifierPresent,
    providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
    redirectURI,
    status: 0,
    statusText: '',
    tokenEndpoint,
    transportError,
    via,
    workerTokenExchangeUrl
  }
}

function logTokenTransportFailure({
  context,
  endpoint,
  error,
  fallbackAvailable,
  via,
  workerRequiredForProcess: workerPinned
}: {
  context: CloudflareTokenCallContext & { workerTokenExchangeUrl: string | null }
  endpoint: string
  error: unknown
  fallbackAvailable: boolean
  via: 'direct' | 'worker'
  workerRequiredForProcess: boolean
}): void {
  const transportError = createTransportErrorShape(error)

  log('cloudflare_oauth_token_exchange_transport_failure %o', {
    endpointHost: readEndpointHost(endpoint),
    fallbackAvailable,
    failureKind: transportError.kind,
    operation: context.operation,
    providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
    timeoutMs: CLOUDFLARE_TOKEN_REQUEST_TIMEOUT_MS,
    tokenEndpoint: context.tokenEndpoint,
    transportError,
    via,
    workerRequiredForProcess: workerPinned,
    workerTokenExchangeUrl: context.workerTokenExchangeUrl
  })
}

function createTransportErrorShape(error: unknown): CloudflareOAuthTokenTransportErrorShape {
  const isTransportError = error instanceof CloudflareOAuthTokenTransportError
  const cause = isTransportError ? error.cause : error
  const kind = isTransportError ? error.kind : classifyTransportFailure(error)

  if (cause instanceof Error) {
    return { kind, message: cause.message, name: cause.name }
  }

  return { kind, message: String(cause), name: 'UnknownError' }
}

function readEndpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).host
  } catch {
    return null
  }
}

function logTokenResponse(diagnostic: TokenExchangeDiagnostic): void {
  log('cloudflare_oauth_token_exchange_response %o', diagnostic)
}

function classifyTokenResponse(response: TokenHttpResponse): string {
  const cfMitigated = response.headers.get('cf-mitigated')?.toLowerCase()
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  if (cfMitigated === 'challenge') {
    return 'challenge_html'
  }
  if (contentType.includes('application/json')) {
    return response.ok ? 'oauth_json' : 'oauth_error_json'
  }
  if (contentType.includes('text/html')) {
    return response.status === 403 ? 'challenge_html' : 'html'
  }
  return 'other'
}

function createDiagnosticBody(response: TokenHttpResponse): { body: unknown; truncated: boolean } {
  const text = response.bodyText
  const truncated = text.length > MAX_DIAGNOSTIC_BODY_LENGTH
  const diagnosticText = truncated ? text.slice(0, MAX_DIAGNOSTIC_BODY_LENGTH) : text

  if (response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    try {
      return {
        body: redactKnownSecretFields(JSON.parse(diagnosticText)),
        truncated
      }
    } catch {
      return { body: diagnosticText, truncated }
    }
  }

  return { body: diagnosticText, truncated }
}

function redactKnownSecretFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactKnownSecretFields)
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isKnownSecretResponseField(key) ? '[redacted]' : redactKnownSecretFields(entry)
    ])
  )
}

function isKnownSecretResponseField(key: string): boolean {
  return /^(access_token|refresh_token|id_token|client_secret)$/iu.test(key)
}

function createBetterAuthErrorShape(error: unknown): BetterAuthErrorShape {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name
    }
  }

  if (
    error === null ||
    typeof error === 'string' ||
    typeof error === 'number' ||
    typeof error === 'boolean'
  ) {
    return error
  }

  if (error && typeof error === 'object') {
    return error as Record<string, unknown>
  }

  return null
}
