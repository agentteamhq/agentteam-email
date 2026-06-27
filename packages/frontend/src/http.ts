import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import parseForwarded from 'forwarded-parse'
import ipaddr from 'ipaddr.js'
import proxyaddr from 'proxy-addr'
import type { IncomingMessage, ServerResponse } from 'node:http'

type RequestInitWithDuplex = RequestInit & {
  duplex?: 'half'
}

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[]
}

export function createWebRequest(req: IncomingMessage, origin: string): Request {
  const url = new URL(req.url ?? '/', origin)
  const headers = new Headers()

  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(name, value)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item)
      }
    }
  }

  const method = req.method ?? 'GET'
  const init: RequestInitWithDuplex = {
    headers,
    method
  }

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(req) as ReadableStream
    init.duplex = 'half'
  }

  return new Request(url, init)
}

export async function sendWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status
  res.statusMessage = response.statusText

  const headers = response.headers as HeadersWithSetCookie
  const setCookie = headers.getSetCookie?.()

  response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie') {
      res.setHeader(name, value)
    }
  })

  if (setCookie && setCookie.length > 0) {
    res.setHeader('set-cookie', setCookie)
  }

  if (!response.body) {
    res.end()
    return
  }

  const body = response.body as Parameters<typeof Readable.fromWeb>[0]

  await pipeline(Readable.fromWeb(body), res)
}

export function getRequestOrigin(req: IncomingMessage): string {
  const hasValidProxyAddress = proxyClientIPAddress(req) !== null
  const forwarded = hasValidProxyAddress ? firstForwardedEntry(headerValue(req.headers.forwarded)) : null
  const host =
    normalizeHTTPHost(forwarded?.host) ??
    (hasValidProxyAddress ? normalizeHTTPHost(headerValue(req.headers['x-forwarded-host'])) : null) ??
    normalizeHTTPHost(headerValue(req.headers.host)) ??
    'localhost:4321'
  const protocol =
    normalizeHTTPProtocol(forwarded?.proto) ??
    (hasValidProxyAddress ? normalizeHTTPProtocol(headerValue(req.headers['x-forwarded-proto'])) : null) ??
    'http'

  const url = new URL('http://localhost')
  url.protocol = `${protocol}:`
  url.host = host

  return url.origin
}

function firstForwardedEntry(header: string | null) {
  if (!header) {
    return null
  }
  try {
    return parseForwarded(header)[0] ?? null
  } catch {
    return null
  }
}

function normalizeHTTPProtocol(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'http' || normalized === 'https' ? normalized : null
}

function normalizeHTTPHost(value: string | null | undefined) {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }
  try {
    const url = new URL(`http://${normalized}`)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return null
    }
    const hostname = unbracketHostname(url.hostname)
    if (hostname.includes(':') && !ipaddr.isValid(hostname)) {
      return null
    }
    return url.host.toLowerCase()
  } catch {
    return null
  }
}

function proxyClientIPAddress(req: IncomingMessage) {
  try {
    const addresses = proxyaddr.all(req)
    for (const address of addresses.slice().reverse()) {
      const normalized = normalizeIPAddress(address)
      if (normalized) {
        return normalized
      }
    }
  } catch {
    return null
  }
  return null
}

function normalizeIPAddress(value: string) {
  try {
    return ipaddr.process(unbracketHostname(value)).toString()
  } catch {
    return null
  }
}

function unbracketHostname(value: string) {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}
