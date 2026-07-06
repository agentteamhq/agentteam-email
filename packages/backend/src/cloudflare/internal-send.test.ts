import { beforeEach, describe, expect, it, vi } from 'vitest'

const internalSendTestState = vi.hoisted(() => ({
  debugFactory: Object.assign(vi.fn(), {
    disable: vi.fn(),
    enable: vi.fn(),
    enabled: vi.fn()
  }),
  debugLog: vi.fn(),
  sendCloudflareRawEmailForControl: vi.fn()
}))

vi.mock('debug', () => ({
  default: internalSendTestState.debugFactory
}))

vi.mock('./service', () => {
  class CloudflareControlSendError extends Error {
    constructor(
      message: string,
      public readonly status: 400 | 403 | 502
    ) {
      super(message)
      this.name = 'CloudflareControlSendError'
    }
  }

  return {
    CloudflareControlSendError,
    sendCloudflareRawEmailForControl: internalSendTestState.sendCloudflareRawEmailForControl
  }
})

describe('Cloudflare internal control send handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    vi.stubEnv('AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN', 'control-to-web-token')
    internalSendTestState.debugFactory.mockClear()
    internalSendTestState.debugFactory.mockImplementation(() => internalSendTestState.debugLog)
    internalSendTestState.debugLog.mockReset()
    internalSendTestState.sendCloudflareRawEmailForControl.mockReset()
  })

  it('rejects requests without the scoped control-to-web token before send lookup', async () => {
    expect.hasAssertions()
    const { handleCloudflareControlSendRawRequest } = await import('./internal-send')

    const response = await handleCloudflareControlSendRawRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/cloudflare/send-raw', {
        body: JSON.stringify(validRequestBody()),
        headers: { 'x-request-id': 'internal-send-auth-1' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toStrictEqual({
      code: 'UNAUTHORIZED',
      error: 'Authentication is required.',
      supportReference: 'request-id:internal-send-auth-1'
    })
    expect(internalSendTestState.sendCloudflareRawEmailForControl).not.toHaveBeenCalled()
  })

  it('rejects invalid request bodies before send lookup', async () => {
    expect.hasAssertions()
    const { handleCloudflareControlSendRawRequest } = await import('./internal-send')

    const response = await handleCloudflareControlSendRawRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/cloudflare/send-raw', {
        body: JSON.stringify({ ...validRequestBody(), recipients: [] }),
        headers: { 'X-Agent-Mail-Control-Web-Token': 'control-to-web-token' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(400)
    expect(internalSendTestState.sendCloudflareRawEmailForControl).not.toHaveBeenCalled()
  })

  it('sends through the web-owned Cloudflare service for authenticated control requests', async () => {
    expect.hasAssertions()
    internalSendTestState.sendCloudflareRawEmailForControl.mockResolvedValue({
      delivered: ['recipient@example.net'],
      permanent_bounces: [],
      queued: []
    })
    const { handleCloudflareControlSendRawRequest } = await import('./internal-send')

    const response = await handleCloudflareControlSendRawRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/cloudflare/send-raw', {
        body: JSON.stringify(validRequestBody()),
        headers: { 'X-Agent-Mail-Control-Web-Token': 'control-to-web-token' },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      delivered: ['recipient@example.net'],
      permanent_bounces: [],
      queued: []
    })
    expect(internalSendTestState.sendCloudflareRawEmailForControl).toHaveBeenCalledWith({
      domain: 'example.com',
      from: 'agent@example.com',
      mimeMessage: 'From: agent@example.com\r\n\r\nbody',
      organizationId: '01960000-0000-7000-8000-000000000001',
      organizationPublicId: 'org_public_test',
      recipients: ['recipient@example.net'],
      sendId: undefined,
      zoneMtaQueueId: 'zone-queue-123'
    })
  })

  it('returns service authorization failures without exposing Cloudflare credentials', async () => {
    expect.hasAssertions()
    const { CloudflareControlSendError } = await import('./service')
    internalSendTestState.sendCloudflareRawEmailForControl.mockRejectedValue(
      new CloudflareControlSendError(
        'Active Agent Mail domain is not authorized for send with Authorization Bearer raw-token',
        403
      )
    )
    const { handleCloudflareControlSendRawRequest } = await import('./internal-send')

    const response = await handleCloudflareControlSendRawRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/cloudflare/send-raw', {
        body: JSON.stringify(validRequestBody()),
        headers: {
          'X-Agent-Mail-Control-Web-Token': 'control-to-web-token',
          'x-request-id': 'internal-send-request-1'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body).toStrictEqual({
      code: 'FORBIDDEN',
      error: 'Access denied.',
      supportReference: 'request-id:internal-send-request-1'
    })
    expect(JSON.stringify(body)).not.toContain('raw-token')
    expect(JSON.stringify(body)).not.toContain('Active Agent Mail domain')
  })

  it('logs control send failures without raw provider payloads or MIME', async () => {
    expect.hasAssertions()
    const { CloudflareControlSendError } = await import('./service')
    internalSendTestState.sendCloudflareRawEmailForControl.mockRejectedValue(
      new CloudflareControlSendError(
        'Cloudflare raw send failed with Cookie raw-cookie and From: agent@example.com',
        502
      )
    )
    const { handleCloudflareControlSendRawRequest } = await import('./internal-send')

    const response = await handleCloudflareControlSendRawRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/cloudflare/send-raw', {
        body: JSON.stringify(validRequestBody()),
        headers: {
          'X-Agent-Mail-Control-Web-Token': 'control-to-web-token',
          'x-request-id': 'internal-send-request-2'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toStrictEqual({
      code: 'BAD_GATEWAY',
      error: 'Upstream service unavailable.',
      supportReference: 'request-id:internal-send-request-2'
    })
    expect(internalSendTestState.debugLog).toHaveBeenCalledWith(
      'cloudflare_control_send_raw_failed %o',
      expect.objectContaining({
        error: {
          code: '502',
          message: 'Cloudflare raw send failed with Cookie secret_redacted and From:  email_redacted',
          name: 'CloudflareControlSendError',
          status: '502',
          statusCode: 502,
          type: 'object'
        },
        operation: 'cloudflare_control_send_raw',
        publicError: {
          code: 'BAD_GATEWAY',
          status: 502,
          supportReference: 'request-id:internal-send-request-2'
        },
        requestId: 'internal-send-request-2'
      })
    )
    const serializedLogCalls = JSON.stringify(internalSendTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('raw-cookie')
    expect(serializedLogCalls).not.toContain('agent@example.com')
    expect(serializedLogCalls).toContain('Cloudflare raw send failed')
  })
})

function validRequestBody() {
  return {
    domain: 'example.com',
    from: 'agent@example.com',
    mime_message: 'From: agent@example.com\r\n\r\nbody',
    organization_id: '01960000-0000-7000-8000-000000000001',
    organization_public_id: 'org_public_test',
    recipients: ['recipient@example.net'],
    zonemta_queue_id: 'zone-queue-123'
  }
}
