import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentMailTrialError,
  isAgentMailTrialError,
  startAgentMailTrial
} from '../agent-access/trial-service'

type IsAgentMailTrialErrorMock = (error: unknown) => error is AgentMailTrialError
type StartAgentMailTrialMock = (input: unknown) => Promise<unknown>

const apiIndexTestState = vi.hoisted(() => ({
  debugFactory: Object.assign(vi.fn(), {
    disable: vi.fn(),
    enable: vi.fn(),
    enabled: vi.fn()
  }),
  debugLog: vi.fn(),
  handleBetterAuthProtocolRequest: vi.fn(),
  isAgentMailTrialError: vi.fn<IsAgentMailTrialErrorMock>(),
  startAgentMailTrial: vi.fn<StartAgentMailTrialMock>()
}))

vi.mock('debug', () => ({
  default: apiIndexTestState.debugFactory
}))

vi.mock('../auth/protocol-handler', () => ({
  handleBetterAuthProtocolRequest: apiIndexTestState.handleBetterAuthProtocolRequest
}))

vi.mock('../rpc/mail', async () => {
  const { Elysia } = await import('elysia')

  return {
    createMailHttpRoutes: () => new Elysia({ name: 'mock-api-mail-routes' })
  }
})

vi.mock(import('../agent-access/trial-service'), () => ({
  isAgentMailTrialError: apiIndexTestState.isAgentMailTrialError as unknown as typeof isAgentMailTrialError,
  startAgentMailTrial: apiIndexTestState.startAgentMailTrial as unknown as typeof startAgentMailTrial
}))

describe('backend API routes', () => {
  beforeEach(() => {
    vi.resetModules()
    apiIndexTestState.debugFactory.mockClear()
    apiIndexTestState.debugFactory.mockImplementation(() => apiIndexTestState.debugLog)
    apiIndexTestState.debugLog.mockReset()
    apiIndexTestState.handleBetterAuthProtocolRequest.mockReset()
    apiIndexTestState.isAgentMailTrialError.mockReset()
    apiIndexTestState.isAgentMailTrialError.mockImplementation(
      (error: unknown): error is AgentMailTrialError =>
        error instanceof Error && error.name === 'AgentMailTrialError'
    )
    apiIndexTestState.startAgentMailTrial.mockReset()
  })

  it('redacts trial service failures from public API responses and logs safe diagnostics', async () => {
    expect.hasAssertions()

    const error = new Error(
      'Trial provisioning failed for admission_token=raw-admission-token and database password=_secret_db'
    ) as Error & { status: 503 }
    error.name = 'AgentMailTrialError'
    error.status = 503
    apiIndexTestState.startAgentMailTrial.mockRejectedValue(error)

    const { backendApiApp } = await import('./index')
    const response = await backendApiApp.handle(
      new Request('https://mail.example.com/api/agent-access/trials?token=raw-query-token', {
        body: JSON.stringify({
          agent_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'agent-key' },
          admission_token: 'raw-admission-token',
          host_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'host-key' }
        }),
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'api-request-1'
        },
        method: 'POST'
      })
    )
    const responseBody = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(responseBody)).toStrictEqual({
      code: 'SERVICE_UNAVAILABLE',
      error: 'Service unavailable.',
      supportReference: 'request-id:api-request-1'
    })
    expect(responseBody).not.toContain('raw-admission-token')
    expect(responseBody).not.toContain('_secret_db')
    expect(responseBody).not.toContain('raw-query-token')
    expect(apiIndexTestState.debugLog).toHaveBeenCalledWith('api_handled_error %o', {
      error: {
        code: '503',
        message:
          'Trial provisioning failed for admission_token=secret_redacted and database password=secret_redacted',
        name: 'AgentMailTrialError',
        status: '503',
        statusCode: 503,
        type: 'object'
      },
      errorCode: '503',
      method: 'POST',
      operation: 'api_agent_access_trial_start',
      path: '/api/agent-access/trials',
      publicError: {
        code: 'SERVICE_UNAVAILABLE',
        status: 503,
        supportReference: 'request-id:api-request-1'
      },
      requestId: 'api-request-1'
    })
    const serializedLogCalls = JSON.stringify(apiIndexTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('raw-admission-token')
    expect(serializedLogCalls).not.toContain('_secret_db')
    expect(serializedLogCalls).not.toContain('raw-query-token')
    expect(serializedLogCalls).toContain('Trial provisioning failed')
  })

  it('preserves API Bearer challenges for trial authentication failures', async () => {
    expect.hasAssertions()

    const error = new Error('Authentication failed for Authorization: Bearer raw-api-token') as Error & {
      status: 401
    }
    error.name = 'AgentMailTrialError'
    error.status = 401
    apiIndexTestState.startAgentMailTrial.mockRejectedValue(error)

    const { backendApiApp } = await import('./index')
    const response = await backendApiApp.handle(
      new Request('https://mail.example.com/api/agent-access/trials', {
        body: JSON.stringify({
          agent_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'agent-key' },
          host_public_key: { crv: 'Ed25519', kty: 'OKP', x: 'host-key' }
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
    )
    const responseBody = await response.text()

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-api"')
    expect(JSON.parse(responseBody)).toStrictEqual({
      code: 'UNAUTHORIZED',
      error: 'Authentication is required.'
    })
    expect(responseBody).not.toContain('raw-api-token')
  })
})
