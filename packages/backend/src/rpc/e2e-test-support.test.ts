import { beforeEach, describe, expect, it, vi } from 'vitest'

const e2eTestSupportTestState = vi.hoisted(() => ({
  debugFactory: Object.assign(vi.fn(), {
    disable: vi.fn(),
    enable: vi.fn(),
    enabled: vi.fn()
  }),
  debugLog: vi.fn(),
  findByIdExec: vi.fn(),
  findOneExec: vi.fn(),
  globals: vi.fn(),
  signUpEmail: vi.fn(),
  updateOneExec: vi.fn()
}))

vi.mock('debug', () => ({
  default: e2eTestSupportTestState.debugFactory
}))

vi.mock('../globals', () => ({
  globals: e2eTestSupportTestState.globals
}))

describe('e2e test support RPC', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')

    e2eTestSupportTestState.debugFactory.mockClear()
    e2eTestSupportTestState.debugFactory.mockImplementation(() => e2eTestSupportTestState.debugLog)
    e2eTestSupportTestState.debugLog.mockReset()
    e2eTestSupportTestState.findByIdExec.mockReset()
    e2eTestSupportTestState.findByIdExec.mockResolvedValue({
      _id: 'user-1',
      email: 'agent@test.test',
      name: 'Agent Test'
    })
    e2eTestSupportTestState.findOneExec.mockReset()
    e2eTestSupportTestState.findOneExec.mockResolvedValue({
      _id: 'user-1',
      email: 'agent@test.test',
      generatedFromSeed: 'e2e-test-support',
      name: 'Agent Test'
    })
    e2eTestSupportTestState.signUpEmail.mockReset()
    e2eTestSupportTestState.signUpEmail.mockResolvedValue({})
    e2eTestSupportTestState.updateOneExec.mockReset()
    e2eTestSupportTestState.updateOneExec.mockResolvedValue({})
    e2eTestSupportTestState.globals.mockReset()
    e2eTestSupportTestState.globals.mockResolvedValue(createMockGlobals())
  })

  it('uses the shared not-found public contract when test support is disabled', async () => {
    expect.hasAssertions()

    const response = await postTestPrincipal({
      authorization: 'Bearer raw-disabled-token'
    })
    const bodyText = await response.text()

    expect(response.status).toBe(404)
    expect(JSON.parse(bodyText)).toStrictEqual({
      code: 'NOT_FOUND',
      error: 'Not found.'
    })
    expect(bodyText).not.toContain('raw-disabled-token')
    expect(e2eTestSupportTestState.debugLog).toHaveBeenCalledWith(
      'e2e_test_support_handled_error %o',
      expect.objectContaining({
        operation: 'e2e_test_support_principal_create',
        publicError: {
          code: 'NOT_FOUND',
          status: 404
        },
        reason: 'support_disabled'
      })
    )
  })

  it('does not expose missing support-token configuration details when enabled', async () => {
    expect.hasAssertions()
    vi.stubEnv('E2E_TEST_SUPPORT_ENABLED', 'true')

    const response = await postTestPrincipal()
    const bodyText = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(bodyText)).toStrictEqual({
      code: 'INTERNAL_SERVER_ERROR',
      error: 'Internal server error.'
    })
    expect(bodyText).not.toContain('E2E test support token is not configured')
    expect(e2eTestSupportTestState.debugLog).toHaveBeenCalledWith(
      'e2e_test_support_handled_error %o',
      expect.objectContaining({
        operation: 'e2e_test_support_principal_create',
        publicError: {
          code: 'INTERNAL_SERVER_ERROR',
          status: 500
        },
        reason: 'support_token_missing'
      })
    )
  })

  it('uses the shared unauthorized public contract without logging the presented token', async () => {
    expect.hasAssertions()
    vi.stubEnv('E2E_TEST_SUPPORT_ENABLED', 'true')
    vi.stubEnv('E2E_TEST_SUPPORT_TOKEN', 'expected-e2e-token')

    const response = await postTestPrincipal({
      authorization: 'Bearer raw-secret-e2e-token'
    })
    const bodyText = await response.text()

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-e2e-test-support"')
    expect(JSON.parse(bodyText)).toStrictEqual({
      code: 'UNAUTHORIZED',
      error: 'Authentication is required.'
    })
    expect(bodyText).not.toContain('raw-secret-e2e-token')
    const serializedLogCalls = JSON.stringify(e2eTestSupportTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('raw-secret-e2e-token')
    expect(e2eTestSupportTestState.debugLog).toHaveBeenCalledWith(
      'e2e_test_support_handled_error %o',
      expect.objectContaining({
        operation: 'e2e_test_support_principal_create',
        publicError: {
          code: 'UNAUTHORIZED',
          status: 401
        },
        reason: 'invalid_support_token'
      })
    )
  })

  it('returns a Bearer challenge for missing E2E support credentials', async () => {
    expect.hasAssertions()
    vi.stubEnv('E2E_TEST_SUPPORT_ENABLED', 'true')
    vi.stubEnv('E2E_TEST_SUPPORT_TOKEN', 'expected-e2e-token')

    const response = await postTestPrincipal()
    const bodyText = await response.text()

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-e2e-test-support"')
    expect(JSON.parse(bodyText)).toStrictEqual({
      code: 'UNAUTHORIZED',
      error: 'Authentication is required.'
    })
    expect(bodyText).not.toContain('expected-e2e-token')
    const serializedLogCalls = JSON.stringify(e2eTestSupportTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('expected-e2e-token')
    expect(e2eTestSupportTestState.debugLog).toHaveBeenCalledWith(
      'e2e_test_support_handled_error %o',
      expect.objectContaining({
        operation: 'e2e_test_support_principal_create',
        publicError: {
          code: 'UNAUTHORIZED',
          status: 401
        },
        reason: 'invalid_support_token'
      })
    )
  })

  it('redacts provisioning failures from public responses and logs bounded diagnostics', async () => {
    expect.hasAssertions()
    vi.stubEnv('E2E_TEST_SUPPORT_ENABLED', 'true')
    vi.stubEnv('E2E_TEST_SUPPORT_TOKEN', 'expected-e2e-token')
    const error = new Error('sign-up failed with password=raw-e2e-password and token=raw-provisioning-token')
    error.name = 'sk-secret-provisioning-token'
    e2eTestSupportTestState.findOneExec.mockResolvedValue(null)
    e2eTestSupportTestState.signUpEmail.mockRejectedValue(error)

    const response = await postTestPrincipal({
      authorization: 'Bearer expected-e2e-token',
      'x-request-id': 'e2e-provision-1'
    })
    const bodyText = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(bodyText)).toStrictEqual({
      code: 'INTERNAL_SERVER_ERROR',
      error: 'Internal server error.',
      supportReference: 'request-id:e2e-provision-1'
    })
    expect(bodyText).not.toContain('raw-e2e-password')
    expect(bodyText).not.toContain('raw-provisioning-token')
    expect(bodyText).not.toContain('sign-up failed')
    expect(e2eTestSupportTestState.debugLog).toHaveBeenCalledWith(
      'e2e_test_support_handled_error %o',
      expect.objectContaining({
        error: {
          message: 'sign-up failed with password=secret_redacted and token=secret_redacted',
          name: 'object',
          type: 'object'
        },
        operation: 'e2e_test_support_principal_create',
        publicError: {
          code: 'INTERNAL_SERVER_ERROR',
          status: 500,
          supportReference: 'request-id:e2e-provision-1'
        },
        reason: 'principal_provision_failed',
        requestId: 'e2e-provision-1'
      })
    )
    const serializedLogCalls = JSON.stringify(e2eTestSupportTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('raw-e2e-password')
    expect(serializedLogCalls).not.toContain('raw-provisioning-token')
    expect(serializedLogCalls).not.toContain('sk-secret-provisioning-token')
    expect(serializedLogCalls).toContain('sign-up failed')
  })

  it('preserves successful test principal provisioning behavior', async () => {
    expect.hasAssertions()
    vi.stubEnv('E2E_TEST_SUPPORT_ENABLED', 'true')
    vi.stubEnv('E2E_TEST_SUPPORT_TOKEN', 'expected-e2e-token')

    const response = await postTestPrincipal({
      authorization: 'Bearer expected-e2e-token'
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      principal: {
        email: 'agent@test.test',
        emailVerified: true,
        name: 'Agent Test',
        userId: 'user-1'
      }
    })
    expect(e2eTestSupportTestState.updateOneExec).toHaveBeenCalledOnce()
  })
})

async function postTestPrincipal(headers: Record<string, string> = {}): Promise<Response> {
  const { default: e2eTestSupport } = await import('./e2e-test-support')

  return e2eTestSupport.handle(
    new Request('https://mail.example.com/e2e/test-principals?token=raw-query-token', {
      body: JSON.stringify({
        email: 'Agent@Test.Test',
        name: 'Agent Test',
        password: 'raw-e2e-password'
      }),
      headers: {
        'content-type': 'application/json',
        ...headers
      },
      method: 'POST'
    })
  )
}

function createMockGlobals(): unknown {
  return {
    auth: {
      api: {
        signUpEmail: e2eTestSupportTestState.signUpEmail
      }
    },
    db: {
      models: {
        user: {
          findById: vi.fn(() => ({
            exec: e2eTestSupportTestState.findByIdExec
          })),
          findOne: vi.fn(() => ({
            exec: e2eTestSupportTestState.findOneExec
          })),
          updateOne: vi.fn(() => ({
            exec: e2eTestSupportTestState.updateOneExec
          }))
        }
      }
    }
  }
}
