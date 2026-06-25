import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceTestState = vi.hoisted(() => ({
  agentMailMailboxGrantFind: vi.fn(),
  agentMailSystemGrantFind: vi.fn(),
  authGetAgentSession: vi.fn(),
  authGetSession: vi.fn(),
  authVerifyApiKey: vi.fn(),
  getAgentMailControlStatus: vi.fn(),
  memberFindOne: vi.fn(),
  oauthVerifyAccessToken: vi.fn()
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
  getAgentMailControlStatus: serviceTestState.getAgentMailControlStatus,
  submitAgentMailSend: vi.fn()
}))

describe('Agent Mail service status boundary', () => {
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
    serviceTestState.getAgentMailControlStatus.mockReset()
    serviceTestState.memberFindOne.mockReset()
    serviceTestState.oauthVerifyAccessToken.mockReset()

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
  })

  it('returns an allowlisted status projection without internal control payload fields', async () => {
    expect.hasAssertions()
    serviceTestState.getAgentMailControlStatus.mockResolvedValue({
      ok: false,
      status: 'degraded',
      issues: ['queue backlog', 'bearer token top_secret_001 in control issue'],
      generated_at: '2026-06-23T12:00:00Z',
      selected_provider: 'cloudflare',
      source_files: {
        poller_config: '/private/poller.yaml',
        provider_relay_config: '/private/provider-relay.yaml'
      },
      control_state: {
        backend: 'kubernetes',
        namespace: 'private-namespace',
        configmap: 'private-configmap',
        key: 'private-key',
        resource_version: 'internal-resource-version',
        exists: true,
        configured: true,
        schema: 'agent-mail.control-state.v1',
        updated_at: '2026-06-23T11:59:00Z',
        domains_total: 2,
        domains_active: 1,
        domains_disabled: 1,
        ok: true,
        issues: ['namespace private-namespace leaked token control_secret_002']
      },
      modules: {
        poller: {
          ok: false,
          configured: true,
          endpoint: 'https://internal-poller.example.test',
          listen_address: '127.0.0.1:3001',
          public_url: 'https://public-notify.example.test',
          state_mongo_uri: 'mongodb://secret-state-uri',
          state_database: 'private-state-db',
          domains_source: 'private-domains-source',
          active_domains: 1,
          queue: {
            pending: 3,
            leased: 1,
            retry_wait: 2,
            blocked: 0,
            delivered: 9,
            completed: 10
          },
          issues: ['poller delayed', 'https://internal-poller.example.test?token=module_secret_003']
        }
      },
      dependencies: {
        cloudflare_api: {
          ok: true,
          configured: true,
          endpoint: 'https://api.cloudflare.com/client/v4',
          bucket: 'private-bucket',
          provider: 'cloudflare',
          issues: ['mongodb://dependency_secret_004@mongo.internal/state']
        }
      },
      provisioning: {
        status: 'failed',
        last_apply_at: '2026-06-23T11:00:00Z',
        last_error: 'raw provider error with token',
        domains_applied: 1,
        domains_pending: 0,
        domains_failed: 1,
        issues: ['provisioning failed', 'archive_key result_secret_005 failed']
      },
      tunnel: {
        external_host: 'tunnel-private.example.test',
        public_notify_url: 'https://tunnel-private.example.test/notify',
        listen_url: 'http://127.0.0.1:8080',
        notify_path: '/private-notify',
        configured: true,
        ok: true,
        issues: ['public_notify_url https://tunnel-private.example.test/notify']
      },
      domains: [
        {
          domain: 'example.test',
          status: 'needs_attention',
          issues: ['missing catch-all', 'raw_key domain_secret_006 failed for user@example.test'],
          inbound: {
            sweep_configured: true,
            dsn_configured: false,
            provider: 'cloudflare',
            cloudflare_zone: 'private-zone-name'
          },
          outbound: {
            configured: true,
            provider: 'ses',
            sender_domain: 'mail.example.test'
          },
          feedback_address: 'feedback@example.test',
          feedback: {
            ok: true,
            configured: true,
            address: 'feedback@example.test',
            wildduck_exists: true,
            wildduck_user_id: 'private-wildduck-user',
            issues: ['feedback@example.test leaked wildduck_user_id private-wildduck-user']
          },
          provider_identity: {
            cloudflare: {
              sending_domain: 'sender.example.test',
              bounce_domain: 'bounce.example.test'
            }
          },
          cloudflare: {
            ok: false,
            zone_name: 'example.test',
            zone_id: 'private-zone-id',
            catch_all_rule_id: 'private-rule-id',
            catch_all_enabled: false,
            catch_all_configured: false,
            regular_rules: [{ id: 'private-regular-rule-id', name: 'private rule', enabled: true }],
            last_provision_status: 'failed',
            last_provision_at: '2026-06-23T10:00:00Z',
            last_provision_error: 'raw cloudflare error with token',
            issues: ['catch-all disabled', 'zone_id private-zone-id rule_id private-rule-id']
          }
        }
      ]
    })

    const { getAgentMailStatusForWeb } = await import('./service')
    const status = await getAgentMailStatusForWeb(new Headers())
    const serialized = JSON.stringify(status)

    expect(status).toMatchObject({
      controlState: {
        configured: true,
        domainsActive: 1,
        domainsDisabled: 1,
        domainsTotal: 2,
        exists: true,
        issues: ['Runtime issue detected. Check server logs for details.'],
        ok: true,
        schema: 'agent-mail.control-state.v1'
      },
      dependencies: {
        cloudflare_api: {
          configured: true,
          issues: ['Runtime issue detected. Check server logs for details.'],
          ok: true
        }
      },
      domains: [
        {
          cloudflare: {
            catchAllConfigured: false,
            catchAllEnabled: false,
            issues: ['catch-all disabled', 'Runtime issue detected. Check server logs for details.'],
            lastProvisionStatus: 'failed',
            ok: false
          },
          domain: 'example.test',
          issues: ['missing catch-all', 'Runtime issue detected. Check server logs for details.'],
          status: 'needs_attention'
        }
      ],
      generatedAt: '2026-06-23T12:00:00Z',
      issues: ['queue backlog', 'Runtime issue detected. Check server logs for details.'],
      modules: {
        poller: {
          activeDomains: 1,
          configured: true,
          issues: ['poller delayed', 'Runtime issue detected. Check server logs for details.'],
          ok: false,
          queue: {
            pending: 3,
            retryWait: 2
          }
        }
      },
      ok: false,
      provisioning: {
        domainsApplied: 1,
        domainsFailed: 1,
        domainsPending: 0,
        issues: ['provisioning failed', 'Runtime issue detected. Check server logs for details.'],
        status: 'failed'
      },
      selectedProvider: 'cloudflare',
      status: 'degraded',
      tunnel: {
        configured: true,
        issues: ['Runtime issue detected. Check server logs for details.'],
        ok: true
      }
    })
    expect(serialized).not.toContain('source_files')
    expect(serialized).not.toContain('/private/poller.yaml')
    expect(serialized).not.toContain('private-namespace')
    expect(serialized).not.toContain('private-configmap')
    expect(serialized).not.toContain('internal-resource-version')
    expect(serialized).not.toContain('secret-state-uri')
    expect(serialized).not.toContain('private-state-db')
    expect(serialized).not.toContain('https://api.cloudflare.com/client/v4')
    expect(serialized).not.toContain('private-bucket')
    expect(serialized).not.toContain('raw provider error with token')
    expect(serialized).not.toContain('tunnel-private.example.test')
    expect(serialized).not.toContain('private-zone-id')
    expect(serialized).not.toContain('private-rule-id')
    expect(serialized).not.toContain('private-wildduck-user')
    expect(serialized).not.toContain('sender.example.test')
    expect(serialized).not.toContain('raw cloudflare error with token')
    expect(serialized).not.toContain('top_secret_001')
    expect(serialized).not.toContain('control_secret_002')
    expect(serialized).not.toContain('module_secret_003')
    expect(serialized).not.toContain('dependency_secret_004')
    expect(serialized).not.toContain('result_secret_005')
    expect(serialized).not.toContain('domain_secret_006')
  })

  it('rejects status access before calling the control service when status permission is missing', async () => {
    expect.hasAssertions()
    serviceTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ role: 'member' })
    })

    const { getAgentMailStatusForWeb } = await import('./service')

    await expect(getAgentMailStatusForWeb(new Headers())).rejects.toMatchObject({
      message: 'Agent mail status access is not authorized',
      status: 403
    })
    expect(serviceTestState.getAgentMailControlStatus).not.toHaveBeenCalled()
  })

  it('ignores unsupported grant constraints when resolving non-session organization access', async () => {
    expect.hasAssertions()
    serviceTestState.authVerifyApiKey.mockResolvedValue({
      key: {
        configId: 'default',
        id: 'api-key-1',
        referenceId: 'user-1'
      },
      valid: true
    })
    serviceTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            constraints: { mailboxLimit: 1 },
            expiresAt: null,
            mailboxAddress: 'blocked@example.test',
            organizationId: 'org-1',
            principalId: 'api-key-1',
            principalType: 'api_key',
            status: 'active'
          },
          {
            capability: 'readMailbox',
            constraints: null,
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-2',
            principalId: 'api-key-1',
            principalType: 'api_key',
            status: 'active'
          }
        ])
    })
    serviceTestState.getAgentMailControlStatus.mockResolvedValue({
      dependencies: {},
      domains: [],
      issues: [],
      modules: {},
      ok: true,
      status: 'ok'
    })

    const { getAgentMailStatusForWeb } = await import('./service')

    await expect(
      getAgentMailStatusForWeb(new Headers({ 'x-api-key': 'agentteam_secret' }))
    ).resolves.toMatchObject({
      ok: true,
      status: 'ok'
    })
    expect(serviceTestState.getAgentMailControlStatus).toHaveBeenCalledTimes(1)
  })
})
