import { beforeEach, describe, expect, it, vi } from 'vitest'

const agentMetadataTestState = vi.hoisted(() => ({
  getAgentConfiguration: vi.fn(),
  globals: vi.fn()
}))

vi.mock('../globals', () => ({
  globals: agentMetadataTestState.globals
}))

describe('Agent Auth public metadata', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    agentMetadataTestState.getAgentConfiguration.mockReset()
    agentMetadataTestState.globals.mockReset()
  })

  it('serves Agent Auth discovery metadata from Better Auth with public API auth bridge URLs', async () => {
    expect.hasAssertions()

    agentMetadataTestState.getAgentConfiguration.mockResolvedValue({
      authorization_endpoint: 'https://mail.example.com/api/agent/authorize',
      default_location: 'https://mail.example.com/api/capability/execute',
      endpoints: {
        register: 'https://mail.example.com/api/agent/register',
        revoke: 'https://mail.example.com/api/agent/revoke',
        status: 'https://mail.example.com/api/agent/status'
      },
      issuer: 'https://better-auth-internal.test',
      jwks_uri: 'https://mail.example.com/api/agent/jwks',
      token_endpoint: 'https://mail.example.com/api/agent/token'
    })
    agentMetadataTestState.globals.mockResolvedValue({
      auth: {
        api: {
          getAgentConfiguration: agentMetadataTestState.getAgentConfiguration
        }
      }
    })

    const { handleAgentAuthConfigurationRequest } = await import('./agent-auth-metadata')
    const response = await handleAgentAuthConfigurationRequest(
      new Request('https://mail.example.com/.well-known/agent-configuration')
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('public, max-age=300')
    expect(await response?.json()).toStrictEqual({
      authorization_endpoint: 'https://mail.example.com/api/auth/agent/authorize',
      default_location: 'https://mail.example.com/api/auth/capability/execute',
      endpoints: {
        register: 'https://mail.example.com/api/auth/agent/register',
        revoke: 'https://mail.example.com/api/auth/agent/revoke',
        status: 'https://mail.example.com/api/auth/agent/status'
      },
      issuer: 'https://mail.example.com',
      jwks_uri: 'https://mail.example.com/api/auth/agent/jwks',
      token_endpoint: 'https://mail.example.com/api/auth/agent/token'
    })
    expect(agentMetadataTestState.getAgentConfiguration).toHaveBeenCalledOnce()
  }, 15_000)

  it('serves HEAD requests without a response body', async () => {
    expect.hasAssertions()

    const { handleAgentAuthConfigurationRequest } = await import('./agent-auth-metadata')
    const response = await handleAgentAuthConfigurationRequest(
      new Request('https://mail.example.com/.well-known/agent-configuration', { method: 'HEAD' })
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('application/json')
    expect(await response?.text()).toBe('')
    expect(agentMetadataTestState.getAgentConfiguration).not.toHaveBeenCalled()
  })

  it('rejects unsupported methods with an allow header', async () => {
    expect.hasAssertions()

    const { handleAgentAuthConfigurationRequest } = await import('./agent-auth-metadata')
    const response = await handleAgentAuthConfigurationRequest(
      new Request('https://mail.example.com/.well-known/agent-configuration', { method: 'POST' })
    )

    expect(response?.status).toBe(405)
    expect(response?.headers.get('allow')).toBe('GET, HEAD')
  })

  it('ignores unrelated paths', async () => {
    expect.hasAssertions()

    const { handleAgentAuthConfigurationRequest } = await import('./agent-auth-metadata')
    const response = await handleAgentAuthConfigurationRequest(
      new Request('https://mail.example.com/.well-known/openid-configuration')
    )

    expect(response).toBeNull()
  })
})
