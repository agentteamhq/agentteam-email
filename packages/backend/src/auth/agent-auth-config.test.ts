import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentMailCapabilityValues } from '@main/db'
import type { AgentAuthEvent } from '@better-auth/agent-auth'
import type { Database } from '../db/db'

describe('Agent Auth configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
  })

  it('advertises only backend-owned email capabilities and rejects unknown capability values', async () => {
    expect.hasAssertions()

    const {
      AGENT_AUTH_CAPABILITIES,
      AGENT_AUTH_PUBLIC_RATE_LIMIT_RULES,
      createAgentAuthOptions,
      isAgentMailCapability
    } = await import('./agent-auth-config')
    const auditLogCreate = vi.fn()
    const options = createAgentAuthOptions({
      models: {
        auditLog: {
          create: auditLogCreate
        }
      }
    } as unknown as Database)

    expect(AGENT_AUTH_CAPABILITIES.map((capability) => capability.name)).toStrictEqual(
      AgentMailCapabilityValues
    )
    for (const capability of AGENT_AUTH_CAPABILITIES) {
      expect(capability.requiredConstraints).toStrictEqual(
        capability.name.startsWith('email.message.') ? ['mailboxAddress'] : []
      )
    }
    expect(options.allowDynamicHostRegistration).toBe(true)
    expect(options.defaultHostCapabilities).toStrictEqual([])
    expect(options.proofOfPresence).toStrictEqual({ enabled: true })
    expect(AGENT_AUTH_PUBLIC_RATE_LIMIT_RULES).toStrictEqual({
      '/agent/claim': {
        max: 10,
        window: 60
      },
      '/agent/register': {
        max: 5,
        window: 60
      },
      '/host/enroll': {
        max: 5,
        window: 60
      }
    })
    expect(options.rateLimit).toStrictEqual(AGENT_AUTH_PUBLIC_RATE_LIMIT_RULES)
    expect(options.validateCapabilities?.(['email.message.read', 'email.message.send'])).toBe(true)
    expect(options.validateCapabilities?.(['email.message.read', 'email.unknown'])).toBe(false)
    expect(isAgentMailCapability('email.message.read')).toBe(true)
    expect(isAgentMailCapability('email.unknown')).toBe(false)
  })

  it('validates Agent Mail capability request constraints with backend-owned schemas', async () => {
    expect.hasAssertions()

    const { isValidAgentMailCapabilityRequestBody } = await import('./agent-auth-config')

    expect(
      isValidAgentMailCapabilityRequestBody({
        capabilities: [
          {
            constraints: {
              mailboxAddress: 'support@example.com'
            },
            name: 'email.message.list'
          },
          {
            constraints: {
              allowedRecipientDomains: ['example.com'],
              allowedRecipientPatterns: ['*@example.com'],
              allowedRecipients: ['ops@example.com'],
              mailboxAddress: 'support@example.com'
            },
            name: 'email.message.send'
          },
          {
            constraints: {},
            name: 'email.status'
          }
        ]
      })
    ).toBe(true)
    expect(
      isValidAgentMailCapabilityRequestBody({
        capabilities: ['email.status']
      })
    ).toBe(false)
    expect(
      isValidAgentMailCapabilityRequestBody({
        capabilities: [
          {
            constraints: {
              organizationId: 'org-1'
            },
            name: 'email.unknown'
          }
        ]
      })
    ).toBe(false)
    expect(
      isValidAgentMailCapabilityRequestBody({
        capabilities: [
          {
            constraints: {
              mailboxAddress: 'support@example.com',
              organizationId: 'org-1'
            },
            name: 'email.message.read'
          }
        ]
      })
    ).toBe(false)
    expect(
      isValidAgentMailCapabilityRequestBody({
        capabilities: [
          {
            constraints: {
              mailboxAddress: 'not-an-email',
              organizationId: 'org-1'
            },
            name: 'email.message.send'
          }
        ]
      })
    ).toBe(false)
    expect(
      isValidAgentMailCapabilityRequestBody({
        capabilities: [
          {
            constraints: {
              allowedRecipients: ['not-an-email'],
              mailboxAddress: 'support@example.com',
              organizationId: 'org-1'
            },
            name: 'email.message.send'
          }
        ]
      })
    ).toBe(false)
  })

  it('records sanitized Agent Auth audit metadata without raw request payloads or outputs', async () => {
    expect.hasAssertions()

    const { createAgentAuthOptions } = await import('./agent-auth-config')
    const auditLogCreate = vi.fn()
    const options = createAgentAuthOptions({
      models: {
        auditLog: {
          create: auditLogCreate
        }
      }
    } as unknown as Database)

    await options.onEvent?.({
      actorId: 'user-1',
      actorType: 'user',
      agentId: 'agent-1',
      args: {
        Authorization: 'Bearer secret-token'
      },
      capability: 'email.message.read',
      hostId: 'host-1',
      orgId: 'org-1',
      output: {
        token: 'secret-token'
      },
      status: 'success',
      targetId: 'grant-1',
      targetType: 'grant',
      type: 'capability.granted'
    } as AgentAuthEvent)

    expect(auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_auth.capability.granted',
      metadata: {
        actorId: 'user-1',
        actorType: 'user',
        agentId: 'agent-1',
        capability: 'email.message.read',
        hostId: 'host-1',
        orgId: 'org-1',
        status: 'success',
        targetId: 'grant-1',
        targetType: 'grant',
        type: 'capability.granted'
      },
      severity: 'low',
      status: 'success'
    })
    expect(JSON.stringify(auditLogCreate.mock.calls)).not.toContain('secret-token')
    expect(JSON.stringify(auditLogCreate.mock.calls)).not.toContain('Authorization')
  })

  it('applies pending human-approved enrollment grants when an enrolled agent is created', async () => {
    expect.hasAssertions()
    const hostId = '01960000-0000-7000-8000-000000000010'
    const agentId = '01960000-0000-7000-8000-000000000011'
    const organizationId = '01960000-0000-7000-8000-000000000012'
    const userId = '01960000-0000-7000-8000-000000000013'
    const grantRequestUpdateOne = vi.fn(() => execResolve({ matchedCount: 1 }))
    const mailboxGrantUpdateOne = vi.fn(() => execResolve({}))
    const systemGrantUpdateOne = vi.fn(() => execResolve({}))
    const auditLogCreate = vi.fn()
    const transaction = vi.fn((operation: unknown) => {
      const transactionOperation = operation as (session: typeof transactionSession) => unknown
      return transactionOperation(transactionSession)
    })
    const { createAgentAuthOptions } = await import('./agent-auth-config')
    const options = createAgentAuthOptions({
      connection: {
        transaction
      },
      models: {
        agent: {
          findById: vi.fn(() =>
            execResolve({
              _id: agentId,
              hostId
            })
          )
        },
        agentMailAgentEnrollmentGrantRequest: {
          findOne: vi.fn(() =>
            execResolve({
              _id: '01960000-0000-7000-8000-000000000014',
              grantExpiresAt: null,
              hostId,
              mailboxGrants: [
                {
                  capabilities: ['readMailbox'],
                  mailboxAddress: 'support@example.test'
                }
              ],
              organizationId,
              requestedByUserId: userId,
              systemPermissions: ['manageForwardingGroups']
            })
          ),
          updateOne: grantRequestUpdateOne
        },
        agentMailMailboxGrant: {
          updateOne: mailboxGrantUpdateOne
        },
        agentMailSystemGrant: {
          updateOne: systemGrantUpdateOne
        },
        auditLog: {
          create: auditLogCreate
        }
      }
    } as unknown as Database)

    await options.onEvent?.({
      agentId,
      hostId,
      metadata: {
        name: 'Research Agent'
      },
      type: 'agent.created'
    })

    expect(mailboxGrantUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'readMailbox',
        mailboxAddress: 'support@example.test',
        organizationId,
        principalId: agentId,
        principalType: 'agent'
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'active'
        })
      }),
      { upsert: true }
    )
    expect(systemGrantUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        permission: 'manageForwardingGroups',
        principalId: agentId,
        principalType: 'agent'
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'active'
        })
      }),
      { upsert: true }
    )
    expect(grantRequestUpdateOne).toHaveBeenCalledWith(
      { _id: '01960000-0000-7000-8000-000000000014', status: 'pending' },
      {
        $set: expect.objectContaining({
          appliedAgentId: agentId,
          status: 'applied'
        })
      }
    )
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(auditLogCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          action: 'agent_mail.agent.enrollment_grants.applied',
          status: 'success'
        })
      ],
      { session: transactionSession }
    )
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent_auth.agent.created',
        status: 'success'
      })
    )
  })
})

const transactionSession = { id: 'transaction-session' }

function execResolve<T>(value: T) {
  const query = {
    exec: vi.fn(() => Promise.resolve(value)),
    session: vi.fn(() => query)
  }
  return query
}
