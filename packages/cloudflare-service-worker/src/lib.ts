export interface WorkerEnvironment {
  AGENTTEAM_WORKER_PASSWORD?: unknown
}

export const WORKER_ROLE = 'agentteam cloudflare service worker'
export const OAUTH_TOKEN_EXCHANGE_PATH = '/oauth2/token'
export const CLOUDFLARE_TOKEN_ENDPOINT = 'https://dash.cloudflare.com/oauth2/token'

const TEXT_ENCODER = new TextEncoder()
const UPSTREAM_RESPONSE_HEADER_ALLOWLIST = new Set([
  'cache-control',
  'cf-mitigated',
  'cf-ray',
  'content-type',
  'expires',
  'pragma'
])

export function isAuthorized(headers: Headers, secret: unknown): boolean {
  const expected = requireSecret(secret)
  if (!expected) {
    return false
  }

  const value = headers.get('authorization') ?? ''
  const match = /^Bearer (?<token>.+)$/iu.exec(value)
  return timingSafeEqual(match?.groups?.token ?? '', expected)
}

export async function exchangeCloudflareOAuthTokenRequest(request: Request): Promise<Response> {
  const body = await request.arrayBuffer()
  const upstreamHeaders = createUpstreamRequestHeaders(request.headers)
  const upstream = await fetch(CLOUDFLARE_TOKEN_ENDPOINT, {
    body,
    headers: upstreamHeaders,
    method: 'POST'
  })
  const upstreamBody = await upstream.arrayBuffer()
  const responseHeaders = createPassthroughResponseHeaders(upstream.headers)

  console.log(
    [
      'agentteam-cloudflare-service-worker upstream',
      `status=${upstream.status}`,
      `content_type=${safeLogValue(upstream.headers.get('content-type'))}`,
      `cf_ray=${safeLogValue(upstream.headers.get('cf-ray'))}`,
      `cf_mitigated=${safeLogValue(upstream.headers.get('cf-mitigated'))}`,
      `classification=${classifyResponse(upstream.status, upstream.headers)}`,
      `request_bytes=${body.byteLength}`,
      `response_bytes=${upstreamBody.byteLength}`
    ].join(' ')
  )

  return new Response(upstreamBody, {
    headers: responseHeaders,
    status: upstream.status,
    statusText: upstream.statusText
  })
}

export function createUpstreamRequestHeaders(headers: Headers): Headers {
  const forwarded = new Headers()
  const contentType = headers.get('content-type')
  const accept = headers.get('accept')

  if (contentType) {
    forwarded.set('content-type', contentType)
  }
  if (accept) {
    forwarded.set('accept', accept)
  }

  return forwarded
}

export function createPassthroughResponseHeaders(headers: Headers): Headers {
  const responseHeaders = new Headers()
  for (const [name, value] of headers) {
    if (UPSTREAM_RESPONSE_HEADER_ALLOWLIST.has(name.toLowerCase())) {
      responseHeaders.set(name, value)
    }
  }
  return responseHeaders
}

export function classifyResponse(status: number, headers: Headers): string {
  const contentType = headers.get('content-type')?.toLowerCase() ?? ''
  const cfMitigated = headers.get('cf-mitigated')?.toLowerCase() ?? ''

  if (cfMitigated === 'challenge') {
    return 'challenge_html'
  }
  if (contentType.includes('application/json')) {
    return status >= 200 && status < 300 ? 'oauth_json' : 'oauth_error_json'
  }
  if (contentType.includes('text/html')) {
    return status === 403 ? 'challenge_html' : 'html'
  }
  return 'other'
}

export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers
    },
    status
  })
}

function requireSecret(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = TEXT_ENCODER.encode(left)
  const rightBytes = TEXT_ENCODER.encode(right)
  let difference = leftBytes.byteLength ^ rightBytes.byteLength
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength)

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }

  return difference === 0
}

function safeLogValue(value: string | null): string {
  if (!value) {
    return 'none'
  }
  return /^[ A-Za-z0-9./,:;=+_-]{1,160}$/u.test(value) ? value : 'present'
}
