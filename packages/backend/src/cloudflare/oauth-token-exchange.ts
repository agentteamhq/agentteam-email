import { getOAuth2Tokens } from '@better-auth/core/oauth2'
import debug from 'debug'

import { CLOUDFLARE_OAUTH_PROVIDER_ID } from './constants'
import type { OAuth2Tokens } from '@better-auth/core/oauth2'
import type { GenericOAuthConfig } from 'better-auth/plugins'

const log = debug('app:cloudflare:oauth-token')
const MAX_DIAGNOSTIC_BODY_LENGTH = 16_384

let workerRequiredForProcess = false

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
  callbackRedirectURI: string
  cfMitigated: string | null
  cfRay: string | null
  classification: string
  contentType: string | null
  pkceVerifierPresent: boolean
  providerId: typeof CLOUDFLARE_OAUTH_PROVIDER_ID
  redirectURI: string
  workerTokenExchangeUrl: string | null
  status: number
  statusText: string
  tokenEndpoint: string
  via: 'direct' | 'worker'
}

export class CloudflareOAuthTokenExchangeError extends Error {
  readonly diagnostic: TokenExchangeDiagnostic

  constructor(diagnostic: TokenExchangeDiagnostic) {
    super('Cloudflare OAuth token exchange failed')
    this.name = 'CloudflareOAuthTokenExchangeError'
    this.diagnostic = diagnostic
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
  const request = createAuthorizationCodeTokenRequest({
    clientId,
    code,
    codeVerifier,
    redirectURI
  })

  if (worker.directFirst && !workerRequiredForProcess) {
    const directResponse = await postTokenRequest(tokenEndpoint, request, 'direct')
    logTokenResponse(
      createTokenExchangeDiagnostic({
        callbackRedirectURI,
        redirectURI,
        response: directResponse,
        tokenEndpoint,
        pkceVerifierPresent: Boolean(codeVerifier),
        workerTokenExchangeUrl: null
      })
    )

    if (!isCloudflareChallengeEgressBlock(directResponse)) {
      return parseTokenResponse(directResponse, {
        callbackRedirectURI,
        redirectURI,
        tokenEndpoint,
        pkceVerifierPresent: Boolean(codeVerifier),
        workerTokenExchangeUrl: null
      })
    }

    workerRequiredForProcess = true
    log('cloudflare_oauth_token_exchange_direct_challenge_detected %o', {
      cfMitigated: directResponse.headers.get('cf-mitigated'),
      cfRay: directResponse.headers.get('cf-ray'),
      contentType: directResponse.headers.get('content-type'),
      providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
      workerTokenExchangeUrl: worker.tokenExchangeUrl,
      status: directResponse.status,
      tokenEndpoint
    })
  }

  const workerResponse = await postTokenRequest(
    worker.tokenExchangeUrl,
    withWorkerAuthorization(request, worker.password),
    'worker'
  )
  logTokenResponse(
    createTokenExchangeDiagnostic({
      callbackRedirectURI,
      redirectURI,
      response: workerResponse,
      tokenEndpoint,
      pkceVerifierPresent: Boolean(codeVerifier),
      workerTokenExchangeUrl: worker.tokenExchangeUrl
    })
  )
  return parseTokenResponse(workerResponse, {
    callbackRedirectURI,
    redirectURI,
    tokenEndpoint,
    pkceVerifierPresent: Boolean(codeVerifier),
    workerTokenExchangeUrl: worker.tokenExchangeUrl
  })
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

export function resetCloudflareOAuthTokenExchangeStateForTest(): void {
  workerRequiredForProcess = false
}

async function postTokenRequest(
  url: string,
  request: TokenRequest,
  via: 'direct' | 'worker'
): Promise<TokenHttpResponse> {
  const response = await fetch(url, {
    body: request.bodyText,
    headers: request.headers,
    method: 'POST'
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
  context: {
    callbackRedirectURI: string
    pkceVerifierPresent: boolean
    redirectURI: string
    tokenEndpoint: string
    workerTokenExchangeUrl: string | null
  }
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
  pkceVerifierPresent,
  redirectURI,
  response,
  tokenEndpoint,
  workerTokenExchangeUrl
}: {
  betterAuthErrorShape?: BetterAuthErrorShape
  callbackRedirectURI: string
  pkceVerifierPresent: boolean
  redirectURI: string
  response: TokenHttpResponse
  tokenEndpoint: string
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
    pkceVerifierPresent,
    providerId: CLOUDFLARE_OAUTH_PROVIDER_ID,
    redirectURI,
    status: response.status,
    statusText: response.statusText,
    tokenEndpoint,
    via: response.via,
    workerTokenExchangeUrl
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
