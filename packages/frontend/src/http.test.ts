import { describe, expect, it } from 'vitest'

import { getRequestOrigin } from './http'
import type { IncomingMessage } from 'node:http'

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

function requestWithHeaders(headers: IncomingMessage['headers']): IncomingMessage {
  return {
    connection: { remoteAddress: '127.0.0.1' },
    headers,
    socket: { remoteAddress: '127.0.0.1' }
  } as IncomingMessage
}
