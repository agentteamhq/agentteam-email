import { describe, expect, it } from 'vitest'

import { getRequestOrigin, sendWebResponse } from './http'
import type { IncomingMessage, ServerResponse } from 'node:http'

describe('getRequestOrigin', () => {
  it('uses a validated RFC Forwarded host and protocol', () => {
    expect(
      getRequestOrigin(
        requestWithHeaders({
          forwarded: 'for=203.0.113.10;proto=https;host="mail.example.com:8443"',
          host: 'internal.example.test'
        })
      )
    ).toBe('https://mail.example.com:8443')
  })

  it('rejects malformed forwarded hosts and falls back to the Host header', () => {
    expect(
      getRequestOrigin(
        requestWithHeaders({
          host: 'mail.example.com',
          'x-forwarded-host': 'attacker.example.test/path',
          'x-forwarded-proto': 'https'
        })
      )
    ).toBe('https://mail.example.com')
  })
})

describe('sendWebResponse', () => {
  it('does not write an HTTP status message', async () => {
    expect.assertions(3)
    const res = responseTarget()

    await sendWebResponse(
      new Response(null, {
        headers: {
          'x-test': 'ok'
        },
        status: 204,
        statusText: 'No Content'
      }),
      res
    )

    expect(res.statusCode).toBe(204)
    expect(res.headers).toStrictEqual({ 'x-test': 'ok' })
    expect(res.ended).toBe(true)
  })
})

function requestWithHeaders(headers: IncomingMessage['headers']): IncomingMessage {
  return {
    connection: { remoteAddress: '127.0.0.1' },
    headers,
    socket: { remoteAddress: '127.0.0.1' }
  } as IncomingMessage
}

function responseTarget(): ServerResponse & {
  ended: boolean
  headers: Record<string, string | string[] | number>
} {
  const target = {
    ended: false,
    headers: {} as Record<string, string | string[] | number>,
    statusCode: 200,
    end() {
      this.ended = true
    },
    setHeader(name: string, value: string | string[] | number) {
      this.headers[name] = value
      return this as unknown as ServerResponse
    },
    set statusMessage(_value: string) {
      throw new Error('sendWebResponse must not write statusMessage')
    }
  }

  return target as unknown as ServerResponse & {
    ended: boolean
    headers: Record<string, string | string[] | number>
  }
}
