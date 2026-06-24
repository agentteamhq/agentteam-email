import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '../db/db'

const enrollmentGrantTestState = vi.hoisted(() => ({
  agentFindById: vi.fn(),
  agentMailAgentEnrollmentGrantRequestFindOne: vi.fn(),
  agentMailAgentEnrollmentGrantRequestUpdateOne: vi.fn(),
  agentMailMailboxGrantUpdateOne: vi.fn(),
  agentMailSystemGrantUpdateOne: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn()
}))

describe('Agent Mail enrollment grant application', () => {
  beforeEach(() => {
    vi.resetModules()
    enrollmentGrantTestState.agentFindById.mockReset()
    enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReset()
    enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestUpdateOne.mockReset()
    enrollmentGrantTestState.agentMailMailboxGrantUpdateOne.mockReset()
    enrollmentGrantTestState.agentMailSystemGrantUpdateOne.mockReset()
    enrollmentGrantTestState.auditLogCreate.mockReset()
    enrollmentGrantTestState.transaction.mockReset()

    enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestUpdateOne.mockReturnValue(
      execResolve({ matchedCount: 1, modifiedCount: 1 })
    )
    enrollmentGrantTestState.agentMailMailboxGrantUpdateOne.mockReturnValue(execResolve({}))
    enrollmentGrantTestState.agentMailSystemGrantUpdateOne.mockReturnValue(execResolve({}))
    enrollmentGrantTestState.auditLogCreate.mockResolvedValue({})
    enrollmentGrantTestState.transaction.mockImplementation((operation: unknown) => {
      const transactionOperation = operation as (session: typeof transactionSession) => unknown
      return transactionOperation(transactionSession)
    })
  })

  it('applies pending enrollment mailbox and system grants to the enrolled agent', async () => {
    expect.hasAssertions()
    const hostId = '01960000-0000-7000-8000-000000000010'
    const agentId = '01960000-0000-7000-8000-000000000011'
    const organizationId = '01960000-0000-7000-8000-000000000012'
    const userId = '01960000-0000-7000-8000-000000000013'
    const grantExpiresAt = new Date('2099-01-01T00:00:00.000Z')
    const db = testDb()

    enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReturnValue(
      execResolve({
        _id: '01960000-0000-7000-8000-000000000014',
        grantExpiresAt,
        hostId,
        mailboxGrants: [
          {
            capabilities: ['readMailbox', 'sendAs', 'readMailbox'],
            mailboxAddress: 'support@example.test'
          }
        ],
        organizationId,
        requestedByUserId: userId,
        systemPermissions: ['manageForwardingGroups']
      })
    )
    enrollmentGrantTestState.agentFindById.mockReturnValue(
      execResolve({
        _id: agentId,
        hostId
      })
    )

    const { applyAgentMailEnrollmentGrantRequestForAgent } = await import('./enrollment-grants')
    const result = await applyAgentMailEnrollmentGrantRequestForAgent({ agentId, db, hostId })

    expect(result).toStrictEqual({
      applied: true,
      mailboxGrantCount: 2,
      status: 'applied',
      systemGrantCount: 1
    })
    expect(enrollmentGrantTestState.agentMailMailboxGrantUpdateOne).toHaveBeenCalledTimes(2)
    expect(enrollmentGrantTestState.agentMailMailboxGrantUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'readMailbox',
        mailboxAddress: 'support@example.test',
        organizationId,
        principalId: agentId,
        principalType: 'agent'
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          expiresAt: grantExpiresAt,
          grantedByUserId: userId,
          status: 'active'
        })
      }),
      { upsert: true }
    )
    expect(enrollmentGrantTestState.agentMailSystemGrantUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        permission: 'manageForwardingGroups',
        principalId: agentId,
        principalType: 'agent'
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          expiresAt: grantExpiresAt,
          grantedByUserId: userId,
          status: 'active'
        })
      }),
      { upsert: true }
    )
    expect(enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestUpdateOne).toHaveBeenCalledWith(
      { _id: '01960000-0000-7000-8000-000000000014', status: 'pending' },
      {
        $set: expect.objectContaining({
          appliedAgentId: agentId,
          status: 'applied'
        })
      }
    )
    expect(enrollmentGrantTestState.auditLogCreate).toHaveBeenCalledWith(
      [
        {
          action: 'agent_mail.agent.enrollment_grants.applied',
          metadata: {
            agentId,
            hostId,
            mailboxGrantCount: 2,
            organizationId,
            systemGrantCount: 1
          },
          severity: 'medium',
          status: 'success',
          userId
        }
      ],
      { session: transactionSession }
    )
  })

  it('expires pending enrollment grants without creating agent grants', async () => {
    expect.hasAssertions()
    const hostId = '01960000-0000-7000-8000-000000000020'
    const agentId = '01960000-0000-7000-8000-000000000021'
    const db = testDb()

    enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReturnValue(
      execResolve({
        _id: '01960000-0000-7000-8000-000000000022',
        grantExpiresAt: new Date('2000-01-01T00:00:00.000Z'),
        hostId,
        mailboxGrants: [
          {
            capabilities: ['readMailbox'],
            mailboxAddress: 'support@example.test'
          }
        ],
        organizationId: '01960000-0000-7000-8000-000000000023',
        requestedByUserId: '01960000-0000-7000-8000-000000000024',
        systemPermissions: ['manageForwardingGroups']
      })
    )

    const { applyAgentMailEnrollmentGrantRequestForAgent } = await import('./enrollment-grants')
    const result = await applyAgentMailEnrollmentGrantRequestForAgent({ agentId, db, hostId })

    expect(result).toStrictEqual({
      applied: false,
      mailboxGrantCount: 0,
      status: 'expired',
      systemGrantCount: 0
    })
    expect(enrollmentGrantTestState.agentFindById).not.toHaveBeenCalled()
    expect(enrollmentGrantTestState.agentMailMailboxGrantUpdateOne).not.toHaveBeenCalled()
    expect(enrollmentGrantTestState.agentMailSystemGrantUpdateOne).not.toHaveBeenCalled()
    expect(enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestUpdateOne).toHaveBeenCalledWith(
      { _id: '01960000-0000-7000-8000-000000000022', status: 'pending' },
      {
        $set: expect.objectContaining({
          status: 'expired'
        })
      }
    )
  })

  it('does not create grants when another agent already claimed the enrollment request', async () => {
    expect.hasAssertions()
    const hostId = '01960000-0000-7000-8000-000000000030'
    const agentId = '01960000-0000-7000-8000-000000000031'
    const db = testDb()

    enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReturnValue(
      execResolve({
        _id: '01960000-0000-7000-8000-000000000032',
        grantExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        hostId,
        mailboxGrants: [
          {
            capabilities: ['readMailbox'],
            mailboxAddress: 'support@example.test'
          }
        ],
        organizationId: '01960000-0000-7000-8000-000000000033',
        requestedByUserId: '01960000-0000-7000-8000-000000000034',
        systemPermissions: ['manageForwardingGroups']
      })
    )
    enrollmentGrantTestState.agentFindById.mockReturnValue(
      execResolve({
        _id: agentId,
        hostId
      })
    )
    enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestUpdateOne.mockReturnValue(
      execResolve({ matchedCount: 0, modifiedCount: 0 })
    )

    const { applyAgentMailEnrollmentGrantRequestForAgent } = await import('./enrollment-grants')
    const result = await applyAgentMailEnrollmentGrantRequestForAgent({ agentId, db, hostId })

    expect(result).toStrictEqual({
      applied: false,
      mailboxGrantCount: 0,
      status: 'missing',
      systemGrantCount: 0
    })
    expect(enrollmentGrantTestState.agentMailMailboxGrantUpdateOne).not.toHaveBeenCalled()
    expect(enrollmentGrantTestState.agentMailSystemGrantUpdateOne).not.toHaveBeenCalled()
    expect(enrollmentGrantTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('keeps the request claim and grant writes in one transaction when a grant write fails', async () => {
    expect.hasAssertions()
    const hostId = '01960000-0000-7000-8000-000000000040'
    const agentId = '01960000-0000-7000-8000-000000000041'
    const claimQuery = execResolve({ matchedCount: 1, modifiedCount: 1 })
    const mailboxGrantQuery = execReject(new Error('grant write failed'))
    const db = testDb()

    enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestFindOne.mockReturnValue(
      execResolve({
        _id: '01960000-0000-7000-8000-000000000042',
        grantExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        hostId,
        mailboxGrants: [
          {
            capabilities: ['readMailbox'],
            mailboxAddress: 'support@example.test'
          }
        ],
        organizationId: '01960000-0000-7000-8000-000000000043',
        requestedByUserId: '01960000-0000-7000-8000-000000000044',
        systemPermissions: []
      })
    )
    enrollmentGrantTestState.agentFindById.mockReturnValue(
      execResolve({
        _id: agentId,
        hostId
      })
    )
    enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestUpdateOne.mockReturnValue(claimQuery)
    enrollmentGrantTestState.agentMailMailboxGrantUpdateOne.mockReturnValue(mailboxGrantQuery)

    const { applyAgentMailEnrollmentGrantRequestForAgent } = await import('./enrollment-grants')
    await expect(applyAgentMailEnrollmentGrantRequestForAgent({ agentId, db, hostId })).rejects.toThrow(
      'grant write failed'
    )

    expect(enrollmentGrantTestState.transaction).toHaveBeenCalledTimes(1)
    expect(claimQuery.session).toHaveBeenCalledWith(transactionSession)
    expect(mailboxGrantQuery.session).toHaveBeenCalledWith(transactionSession)
    expect(enrollmentGrantTestState.auditLogCreate).not.toHaveBeenCalled()
  })
})

const transactionSession = { id: 'transaction-session' }

function testDb() {
  return {
    connection: {
      transaction: enrollmentGrantTestState.transaction
    },
    models: {
      agent: {
        findById: enrollmentGrantTestState.agentFindById
      },
      agentMailAgentEnrollmentGrantRequest: {
        findOne: enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestFindOne,
        updateOne: enrollmentGrantTestState.agentMailAgentEnrollmentGrantRequestUpdateOne
      },
      agentMailMailboxGrant: {
        updateOne: enrollmentGrantTestState.agentMailMailboxGrantUpdateOne
      },
      agentMailSystemGrant: {
        updateOne: enrollmentGrantTestState.agentMailSystemGrantUpdateOne
      },
      auditLog: {
        create: enrollmentGrantTestState.auditLogCreate
      }
    }
  } as unknown as Database
}

function execResolve<T>(value: T) {
  const query = {
    exec: vi.fn(() => Promise.resolve(value)),
    session: vi.fn(() => query)
  }
  return query
}

function execReject(error: Error) {
  const query = {
    exec: vi.fn(() => Promise.reject(error)),
    session: vi.fn(() => query)
  }
  return query
}
