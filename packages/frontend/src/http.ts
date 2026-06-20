import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

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
  const forwardedHost = req.headers['x-forwarded-host']
  const host = forwardedHost ?? req.headers.host ?? 'localhost:4321'
  const hostname = Array.isArray(host) ? host[0] : host
  const forwardedProto = req.headers['x-forwarded-proto']
  const protocolHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  const protocol = protocolHeader === 'https' ? 'https' : 'http'

  return new URL(`${protocol}://${hostname}`).origin
}
