import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceTestState = vi.hoisted(() => ({
  agentMailMailboxGrantFind: vi.fn(),
  agentMailSystemGrantFind: vi.fn(),
  authGetAgentSession: vi.fn(),
  authGetSession: vi.fn(),
  authVerifyApiKey: vi.fn(),
  cloudflareConnectionFindOne: vi.fn(),
  memberFindOne: vi.fn(),
  oauthVerifyAccessToken: vi.fn(),
  submitAgentMailSend: vi.fn()
}))

vi.mock('../globals', () => ({
  globals: () =>
    Promise.resolve({
      auth: {
        api: {
          getAgentSession: serviceTestState.authGetAgentSession,
          getSession: serviceTestState.authGetSession,
          verifyApiKey: serviceTestState.authVerifyApiKey
        }
      },
      db: {
        models: {
          cloudflareConnection: {
            findOne: serviceTestState.cloudflareConnectionFindOne
          },
          agentMailMailboxGrant: {
            find: serviceTestState.agentMailMailboxGrantFind
          },
          agentMailSystemGrant: {
            find: serviceTestState.agentMailSystemGrantFind
          },
          member: {
            findOne: serviceTestState.memberFindOne
          }
        }
      }
    })
}))

vi.mock('@better-auth/oauth-provider/resource-client', () => ({
  oauthProviderResourceClient: () => ({
    getActions: () => ({
      verifyAccessToken: serviceTestState.oauthVerifyAccessToken
    })
  })
}))

vi.mock('./control-client', () => ({
  submitAgentMailSend: serviceTestState.submitAgentMailSend
}))

describe('Agent Mail service boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    serviceTestState.agentMailMailboxGrantFind.mockReset()
    serviceTestState.agentMailSystemGrantFind.mockReset()
    serviceTestState.authGetAgentSession.mockReset()
    serviceTestState.authGetSession.mockReset()
    serviceTestState.authVerifyApiKey.mockReset()
    serviceTestState.cloudflareConnectionFindOne.mockReset()
    serviceTestState.memberFindOne.mockReset()
    serviceTestState.oauthVerifyAccessToken.mockReset()
    serviceTestState.submitAgentMailSend.mockReset()

    serviceTestState.authGetAgentSession.mockResolvedValue(null)
    serviceTestState.authGetSession.mockResolvedValue({
      session: {
        activeOrganizationId: 'org-1',
        id: 'session-1'
      },
      user: {
        id: 'user-1'
      }
    })
    serviceTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ role: 'owner' })
    })
    serviceTestState.agentMailMailboxGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    serviceTestState.agentMailSystemGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    serviceTestState.cloudflareConnectionFindOne.mockReturnValue({ exec: () => Promise.resolve(null) })
  })

  it('submits outbound mail with a Nodemailer-generated RFC822 message', async () => {
    expect.hasAssertions()
    serviceTestState.cloudflareConnectionFindOne.mockReturnValue({
      exec: () => Promise.resolve({ domain: 'example.test', status: 'active' })
    })
    serviceTestState.submitAgentMailSend.mockResolvedValue({
      idempotency_key: 'queued-key',
      status: 'submitted'
    })

    const { submitAgentMailOutboundFromWeb } = await import('./service')
    await expect(
      submitAgentMailOutboundFromWeb({
        headers: new Headers(),
        input: {
          from: 'Support <Support@Example.Test>',
          subject: 'Hello ✓',
          text: 'Body ✓',
          to: ['Recipient <Recipient@Exämple.com>']
        }
      })
    ).resolves.toStrictEqual({
      idempotency_key: 'queued-key',
      status: 'submitted'
    })

    expect(serviceTestState.submitAgentMailSend).toHaveBeenCalledOnce()
    const request = serviceTestState.submitAgentMailSend.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      domain: 'example.test',
      from: 'support@example.test',
      to: 'recipient@xn--exmple-cua.com'
    })
    expect(request.raw).toContain('From: support@example.test\r\n')
    expect(request.raw).toContain('To: recipient@xn--exmple-cua.com\r\n')
    expect(request.raw).toContain('Subject: =?UTF-8?')
    expect(request.raw).toContain('Message-ID: <')
    expect(request.raw).toContain('MIME-Version: 1.0\r\n')
    expect(request.raw).toContain('Content-Type: text/plain; charset=utf-8\r\n')
    expect(request.raw).toContain('Body =E2=9C=93')
  })
})
