import { HttpStatusCode } from '@main/common'
import { describe, expect, it } from 'vitest'

import { createSafeRequestCorrelationLogDetails, mapPublicErrorResponse } from './public-error-response'

describe('public error response mapping', () => {
  it('maps unknown failures to a generic server error with a safe request reference', () => {
    expect.hasAssertions()

    const error = new Error(
      'database password=_secret_database_password and Authorization Bearer raw-bearer-token'
    )
    error.stack = 'stack with raw-bearer-token'

    const response = mapPublicErrorResponse({
      code: 'UNKNOWN',
      error,
      request: new Request('https://mail.example.test/rpc/mail?token=raw-query-token', {
        headers: {
          authorization: 'Bearer raw-bearer-token',
          cookie: 'better-auth.session_token=raw-cookie',
          'x-request-id': 'request-1'
        }
      })
    })
    const serialized = JSON.stringify(response)

    expect(response).toStrictEqual({
      body: {
        code: 'INTERNAL_SERVER_ERROR',
        error: 'Internal server error.',
        supportReference: 'request-id:request-1'
      },
      status: 500
    })
    expect(serialized).not.toContain('database password')
    expect(serialized).not.toContain('raw-bearer-token')
    expect(serialized).not.toContain('raw-cookie')
    expect(serialized).not.toContain('raw-query-token')
  })

  it.each([
    {
      property: 'status',
      status: HttpStatusCode.Unauthorized
    },
    {
      property: 'status',
      status: HttpStatusCode.Forbidden
    },
    {
      property: 'statusCode',
      status: HttpStatusCode.Unauthorized
    },
    {
      property: 'statusCode',
      status: HttpStatusCode.Forbidden
    }
  ])('does not trust lower-layer $property errors for public auth semantics', ({ property, status }) => {
    expect.hasAssertions()

    const response = mapPublicErrorResponse({
      error: Object.assign(new Error(`raw lower-layer token failure for ${status}`), { [property]: status })
    })

    expect(response).toStrictEqual({
      body: {
        code: 'INTERNAL_SERVER_ERROR',
        error: 'Internal server error.'
      },
      status: 500
    })
    expect(JSON.stringify(response)).not.toContain('raw lower-layer token failure')
  })

  it.each([
    {
      body: { code: 'UNAUTHORIZED', error: 'Authentication is required.' },
      status: HttpStatusCode.Unauthorized
    },
    {
      body: { code: 'FORBIDDEN', error: 'Access denied.' },
      status: HttpStatusCode.Forbidden
    }
  ])('preserves route-owned $status semantics without exposing lower-layer messages', ({ body, status }) => {
    expect.hasAssertions()

    const response = mapPublicErrorResponse({
      code: status,
      error: Object.assign(new Error(`raw lower-layer token failure for ${status}`), { status })
    })

    expect(response).toStrictEqual({
      body,
      status
    })
    expect(JSON.stringify(response)).not.toContain('raw lower-layer token failure')
  })

  it('uses safe correlation fallbacks and rejects suspicious request identifiers', () => {
    expect.hasAssertions()

    const request = new Request('https://mail.example.test/rpc/cloudflare/status', {
      headers: {
        'cf-ray': '8d18f1d2c4a12345-SJC',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        'x-request-id': 'sk-secret-request-token'
      }
    })

    expect(createSafeRequestCorrelationLogDetails(request)).toStrictEqual({
      cfRay: '8d18f1d2c4a12345-SJC',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    })
    expect(
      mapPublicErrorResponse({
        error: Object.assign(new Error('Cloudflare returned token raw-provider-token'), {
          statusCode: HttpStatusCode.BadGateway
        }),
        request
      })
    ).toStrictEqual({
      body: {
        code: 'BAD_GATEWAY',
        error: 'Upstream service unavailable.',
        supportReference: 'cf-ray:8d18f1d2c4a12345-SJC'
      },
      status: HttpStatusCode.BadGateway
    })
  })
})
