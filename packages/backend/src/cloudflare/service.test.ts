import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '../db/db'

const cloudflareServiceTestState = vi.hoisted(() => ({
  applyCloudflareProvisioning: vi.fn(),
  createAgentMailWorkerCredentials: vi.fn(),
  decryptSecretValue: vi.fn((value: string) => value.replace(/^encrypted:/u, '')),
  encryptSecretValue: vi.fn((value: string) => `encrypted:${value}`),
  globals: vi.fn(),
  listCloudflareAccounts: vi.fn(),
  listCloudflareZones: vi.fn(),
  requireAgentMailOrganizationContext: vi.fn(),
  sanitizeCloudflareError: vi.fn((error: unknown) => ({
    code:
      error && typeof error === 'object' && 'status' in error
        ? `CLOUDFLARE_${error.status}`
        : 'CLOUDFLARE_REQUEST_FAILED',
    message: 'Cloudflare request failed. Check the selected account, zone, and permissions.'
  })),
  syncAgentMailRuntime: vi.fn()
}))

vi.mock('./client', () => ({
  applyCloudflareProvisioning: cloudflareServiceTestState.applyCloudflareProvisioning,
  listCloudflareAccounts: cloudflareServiceTestState.listCloudflareAccounts,
  listCloudflareZones: cloudflareServiceTestState.listCloudflareZones,
  sanitizeCloudflareError: cloudflareServiceTestState.sanitizeCloudflareError
}))

vi.mock('../globals', () => ({
  globals: cloudflareServiceTestState.globals
}))

vi.mock('../agent-mail/service', () => ({
  isAgentMailAccessError: (error: unknown) => error instanceof Error && error.name === 'AgentMailAccessError',
  requireAgentMailOrganizationContext: cloudflareServiceTestState.requireAgentMailOrganizationContext
}))

vi.mock('../agent-mail/control-client', () => ({
  createAgentMailWorkerCredentials: cloudflareServiceTestState.createAgentMailWorkerCredentials,
  syncAgentMailRuntime: cloudflareServiceTestState.syncAgentMailRuntime
}))

vi.mock('../lib/secret-box', () => ({
  decryptSecretValue: cloudflareServiceTestState.decryptSecretValue,
  encryptSecretValue: cloudflareServiceTestState.encryptSecretValue
}))

describe('Cloudflare public views', () => {
  it('omits internal ids, storage coordinates, and credential lifecycle fields from web DTOs', async () => {
    expect.hasAssertions()
    const { cloudflareConnectionPublicView, cloudflareOAuthGrantPublicView } = await import('./public-views')

    const connectionView = cloudflareConnectionPublicView({
      _id: '01960000-0000-7000-8000-000000000001',
      agentMailDomainId: '01960000-0000-7000-8000-000000000002',
      agentMailWorkerDeploymentId: '01960000-0000-7000-8000-000000000003',
      archivePrefix: 'orgs/org_public_test/domains/example.test/mail/inbound',
      cloudflareAccountId: 'cf-account-1',
      cloudflareAccountName: 'Team Cloudflare',
      cloudflareZoneId: 'cf-zone-1',
      cloudflareZoneName: 'example.test',
      createdAt: new Date('2026-06-23T10:00:00.000Z'),
      domain: 'example.test',
      encryptedWorkerHmacSecret: 'encrypted-worker-hmac-secret',
      grantId: '01960000-0000-7000-8000-000000000004',
      hmacSecretReference: 'cloudflare-worker:secret',
      lastErrorCode: null,
      lastErrorMessage: null,
      lastProvisionedAt: new Date('2026-06-23T11:00:00.000Z'),
      organizationId: '01960000-0000-7000-8000-000000000005',
      organizationPublicId: 'org_public_test',
      provisioningStatus: 'succeeded',
      r2BucketName: 'agent-mail-archive',
      r2Endpoint: 'https://example.r2.cloudflarestorage.com',
      r2Region: 'auto',
      status: 'active',
      updatedAt: new Date('2026-06-23T11:00:00.000Z'),
      userId: '01960000-0000-7000-8000-000000000006',
      workerCredentialExpiresAt: new Date('2026-06-24T11:00:00.000Z'),
      workerCredentialIssuedAt: new Date('2026-06-23T11:00:00.000Z'),
      workerCredentialRefreshAfter: new Date('2026-06-24T10:00:00.000Z'),
      workerScriptName: 'agentteam-email-example-test'
    } as never)
    const grantView = cloudflareOAuthGrantPublicView({
      _id: '01960000-0000-7000-8000-000000000007',
      betterAuthAccountId: '01960000-0000-7000-8000-000000000008',
      cloudflareEmail: 'admin@example.test',
      cloudflareUserId: 'cloudflare-user-1',
      createdAt: new Date('2026-06-23T10:00:00.000Z'),
      grantedScopes: ['zone:read'],
      lastErrorCode: null,
      lastErrorMessage: null,
      lastRefreshAt: null,
      lastTokenCheckAt: new Date('2026-06-23T11:00:00.000Z'),
      organizationId: '01960000-0000-7000-8000-000000000005',
      requiredScopes: ['zone:read'],
      status: 'active',
      updatedAt: new Date('2026-06-23T11:00:00.000Z'),
      userId: '01960000-0000-7000-8000-000000000006'
    } as never)
    const serialized = JSON.stringify({ connectionView, grantView })

    expect(connectionView).toMatchObject({
      cloudflareAccountId: 'cf-account-1',
      cloudflareZoneId: 'cf-zone-1',
      domain: 'example.test',
      publicId: expect.any(String),
      status: 'active',
      workerScriptName: 'agentteam-email-example-test'
    })
    expect(grantView).toMatchObject({
      cloudflareEmail: 'admin@example.test',
      cloudflareUserId: 'cloudflare-user-1',
      publicId: expect.any(String),
      status: 'active'
    })
    expect(connectionView).not.toHaveProperty('id')
    expect(connectionView).not.toHaveProperty('organizationId')
    expect(connectionView).not.toHaveProperty('organizationPublicId')
    expect(connectionView).not.toHaveProperty('grantId')
    expect(connectionView).not.toHaveProperty('agentMailDomainId')
    expect(connectionView).not.toHaveProperty('archivePrefix')
    expect(connectionView).not.toHaveProperty('r2Endpoint')
    expect(connectionView).not.toHaveProperty('workerCredentialExpiresAt')
    expect(grantView).not.toHaveProperty('id')
    expect(grantView).not.toHaveProperty('userId')
    expect(grantView).not.toHaveProperty('organizationId')
    expect(grantView).not.toHaveProperty('betterAuthAccountId')
    expect(serialized).not.toContain('encrypted-worker-hmac-secret')
    expect(serialized).not.toContain('cloudflare-worker:secret')
    expect(serialized).not.toContain('agent-mail-archive')
    expect(serialized).not.toContain('https://example.r2.cloudflarestorage.com')
  })

  it('normalizes stored provider and control errors before returning web DTOs', async () => {
    expect.hasAssertions()
    const { cloudflareConnectionPublicView, cloudflareOAuthGrantPublicView } = await import('./public-views')

    const connectionView = cloudflareConnectionPublicView({
      _id: '01960000-0000-7000-8000-000000000001',
      cloudflareAccountId: 'cf-account-1',
      cloudflareZoneId: 'cf-zone-1',
      domain: 'example.test',
      lastErrorCode: 'CLOUDFLARE_403',
      lastErrorMessage: 'Cloudflare said token cf_secret_123 cannot update route',
      provisioningStatus: 'failed',
      status: 'degraded'
    } as never)
    const grantView = cloudflareOAuthGrantPublicView({
      _id: '01960000-0000-7000-8000-000000000007',
      cloudflareUserId: 'cloudflare-user-1',
      grantedScopes: ['zone:read'],
      lastErrorCode: 'AGENT_MAIL_CONTROL_SYNC_FAILED',
      lastErrorMessage: 'control payload included token control_secret_456',
      requiredScopes: ['zone:read'],
      status: 'degraded'
    } as never)
    const serialized = JSON.stringify({ connectionView, grantView })

    expect(connectionView.lastErrorMessage).toBe(
      'Cloudflare request failed. Check the selected account, zone, and permissions.'
    )
    expect(grantView.lastErrorMessage).toBe(
      'Agent Mail runtime sync failed. Try again or check runtime health.'
    )
    expect(serialized).not.toContain('cf_secret_123')
    expect(serialized).not.toContain('control_secret_456')
  })

  it('omits internal ids and callback data from OAuth intent public views', async () => {
    expect.hasAssertions()
    const { cloudflareOAuthConnectionIntentPublicView } = await import('./public-views')

    const intentView = cloudflareOAuthConnectionIntentPublicView({
      _id: '01960000-0000-7000-8000-000000000001',
      callbackPath: '/dashboard/?internal_callback=1',
      createdAt: new Date('2026-06-23T10:00:00.000Z'),
      errorCode: 'CLOUDFLARE_403',
      errorMessage: 'OAuth callback contained provider token cf_oauth_secret_123',
      expiresAt: new Date('2026-06-23T10:15:00.000Z'),
      organizationId: '01960000-0000-7000-8000-000000000002',
      status: 'failed',
      updatedAt: new Date('2026-06-23T10:01:00.000Z'),
      userId: '01960000-0000-7000-8000-000000000003'
    } as never)
    const serialized = JSON.stringify(intentView)

    expect(intentView).toStrictEqual({
      createdAt: new Date('2026-06-23T10:00:00.000Z'),
      errorCode: 'CLOUDFLARE_403',
      errorMessage: 'Cloudflare request failed. Check the selected account, zone, and permissions.',
      expiresAt: new Date('2026-06-23T10:15:00.000Z'),
      publicId: expect.any(String),
      status: 'failed',
      updatedAt: new Date('2026-06-23T10:01:00.000Z')
    })
    expect(intentView).not.toHaveProperty('id')
    expect(intentView).not.toHaveProperty('userId')
    expect(intentView).not.toHaveProperty('organizationId')
    expect(intentView).not.toHaveProperty('callbackPath')
    expect(serialized).not.toContain('01960000-0000-7000-8000-000000000001')
    expect(serialized).not.toContain('01960000-0000-7000-8000-000000000002')
    expect(serialized).not.toContain('01960000-0000-7000-8000-000000000003')
    expect(serialized).not.toContain('internal_callback')
    expect(serialized).not.toContain('cf_oauth_secret_123')
  })
})

describe('Cloudflare domain authorization', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    cloudflareServiceTestState.applyCloudflareProvisioning.mockReset()
    cloudflareServiceTestState.createAgentMailWorkerCredentials.mockReset()
    cloudflareServiceTestState.globals.mockReset()
    cloudflareServiceTestState.listCloudflareAccounts.mockReset()
    cloudflareServiceTestState.listCloudflareZones.mockReset()
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockReset()
    cloudflareServiceTestState.syncAgentMailRuntime.mockReset()
  })

  it('allows a non-admin member with domain CASL authority to read Cloudflare status', async () => {
    expect.hasAssertions()
    const { globals, mocks } = cloudflareAuthorizationGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: { cannot: vi.fn(() => false) },
      organizationId: TEST_ORGANIZATION_ID
    })
    mocks.connectionFind.mockReturnValue(
      sortedQuery([
        {
          _id: '01960000-0000-7000-8000-000000000001',
          cloudflareAccountId: 'cf-account-1',
          cloudflareAccountName: 'Team Cloudflare',
          cloudflareZoneId: 'cf-zone-1',
          cloudflareZoneName: 'example.test',
          createdAt: new Date('2026-06-23T10:00:00.000Z'),
          domain: 'example.test',
          lastErrorCode: null,
          lastErrorMessage: null,
          lastProvisionedAt: null,
          provisioningStatus: 'not_started',
          status: 'connected',
          updatedAt: new Date('2026-06-23T10:00:00.000Z'),
          workerScriptName: null
        }
      ])
    )
    mocks.grantFind.mockReturnValue(
      sortedQuery([
        {
          _id: '01960000-0000-7000-8000-000000000002',
          cloudflareEmail: 'admin@example.test',
          cloudflareUserId: 'cloudflare-user-1',
          createdAt: new Date('2026-06-23T10:00:00.000Z'),
          grantedScopes: ['zone:read'],
          lastErrorCode: null,
          lastErrorMessage: null,
          lastRefreshAt: null,
          lastTokenCheckAt: null,
          requiredScopes: ['zone:read'],
          status: 'active',
          updatedAt: new Date('2026-06-23T10:00:00.000Z')
        }
      ])
    )
    const { getCloudflareStatus } = await import('./service')

    await expect(getCloudflareStatus(new Headers())).resolves.toMatchObject({
      connections: [
        {
          cloudflareAccountId: 'cf-account-1',
          domain: 'example.test',
          status: 'connected'
        }
      ],
      grants: [
        {
          cloudflareUserId: 'cloudflare-user-1',
          status: 'active'
        }
      ]
    })
    expect(mocks.memberFindOne).toHaveBeenCalledWith({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID
    })
    expect(mocks.connectionFind).toHaveBeenCalledWith({ organizationId: TEST_ORGANIZATION_ID })
  })

  it('rejects domain connection before provider or control calls when CASL authority is missing', async () => {
    expect.hasAssertions()
    const { globals, mocks } = cloudflareAuthorizationGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: { cannot: vi.fn(() => true) },
      organizationId: TEST_ORGANIZATION_ID
    })
    const { connectCloudflareDomain } = await import('./service')

    await expect(
      connectCloudflareDomain({
        headers: new Headers(),
        input: {
          cloudflareAccountId: 'cf-account-1',
          cloudflareZoneId: 'cf-zone-1',
          domain: 'example.test'
        }
      })
    ).rejects.toMatchObject({
      message: 'Cloudflare domain management is not authorized',
      status: 403
    })
    expect(mocks.authGetAccessToken).not.toHaveBeenCalled()
    expect(mocks.grantFindOne).not.toHaveBeenCalled()
    expect(mocks.connectionFindOneAndUpdate).not.toHaveBeenCalled()
    expect(cloudflareServiceTestState.createAgentMailWorkerCredentials).not.toHaveBeenCalled()
    expect(cloudflareServiceTestState.applyCloudflareProvisioning).not.toHaveBeenCalled()
    expect(cloudflareServiceTestState.syncAgentMailRuntime).not.toHaveBeenCalled()
  })
})

describe('Cloudflare worker credential refresh service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    cloudflareServiceTestState.applyCloudflareProvisioning.mockReset()
    cloudflareServiceTestState.createAgentMailWorkerCredentials.mockReset()
    cloudflareServiceTestState.decryptSecretValue.mockClear()
    cloudflareServiceTestState.encryptSecretValue.mockClear()
    cloudflareServiceTestState.globals.mockReset()
    cloudflareServiceTestState.listCloudflareAccounts.mockReset()
    cloudflareServiceTestState.listCloudflareZones.mockReset()
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockReset()
    cloudflareServiceTestState.sanitizeCloudflareError.mockClear()
    cloudflareServiceTestState.syncAgentMailRuntime.mockReset()
  })

  it('refreshes due Worker credentials with the existing HMAC secret and records a succeeded job', async () => {
    expect.hasAssertions()
    const now = new Date('2026-06-23T10:00:00.000Z')
    const deployment = workerDeployment()
    const connection = cloudflareConnection()
    const grant = cloudflareGrant()
    const account = cloudflareAccount()
    const workerCredentials = issuedWorkerCredentials()
    const refreshRecord = { _id: 'refresh-1' }
    const { db, mocks } = refreshDb({
      account,
      connection,
      deployments: [deployment],
      grant,
      refreshRecord
    })
    cloudflareServiceTestState.createAgentMailWorkerCredentials.mockResolvedValue(workerCredentials)
    cloudflareServiceTestState.applyCloudflareProvisioning.mockResolvedValue({
      hmacSecret: 'existing-worker-hmac-secret',
      hmacSecretReference: 'cloudflare-worker:script:AGENTTEAM_WORKER_HMAC_SECRET',
      r2BucketName: workerCredentials.bucket,
      r2Endpoint: workerCredentials.endpoint,
      r2Region: workerCredentials.region,
      workerScriptName: 'agentteam-email-example-test'
    })
    const { refreshDueAgentMailWorkerCredentials } = await import('./service')

    await expect(refreshDueAgentMailWorkerCredentials(db, now)).resolves.toStrictEqual({
      failed: 0,
      refreshed: 1
    })

    expect(mocks.refreshCreate).toHaveBeenCalledWith({
      userId: deployment.userId,
      organizationId: deployment.organizationId,
      agentMailDomainId: deployment.agentMailDomainId,
      agentMailWorkerDeploymentId: deployment._id,
      cloudflareConnectionId: deployment.cloudflareConnectionId,
      status: 'pending',
      startedAt: now
    })
    expect(cloudflareServiceTestState.applyCloudflareProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: account.accessToken,
        hmacSecret: 'existing-worker-hmac-secret',
        workerCredentials: expect.objectContaining({
          accessKeyId: workerCredentials.access_key_id,
          secretAccessKey: workerCredentials.secret_access_key,
          sessionToken: workerCredentials.session_token
        })
      })
    )
    expect(mocks.deploymentUpdateOne).toHaveBeenCalledWith(
      { _id: deployment._id },
      {
        $set: expect.objectContaining({
          credentialExpiresAt: new Date(workerCredentials.expires_at),
          lastErrorCode: null,
          lastErrorMessage: null,
          provisioningStatus: 'succeeded',
          status: 'active'
        })
      }
    )
    expect(mocks.connectionUpdateOne).toHaveBeenCalledWith(
      { _id: connection._id },
      {
        $set: expect.objectContaining({
          provisioningStatus: 'succeeded',
          status: 'active',
          workerCredentialExpiresAt: new Date(workerCredentials.expires_at)
        })
      }
    )
    expect(mocks.refreshUpdateOne).toHaveBeenCalledWith(
      { _id: refreshRecord._id },
      {
        $set: expect.objectContaining({
          credentialExpiresAt: new Date(workerCredentials.expires_at),
          status: 'succeeded'
        })
      }
    )
    expect(cloudflareServiceTestState.encryptSecretValue).not.toHaveBeenCalled()
  })

  it('marks the deployment degraded and records a failed job when Cloudflare refresh fails', async () => {
    expect.hasAssertions()
    const now = new Date('2026-06-23T10:00:00.000Z')
    const deployment = workerDeployment()
    const connection = cloudflareConnection()
    const workerCredentials = issuedWorkerCredentials()
    const refreshRecord = { _id: 'refresh-1' }
    const { db, mocks } = refreshDb({
      account: cloudflareAccount(),
      connection,
      deployments: [deployment],
      grant: cloudflareGrant(),
      refreshRecord
    })
    const cloudflareError = new Error('Cloudflare worker upload failed')
    cloudflareServiceTestState.createAgentMailWorkerCredentials.mockResolvedValue(workerCredentials)
    cloudflareServiceTestState.applyCloudflareProvisioning.mockRejectedValue(cloudflareError)
    const { refreshDueAgentMailWorkerCredentials } = await import('./service')

    await expect(refreshDueAgentMailWorkerCredentials(db, now)).resolves.toStrictEqual({
      failed: 1,
      refreshed: 0
    })

    expect(cloudflareServiceTestState.sanitizeCloudflareError).toHaveBeenCalledWith(cloudflareError)
    expect(mocks.deploymentUpdateOne).toHaveBeenCalledWith(
      { _id: deployment._id },
      {
        $set: {
          status: 'degraded',
          lastErrorCode: 'CLOUDFLARE_REQUEST_FAILED',
          lastErrorMessage: 'Cloudflare request failed. Check the selected account, zone, and permissions.'
        }
      }
    )
    expect(mocks.refreshUpdateOne).toHaveBeenCalledWith(
      { _id: refreshRecord._id },
      {
        $set: expect.objectContaining({
          status: 'failed',
          lastErrorCode: 'CLOUDFLARE_REQUEST_FAILED',
          lastErrorMessage: 'Cloudflare request failed. Check the selected account, zone, and permissions.'
        })
      }
    )
    expect(mocks.connectionUpdateOne).not.toHaveBeenCalled()
  })
})

const TEST_ORGANIZATION_ID = '01960000-0000-7000-8000-000000000010'
const TEST_USER_ID = '01960000-0000-7000-8000-000000000011'

function cloudflareAuthorizationGlobals() {
  const mocks = {
    authGetAccessToken: vi.fn(),
    authGetSession: vi.fn(() =>
      Promise.resolve({
        session: {
          activeOrganizationId: TEST_ORGANIZATION_ID,
          id: 'session-1'
        },
        user: {
          id: TEST_USER_ID
        }
      })
    ),
    authUnlinkAccount: vi.fn(),
    connectionFind: vi.fn(() => sortedQuery([])),
    connectionFindOneAndUpdate: vi.fn(() => execQuery(null)),
    grantFind: vi.fn(() => sortedQuery([])),
    grantFindOne: vi.fn(() => execQuery(null)),
    memberFindOne: vi.fn(() => execQuery({ role: 'member' })),
    organizationFindById: vi.fn(() => execQuery({ _id: TEST_ORGANIZATION_ID }))
  }
  return {
    globals: {
      auth: {
        api: {
          getAccessToken: mocks.authGetAccessToken,
          getSession: mocks.authGetSession,
          unlinkAccount: mocks.authUnlinkAccount
        }
      },
      db: {
        models: {
          cloudflareConnection: {
            find: mocks.connectionFind,
            findOneAndUpdate: mocks.connectionFindOneAndUpdate
          },
          cloudflareOAuthGrant: {
            find: mocks.grantFind,
            findOne: mocks.grantFindOne
          },
          member: {
            findOne: mocks.memberFindOne
          },
          organization: {
            findById: mocks.organizationFindById
          }
        }
      }
    },
    mocks
  }
}

function refreshDb({
  account,
  connection,
  deployments,
  grant,
  refreshRecord
}: {
  account: Record<string, unknown>
  connection: Record<string, unknown>
  deployments: ReadonlyArray<Record<string, unknown>>
  grant: Record<string, unknown>
  refreshRecord: Record<string, unknown>
}) {
  const mocks = {
    accountFindOne: vi.fn(() => execQuery(account)),
    accountUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    connectionFindOne: vi.fn(() => execQuery(connection)),
    connectionUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    deploymentFind: vi.fn(() => sortedLimitedQuery(deployments)),
    deploymentUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    grantFindOne: vi.fn(() => execQuery(grant)),
    grantUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    refreshCreate: vi.fn(() => Promise.resolve(refreshRecord)),
    refreshUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 }))
  }
  const db = {
    models: {
      account: {
        findOne: mocks.accountFindOne,
        updateOne: mocks.accountUpdateOne
      },
      agentMailWorkerCredentialRefresh: {
        create: mocks.refreshCreate,
        updateOne: mocks.refreshUpdateOne
      },
      agentMailWorkerDeployment: {
        find: mocks.deploymentFind,
        updateOne: mocks.deploymentUpdateOne
      },
      cloudflareConnection: {
        findOne: mocks.connectionFindOne,
        updateOne: mocks.connectionUpdateOne
      },
      cloudflareOAuthGrant: {
        findOne: mocks.grantFindOne,
        updateOne: mocks.grantUpdateOne
      }
    }
  } as unknown as Database

  return { db, mocks }
}

function sortedLimitedQuery(value: unknown) {
  return {
    sort: vi.fn(() => ({
      limit: vi.fn(() => execQuery(value))
    }))
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

function workerDeployment() {
  return {
    _id: 'deployment-1',
    agentMailDomainId: '01960000-0000-7000-8000-000000000010',
    archivePrefix: 'orgs/org_public_test/domains/example.test/mail/inbound',
    cloudflareAccountId: 'cf-account-1',
    cloudflareConnectionId: 'connection-1',
    cloudflareZoneId: 'cf-zone-1',
    domain: 'example.test',
    encryptedWorkerHmacSecret: 'encrypted:existing-worker-hmac-secret',
    organizationId: '01960000-0000-7000-8000-000000000001',
    organizationPublicId: 'org_public_test',
    userId: 'user-1',
    workerConnectionId: 'conn_public_test'
  }
}

function cloudflareConnection() {
  return {
    _id: 'connection-1',
    grantId: 'grant-1',
    organizationId: '01960000-0000-7000-8000-000000000001',
    status: 'active'
  }
}

function cloudflareGrant() {
  return {
    _id: 'grant-1',
    betterAuthAccountId: 'account-1',
    organizationId: '01960000-0000-7000-8000-000000000001',
    status: 'active',
    userId: 'user-1'
  }
}

function cloudflareAccount() {
  return {
    _id: 'account-1',
    accessToken: 'stored-cloudflare-access-token',
    accessTokenExpiresAt: new Date('2026-06-24T12:00:00.000Z'),
    providerId: 'cloudflare',
    userId: 'user-1'
  }
}

function issuedWorkerCredentials() {
  return {
    access_key_id: 'new-r2-access-key',
    archive_prefix: 'orgs/org_public_test/domains/example.test/mail/inbound',
    bucket: 'agent-mail-archive',
    endpoint: 'https://example.r2.cloudflarestorage.com',
    expires_at: '2026-06-24T10:00:00.000Z',
    region: 'auto',
    secret_access_key: 'new-r2-secret-access-key',
    session_token: 'new-r2-session-token'
  }
}
