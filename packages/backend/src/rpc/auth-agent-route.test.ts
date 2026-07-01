import { Buffer } from 'node:buffer'

import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as MainDb from '@main/db'
import type { DBAdapter, DBTransactionAdapter, Where } from '@better-auth/core/db/adapter'
import type { JWK } from 'jose'
import type { GlobalAuth } from '../auth/auth'
import type { Database } from '../db/db'

type StoredRecord = Record<string, unknown> & {
  id: string
}

type SecondaryStorageRecord = {
  counter?: number | null
  createdAt?: Date
  expiresAt?: Date | null
  key: string
  updatedAt?: Date
  value: string
}

type JsonObject = Record<string, unknown>

type RouteTestState = {
  auth: GlobalAuth | null
  betterAuthAdapter: DBAdapter | null
}

const routeTestState = vi.hoisted<RouteTestState>(() => ({
  auth: null,
  betterAuthAdapter: null
}))

const DECODED_JWT = 'eyJ0eXAiOiJob3N0K2p3dCJ9.eyJzdWIiOiJhZ2VudC0xIn0.sig'

vi.mock('@main/db', async (importOriginal) => {
  const actual = await importOriginal<typeof MainDb>()

  return {
    ...actual,
    createBetterAuthMongoAdapterFromMongooseConnection: vi.fn(() => () => {
      if (!routeTestState.betterAuthAdapter) {
        throw new Error('Better Auth route test adapter is not initialized.')
      }

      return routeTestState.betterAuthAdapter
    })
  }
})

vi.mock('../globals', () => ({
  globals: vi.fn(async () => {
    if (!routeTestState.auth) {
      throw new Error('Better Auth route test auth instance is not initialized.')
    }

    return { auth: routeTestState.auth }
  })
}))

describe('Better Auth Agent Auth mounted routes', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.clearAllMocks()

    routeTestState.auth = null
    routeTestState.betterAuthAdapter = null

    vi.stubEnv('BETTER_AUTH_SECRET', 'better-auth-test-secret')
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
  })

  it('does not expose raw Better Auth capability mutation routes outside the CASL agent-access boundary', async () => {
    expect.hasAssertions()

    const { backendRpcApp } = await import('./index')

    for (const path of [
      '/rpc/auth/api/agent/approve-capability',
      '/rpc/auth/api/agent/grant-capability',
      '/rpc/auth/api/agent/revoke-capability'
    ]) {
      const response = await backendRpcApp.handle(
        new Request(`https://mail.example.com${path}`, {
          body: '{}',
          headers: { 'content-type': 'application/json' },
          method: 'POST'
        })
      )

      expect({ path, status: response.status, body: await readJsonResponse(response) }).toStrictEqual({
        body: { error: 'Not found' },
        path,
        status: 404
      })
    }
  })

  it('does not expose Better Auth audit-log insertion through the public auth mount', async () => {
    expect.hasAssertions()

    const { backendRpcApp } = await import('./index')
    const response = await backendRpcApp.handle(
      new Request('https://mail.example.com/rpc/auth/api/audit-log/insert', {
        body: JSON.stringify({
          action: 'admin.dashboard.probe',
          metadata: {},
          severity: 'low',
          status: 'success'
        }),
        headers: {
          'content-type': 'application/json',
          cookie: 'better-auth.session_token=session'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(404)
    await expect(readJsonResponse(response)).resolves.toStrictEqual({ error: 'Not found' })
  })

  it('accepts delegated dynamic agent registration at the public RPC auth mount', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    const auditLogCreate = vi.fn(async (input: unknown) => input)
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(auditLogCreate))

    const { backendRpcApp } = await import('./index')

    const requestUrl = 'https://mail.example.com/rpc/auth/api/agent/register'
    const registration = await createHostSignedRegistrationToken({ requestUrl })
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          capabilities: [
            {
              constraints: {},
              name: 'email.status'
            }
          ],
          mode: 'delegated',
          name: 'Local CLI agent',
          preferred_method: 'device_authorization',
          reason: 'CLI status check'
        }),
        headers: {
          authorization: `Bearer ${registration.token}`,
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )
    const body = await readJsonResponse(response)

    expect({ body, status: response.status }).toMatchObject({
      body: {
        agent_capability_grants: [
          {
            capability: 'email.status',
            reason: 'CLI status check',
            status: 'pending'
          }
        ],
        approval: {
          method: 'device_authorization',
          verification_uri: 'https://mail.example.com/device/capabilities'
        },
        mode: 'delegated',
        name: 'Local CLI agent',
        status: 'pending'
      },
      status: 200
    })

    const responseText = JSON.stringify(body)
    expect(responseText).not.toContain('host_public_key')
    expect(responseText).not.toContain('agent_public_key')
    expect(responseText).not.toContain('publicKey')

    const [host] = adapterStore.recordsFor('agentHost')
    expect(host).toMatchObject({
      defaultCapabilities: [],
      kid: registration.hostPublicJwk.kid,
      name: 'Local CLI host',
      status: 'pending',
      userId: null
    })
    expect(JSON.parse(String(host?.publicKey))).toStrictEqual(registration.hostPublicJwk)

    const [agent] = adapterStore.recordsFor('agent')
    expect(agent).toMatchObject({
      hostId: host?.id,
      kid: registration.agentPublicJwk.kid,
      mode: 'delegated',
      name: 'Local CLI agent',
      status: 'pending',
      userId: null
    })
    expect(JSON.parse(String(agent?.publicKey))).toStrictEqual(registration.agentPublicJwk)

    const [grant] = adapterStore.recordsFor('agentCapabilityGrant')
    expect(grant).toMatchObject({
      agentId: agent?.id,
      capability: 'email.status',
      constraints: {},
      grantedBy: null,
      reason: 'CLI status check',
      status: 'pending'
    })

    const [approval] = adapterStore.recordsFor('approvalRequest')
    expect(approval).toMatchObject({
      agentId: agent?.id,
      capabilities: 'email.status',
      hostId: host?.id,
      method: 'device_authorization',
      status: 'pending',
      userId: null
    })
    expect(approval?.userCodeHash).toStrictEqual(expect.any(String))
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent_auth.agent.created',
        status: 'success'
      })
    )
  })

  it('keeps high-risk dynamic mailbox grants pending behind approval before use', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const requestUrl = 'https://mail.example.com/rpc/auth/api/agent/register'
    const registration = await createHostSignedRegistrationToken({ requestUrl })
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          capabilities: [
            {
              constraints: {
                mailboxAddress: 'support@example.test'
              },
              name: 'email.message.send'
            }
          ],
          mode: 'delegated',
          name: 'Local CLI send agent',
          preferred_method: 'device_authorization',
          reason: 'Send support replies'
        }),
        headers: {
          authorization: `Bearer ${registration.token}`,
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )
    const body = await readJsonResponse(response)

    expect({ body, status: response.status }).toMatchObject({
      body: {
        agent_capability_grants: [
          {
            capability: 'email.message.send',
            status: 'pending'
          }
        ],
        status: 'pending'
      },
      status: 200
    })

    const [agent] = adapterStore.recordsFor('agent')
    expect(agent).toMatchObject({
      mode: 'delegated',
      name: 'Local CLI send agent',
      status: 'pending',
      userId: null
    })

    const [grant] = adapterStore.recordsFor('agentCapabilityGrant')
    expect(grant).toMatchObject({
      agentId: agent?.id,
      capability: 'email.message.send',
      constraints: {
        mailboxAddress: 'support@example.test'
      },
      grantedBy: null,
      reason: 'Send support replies',
      status: 'pending'
    })

    const [approval] = adapterStore.recordsFor('approvalRequest')
    expect(approval).toMatchObject({
      agentId: agent?.id,
      capabilities: 'email.message.send',
      method: 'device_authorization',
      status: 'pending',
      userId: null
    })
    expect(adapterStore.recordsFor('agentCapabilityGrant')).not.toContainEqual(
      expect.objectContaining({
        capability: 'email.message.send',
        status: 'active'
      })
    )
  })

  it('returns a Bearer challenge for invalid dynamic registration JWT credentials', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const requestUrl = 'https://mail.example.com/rpc/auth/api/agent/register'
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          capabilities: [
            {
              constraints: {},
              name: 'email.status'
            }
          ],
          mode: 'delegated',
          name: 'Local CLI agent',
          preferred_method: 'device_authorization',
          reason: 'CLI status check'
        }),
        headers: {
          authorization: 'Bearer header.payload.signature',
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="agentteam-agent-auth"')
    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([])
    expect(adapterStore.recordsFor('agent')).toStrictEqual([])
    expect(adapterStore.recordsFor('agentCapabilityGrant')).toStrictEqual([])
    expect(adapterStore.recordsFor('approvalRequest')).toStrictEqual([])
  })

  it('returns a Bearer challenge for invalid signed agent status and revoke JWT credentials', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    for (const endpoint of [
      {
        body: undefined,
        method: 'GET',
        path: '/rpc/auth/api/agent/status'
      },
      {
        body: JSON.stringify({ agent_id: 'agent-1' }),
        method: 'POST',
        path: '/rpc/auth/api/agent/revoke'
      }
    ]) {
      const response = await backendRpcApp.handle(
        new Request(`https://mail.example.com${endpoint.path}`, {
          body: endpoint.body,
          headers: {
            authorization: 'Bearer header.payload.signature',
            ...(endpoint.body ? { 'content-type': 'application/json' } : {}),
            host: 'mail.example.com'
          },
          method: endpoint.method
        })
      )

      const challenge = response.headers.get('www-authenticate')
      expect({ path: endpoint.path, status: response.status }, endpoint.path).toStrictEqual({
        path: endpoint.path,
        status: 401
      })
      expect(challenge, endpoint.path).toContain('Bearer realm="agentteam-agent-auth"')
    }

    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([])
    expect(adapterStore.recordsFor('agent')).toStrictEqual([])
    expect(adapterStore.recordsFor('agentCapabilityGrant')).toStrictEqual([])
    expect(adapterStore.recordsFor('approvalRequest')).toStrictEqual([])
  })

  it('rejects malformed Agent Auth Bearer credentials before request validation', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    for (const endpoint of [
      {
        body: JSON.stringify({
          capabilities: [{ name: 'email.message.send' }],
          mode: 'delegated',
          name: 'Local CLI agent'
        }),
        method: 'POST',
        path: '/rpc/auth/api/agent/register'
      },
      {
        body: JSON.stringify({
          capabilities: [{ name: 'email.message.send' }],
          reason: 'CLI send request'
        }),
        method: 'POST',
        path: '/rpc/auth/api/agent/request-capability'
      },
      {
        body: undefined,
        method: 'GET',
        path: '/rpc/auth/api/agent/status'
      }
    ]) {
      const response = await backendRpcApp.handle(
        new Request(`https://mail.example.com${endpoint.path}`, {
          body: endpoint.body,
          headers: {
            authorization: `Bearer ${DECODED_JWT} more`,
            ...(endpoint.body ? { 'content-type': 'application/json' } : {}),
            host: 'mail.example.com'
          },
          method: endpoint.method
        })
      )

      expect({ body: await readJsonResponse(response), path: endpoint.path, status: response.status }).toStrictEqual({
        body: {
          error: 'invalid_token'
        },
        path: endpoint.path,
        status: 401
      })
      expect(response.headers.get('www-authenticate'), endpoint.path).toBe('Bearer realm="agentteam-agent-auth"')
    }

    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([])
    expect(adapterStore.recordsFor('agent')).toStrictEqual([])
    expect(adapterStore.recordsFor('agentCapabilityGrant')).toStrictEqual([])
    expect(adapterStore.recordsFor('approvalRequest')).toStrictEqual([])
  })

  it('rejects unsupported dynamic registration modes before creating Agent Auth records', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const requestUrl = 'https://mail.example.com/rpc/auth/api/agent/register'
    const registration = await createHostSignedRegistrationToken({ requestUrl })
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          capabilities: [
            {
              constraints: {},
              name: 'email.status'
            }
          ],
          mode: 'unattended',
          name: 'Local CLI agent',
          preferred_method: 'device_authorization',
          reason: 'CLI status check'
        }),
        headers: {
          authorization: `Bearer ${registration.token}`,
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(400)
    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([])
    expect(adapterStore.recordsFor('agent')).toStrictEqual([])
    expect(adapterStore.recordsFor('agentCapabilityGrant')).toStrictEqual([])
    expect(adapterStore.recordsFor('approvalRequest')).toStrictEqual([])
  })

  it('rate limits public dynamic agent registration before creating additional records in production', async () => {
    expect.hasAssertions()
    vi.stubEnv('NODE_ENV', 'production')

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const requestUrl = 'https://mail.example.com/rpc/auth/api/agent/register'
    const responses: Response[] = []

    for (let index = 0; index < 6; index += 1) {
      const registration = await createHostSignedRegistrationToken({
        keySuffix: String(index),
        requestUrl
      })
      const response = await backendRpcApp.handle(
        new Request(requestUrl, {
          body: JSON.stringify({
            capabilities: [
              {
                constraints: {},
                name: 'email.status'
              }
            ],
            mode: 'delegated',
            name: `Local CLI agent ${index}`,
            preferred_method: 'device_authorization',
            reason: 'CLI status check'
          }),
          headers: {
            authorization: `Bearer ${registration.token}`,
            'content-type': 'application/json',
            host: 'mail.example.com'
          },
          method: 'POST'
        })
      )
      responses.push(response)
    }

    expect(responses.slice(0, 5).map((response) => response.status)).toStrictEqual([200, 200, 200, 200, 200])
    const rateLimitedResponse = responses[5]
    if (!rateLimitedResponse) {
      throw new Error('Expected dynamic registration to return a rate-limited response.')
    }
    expect(rateLimitedResponse.status).toBe(429)
    await expect(readJsonResponse(rateLimitedResponse)).resolves.toStrictEqual({
      message: 'Too many requests. Please try again later.'
    })
    expect(adapterStore.recordsFor('agentHost')).toHaveLength(5)
    expect(adapterStore.recordsFor('agent')).toHaveLength(5)
    expect(adapterStore.recordsFor('agentCapabilityGrant')).toHaveLength(5)
  })

  it('rejects capability requests missing backend-owned required constraints before creating records', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const requestUrl = 'https://mail.example.com/rpc/auth/api/agent/register'
    const registration = await createHostSignedRegistrationToken({ requestUrl })
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          capabilities: [{ name: 'email.message.send' }],
          mode: 'delegated',
          name: 'Local CLI agent'
        }),
        headers: {
          authorization: `Bearer ${registration.token}`,
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )
    const body = await readJsonResponse(response)

    expect({ body, status: response.status }).toMatchObject({
      body: {
        error: 'invalid_request'
      },
      status: 400
    })
    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([])
    expect(adapterStore.recordsFor('agent')).toStrictEqual([])
    expect(adapterStore.recordsFor('agentCapabilityGrant')).toStrictEqual([])
    expect(adapterStore.recordsFor('approvalRequest')).toStrictEqual([])
  })

  it('rejects capability requests with invalid backend-owned constraint values before creating records', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const requestUrl = 'https://mail.example.com/rpc/auth/api/agent/register'
    const registration = await createHostSignedRegistrationToken({ requestUrl })
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          capabilities: [
            {
              constraints: {
                mailboxAddress: 'not-an-email',
                organizationId: 'org-1'
              },
              name: 'email.message.send'
            }
          ],
          mode: 'delegated',
          name: 'Local CLI agent'
        }),
        headers: {
          authorization: `Bearer ${registration.token}`,
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )
    const body = await readJsonResponse(response)

    expect({ body, status: response.status }).toStrictEqual({
      body: {
        error: 'invalid_request'
      },
      status: 400
    })
    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([])
    expect(adapterStore.recordsFor('agent')).toStrictEqual([])
    expect(adapterStore.recordsFor('agentCapabilityGrant')).toStrictEqual([])
    expect(adapterStore.recordsFor('approvalRequest')).toStrictEqual([])
  })

  it('rejects request-capability constraint values before creating grant records', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const requestUrl = 'https://mail.example.com/rpc/auth/api/agent/request-capability'
    const registration = await createHostSignedRegistrationToken({ requestUrl })
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          capabilities: [
            {
              constraints: {
                mailboxAddress: 'not-an-email',
                organizationId: 'org-1'
              },
              name: 'email.message.send'
            }
          ],
          reason: 'CLI send request'
        }),
        headers: {
          authorization: `Bearer ${registration.token}`,
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )
    const body = await readJsonResponse(response)

    expect({ body, status: response.status }).toStrictEqual({
      body: {
        error: 'invalid_request'
      },
      status: 400
    })
    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([])
    expect(adapterStore.recordsFor('agent')).toStrictEqual([])
    expect(adapterStore.recordsFor('agentCapabilityGrant')).toStrictEqual([])
    expect(adapterStore.recordsFor('approvalRequest')).toStrictEqual([])
  })

  it('rejects capability requests with mismatched constraint schemas before creating records', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const requestUrl = 'https://mail.example.com/rpc/auth/api/agent/register'
    const registration = await createHostSignedRegistrationToken({ requestUrl })
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          capabilities: [
            {
              constraints: {
                mailboxAddress: 'support@example.com',
                organizationId: 'org-1'
              },
              name: 'email.status'
            }
          ],
          mode: 'delegated',
          name: 'Local CLI agent'
        }),
        headers: {
          authorization: `Bearer ${registration.token}`,
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )
    const body = await readJsonResponse(response)

    expect({ body, status: response.status }).toStrictEqual({
      body: {
        error: 'invalid_request'
      },
      status: 400
    })
    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([])
    expect(adapterStore.recordsFor('agent')).toStrictEqual([])
    expect(adapterStore.recordsFor('agentCapabilityGrant')).toStrictEqual([])
    expect(adapterStore.recordsFor('approvalRequest')).toStrictEqual([])
  })

  it('enrolls a pending host token at the public RPC auth mount without returning token material', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    const auditLogCreate = vi.fn(async (input: unknown) => input)
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(auditLogCreate))

    const { backendRpcApp } = await import('./index')

    const enrollmentToken = 'enrollment-token'
    const enrollmentTokenHash = await hashEnrollmentToken(enrollmentToken)
    const pendingHost = adapterStore.insertRecord('agentHost', {
      activatedAt: null,
      createdAt: new Date('2026-06-23T12:00:00.000Z'),
      defaultCapabilities: ['email.status'],
      enrollmentTokenExpiresAt: new Date(Date.now() + 60_000),
      enrollmentTokenHash,
      expiresAt: null,
      id: 'host-enroll-1',
      jwksUrl: null,
      kid: null,
      lastUsedAt: null,
      name: 'Pending CLI host',
      publicKey: null,
      status: 'pending_enrollment',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
      userId: 'user-1'
    })
    const hostPublicJwk = await createPublicJwk('enrolled-host-key-1')
    const requestUrl = 'https://mail.example.com/rpc/auth/api/host/enroll'
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          name: 'Enrolled CLI host',
          public_key: hostPublicJwk,
          token: enrollmentToken
        }),
        headers: {
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )
    const body = await readJsonResponse(response)

    expect({ body, status: response.status }).toStrictEqual({
      body: {
        default_capabilities: ['email.status'],
        hostId: pendingHost.id,
        name: 'Enrolled CLI host',
        status: 'active'
      },
      status: 200
    })

    const responseText = JSON.stringify(body)
    expect(responseText).not.toContain(enrollmentToken)
    expect(responseText).not.toContain(enrollmentTokenHash)
    expect(responseText).not.toContain('enrollmentTokenHash')
    expect(responseText).not.toContain('publicKey')

    const [host] = adapterStore.recordsFor('agentHost')
    expect(host).toMatchObject({
      activatedAt: expect.any(Date),
      enrollmentTokenExpiresAt: null,
      enrollmentTokenHash: null,
      expiresAt: expect.any(Date),
      id: pendingHost.id,
      kid: hostPublicJwk.kid,
      name: 'Enrolled CLI host',
      status: 'active',
      userId: 'user-1'
    })
    expect(JSON.parse(String(host?.publicKey))).toStrictEqual(hostPublicJwk)
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent_auth.host.enrolled',
        status: 'success'
      })
    )
  })

  it('rejects invalid host enrollment tokens without mutating pending hosts', async () => {
    expect.hasAssertions()

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const enrollmentTokenHash = await hashEnrollmentToken('valid-enrollment-token')
    adapterStore.insertRecord('agentHost', {
      activatedAt: null,
      createdAt: new Date('2026-06-23T12:00:00.000Z'),
      defaultCapabilities: ['email.status'],
      enrollmentTokenExpiresAt: new Date(Date.now() + 60_000),
      enrollmentTokenHash,
      expiresAt: null,
      id: 'host-enroll-1',
      jwksUrl: null,
      kid: null,
      lastUsedAt: null,
      name: 'Pending CLI host',
      publicKey: null,
      status: 'pending_enrollment',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
      userId: 'user-1'
    })
    const hostPublicJwk = await createPublicJwk('enrolled-host-key-1')
    const requestUrl = 'https://mail.example.com/rpc/auth/api/host/enroll'
    const response = await backendRpcApp.handle(
      new Request(requestUrl, {
        body: JSON.stringify({
          public_key: hostPublicJwk,
          token: 'invalid-enrollment-token'
        }),
        headers: {
          'content-type': 'application/json',
          host: 'mail.example.com'
        },
        method: 'POST'
      })
    )
    const body = await readJsonResponse(response)

    expect({ body, status: response.status }).toMatchObject({
      body: {
        error: 'enrollment_token_invalid'
      },
      status: 401
    })
    expect(response.headers.get('www-authenticate')).toBeNull()
    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([
      expect.objectContaining({
        enrollmentTokenHash,
        kid: null,
        publicKey: null,
        status: 'pending_enrollment'
      })
    ])
  })

  it('rate limits invalid host enrollment tokens before mutating pending hosts in production', async () => {
    expect.hasAssertions()
    vi.stubEnv('NODE_ENV', 'production')

    const adapterStore = createMemoryBetterAuthAdapterStore()
    routeTestState.betterAuthAdapter = adapterStore.adapter

    const { createGlobalAuth } = await import('../auth/auth')
    routeTestState.auth = createGlobalAuth(createFakeDatabase(vi.fn(async (input: unknown) => input)))

    const { backendRpcApp } = await import('./index')

    const enrollmentTokenHash = await hashEnrollmentToken('valid-enrollment-token')
    adapterStore.insertRecord('agentHost', {
      activatedAt: null,
      createdAt: new Date('2026-06-23T12:00:00.000Z'),
      defaultCapabilities: ['email.status'],
      enrollmentTokenExpiresAt: new Date(Date.now() + 60_000),
      enrollmentTokenHash,
      expiresAt: null,
      id: 'host-enroll-1',
      jwksUrl: null,
      kid: null,
      lastUsedAt: null,
      name: 'Pending CLI host',
      publicKey: null,
      status: 'pending_enrollment',
      updatedAt: new Date('2026-06-23T12:00:00.000Z'),
      userId: 'user-1'
    })
    const hostPublicJwk = await createPublicJwk('enrolled-host-key-1')
    const requestUrl = 'https://mail.example.com/rpc/auth/api/host/enroll'
    const responses: Response[] = []

    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await backendRpcApp.handle(
          new Request(requestUrl, {
            body: JSON.stringify({
              public_key: hostPublicJwk,
              token: 'invalid-enrollment-token'
            }),
            headers: {
              'content-type': 'application/json',
              host: 'mail.example.com'
            },
            method: 'POST'
          })
        )
      )
    }

    expect(responses.slice(0, 5).map((response) => response.status)).toStrictEqual([401, 401, 401, 401, 401])
    const rateLimitedResponse = responses[5]
    if (!rateLimitedResponse) {
      throw new Error('Expected host enrollment to return a rate-limited response.')
    }
    expect(rateLimitedResponse.status).toBe(429)
    await expect(readJsonResponse(rateLimitedResponse)).resolves.toStrictEqual({
      message: 'Too many requests. Please try again later.'
    })
    expect(adapterStore.recordsFor('agentHost')).toStrictEqual([
      expect.objectContaining({
        enrollmentTokenHash,
        kid: null,
        publicKey: null,
        status: 'pending_enrollment'
      })
    ])
  })
})

function createFakeDatabase(auditLogCreate: (input: unknown) => Promise<unknown>): Database {
  const betterAuthSecondaryStorage = createMemorySecondaryStorageModel()

  return {
    connection: {},
    models: {
      agentMailAgentEnrollmentGrantRequest: {
        findOne: vi.fn(() => ({
          exec: async () => null
        }))
      },
      auditLog: {
        create: auditLogCreate
      },
      betterAuthSecondaryStorage
    }
  } as unknown as Database
}

function createMemorySecondaryStorageModel() {
  const records = new Map<string, SecondaryStorageRecord>()

  const findRecord = (filter: Record<string, unknown>) => {
    const key = typeof filter.key === 'string' ? filter.key : null
    if (!key) {
      return null
    }
    const record = records.get(key)
    return record && secondaryStorageRecordMatches(record, filter) ? record : null
  }

  const applyUpdate = (
    record: SecondaryStorageRecord,
    update: Record<string, unknown>,
    { inserting }: { inserting: boolean }
  ) => {
    const setOnInsert = objectValue(update.$setOnInsert)
    if (inserting && setOnInsert) {
      Object.assign(record, setOnInsert)
    }

    const set = objectValue(update.$set)
    if (set) {
      Object.assign(record, set)
    }

    const increments = objectValue(update.$inc)
    if (increments) {
      for (const [field, increment] of Object.entries(increments)) {
        if (typeof increment === 'number') {
          const current =
            typeof record[field as keyof SecondaryStorageRecord] === 'number'
              ? (record[field as keyof SecondaryStorageRecord] as number)
              : 0
          Object.assign(record, { [field]: current + increment })
        }
      }
    }
  }

  return {
    deleteOne: vi.fn((filter: Record<string, unknown>) => ({
      exec: async () => {
        const record = findRecord(filter)
        if (!record) {
          return { deletedCount: 0 }
        }
        records.delete(record.key)
        return { deletedCount: 1 }
      }
    })),
    findOne: vi.fn((filter: Record<string, unknown>) => ({
      exec: async () => cloneSecondaryStorageRecord(findRecord(filter))
    })),
    findOneAndUpdate: vi.fn(
      (
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options: Record<string, unknown>
      ) => ({
        exec: async () => {
          const key = typeof filter.key === 'string' ? filter.key : null
          if (!key) {
            return null
          }
          let record = records.get(key)
          const inserting = !record
          if (!record) {
            if (!options.upsert) {
              return null
            }
            record = { key, value: '0' }
            records.set(key, record)
          }
          applyUpdate(record, update, { inserting })
          return cloneSecondaryStorageRecord(record)
        }
      })
    ),
    updateOne: vi.fn(
      (
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => ({
        exec: async () => {
          const key = typeof filter.key === 'string' ? filter.key : null
          if (!key) {
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
          }
          let record = findRecord(filter)
          const inserting = !record
          if (!record) {
            if (!options?.upsert) {
              return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
            }
            record = { key, value: '' }
            records.set(key, record)
          }
          applyUpdate(record, update, { inserting })
          return {
            matchedCount: inserting ? 0 : 1,
            modifiedCount: 1,
            upsertedCount: inserting ? 1 : 0
          }
        }
      })
    )
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function secondaryStorageRecordMatches(record: SecondaryStorageRecord, filter: Record<string, unknown>) {
  for (const [field, expected] of Object.entries(filter)) {
    const actual = record[field as keyof SecondaryStorageRecord]
    if (expected instanceof Date) {
      if (!(actual instanceof Date) || actual.getTime() !== expected.getTime()) {
        return false
      }
      continue
    }
    if (actual !== expected) {
      return false
    }
  }
  return true
}

function cloneSecondaryStorageRecord(record: SecondaryStorageRecord | null) {
  return record ? { ...record } : null
}

function createMemoryBetterAuthAdapterStore() {
  const records = new Map<string, StoredRecord[]>()
  let nextId = 1

  const recordsFor = (model: string): StoredRecord[] => records.get(model)?.map(cloneRecord) ?? []

  const mutableRecordsFor = (model: string): StoredRecord[] => {
    const existing = records.get(model)
    if (existing) {
      return existing
    }

    const created: StoredRecord[] = []
    records.set(model, created)
    return created
  }

  const findMatchingRecords = (model: string, where?: Where[]): StoredRecord[] =>
    mutableRecordsFor(model).filter((record) => matchesWhere(record, where))

  const insertRecord = (model: string, data: StoredRecord): StoredRecord => {
    const record = cloneRecord(data)
    mutableRecordsFor(model).push(record)
    return cloneRecord(record)
  }

  const countRecords = async ({ model, where }: CountInput): Promise<number> =>
    findMatchingRecords(model, where).length

  const createRecord = async ({ data, model, select }: CreateInput): Promise<StoredRecord> => {
    const id = typeof data.id === 'string' ? data.id : `${model}-${nextId++}`
    const record = {
      ...data,
      id
    }

    mutableRecordsFor(model).push(record)

    return projectRecord(record, select)
  }

  const deleteRecord = async ({ model, where }: DeleteInput): Promise<void> => {
    const modelRecords = mutableRecordsFor(model)
    const index = modelRecords.findIndex((record) => matchesWhere(record, where))
    if (index >= 0) {
      modelRecords.splice(index, 1)
    }
  }

  const deleteManyRecords = async ({ model, where }: DeleteInput): Promise<number> => {
    const modelRecords = mutableRecordsFor(model)
    const retained = modelRecords.filter((record) => !matchesWhere(record, where))
    const deletedCount = modelRecords.length - retained.length
    records.set(model, retained)
    return deletedCount
  }

  const consumeOneRecord = async ({ model, where }: DeleteInput): Promise<StoredRecord | null> => {
    const record = findMatchingRecords(model, where)[0]
    if (!record) {
      return null
    }

    await deleteRecord({ model, where: [{ field: 'id', value: record.id }] })
    return cloneRecord(record)
  }

  const findManyRecords = async ({
    limit,
    model,
    offset,
    select,
    sortBy,
    where
  }: FindManyInput): Promise<StoredRecord[]> => {
    const matched = findMatchingRecords(model, where)
    const sorted = sortBy ? sortRecords(matched, sortBy) : matched
    const start = offset ?? 0
    const end = typeof limit === 'number' ? start + limit : undefined
    return sorted.slice(start, end).map((record) => projectRecord(record, select))
  }

  const findOneRecord = async ({ model, select, where }: FindOneInput): Promise<StoredRecord | null> => {
    const record = findMatchingRecords(model, where)[0]
    return record ? projectRecord(record, select) : null
  }

  const incrementOneRecord = async ({
    increment,
    model,
    set,
    where
  }: IncrementOneInput): Promise<StoredRecord | null> => {
    const record = findMatchingRecords(model, where)[0]
    if (!record) {
      return null
    }

    for (const [field, delta] of Object.entries(increment)) {
      const current = record[field]
      record[field] = typeof current === 'number' ? current + delta : delta
    }
    Object.assign(record, set)
    return cloneRecord(record)
  }

  const updateRecord = async ({ model, update, where }: UpdateInput): Promise<StoredRecord | null> => {
    const record = findMatchingRecords(model, where)[0]
    if (!record) {
      return null
    }

    Object.assign(record, update)
    return cloneRecord(record)
  }

  const updateManyRecords = async ({ model, update, where }: UpdateInput): Promise<number> => {
    const matched = findMatchingRecords(model, where)
    for (const record of matched) {
      Object.assign(record, update)
    }
    return matched.length
  }

  const adapter: DBAdapter = {
    id: 'agent-auth-route-test-memory',
    count: countRecords,
    create: createRecord as DBAdapter['create'],
    consumeOne: consumeOneRecord as DBAdapter['consumeOne'],
    delete: deleteRecord,
    deleteMany: deleteManyRecords,
    findMany: findManyRecords as DBAdapter['findMany'],
    findOne: findOneRecord as DBAdapter['findOne'],
    incrementOne: incrementOneRecord as DBAdapter['incrementOne'],
    transaction: async <TResult>(callback: (trx: DBTransactionAdapter) => Promise<TResult>) =>
      callback(adapter),
    update: updateRecord as DBAdapter['update'],
    updateMany: updateManyRecords
  }

  return {
    adapter,
    insertRecord,
    recordsFor
  }
}

type CreateInput = {
  data: Record<string, unknown> & {
    id?: unknown
  }
  model: string
  select?: string[]
}

type CountInput = {
  model: string
  where?: Where[]
}

type DeleteInput = {
  model: string
  where: Where[]
}

type FindManyInput = {
  limit?: number
  model: string
  offset?: number
  select?: string[]
  sortBy?: SortBy
  where?: Where[]
}

type FindOneInput = {
  model: string
  select?: string[]
  where: Where[]
}

type IncrementOneInput = {
  increment: Record<string, number>
  model: string
  set?: Record<string, unknown>
  where: Where[]
}

type SortBy = {
  direction: 'asc' | 'desc'
  field: string
}

type UpdateInput = {
  model: string
  update: Record<string, unknown>
  where: Where[]
}

function matchesWhere(record: StoredRecord, where: Where[] | undefined): boolean {
  return (where ?? []).every((clause) => {
    const actual = record[clause.field]
    const expected = clause.value
    const operator = clause.operator ?? 'eq'

    if (operator === 'eq') {
      return actual === expected
    }
    if (operator === 'ne') {
      return actual !== expected
    }
    if (operator === 'in') {
      return Array.isArray(expected) && expected.some((value) => value === actual)
    }
    if (operator === 'not_in') {
      return Array.isArray(expected) && expected.every((value) => value !== actual)
    }
    if (operator === 'contains') {
      return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)
    }
    if (operator === 'starts_with') {
      return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected)
    }
    if (operator === 'ends_with') {
      return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected)
    }

    return compareOrdered(actual, expected, operator)
  })
}

function compareOrdered(actual: unknown, expected: unknown, operator: Where['operator']): boolean {
  const actualValue = orderedValue(actual)
  const expectedValue = orderedValue(expected)

  if (actualValue === null || expectedValue === null) {
    return false
  }
  if (operator === 'lt') {
    return actualValue < expectedValue
  }
  if (operator === 'lte') {
    return actualValue <= expectedValue
  }
  if (operator === 'gt') {
    return actualValue > expectedValue
  }
  if (operator === 'gte') {
    return actualValue >= expectedValue
  }

  return false
}

function orderedValue(value: unknown): number | string | null {
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }
  return null
}

function sortRecords(records: StoredRecord[], sortBy: SortBy): StoredRecord[] {
  return [...records].sort((left, right) => {
    const leftValue = orderedValue(left[sortBy.field])
    const rightValue = orderedValue(right[sortBy.field])

    if (leftValue === rightValue) {
      return 0
    }
    if (leftValue === null) {
      return 1
    }
    if (rightValue === null) {
      return -1
    }

    const result = leftValue > rightValue ? 1 : -1
    return sortBy.direction === 'asc' ? result : -result
  })
}

function projectRecord(record: StoredRecord, select: string[] | undefined): StoredRecord {
  if (!select?.length) {
    return cloneRecord(record)
  }

  const projected: StoredRecord = { id: record.id }
  for (const field of select) {
    if (field in record) {
      projected[field] = record[field]
    }
  }
  return projected
}

function cloneRecord(record: StoredRecord): StoredRecord {
  return { ...record }
}

async function createHostSignedRegistrationToken({
  keySuffix = '1',
  requestUrl
}: {
  keySuffix?: string
  requestUrl: string
}): Promise<{
  agentPublicJwk: JWK
  hostPublicJwk: JWK
  token: string
}> {
  const hostKid = `host-key-${keySuffix}`
  const agentKid = `agent-key-${keySuffix}`
  const hostKeys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  const agentKeys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  const hostPublicJwk = await exportPublicJwk(hostKeys.publicKey, hostKid)
  const agentPublicJwk = await exportPublicJwk(agentKeys.publicKey, agentKid)

  const token = await new SignJWT({
    agent_public_key: agentPublicJwk,
    host_name: 'Local CLI host',
    host_public_key: hostPublicJwk,
    htm: 'POST',
    htu: requestUrl
  })
    .setProtectedHeader({
      alg: 'EdDSA',
      kid: hostKid,
      typ: 'host+jwt'
    })
    .setAudience('https://mail.example.com')
    .setExpirationTime('60s')
    .setIssuedAt()
    .setIssuer(hostKid)
    .setJti(`${hostKid}-${crypto.randomUUID()}`)
    .sign(hostKeys.privateKey)

  return {
    agentPublicJwk,
    hostPublicJwk,
    token
  }
}

async function createPublicJwk(kid: string): Promise<JWK> {
  const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  return exportPublicJwk(keys.publicKey, kid)
}

async function exportPublicJwk(publicKey: CryptoKey, kid: string): Promise<JWK> {
  return withKeyId(await exportJWK(publicKey), kid)
}

function withKeyId(jwk: JWK, kid: string): JWK {
  return {
    ...jwk,
    kid
  }
}

async function hashEnrollmentToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Buffer.from(digest).toString('base64url')
}

async function readJsonResponse(response: Response): Promise<JsonObject> {
  const body = await response.text()
  try {
    return JSON.parse(body) as JsonObject
  } catch {
    return {
      body
    }
  }
}
