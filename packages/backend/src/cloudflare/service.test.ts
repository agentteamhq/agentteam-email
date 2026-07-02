import { publicIdFromUUIDv7 } from '@main/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '../db/db'

const EXISTING_WORKER_WEBHOOK_SIGNING_SECRET = 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

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
  sendCloudflareRawEmail: vi.fn(),
  syncAgentMailRuntimeProjection: vi.fn()
}))

vi.mock('./client', () => ({
  applyCloudflareProvisioning: cloudflareServiceTestState.applyCloudflareProvisioning,
  listCloudflareAccounts: cloudflareServiceTestState.listCloudflareAccounts,
  listCloudflareZones: cloudflareServiceTestState.listCloudflareZones,
  sanitizeCloudflareError: cloudflareServiceTestState.sanitizeCloudflareError,
  sendCloudflareRawEmail: cloudflareServiceTestState.sendCloudflareRawEmail
}))

vi.mock('../globals', () => ({
  globals: cloudflareServiceTestState.globals
}))

vi.mock('../agent-mail/service', () => ({
  isAgentMailAccessError: (error: unknown) => error instanceof Error && error.name === 'AgentMailAccessError',
  requireAgentMailOrganizationContext: cloudflareServiceTestState.requireAgentMailOrganizationContext
}))

vi.mock('../agent-mail/control-client', () => ({
  createAgentMailWorkerCredentials: cloudflareServiceTestState.createAgentMailWorkerCredentials
}))

vi.mock('../agent-mail/runtime-projection', () => ({
  createAgentMailArchivePrefix: (organizationPublicId: string, domain: string) =>
    `orgs/${organizationPublicId}/domains/${domain.trim().toLowerCase()}/mail/inbound`,
  syncAgentMailRuntimeProjection: cloudflareServiceTestState.syncAgentMailRuntimeProjection
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
      encryptedWorkerHmacSecret: 'encrypted-worker-webhook-signing-secret',
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
    expect(serialized).not.toContain('encrypted-worker-webhook-signing-secret')
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
      lastErrorCode: 'AT_EMAIL_ADMIN_CONTROL_SYNC_FAILED',
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

describe('Cloudflare OAuth start service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('CLOUDFLARE_OAUTH_CLIENT_ID', 'cloudflare-client-id')
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    cloudflareServiceTestState.globals.mockReset()
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockReset()
  })

  it.each([
    {
      callbackPath: '/dashboard/',
      returnTarget: 'dashboard-onboarding'
    },
    {
      callbackPath: '/settings/connected-accounts/',
      returnTarget: 'settings-connected-accounts'
    },
    {
      callbackPath: '/settings/domains/',
      returnTarget: 'settings-domains'
    }
  ] as const)(
    'starts Cloudflare OAuth for $returnTarget and sends failures to the app-owned redirect error route',
    async ({ callbackPath, returnTarget }) => {
      expect.hasAssertions()
      const { globals, mocks } = cloudflareOAuthStartGlobals()
      const headers = new Headers({ cookie: 'session=abc' })
      cloudflareServiceTestState.globals.mockResolvedValue(globals)
      cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
        ability: { cannot: vi.fn(() => false) },
        organizationId: TEST_ORGANIZATION_ID
      })
      const { startCloudflareOAuth } = await import('./service')

      const result = await startCloudflareOAuth({ headers, returnTarget })
      const oauthBody = mocks.authOAuth2LinkAccount.mock.calls[0]?.[0].body
      const successUrl = new URL(String(oauthBody?.callbackURL))
      const errorUrl = new URL(String(oauthBody?.errorCallbackURL))

      expect(result.redirectUrl).toBe('https://dash.cloudflare.test/oauth/start')
      expect(mocks.authOAuth2LinkAccount).toHaveBeenCalledWith({
        body: expect.objectContaining({
          providerId: 'cloudflare',
          callbackURL: expect.any(String),
          errorCallbackURL: expect.any(String)
        }),
        headers,
        returnHeaders: true
      })
      expect(oauthBody).not.toHaveProperty('scopes')
      expect(mocks.intentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackPath,
          status: 'pending'
        })
      )
      expect(successUrl.origin).toBe('https://mail.example.test')
      expect(successUrl.pathname).toBe(callbackPath)
      expect(successUrl.searchParams.has('settings')).toBe(false)
      expect(successUrl.searchParams.get('cloudflareIntentId')).toBe(result.intent.publicId)
      expect(errorUrl.origin).toBe('https://mail.example.test')
      expect(errorUrl.pathname).toBe('/redirect/error')
      expect(errorUrl.searchParams.get('provider')).toBe('cloudflare')
      expect(errorUrl.searchParams.get('flow')).toBe('connected-account')
      expect(errorUrl.searchParams.get('cloudflareIntentId')).toBe(result.intent.publicId)
      expect(errorUrl.searchParams.get('returnTarget')).toBe(returnTarget)
      expect(errorUrl.searchParams.get('callbackUri')).toBe(
        'https://mail.example.test/rpc/auth/api/oauth2/callback/cloudflare'
      )
      expect(errorUrl.toString()).not.toContain('/rpc/auth/api/error')
    }
  )
})

describe('Cloudflare OAuth finalize service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    cloudflareServiceTestState.globals.mockReset()
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockReset()
  })

  it('keeps the same Cloudflare provider user separate across app users in the same organization', async () => {
    expect.hasAssertions()
    const { globals, grants, mocks } = cloudflareOAuthFinalizeGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: { cannot: vi.fn(() => false) },
      organizationId: TEST_ORGANIZATION_ID
    })
    const { finalizeCloudflareOAuth } = await import('./service')

    await expect(
      finalizeCloudflareOAuth({
        headers: new Headers(),
        intentPublicId: TEST_INTENT_PUBLIC_ID
      })
    ).resolves.toMatchObject({
      grant: {
        cloudflareUserId: 'cloudflare-user-shared',
        publicId: TEST_CURRENT_USER_GRANT_PUBLIC_ID,
        status: 'active'
      }
    })

    expect(grants).toHaveLength(2)
    expect(grants.find((grant) => grant._id === TEST_OTHER_USER_GRANT_ID)).toMatchObject({
      cloudflareUserId: 'cloudflare-user-shared',
      userId: TEST_OTHER_USER_ID
    })
    expect(grants.find((grant) => grant._id === TEST_CURRENT_USER_GRANT_ID)).toMatchObject({
      cloudflareUserId: 'cloudflare-user-shared',
      userId: TEST_USER_ID
    })
    expect(mocks.grantFindOneAndUpdate).toHaveBeenCalledWith(
      {
        cloudflareUserId: 'cloudflare-user-shared',
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID
      },
      expect.any(Object),
      { returnDocument: 'after', upsert: true }
    )
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
    cloudflareServiceTestState.syncAgentMailRuntimeProjection.mockReset()
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
          domain: 'example.test',
          grantPublicId: TEST_OLDER_GRANT_PUBLIC_ID
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
    expect(cloudflareServiceTestState.syncAgentMailRuntimeProjection).not.toHaveBeenCalled()
  })

  it('lists Cloudflare accounts from every active grant with the owning grant public id', async () => {
    expect.hasAssertions()
    const { globals, mocks } = cloudflareGrantSelectionGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: { cannot: vi.fn(() => false) },
      organizationId: TEST_ORGANIZATION_ID
    })
    cloudflareServiceTestState.listCloudflareAccounts.mockImplementation(async (accessToken: string) => {
      if (accessToken === 'token-for-cloudflare-user-old') {
        return [{ id: 'cf-account-old', name: 'Older Account', type: 'standard' }]
      }
      if (accessToken === 'token-for-cloudflare-user-new') {
        return [{ id: 'cf-account-new', name: 'Newer Account', type: 'enterprise' }]
      }
      return []
    })
    const { listConnectedCloudflareAccounts } = await import('./service')

    await expect(listConnectedCloudflareAccounts(new Headers())).resolves.toStrictEqual([
      {
        grantPublicId: TEST_OLDER_GRANT_PUBLIC_ID,
        id: 'cf-account-old',
        name: 'Older Account',
        type: 'standard'
      },
      {
        grantPublicId: TEST_NEWER_GRANT_PUBLIC_ID,
        id: 'cf-account-new',
        name: 'Newer Account',
        type: 'enterprise'
      }
    ])

    expect(mocks.grantFind).toHaveBeenCalledWith({
      organizationId: TEST_ORGANIZATION_ID,
      status: 'active',
      userId: TEST_USER_ID
    })
    expect(mocks.grantFindOne).not.toHaveBeenCalled()
    expect(cloudflareServiceTestState.listCloudflareAccounts).toHaveBeenCalledWith(
      'token-for-cloudflare-user-old'
    )
    expect(cloudflareServiceTestState.listCloudflareAccounts).toHaveBeenCalledWith(
      'token-for-cloudflare-user-new'
    )
  })

  it('lists Cloudflare zones from the selected non-newest grant public id', async () => {
    expect.hasAssertions()
    const { globals, mocks } = cloudflareGrantSelectionGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: { cannot: vi.fn(() => false) },
      organizationId: TEST_ORGANIZATION_ID
    })
    cloudflareServiceTestState.listCloudflareZones.mockResolvedValue([
      {
        accountId: 'cf-account-old',
        accountName: 'Older Account',
        id: 'cf-zone-old',
        name: 'old.example.test',
        status: 'active'
      }
    ])
    const { listConnectedCloudflareZones } = await import('./service')

    await expect(
      listConnectedCloudflareZones({
        cloudflareAccountId: 'cf-account-old',
        grantPublicId: TEST_OLDER_GRANT_PUBLIC_ID,
        headers: new Headers()
      })
    ).resolves.toStrictEqual([
      {
        accountId: 'cf-account-old',
        accountName: 'Older Account',
        grantPublicId: TEST_OLDER_GRANT_PUBLIC_ID,
        id: 'cf-zone-old',
        name: 'old.example.test',
        status: 'active'
      }
    ])

    expect(mocks.grantFindOne).toHaveBeenCalledWith({
      _id: TEST_OLDER_GRANT_ID,
      organizationId: TEST_ORGANIZATION_ID,
      status: 'active',
      userId: TEST_USER_ID
    })
    expect(mocks.grantFind).not.toHaveBeenCalled()
    expect(cloudflareServiceTestState.listCloudflareZones).toHaveBeenCalledWith({
      accessToken: 'token-for-cloudflare-user-old',
      cloudflareAccountId: 'cf-account-old'
    })
  })

  it('keeps compatibility zone listing on all active grants when no grant public id is supplied', async () => {
    expect.hasAssertions()
    const { globals, mocks } = cloudflareGrantSelectionGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: { cannot: vi.fn(() => false) },
      organizationId: TEST_ORGANIZATION_ID
    })
    cloudflareServiceTestState.listCloudflareZones.mockImplementation(
      async ({ accessToken }: { accessToken: string }) => {
        if (accessToken === 'token-for-cloudflare-user-old') {
          return [
            {
              accountId: 'cf-account-old',
              accountName: 'Older Account',
              id: 'cf-zone-old',
              name: 'old.example.test',
              status: 'active'
            }
          ]
        }
        if (accessToken === 'token-for-cloudflare-user-new') {
          return [
            {
              accountId: 'cf-account-new',
              accountName: 'Newer Account',
              id: 'cf-zone-new',
              name: 'new.example.test',
              status: 'active'
            }
          ]
        }
        return []
      }
    )
    const { listConnectedCloudflareZones } = await import('./service')

    await expect(listConnectedCloudflareZones({ headers: new Headers() })).resolves.toStrictEqual([
      {
        accountId: 'cf-account-old',
        accountName: 'Older Account',
        grantPublicId: TEST_OLDER_GRANT_PUBLIC_ID,
        id: 'cf-zone-old',
        name: 'old.example.test',
        status: 'active'
      },
      {
        accountId: 'cf-account-new',
        accountName: 'Newer Account',
        grantPublicId: TEST_NEWER_GRANT_PUBLIC_ID,
        id: 'cf-zone-new',
        name: 'new.example.test',
        status: 'active'
      }
    ])

    expect(mocks.grantFind).toHaveBeenCalledWith({
      organizationId: TEST_ORGANIZATION_ID,
      status: 'active',
      userId: TEST_USER_ID
    })
    expect(mocks.grantFindOne).not.toHaveBeenCalled()
  })

  it('connects a domain to the exact active grant selected by grant public id', async () => {
    expect.hasAssertions()
    const { globals, mocks } = cloudflareGrantSelectionGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: { cannot: vi.fn(() => false) },
      organizationId: TEST_ORGANIZATION_ID
    })
    const { connectCloudflareDomain } = await import('./service')

    await expect(
      connectCloudflareDomain({
        headers: new Headers(),
        input: {
          cloudflareAccountId: 'cf-account-old',
          cloudflareAccountName: 'Older Account',
          cloudflareZoneId: 'cf-zone-old',
          cloudflareZoneName: 'old.example.test',
          domain: 'Example.COM',
          grantPublicId: TEST_OLDER_GRANT_PUBLIC_ID
        }
      })
    ).resolves.toMatchObject({
      cloudflareAccountId: 'cf-account-old',
      cloudflareZoneId: 'cf-zone-old',
      domain: 'example.com',
      status: 'connected'
    })

    expect(mocks.grantFindOne).toHaveBeenCalledWith({
      _id: TEST_OLDER_GRANT_ID,
      organizationId: TEST_ORGANIZATION_ID,
      status: 'active',
      userId: TEST_USER_ID
    })
    expect(mocks.grantFind).not.toHaveBeenCalled()
    expect(mocks.connectionFindOneAndUpdate).toHaveBeenCalledWith(
      {
        cloudflareAccountId: 'cf-account-old',
        cloudflareZoneId: 'cf-zone-old',
        domain: 'example.com',
        organizationId: TEST_ORGANIZATION_ID
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          grantId: TEST_OLDER_GRANT_ID,
          status: 'connected'
        })
      }),
      { returnDocument: 'after', upsert: true }
    )
  })
})

describe('Cloudflare disconnect service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    cloudflareServiceTestState.globals.mockReset()
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockReset()
    cloudflareServiceTestState.syncAgentMailRuntimeProjection.mockReset()
  })

  it('disconnects only the exact active grant selected by public id', async () => {
    expect.hasAssertions()
    const headers = new Headers()
    const { globals, mocks } = cloudflareDisconnectGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: { cannot: vi.fn(() => false) },
      organizationId: TEST_ORGANIZATION_ID
    })
    const { disconnectCloudflare } = await import('./service')

    await expect(
      disconnectCloudflare({
        grantPublicId: TEST_OLDER_GRANT_PUBLIC_ID,
        headers
      })
    ).resolves.toMatchObject({
      grants: expect.arrayContaining([
        expect.objectContaining({
          cloudflareUserId: 'cloudflare-user-old',
          status: 'revoked'
        }),
        expect.objectContaining({
          cloudflareUserId: 'cloudflare-user-new',
          status: 'active'
        })
      ])
    })

    expect(mocks.grantFindOne).toHaveBeenCalledWith({
      _id: TEST_OLDER_GRANT_ID,
      organizationId: TEST_ORGANIZATION_ID,
      status: 'active',
      userId: TEST_USER_ID
    })
    expect(mocks.grantUpdateOne).toHaveBeenCalledWith(
      { _id: TEST_OLDER_GRANT_ID },
      {
        $set: {
          lastErrorCode: null,
          lastErrorMessage: null,
          status: 'revoked'
        }
      }
    )
    expect(mocks.connectionUpdateMany).toHaveBeenCalledWith(
      { grantId: TEST_OLDER_GRANT_ID, organizationId: TEST_ORGANIZATION_ID },
      {
        $set: {
          encryptedWorkerHmacSecret: null,
          hmacSecretReference: null,
          status: 'disconnected'
        }
      }
    )
    expect(mocks.authUnlinkAccount).toHaveBeenCalledWith({
      body: {
        accountId: 'cloudflare-user-old',
        providerId: 'cloudflare'
      },
      headers
    })
    expect(cloudflareServiceTestState.syncAgentMailRuntimeProjection).toHaveBeenCalledWith(
      expect.any(Object),
      { reason: 'cloudflare-disconnect' }
    )
  })

  it('rejects omitted grant public ids after authz without selecting the newest active grant', async () => {
    expect.hasAssertions()
    const { globals, mocks } = cloudflareDisconnectGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.requireAgentMailOrganizationContext.mockResolvedValue({
      ability: { cannot: vi.fn(() => false) },
      organizationId: TEST_ORGANIZATION_ID
    })
    const { disconnectCloudflare } = await import('./service')

    await expect(
      disconnectCloudflare({
        grantPublicId: undefined as unknown as string,
        headers: new Headers()
      })
    ).rejects.toThrow('Cloudflare grant public id is required')

    expect(mocks.authGetSession).toHaveBeenCalled()
    expect(cloudflareServiceTestState.requireAgentMailOrganizationContext).toHaveBeenCalled()
    expect(mocks.grantFindOne).not.toHaveBeenCalled()
    expect(mocks.grantUpdateOne).not.toHaveBeenCalled()
    expect(mocks.authUnlinkAccount).not.toHaveBeenCalled()
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
    cloudflareServiceTestState.syncAgentMailRuntimeProjection.mockReset()
  })

  it('refreshes due Worker credentials with the existing webhook signing secret and records a succeeded job', async () => {
    expect.hasAssertions()
    const now = new Date('2026-06-23T10:00:00.000Z')
    const deployment = workerDeployment()
    const connection = cloudflareConnection()
    const grant = cloudflareGrant()
    const workerCredentials = issuedWorkerCredentials()
    const refreshRecord = { _id: 'refresh-1' }
    const { db, mocks } = refreshDb({
      connection,
      deployments: [deployment],
      grant,
      refreshRecord
    })
    cloudflareServiceTestState.createAgentMailWorkerCredentials.mockResolvedValue(workerCredentials)
    cloudflareServiceTestState.applyCloudflareProvisioning.mockResolvedValue({
      r2BucketName: workerCredentials.bucket,
      r2Endpoint: workerCredentials.endpoint,
      r2Region: workerCredentials.region,
      webhookSigningSecret: EXISTING_WORKER_WEBHOOK_SIGNING_SECRET,
      webhookSigningSecretReference: 'cloudflare-worker:script:AGENTTEAM_WORKER_HMAC_SECRET',
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
    expect(mocks.authGetAccessToken).toHaveBeenCalledWith({
      body: {
        accountId: grant.cloudflareUserId,
        providerId: 'cloudflare',
        userId: grant.userId
      }
    })
    expect(cloudflareServiceTestState.applyCloudflareProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'better-auth-cloudflare-access-token',
        webhookSigningSecret: EXISTING_WORKER_WEBHOOK_SIGNING_SECRET,
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

describe('Cloudflare control raw sending', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    cloudflareServiceTestState.globals.mockReset()
    cloudflareServiceTestState.sanitizeCloudflareError.mockClear()
    cloudflareServiceTestState.sendCloudflareRawEmail.mockReset()
  })

  it('sends raw mail through the connected user Cloudflare OAuth grant', async () => {
    expect.hasAssertions()
    const { globals, mocks } = cloudflareControlSendGlobals()
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    cloudflareServiceTestState.sendCloudflareRawEmail.mockResolvedValue({
      delivered: ['recipient@example.net'],
      permanentBounces: [],
      queued: []
    })
    const { sendCloudflareRawEmailForControl } = await import('./service')

    await expect(
      sendCloudflareRawEmailForControl({
        domain: 'example.com',
        from: 'agent@example.com',
        mimeMessage: 'From: agent@example.com\r\n\r\nbody',
        organizationId: TEST_ORGANIZATION_ID,
        organizationPublicId: 'org_public_test',
        recipients: ['recipient@example.net']
      })
    ).resolves.toStrictEqual({
      delivered: ['recipient@example.net'],
      permanent_bounces: [],
      queued: []
    })

    expect(mocks.authGetAccessToken).toHaveBeenCalledWith({
      body: {
        accountId: 'cloudflare-user-1',
        providerId: 'cloudflare',
        userId: TEST_USER_ID
      }
    })
    expect(cloudflareServiceTestState.sendCloudflareRawEmail).toHaveBeenCalledWith({
      accessToken: 'user-cloudflare-access-token',
      cloudflareAccountId: 'cf-account-1',
      from: 'agent@example.com',
      mimeMessage: 'From: agent@example.com\r\n\r\nbody',
      recipients: ['recipient@example.net']
    })
    expect(mocks.grantUpdateOne).toHaveBeenCalledWith(
      { _id: 'grant-1' },
      {
        $set: expect.objectContaining({
          lastErrorCode: null,
          lastErrorMessage: null,
          status: 'active'
        })
      }
    )
  })

  it('rejects raw sends before token lookup when the grant lacks email sending scope', async () => {
    expect.hasAssertions()
    const { globals, mocks } = cloudflareControlSendGlobals({
      grant: { ...controlSendGrant(), grantedScopes: ['zone:read'] }
    })
    cloudflareServiceTestState.globals.mockResolvedValue(globals)
    const { sendCloudflareRawEmailForControl } = await import('./service')

    await expect(
      sendCloudflareRawEmailForControl({
        domain: 'example.com',
        from: 'agent@example.com',
        mimeMessage: 'From: agent@example.com\r\n\r\nbody',
        organizationId: TEST_ORGANIZATION_ID,
        organizationPublicId: 'org_public_test',
        recipients: ['recipient@example.net']
      })
    ).rejects.toMatchObject({
      message: 'Cloudflare OAuth grant is not authorized for email sending',
      status: 403
    })

    expect(mocks.authGetAccessToken).not.toHaveBeenCalled()
    expect(cloudflareServiceTestState.sendCloudflareRawEmail).not.toHaveBeenCalled()
  })
})

const TEST_ORGANIZATION_ID = '01960000-0000-7000-8000-000000000010'
const TEST_USER_ID = '01960000-0000-7000-8000-000000000011'
const TEST_OTHER_USER_ID = '01960000-0000-7000-8000-000000000012'
const TEST_INTENT_ID = '01960000-0000-7000-8000-000000000013'
const TEST_INTENT_PUBLIC_ID = publicIdFromUUIDv7(TEST_INTENT_ID)
const TEST_OLDER_GRANT_ID = '01960000-0000-7000-8000-000000000021'
const TEST_NEWER_GRANT_ID = '01960000-0000-7000-8000-000000000022'
const TEST_OTHER_USER_GRANT_ID = '01960000-0000-7000-8000-000000000023'
const TEST_CURRENT_USER_GRANT_ID = '01960000-0000-7000-8000-000000000024'
const TEST_OLDER_GRANT_PUBLIC_ID = publicIdFromUUIDv7(TEST_OLDER_GRANT_ID)
const TEST_NEWER_GRANT_PUBLIC_ID = publicIdFromUUIDv7(TEST_NEWER_GRANT_ID)
const TEST_CURRENT_USER_GRANT_PUBLIC_ID = publicIdFromUUIDv7(TEST_CURRENT_USER_GRANT_ID)

function cloudflareOAuthStartGlobals() {
  const mocks = {
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
    authOAuth2LinkAccount: vi.fn(
      (_input: {
        body: {
          callbackURL?: string
          errorCallbackURL?: string
          providerId: string
        }
        headers: Headers
        returnHeaders: boolean
      }) =>
        Promise.resolve({
          headers: new Headers({ 'set-cookie': 'cloudflare-oauth-start=1' }),
          response: {
            url: 'https://dash.cloudflare.test/oauth/start'
          }
        })
    ),
    intentCreate: vi.fn((input: Record<string, unknown>) =>
      Promise.resolve({
        _id: '01960000-0000-7000-8000-000000000020',
        createdAt: new Date('2026-06-23T10:00:00.000Z'),
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date('2026-06-23T10:00:00.000Z'),
        ...input
      })
    ),
    memberFindOne: vi.fn(() => execQuery({ role: 'owner' })),
    organizationFindById: vi.fn(() => execQuery({ _id: TEST_ORGANIZATION_ID }))
  }
  return {
    globals: {
      auth: {
        api: {
          getSession: mocks.authGetSession,
          oAuth2LinkAccount: mocks.authOAuth2LinkAccount
        }
      },
      db: {
        models: {
          cloudflareOAuthConnectionIntent: {
            create: mocks.intentCreate
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

function cloudflareOAuthFinalizeGlobals() {
  const now = new Date('2026-06-23T10:00:00.000Z')
  const grants = [
    {
      _id: TEST_OTHER_USER_GRANT_ID,
      betterAuthAccountId: '01960000-0000-7000-8000-000000000043',
      cloudflareEmail: null,
      cloudflareUserId: 'cloudflare-user-shared',
      createdAt: now,
      grantedScopes: ['zone:read'],
      lastErrorCode: null,
      lastErrorMessage: null,
      lastRefreshAt: null,
      lastTokenCheckAt: null,
      organizationId: TEST_ORGANIZATION_ID,
      requiredScopes: ['zone:read'],
      status: 'active',
      updatedAt: now,
      userId: TEST_OTHER_USER_ID
    }
  ]
  const mocks = {
    accountFindOne: vi.fn(() =>
      sortedQuery({
        _id: '01960000-0000-7000-8000-000000000044',
        accountId: 'cloudflare-user-shared',
        providerId: 'cloudflare',
        scope: 'zone:read',
        userId: TEST_USER_ID
      })
    ),
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
    grantFindOneAndUpdate: vi.fn(
      (
        query: Record<string, unknown>,
        update: { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> }
      ) => {
        const existingGrant = grants.find((grant) => recordMatchesQuery(grant, query))

        if (existingGrant) {
          Object.assign(existingGrant, update.$set, { updatedAt: now })
          return execQuery(existingGrant)
        }

        const insertedGrant = {
          _id: TEST_CURRENT_USER_GRANT_ID,
          createdAt: now,
          lastRefreshAt: null,
          lastTokenCheckAt: null,
          updatedAt: now,
          ...update.$setOnInsert,
          ...update.$set
        }
        grants.push(insertedGrant as (typeof grants)[number])
        return execQuery(insertedGrant)
      }
    ),
    intentFindOne: vi.fn(() =>
      execQuery({
        _id: TEST_INTENT_ID,
        callbackPath: '/settings/connected-accounts/',
        expiresAt: new Date(Date.now() + 60_000),
        organizationId: TEST_ORGANIZATION_ID,
        status: 'pending',
        userId: TEST_USER_ID
      })
    ),
    intentUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    memberFindOne: vi.fn(() => execQuery({ role: 'member' })),
    organizationFindById: vi.fn(() => execQuery({ _id: TEST_ORGANIZATION_ID }))
  }
  return {
    globals: {
      auth: {
        api: {
          getSession: mocks.authGetSession
        }
      },
      db: {
        models: {
          account: {
            findOne: mocks.accountFindOne
          },
          cloudflareOAuthConnectionIntent: {
            findOne: mocks.intentFindOne,
            updateOne: mocks.intentUpdateOne
          },
          cloudflareOAuthGrant: {
            findOneAndUpdate: mocks.grantFindOneAndUpdate
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
    grants,
    mocks
  }
}

function cloudflareControlSendGlobals({
  connection = controlSendConnection(),
  domain = controlSendDomain(),
  grant = controlSendGrant()
}: {
  connection?: Record<string, unknown> | null
  domain?: Record<string, unknown> | null
  grant?: Record<string, unknown> | null
} = {}) {
  const mocks = {
    authGetAccessToken: vi.fn(() =>
      Promise.resolve({
        accessToken: 'user-cloudflare-access-token'
      })
    ),
    connectionFindOne: vi.fn(() => execQuery(connection)),
    connectionUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    domainFindOne: vi.fn(() => execQuery(domain)),
    grantFindOne: vi.fn(() => execQuery(grant)),
    grantUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 }))
  }
  return {
    globals: {
      auth: {
        api: {
          getAccessToken: mocks.authGetAccessToken
        }
      },
      db: {
        models: {
          agentMailDomain: {
            findOne: mocks.domainFindOne
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
      }
    },
    mocks
  }
}

function controlSendDomain() {
  return {
    _id: 'domain-1',
    cloudflareConnectionId: 'connection-1',
    domain: 'example.com',
    organizationId: TEST_ORGANIZATION_ID,
    organizationPublicId: 'org_public_test',
    status: 'active'
  }
}

function controlSendConnection() {
  return {
    _id: 'connection-1',
    cloudflareAccountId: 'cf-account-1',
    domain: 'example.com',
    grantId: 'grant-1',
    organizationId: TEST_ORGANIZATION_ID,
    organizationPublicId: 'org_public_test',
    provisioningStatus: 'succeeded',
    status: 'active'
  }
}

function controlSendGrant() {
  return {
    _id: 'grant-1',
    cloudflareUserId: 'cloudflare-user-1',
    grantedScopes: ['email-sending.write'],
    organizationId: TEST_ORGANIZATION_ID,
    status: 'active',
    userId: TEST_USER_ID
  }
}

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

function cloudflareDisconnectGlobals() {
  const grants = [cloudflareSelectionGrant('older'), cloudflareSelectionGrant('newer')]
  const connections = [cloudflareSelectionConnection()]
  const mocks = {
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
    authUnlinkAccount: vi.fn(() => Promise.resolve({})),
    connectionFind: vi.fn((query: Record<string, unknown>) => {
      if ('grantId' in query) {
        return execSortableQuery(connections.filter((connection) => recordMatchesQuery(connection, query)))
      }
      return sortedQuery(connections)
    }),
    connectionUpdateMany: vi.fn((query: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      for (const connection of connections) {
        if (recordMatchesQuery(connection, query)) {
          Object.assign(connection, update.$set)
        }
      }
      return execQuery({ modifiedCount: connections.length })
    }),
    deploymentUpdateMany: vi.fn(() => execQuery({ modifiedCount: 1 })),
    domainUpdateMany: vi.fn(() => execQuery({ modifiedCount: 1 })),
    grantFind: vi.fn(() => sortedQuery(grants)),
    grantFindOne: vi.fn((query: Record<string, unknown>) => {
      if ('_id' in query) {
        return execSortableQuery(grants.find((grant) => recordMatchesQuery(grant, query)) ?? null)
      }
      return execSortableQuery(cloudflareSelectionGrant('newer'))
    }),
    grantUpdateOne: vi.fn((query: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      const grant = grants.find((candidate) => recordMatchesQuery(candidate, query))
      if (grant) {
        Object.assign(grant, update.$set)
      }
      return execQuery({ modifiedCount: grant ? 1 : 0 })
    }),
    memberFindOne: vi.fn(() => execQuery({ role: 'member' })),
    organizationFindById: vi.fn(() => execQuery({ _id: TEST_ORGANIZATION_ID }))
  }
  return {
    globals: {
      auth: {
        api: {
          getSession: mocks.authGetSession,
          unlinkAccount: mocks.authUnlinkAccount
        }
      },
      db: {
        models: {
          agentMailDomain: {
            updateMany: mocks.domainUpdateMany
          },
          agentMailWorkerDeployment: {
            updateMany: mocks.deploymentUpdateMany
          },
          cloudflareConnection: {
            find: mocks.connectionFind,
            updateMany: mocks.connectionUpdateMany
          },
          cloudflareOAuthGrant: {
            find: mocks.grantFind,
            findOne: mocks.grantFindOne,
            updateOne: mocks.grantUpdateOne
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

function cloudflareGrantSelectionGlobals() {
  const grants = [cloudflareSelectionGrant('older'), cloudflareSelectionGrant('newer')]
  const connection = cloudflareSelectionConnection()
  const mocks = {
    authGetAccessToken: vi.fn(
      ({ body }: { body: { accountId: string; providerId: string; userId?: string } }) =>
        Promise.resolve({
          accessToken: `token-for-${body.accountId}`
        })
    ),
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
    connectionFindByIdAndUpdate: vi.fn(() => execQuery(connection)),
    connectionFindOneAndUpdate: vi.fn(() => execQuery(connection)),
    domainFindOneAndUpdate: vi.fn(() =>
      execQuery({
        _id: '01960000-0000-7000-8000-000000000032',
        cloudflareConnectionId: connection._id,
        domain: connection.domain,
        organizationId: TEST_ORGANIZATION_ID,
        status: 'connected'
      })
    ),
    grantFind: vi.fn(() => sortedQuery(grants)),
    grantFindOne: vi.fn((query: Record<string, unknown>) =>
      execQuery(
        grants.find(
          (grant) =>
            grant._id === query._id &&
            grant.organizationId === query.organizationId &&
            grant.status === query.status &&
            grant.userId === query.userId
        ) ?? null
      )
    ),
    grantUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    memberFindOne: vi.fn(() => execQuery({ role: 'member' })),
    organizationFindById: vi.fn(() => execQuery({ _id: TEST_ORGANIZATION_ID }))
  }
  return {
    globals: {
      auth: {
        api: {
          getAccessToken: mocks.authGetAccessToken,
          getSession: mocks.authGetSession
        }
      },
      db: {
        models: {
          agentMailDomain: {
            findOneAndUpdate: mocks.domainFindOneAndUpdate
          },
          cloudflareConnection: {
            findByIdAndUpdate: mocks.connectionFindByIdAndUpdate,
            findOneAndUpdate: mocks.connectionFindOneAndUpdate
          },
          cloudflareOAuthGrant: {
            find: mocks.grantFind,
            findOne: mocks.grantFindOne,
            updateOne: mocks.grantUpdateOne
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

function cloudflareSelectionGrant(kind: 'older' | 'newer') {
  const isOlder = kind === 'older'
  return {
    _id: isOlder ? TEST_OLDER_GRANT_ID : TEST_NEWER_GRANT_ID,
    betterAuthAccountId: isOlder
      ? '01960000-0000-7000-8000-000000000041'
      : '01960000-0000-7000-8000-000000000042',
    cloudflareUserId: isOlder ? 'cloudflare-user-old' : 'cloudflare-user-new',
    grantedScopes: ['zone:read'],
    organizationId: TEST_ORGANIZATION_ID,
    requiredScopes: ['zone:read'],
    status: 'active',
    updatedAt: isOlder
      ? new Date('2026-06-23T10:00:00.000Z')
      : new Date('2026-06-24T10:00:00.000Z'),
    userId: TEST_USER_ID
  }
}

function cloudflareSelectionConnection() {
  return {
    _id: '01960000-0000-7000-8000-000000000031',
    cloudflareAccountId: 'cf-account-old',
    cloudflareAccountName: 'Older Account',
    cloudflareZoneId: 'cf-zone-old',
    cloudflareZoneName: 'old.example.test',
    createdAt: new Date('2026-06-23T10:00:00.000Z'),
    domain: 'example.com',
    grantId: TEST_OLDER_GRANT_ID,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastProvisionedAt: null,
    organizationId: TEST_ORGANIZATION_ID,
    provisioningStatus: 'not_started',
    status: 'connected',
    updatedAt: new Date('2026-06-23T10:00:00.000Z'),
    userId: TEST_USER_ID,
    workerScriptName: null
  }
}

function refreshDb({
  connection,
  deployments,
  grant,
  refreshRecord
}: {
  connection: Record<string, unknown>
  deployments: ReadonlyArray<Record<string, unknown>>
  grant: Record<string, unknown>
  refreshRecord: Record<string, unknown>
}) {
  const mocks = {
    authGetAccessToken: vi.fn(() =>
      Promise.resolve({
        accessToken: 'better-auth-cloudflare-access-token'
      })
    ),
    connectionFindOne: vi.fn(() => execQuery(connection)),
    connectionUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    deploymentFind: vi.fn(() => sortedLimitedQuery(deployments)),
    deploymentUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    grantFindOne: vi.fn(() => execQuery(grant)),
    grantUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 })),
    refreshCreate: vi.fn(() => Promise.resolve(refreshRecord)),
    refreshUpdateOne: vi.fn(() => execQuery({ modifiedCount: 1 }))
  }
  cloudflareServiceTestState.globals.mockResolvedValue({
    auth: {
      api: {
        getAccessToken: mocks.authGetAccessToken
      }
    }
  })
  const db = {
    models: {
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

function execSortableQuery(value: unknown) {
  return {
    exec: vi.fn(() => Promise.resolve(value)),
    sort: vi.fn(() => execQuery(value))
  }
}

function execQuery(value: unknown) {
  return {
    exec: vi.fn(() => Promise.resolve(value))
  }
}

function recordMatchesQuery(record: Record<string, unknown>, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([key, value]) => record[key] === value)
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
    encryptedWorkerHmacSecret: `encrypted:${EXISTING_WORKER_WEBHOOK_SIGNING_SECRET}`,
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
    cloudflareUserId: 'cloudflare-user-1',
    organizationId: '01960000-0000-7000-8000-000000000001',
    status: 'active',
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
