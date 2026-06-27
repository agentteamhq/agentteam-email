import { publicIdFromUUIDv7 } from '@main/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '../db/db'

type RuntimeProjectionTestDatabase = Database & {
  readonly testMocks: {
    readonly agentMailDomainUpdateMany: ReturnType<typeof vi.fn>
  }
}

const runtimeProjectionTestState = vi.hoisted(() => ({
  globals: vi.fn(),
  syncAgentMailRuntime: vi.fn()
}))

vi.mock('../globals', () => ({
  globals: runtimeProjectionTestState.globals
}))

vi.mock('./control-client', () => ({
  syncAgentMailRuntime: runtimeProjectionTestState.syncAgentMailRuntime
}))

describe('Agent Mail runtime projection', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN', 'control-to-web-token')
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    runtimeProjectionTestState.globals.mockReset()
    runtimeProjectionTestState.syncAgentMailRuntime.mockReset()
    runtimeProjectionTestState.syncAgentMailRuntime.mockResolvedValue({
      changed: true,
      domains: []
    })
  })

  it('builds the authoritative mail-control snapshot from active Mongo records', async () => {
    expect.hasAssertions()
    const domainId = '01960000-0000-7000-8000-000000000010'
    const connectionId = '01960000-0000-7000-8000-000000000011'
    const db = runtimeProjectionDb({
      connections: [cloudflareConnection({ _id: connectionId })],
      deployments: [workerDeployment({ agentMailDomainId: domainId })],
      domains: [
        agentMailDomain({ _id: domainId, cloudflareConnectionId: connectionId }),
        agentMailDomain({
          _id: '01960000-0000-7000-8000-000000000020',
          cloudflareConnectionId: '01960000-0000-7000-8000-000000000021',
          domain: 'disconnected.example.test',
          status: 'disconnected'
        })
      ]
    })
    const { buildAgentMailRuntimeProjection } = await import('./runtime-projection')

    await expect(buildAgentMailRuntimeProjection(db)).resolves.toStrictEqual([
      {
        archive_prefix: 'orgs/org_public_test/domains/example.test/mail/inbound',
        cloudflare_zone_name: 'example.test',
        domain: 'example.test',
        enabled: true,
        mail_from_domain: 'example.test',
        organization_id: '01960000-0000-7000-8000-000000000001',
        organization_public_id: 'org_public_test',
        worker_connection_id: 'conn_public_test',
        worker_domain_deployment_id: publicIdFromUUIDv7(domainId)
      }
    ])
  })

  it('sends an empty authoritative snapshot when there are no active runtime domains', async () => {
    expect.hasAssertions()
    const db = runtimeProjectionDb({ connections: [], deployments: [], domains: [] })
    const { syncAgentMailRuntimeProjection } = await import('./runtime-projection')

    await expect(syncAgentMailRuntimeProjection(db, { reason: 'startup' })).resolves.toMatchObject({
      domains: 0,
      reason: 'startup'
    })
    expect(runtimeProjectionTestState.syncAgentMailRuntime).toHaveBeenCalledWith([])
    expect(db.testMocks.agentMailDomainUpdateMany).not.toHaveBeenCalled()
  })

  it('syncs the full snapshot and records successful sync time on projected domains', async () => {
    expect.hasAssertions()
    const domainId = '01960000-0000-7000-8000-000000000010'
    const connectionId = '01960000-0000-7000-8000-000000000011'
    const db = runtimeProjectionDb({
      connections: [cloudflareConnection({ _id: connectionId })],
      deployments: [workerDeployment({ agentMailDomainId: domainId })],
      domains: [agentMailDomain({ _id: domainId, cloudflareConnectionId: connectionId })]
    })
    const { syncAgentMailRuntimeProjection } = await import('./runtime-projection')

    await expect(syncAgentMailRuntimeProjection(db, { reason: 'scheduled-repair' })).resolves.toMatchObject({
      changed: true,
      domains: 1,
      reason: 'scheduled-repair'
    })
    expect(runtimeProjectionTestState.syncAgentMailRuntime).toHaveBeenCalledWith([
      expect.objectContaining({
        domain: 'example.test',
        enabled: true,
        worker_connection_id: 'conn_public_test'
      })
    ])
    expect(db.testMocks.agentMailDomainUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: [domainId] } },
      {
        $set: expect.objectContaining({
          lastErrorCode: null,
          lastErrorMessage: null,
          lastRuntimeSyncedAt: expect.any(Date)
        })
      }
    )
  })

  it('rejects internal runtime snapshot requests without the scoped control-to-web token', async () => {
    expect.hasAssertions()
    const { handleAgentMailRuntimeSnapshotRequest } = await import('./runtime-projection')

    const response = await handleAgentMailRuntimeSnapshotRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/runtime/snapshot')
    )

    expect(response.status).toBe(401)
    expect(runtimeProjectionTestState.globals).not.toHaveBeenCalled()
  })

  it('returns the runtime snapshot to mail-control with the scoped control-to-web token', async () => {
    expect.hasAssertions()
    const domainId = '01960000-0000-7000-8000-000000000010'
    const connectionId = '01960000-0000-7000-8000-000000000011'
    runtimeProjectionTestState.globals.mockResolvedValue({
      db: runtimeProjectionDb({
        connections: [cloudflareConnection({ _id: connectionId })],
        deployments: [workerDeployment({ agentMailDomainId: domainId })],
        domains: [agentMailDomain({ _id: domainId, cloudflareConnectionId: connectionId })]
      })
    })
    const { handleAgentMailRuntimeSnapshotRequest } = await import('./runtime-projection')

    const response = await handleAgentMailRuntimeSnapshotRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/runtime/snapshot', {
        headers: {
          'X-Agent-Mail-Control-Web-Token': 'control-to-web-token'
        }
      })
    )

    await expect(response.json()).resolves.toMatchObject({
      domains: [
        {
          domain: 'example.test',
          enabled: true,
          worker_connection_id: 'conn_public_test'
        }
      ]
    })
  })
})

function runtimeProjectionDb({
  connections,
  deployments,
  domains
}: {
  connections: Array<Record<string, unknown>>
  deployments: Array<Record<string, unknown>>
  domains: Array<Record<string, unknown>>
}): RuntimeProjectionTestDatabase {
  const agentMailDomainUpdateMany = vi.fn(() => execQuery({ modifiedCount: domains.length }))
  return {
    models: {
      agentMailDomain: {
        find: vi.fn(() => sortedQuery(domains.filter((domain) => domain.status !== 'disconnected'))),
        updateMany: agentMailDomainUpdateMany
      },
      agentMailWorkerDeployment: {
        find: vi.fn(() =>
          execQuery(
            deployments.filter(
              (deployment) => deployment.status === 'active' || deployment.status === 'degraded'
            )
          )
        )
      },
      cloudflareConnection: {
        find: vi.fn(() =>
          execQuery(
            connections.filter(
              (connection) => connection.status === 'active' || connection.status === 'degraded'
            )
          )
        )
      }
    },
    testMocks: {
      agentMailDomainUpdateMany
    }
  } as unknown as RuntimeProjectionTestDatabase
}

function agentMailDomain(overrides: Record<string, unknown> = {}) {
  return {
    _id: '01960000-0000-7000-8000-000000000010',
    archivePrefix: 'orgs/org_public_test/domains/example.test/mail/inbound',
    cloudflareConnectionId: '01960000-0000-7000-8000-000000000011',
    cloudflareZoneName: 'example.test',
    domain: 'example.test',
    organizationId: '01960000-0000-7000-8000-000000000001',
    organizationPublicId: 'org_public_test',
    status: 'active',
    ...overrides
  }
}

function workerDeployment(overrides: Record<string, unknown> = {}) {
  return {
    _id: '01960000-0000-7000-8000-000000000012',
    agentMailDomainId: '01960000-0000-7000-8000-000000000010',
    archivePrefix: 'orgs/org_public_test/domains/example.test/mail/inbound',
    domain: 'example.test',
    organizationId: '01960000-0000-7000-8000-000000000001',
    organizationPublicId: 'org_public_test',
    status: 'active',
    workerConnectionId: 'conn_public_test',
    ...overrides
  }
}

function cloudflareConnection(overrides: Record<string, unknown> = {}) {
  return {
    _id: '01960000-0000-7000-8000-000000000011',
    archivePrefix: 'orgs/org_public_test/domains/example.test/mail/inbound',
    cloudflareZoneName: 'example.test',
    domain: 'example.test',
    organizationId: '01960000-0000-7000-8000-000000000001',
    status: 'active',
    ...overrides
  }
}

function sortedQuery(value: unknown) {
  return {
    sort: vi.fn(() => execQuery(value))
  }
}

function execQuery(value: unknown) {
  return {
    exec: vi.fn(() => Promise.resolve(value))
  }
}
