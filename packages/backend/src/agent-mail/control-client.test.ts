import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('Agent Mail control client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.stubEnv('AGENT_MAIL_CONTROL_API_BASE_URL', 'https://control.example.test')
    vi.stubEnv('AGENT_MAIL_CONTROL_API_TOKEN', 'fake-control-token')
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
  })

  it('throws a safe error without exposing control response details', async () => {
    expect.hasAssertions()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            message: 'runtime rejected token control_secret_123 for archive archive_internal_456'
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 502
        }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    const { AgentMailControlAPIError, getAgentMailControlStatus } = await import('./control-client')

    try {
      await getAgentMailControlStatus()
      throw new Error('Expected control status request to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(AgentMailControlAPIError)
      expect(error).toMatchObject({
        method: 'agentMail.status.get',
        status: 502
      })
      expect(error).toHaveProperty('message', 'Agent Mail control API request failed with HTTP 502')
      expect(JSON.stringify(error)).not.toContain('control_secret_123')
      expect(JSON.stringify(error)).not.toContain('archive_internal_456')
    }
  })

  it('rejects malformed successful control results without returning weakened credential types', async () => {
    expect.hasAssertions()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          result: {
            access_key_id: 'worker-access-key',
            archive_prefix: 'orgs/org/domains/example.test/mail/inbound',
            bucket: 'agent-mail-archive',
            endpoint: 'https://r2.example.test',
            expires_at: '2030-01-01T00:00:00.000Z',
            region: 'auto',
            secret_access_key: 'control_secret_credential_value'
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    const { AgentMailControlAPIError, createAgentMailWorkerCredentials } = await import('./control-client')

    try {
      await createAgentMailWorkerCredentials({
        archive_prefix: 'orgs/org/domains/example.test/mail/inbound',
        domain: 'example.test',
        organization_id: 'org-id',
        organization_public_id: 'org',
        worker_connection_id: 'connection',
        worker_domain_deployment_id: 'deployment'
      })
      throw new Error('Expected malformed control credentials to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(AgentMailControlAPIError)
      expect(error).toMatchObject({
        method: 'agentMail.worker.archiveCredentials.issue',
        status: 502
      })
      expect(JSON.stringify(error)).not.toContain('control_secret_credential_value')
    }
  })
})
