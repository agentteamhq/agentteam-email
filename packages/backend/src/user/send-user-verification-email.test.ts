import { beforeEach, describe, expect, it, vi } from 'vitest'

const verificationEmailTestState = vi.hoisted(() => ({
  debugFactory: Object.assign(vi.fn(), {
    disable: vi.fn(),
    enable: vi.fn(),
    enabled: vi.fn()
  }),
  debugLog: vi.fn(),
  findOne: vi.fn(),
  globals: vi.fn(),
  sendVerificationEmail: vi.fn(),
  updateOne: vi.fn()
}))

vi.mock('debug', () => ({
  default: verificationEmailTestState.debugFactory
}))

vi.mock('../globals', () => ({
  globals: verificationEmailTestState.globals
}))

describe('sendUserVerificationEmail', () => {
  beforeEach(() => {
    vi.resetModules()
    verificationEmailTestState.debugFactory.mockClear()
    verificationEmailTestState.debugFactory.mockImplementation(() => verificationEmailTestState.debugLog)
    verificationEmailTestState.debugLog.mockReset()
    verificationEmailTestState.findOne.mockReset()
    verificationEmailTestState.globals.mockReset()
    verificationEmailTestState.sendVerificationEmail.mockReset()
    verificationEmailTestState.updateOne.mockReset()
    verificationEmailTestState.globals.mockResolvedValue({
      auth: {
        api: {
          sendVerificationEmail: verificationEmailTestState.sendVerificationEmail
        }
      },
      db: {
        models: {
          user: {
            findOne: verificationEmailTestState.findOne,
            updateOne: verificationEmailTestState.updateOne
          }
        }
      }
    })
    verificationEmailTestState.updateOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ modifiedCount: 1 })
    })
  })

  it('logs verification email success without the recipient address', async () => {
    expect.hasAssertions()
    mockUserLookup({
      _id: 'user_123',
      emailVerified: false,
      lastVerificationEmailSent: null
    })
    verificationEmailTestState.sendVerificationEmail.mockResolvedValue(undefined)

    const { sendUserVerificationEmail } = await import('./send-user-verification-email')
    const result = await sendUserVerificationEmail('recipient@example.test')

    expect(result).toBe('Email not verified. A verification email has been sent, please check your inbox.')
    expect(verificationEmailTestState.debugLog).toHaveBeenCalledWith('sent verification email %o', {
      operation: 'send_user_verification_email',
      userId: 'user_123'
    })
    const serializedLogCalls = JSON.stringify(verificationEmailTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('recipient@example.test')
  })

  it('logs verification email rate limits without the recipient address', async () => {
    expect.hasAssertions()
    mockUserLookup({
      _id: 'user_123',
      emailVerified: false,
      lastVerificationEmailSent: null
    })
    verificationEmailTestState.sendVerificationEmail.mockRejectedValue({
      message: 'rate limited for recipient@example.test with token=raw-rate-limit-token',
      statusCode: 429
    })

    const { sendUserVerificationEmail } = await import('./send-user-verification-email')
    const result = await sendUserVerificationEmail('recipient@example.test')

    expect(result).toBe('Too many attempts. Please wait a few minutes and try again.')
    expect(verificationEmailTestState.debugLog).toHaveBeenCalledWith(
      'too many verification email attempts %o',
      {
        error: {
          message: 'rate limited for  email_redacted  with token=secret_redacted',
          name: 'object',
          statusCode: 429,
          type: 'object'
        },
        operation: 'send_user_verification_email',
        userId: 'user_123'
      }
    )
    const serializedLogCalls = JSON.stringify(verificationEmailTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('recipient@example.test')
    expect(serializedLogCalls).not.toContain('raw-rate-limit-token')
    expect(serializedLogCalls).toContain('rate limited for')
  })

  it('logs verification email failures without raw exception content', async () => {
    expect.hasAssertions()
    mockUserLookup({
      _id: 'user_123',
      emailVerified: false,
      lastVerificationEmailSent: null
    })
    const error = new Error(
      'provider failed for recipient@example.test with token=raw-verification-token'
    ) as Error & {
      code: string
      statusCode: number
    }
    error.name = 'BetterAuthEmailError'
    error.code = 'EMAIL_SEND_FAILED'
    error.stack = 'stack with raw-verification-token and recipient@example.test'
    error.statusCode = 502
    verificationEmailTestState.sendVerificationEmail.mockRejectedValue(error)

    const { sendUserVerificationEmail } = await import('./send-user-verification-email')
    const result = await sendUserVerificationEmail('recipient@example.test')

    expect(result).toBe('Email not verified. Please check your inbox to verify your email.')
    expect(verificationEmailTestState.debugLog).toHaveBeenCalledWith('error sending verification email %o', {
      error: {
        code: 'EMAIL_SEND_FAILED',
        message: 'provider failed for  email_redacted  with token=secret_redacted',
        name: 'BetterAuthEmailError',
        statusCode: 502,
        type: 'object'
      },
      operation: 'send_user_verification_email',
      userId: 'user_123'
    })
    const serializedLogCalls = JSON.stringify(verificationEmailTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('recipient@example.test')
    expect(serializedLogCalls).toContain('BetterAuthEmailError')
    expect(serializedLogCalls).not.toContain('raw-verification-token')
    expect(serializedLogCalls).toContain('provider failed')
    expect(serializedLogCalls).not.toContain('stack with')
  })
})

function mockUserLookup(user: {
  _id: string
  emailVerified: boolean
  lastVerificationEmailSent: Date | null
}) {
  verificationEmailTestState.findOne.mockReturnValue({
    select: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(user)
    })
  })
}
