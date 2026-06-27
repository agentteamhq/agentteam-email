import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const trialServiceTestState = vi.hoisted(() => ({
  agentCapabilityGrantFind: vi.fn(),
  agentCapabilityGrantCreate: vi.fn(),
  agentCapabilityGrantUpdateOne: vi.fn(),
  agentCreate: vi.fn(),
  agentFindById: vi.fn(),
  agentFindOne: vi.fn(),
  agentUpdateOne: vi.fn(),
  agentHostFindById: vi.fn(),
  agentHostCreate: vi.fn(),
  agentHostFindOne: vi.fn(),
  agentHostUpdateOne: vi.fn(),
  agentMailMailboxGrantFind: vi.fn(),
  agentMailSystemGrantFind: vi.fn(),
  agentMailTrialClaimIntentFindOne: vi.fn(),
  agentMailTrialClaimIntentCreate: vi.fn(),
  agentMailTrialClaimIntentUpdateOne: vi.fn(),
  agentMailTrialCountDocuments: vi.fn(),
  agentMailTrialCreate: vi.fn(),
  agentMailTrialFindById: vi.fn(),
  agentMailTrialUpdateOne: vi.fn(),
  auditLogCreate: vi.fn(),
  authGetSession: vi.fn(),
  createUser: vi.fn(),
  createWildDuckClient: vi.fn(),
  deleteUser: vi.fn(),
  globals: vi.fn(),
  memberFind: vi.fn(),
  memberFindOne: vi.fn(),
  organizationFind: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('../globals', () => ({
  globals: trialServiceTestState.globals
}))

vi.mock('../agent-mail/wildduck-client', () => ({
  createWildDuckClient: trialServiceTestState.createWildDuckClient
}))

const organizationId = '01960000-0000-7000-8000-0000000000aa'
const claimOrganizationId = '01960000-0000-7000-8000-0000000000bb'
const claimUserId = '01960000-0000-7000-8000-0000000000cc'
const trialId = '01960000-0000-7000-8000-0000000000dd'
const claimIntentId = '01960000-0000-7000-8000-0000000000ee'
const agentId = '01960000-0000-7000-8000-0000000000ff'
const hostId = '01960000-0000-7000-8000-0000000000a1'
const capabilityGrantId = '01960000-0000-7000-8000-0000000000a2'
const claimToken = 'claim-token'

describe('Agent Mail autonomous trial service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    vi.stubEnv('AT_EMAIL_ADMIN_TRIAL_ENABLED', 'true')
    vi.stubEnv('AT_EMAIL_ADMIN_TRIAL_ORGANIZATION_ID', organizationId)
    vi.stubEnv('AT_EMAIL_ADMIN_TRIAL_DOMAIN', 'trial.example.test')
    vi.stubEnv('AT_EMAIL_ADMIN_TRIAL_ADMISSION_TOKEN', 'trial-admission-token')
    vi.stubEnv(
      'AT_EMAIL_ADMIN_TRIAL_CAPABILITIES',
      [
        'email.status',
        'email.message.list',
        'email.message.read',
        'email.message.search',
        'email.message.create_draft',
        'email.message.send',
        'email.message.reply'
      ].join(',')
    )

    trialServiceTestState.agentCapabilityGrantFind.mockReset()
    trialServiceTestState.agentCapabilityGrantCreate.mockReset()
    trialServiceTestState.agentCapabilityGrantUpdateOne.mockReset()
    trialServiceTestState.agentCreate.mockReset()
    trialServiceTestState.agentFindById.mockReset()
    trialServiceTestState.agentFindOne.mockReset()
    trialServiceTestState.agentUpdateOne.mockReset()
    trialServiceTestState.agentHostFindById.mockReset()
    trialServiceTestState.agentHostCreate.mockReset()
    trialServiceTestState.agentHostFindOne.mockReset()
    trialServiceTestState.agentHostUpdateOne.mockReset()
    trialServiceTestState.agentMailMailboxGrantFind.mockReset()
    trialServiceTestState.agentMailSystemGrantFind.mockReset()
    trialServiceTestState.agentMailTrialClaimIntentFindOne.mockReset()
    trialServiceTestState.agentMailTrialClaimIntentCreate.mockReset()
    trialServiceTestState.agentMailTrialClaimIntentUpdateOne.mockReset()
    trialServiceTestState.agentMailTrialCountDocuments.mockReset()
    trialServiceTestState.agentMailTrialCreate.mockReset()
    trialServiceTestState.agentMailTrialFindById.mockReset()
    trialServiceTestState.agentMailTrialUpdateOne.mockReset()
    trialServiceTestState.auditLogCreate.mockReset()
    trialServiceTestState.authGetSession.mockReset()
    trialServiceTestState.createUser.mockReset()
    trialServiceTestState.createWildDuckClient.mockReset()
    trialServiceTestState.deleteUser.mockReset()
    trialServiceTestState.globals.mockReset()
    trialServiceTestState.memberFind.mockReset()
    trialServiceTestState.memberFindOne.mockReset()
    trialServiceTestState.organizationFind.mockReset()
    trialServiceTestState.transaction.mockReset()

    trialServiceTestState.authGetSession.mockResolvedValue(null)
    trialServiceTestState.agentFindOne.mockReturnValue({ exec: () => Promise.resolve(null) })
    trialServiceTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(null) })
    trialServiceTestState.agentUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 })
    })
    trialServiceTestState.agentHostFindOne.mockReturnValue({ exec: () => Promise.resolve(null) })
    trialServiceTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(null) })
    trialServiceTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    trialServiceTestState.agentCapabilityGrantUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 })
    })
    trialServiceTestState.agentHostUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 })
    })
    trialServiceTestState.agentMailMailboxGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    trialServiceTestState.agentMailSystemGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    trialServiceTestState.agentMailTrialClaimIntentFindOne.mockReturnValue({
      exec: () => Promise.resolve(null)
    })
    trialServiceTestState.agentMailTrialClaimIntentUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 })
    })
    trialServiceTestState.agentMailTrialCountDocuments.mockReturnValue({
      exec: () => Promise.resolve(0)
    })
    trialServiceTestState.agentCapabilityGrantCreate.mockImplementation((input: unknown) =>
      Promise.resolve(input)
    )
    trialServiceTestState.agentCreate.mockImplementation((input: unknown) => Promise.resolve(input))
    trialServiceTestState.agentHostCreate.mockImplementation((input: unknown) => Promise.resolve(input))
    trialServiceTestState.agentMailTrialFindById.mockReturnValue({ exec: () => Promise.resolve(null) })
    trialServiceTestState.agentMailTrialUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 })
    })
    trialServiceTestState.agentMailTrialClaimIntentCreate.mockImplementation((input: unknown) =>
      Promise.resolve(input)
    )
    trialServiceTestState.agentMailTrialCreate.mockImplementation((input: unknown) => Promise.resolve(input))
    trialServiceTestState.auditLogCreate.mockImplementation((input: unknown) => Promise.resolve(input))
    trialServiceTestState.createUser.mockResolvedValue({ id: 'wildduck-user-1' })
    trialServiceTestState.deleteUser.mockResolvedValue({ success: true })
    trialServiceTestState.createWildDuckClient.mockReturnValue({
      createUser: trialServiceTestState.createUser,
      deleteUser: trialServiceTestState.deleteUser
    })
    trialServiceTestState.memberFindOne.mockReturnValue({ exec: () => Promise.resolve(null) })
    trialServiceTestState.memberFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    trialServiceTestState.organizationFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    trialServiceTestState.transaction.mockImplementation((operation: (session: object) => unknown) =>
      operation({ id: 'transaction-session' })
    )
    trialServiceTestState.globals.mockResolvedValue({
      auth: {
        api: {
          getSession: trialServiceTestState.authGetSession
        }
      },
      db: {
        models: {
          agent: {
            create: trialServiceTestState.agentCreate,
            findById: trialServiceTestState.agentFindById,
            findOne: trialServiceTestState.agentFindOne,
            updateOne: trialServiceTestState.agentUpdateOne
          },
          agentCapabilityGrant: {
            create: trialServiceTestState.agentCapabilityGrantCreate,
            find: trialServiceTestState.agentCapabilityGrantFind,
            updateOne: trialServiceTestState.agentCapabilityGrantUpdateOne
          },
          agentHost: {
            create: trialServiceTestState.agentHostCreate,
            findById: trialServiceTestState.agentHostFindById,
            findOne: trialServiceTestState.agentHostFindOne,
            updateOne: trialServiceTestState.agentHostUpdateOne
          },
          agentMailMailboxGrant: {
            find: trialServiceTestState.agentMailMailboxGrantFind
          },
          agentMailSystemGrant: {
            find: trialServiceTestState.agentMailSystemGrantFind
          },
          agentMailTrial: {
            countDocuments: trialServiceTestState.agentMailTrialCountDocuments,
            create: trialServiceTestState.agentMailTrialCreate,
            findById: trialServiceTestState.agentMailTrialFindById,
            updateOne: trialServiceTestState.agentMailTrialUpdateOne
          },
          agentMailTrialClaimIntent: {
            create: trialServiceTestState.agentMailTrialClaimIntentCreate,
            findOne: trialServiceTestState.agentMailTrialClaimIntentFindOne,
            updateOne: trialServiceTestState.agentMailTrialClaimIntentUpdateOne
          },
          auditLog: {
            create: trialServiceTestState.auditLogCreate
          },
          member: {
            find: trialServiceTestState.memberFind,
            findOne: trialServiceTestState.memberFindOne
          },
          organization: {
            find: trialServiceTestState.organizationFind
          }
        },
        connection: {
          transaction: trialServiceTestState.transaction
        }
      }
    })
  })

  it('fails closed without provisioning when trials are disabled', async () => {
    expect.hasAssertions()

    vi.stubEnv('AT_EMAIL_ADMIN_TRIAL_ENABLED', 'false')

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(startAgentMailTrial(validTrialRequest())).rejects.toMatchObject({
      message: 'Agent Mail trials are not enabled',
      status: 503
    })
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostCreate).not.toHaveBeenCalled()
  })

  it('fails closed without provisioning when trial admission is not configured', async () => {
    expect.hasAssertions()

    vi.stubEnv('AT_EMAIL_ADMIN_TRIAL_ADMISSION_TOKEN', '')

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(startAgentMailTrial(validTrialRequest())).rejects.toMatchObject({
      message: 'Agent Mail trial admission is not configured',
      status: 503
    })
    expect(trialServiceTestState.agentMailTrialCountDocuments).not.toHaveBeenCalled()
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostCreate).not.toHaveBeenCalled()
  })

  it('fails closed without provisioning when trial admission is missing', async () => {
    expect.hasAssertions()

    const { startAgentMailTrial } = await import('./trial-service')
    const { admission_token: _admissionToken, ...request } = validTrialRequest()

    await expect(startAgentMailTrial(request)).rejects.toMatchObject({
      message: 'Agent Mail trial admission is required',
      status: 403
    })
    expect(trialServiceTestState.agentMailTrialCountDocuments).not.toHaveBeenCalled()
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostCreate).not.toHaveBeenCalled()
  })

  it('fails closed without provisioning when trial admission is invalid', async () => {
    expect.hasAssertions()

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(
      startAgentMailTrial({
        ...validTrialRequest(),
        admission_token: 'wrong-trial-token'
      })
    ).rejects.toMatchObject({
      message: 'Agent Mail trial admission is not authorized',
      status: 403
    })
    expect(trialServiceTestState.agentMailTrialCountDocuments).not.toHaveBeenCalled()
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostCreate).not.toHaveBeenCalled()
  })

  it('rejects new autonomous trials before provisioning when active trial capacity is reached', async () => {
    expect.hasAssertions()

    vi.stubEnv('AT_EMAIL_ADMIN_TRIAL_MAX_ACTIVE', '2')
    trialServiceTestState.agentMailTrialCountDocuments.mockReturnValue({
      exec: () => Promise.resolve(2)
    })

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(startAgentMailTrial(validTrialRequest())).rejects.toMatchObject({
      message: 'Agent Mail trial capacity has been reached',
      status: 429
    })
    expect(trialServiceTestState.agentMailTrialCountDocuments).toHaveBeenCalledWith({
      expiresAt: { $gt: expect.any(Date) },
      status: 'active'
    })
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostCreate).not.toHaveBeenCalled()
  })

  it('provisions an autonomous trial with constrained CASL-compatible grants and hashed claim state', async () => {
    expect.hasAssertions()

    const { startAgentMailTrial } = await import('./trial-service')

    const result = await startAgentMailTrial(validTrialRequest())

    expect(result.status).toBe('active')
    expect(result.mode).toBe('autonomous')
    expect(result.mailbox.address).toMatch(/^trial-[a-f0-9]{16}@trial\.example\.test$/u)
    expect(result.claim.url).toMatch(/^https:\/\/mail\.example\.com\/agent\/claim\/[A-Za-z0-9_-]+$/u)
    expect(result.post_claim_capabilities).toStrictEqual(result.capabilities)
    expect(JSON.stringify(result)).not.toContain('password')
    expect(JSON.stringify(result)).not.toContain('tokenHash')
    expect(JSON.stringify(result)).not.toContain('"d"')
    expect(JSON.stringify(result)).not.toContain('wildduck-user-1')

    expect(trialServiceTestState.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        address: result.mailbox.address,
        allowUnsafe: false,
        name: 'Test trial agent',
        spamLevel: 0,
        username: result.mailbox.address
      })
    )
    expect(JSON.stringify(trialServiceTestState.createUser.mock.calls[0])).not.toContain('wildduck-token')

    expect(trialServiceTestState.transaction).toHaveBeenCalledOnce()
    expect(trialServiceTestState.agentHostCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          defaultCapabilities: '[]',
          publicKey: JSON.stringify(validHostPublicKey()),
          status: 'active',
          userId: null
        })
      ]),
      expect.objectContaining({ session: expect.objectContaining({ id: 'transaction-session' }) })
    )
    expect(trialServiceTestState.agentCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          mode: 'autonomous',
          publicKey: JSON.stringify(validAgentPublicKey()),
          status: 'active',
          userId: null
        })
      ]),
      expect.objectContaining({ session: expect.objectContaining({ id: 'transaction-session' }) })
    )

    const grantInputs = trialServiceTestState.agentCapabilityGrantCreate.mock.calls.map(
      ([input]) => (Array.isArray(input) ? input[0] : input) as Record<string, unknown>
    )
    expect(grantInputs.map((grant) => grant.capability).sort()).toStrictEqual(
      [
        'email.message.create_draft',
        'email.message.list',
        'email.message.read',
        'email.message.reply',
        'email.message.search',
        'email.message.send',
        'email.status'
      ].sort()
    )
    expect(grantInputs).not.toContainEqual(
      expect.objectContaining({
        capability: expect.stringMatching(/^email\.(agent|mailbox|forwarding_group)\./u)
      })
    )
    expect(grantInputs.find((grant) => grant.capability === 'email.status')).toMatchObject({
      constraints: { organizationId },
      grantedBy: null,
      reason: 'autonomous_trial',
      status: 'active'
    })
    expect(grantInputs.find((grant) => grant.capability === 'email.message.read')).toMatchObject({
      constraints: { mailboxAddress: result.mailbox.address, organizationId },
      status: 'active'
    })

    const claimIntentInput = trialServiceTestState.agentMailTrialClaimIntentCreate.mock.calls[0]?.[0] as
      | ReadonlyArray<Record<string, unknown>>
      | undefined
    const claimIntent = claimIntentInput?.[0]
    expect(claimIntent).toMatchObject({
      approvedByUserId: null,
      status: 'pending',
      targetOrganizationId: null
    })
    expect(claimIntent?.tokenHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.claim.url).not.toContain(String(claimIntent?.tokenHash))

    expect(trialServiceTestState.agentMailTrialCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          capabilities: expect.arrayContaining([...result.capabilities]),
          dailySendLimit: 10,
          mailboxAddress: result.mailbox.address,
          postClaimCapabilities: expect.arrayContaining([...result.post_claim_capabilities]),
          status: 'active',
          totalSendLimit: 50,
          wildDuckUserId: 'wildduck-user-1'
        })
      ]),
      expect.objectContaining({ session: expect.objectContaining({ id: 'transaction-session' }) })
    )
    expect(trialServiceTestState.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent_mail.trial.started',
        metadata: expect.not.objectContaining({
          tokenHash: expect.anything()
        }),
        severity: 'low',
        status: 'success'
      })
    )
  })

  it('stores requested post-claim capabilities separately from pre-claim trial grants', async () => {
    expect.hasAssertions()

    const { startAgentMailTrial } = await import('./trial-service')

    const result = await startAgentMailTrial({
      ...validTrialRequest(),
      capabilities: ['email.status'],
      post_claim_capabilities: ['email.message.read']
    })

    expect(result.capabilities).toStrictEqual(['email.status'])
    expect(result.post_claim_capabilities).toStrictEqual(['email.message.read'])
    expect(trialServiceTestState.agentCapabilityGrantCreate).toHaveBeenCalledTimes(1)
    expect(trialServiceTestState.agentCapabilityGrantCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          capability: 'email.status'
        })
      ]),
      expect.objectContaining({ session: expect.objectContaining({ id: 'transaction-session' }) })
    )
    expect(trialServiceTestState.agentMailTrialCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          capabilities: ['email.status'],
          postClaimCapabilities: ['email.message.read']
        })
      ]),
      expect.objectContaining({ session: expect.objectContaining({ id: 'transaction-session' }) })
    )
  })

  it('rejects private JWK material before touching WildDuck or Agent Auth rows', async () => {
    expect.hasAssertions()

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(
      startAgentMailTrial({
        ...validTrialRequest(),
        agent_public_key: {
          ...validAgentPublicKey(),
          d: 'private-key-material'
        }
      })
    ).rejects.toMatchObject({
      message: 'Invalid Agent Mail trial request',
      status: 400
    })
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostCreate).not.toHaveBeenCalled()
  })

  it('rejects reused trial host keys before touching WildDuck or Agent Auth rows', async () => {
    expect.hasAssertions()

    trialServiceTestState.agentHostFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: hostId,
          kid: validHostPublicKey().kid,
          publicKey: JSON.stringify(validHostPublicKey()),
          status: 'active'
        })
    })
    const { startAgentMailTrial } = await import('./trial-service')

    await expect(startAgentMailTrial(validTrialRequest())).rejects.toMatchObject({
      message: 'Trial host or agent key is already registered',
      status: 409
    })

    expect(trialServiceTestState.agentHostFindOne).toHaveBeenCalledWith({
      $or: [{ publicKey: JSON.stringify(validHostPublicKey()) }, { kid: validHostPublicKey().kid }]
    })
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostCreate).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentCreate).not.toHaveBeenCalled()
  })

  it('rejects reused trial agent keys before touching WildDuck or Agent Auth rows', async () => {
    expect.hasAssertions()

    trialServiceTestState.agentFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: agentId,
          publicKey: JSON.stringify(validAgentPublicKey()),
          status: 'active'
        })
    })
    const { startAgentMailTrial } = await import('./trial-service')

    await expect(startAgentMailTrial(validTrialRequest())).rejects.toMatchObject({
      message: 'Trial host or agent key is already registered',
      status: 409
    })

    expect(trialServiceTestState.agentFindOne).toHaveBeenCalledWith({
      publicKey: JSON.stringify(validAgentPublicKey())
    })
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostCreate).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentCreate).not.toHaveBeenCalled()
  })

  it('rejects configured trial capabilities outside the trial-safe contract', async () => {
    expect.hasAssertions()

    vi.stubEnv('AT_EMAIL_ADMIN_TRIAL_CAPABILITIES', 'email.status,email.agent.manage')

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(startAgentMailTrial(validTrialRequest())).rejects.toMatchObject({
      message: 'Agent Mail trial capabilities are invalid',
      status: 503
    })
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
  })

  it('does not let a request broaden capabilities beyond server policy', async () => {
    expect.hasAssertions()

    vi.stubEnv('AT_EMAIL_ADMIN_TRIAL_CAPABILITIES', 'email.status')

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(
      startAgentMailTrial({
        ...validTrialRequest(),
        capabilities: ['email.status'],
        post_claim_capabilities: ['email.message.read']
      })
    ).rejects.toMatchObject({
      message: 'Requested trial capability is not allowed by server policy',
      status: 400
    })
    expect(trialServiceTestState.createWildDuckClient).not.toHaveBeenCalled()
  })

  it('deletes the WildDuck trial user if DB provisioning fails after mailbox creation', async () => {
    expect.hasAssertions()

    const dbFailure = new Error('agent host write failed')
    trialServiceTestState.agentHostCreate.mockRejectedValueOnce(dbFailure)

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(startAgentMailTrial(validTrialRequest())).rejects.toBe(dbFailure)

    expect(trialServiceTestState.createUser).toHaveBeenCalled()
    expect(trialServiceTestState.deleteUser).toHaveBeenCalledWith('wildduck-user-1')
    expect(trialServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.trial.provisioning_failed',
      metadata: expect.objectContaining({
        cleanupStatus: 'deleted',
        errorName: 'Error',
        mailboxAddress: expect.stringMatching(/^trial-[a-f0-9]{16}@trial\.example\.test$/u),
        wildDuckUserId: 'wildduck-user-1'
      }),
      severity: 'high',
      status: 'failed'
    })
  })

  it('keeps trial startup writes inside a database transaction when a later DB write fails', async () => {
    expect.hasAssertions()

    const dbFailure = new Error('claim intent write failed')
    trialServiceTestState.agentMailTrialClaimIntentCreate.mockRejectedValueOnce(dbFailure)

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(startAgentMailTrial(validTrialRequest())).rejects.toBe(dbFailure)

    expect(trialServiceTestState.transaction).toHaveBeenCalledOnce()
    expect(trialServiceTestState.agentHostCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ status: 'active' })]),
      expect.objectContaining({ session: expect.objectContaining({ id: 'transaction-session' }) })
    )
    expect(trialServiceTestState.agentCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ status: 'active' })]),
      expect.objectContaining({ session: expect.objectContaining({ id: 'transaction-session' }) })
    )
    expect(trialServiceTestState.agentMailTrialCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'active', wildDuckUserId: 'wildduck-user-1' })
      ]),
      expect.objectContaining({ session: expect.objectContaining({ id: 'transaction-session' }) })
    )
    expect(trialServiceTestState.agentMailTrialClaimIntentCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ status: 'pending' })]),
      expect.objectContaining({ session: expect.objectContaining({ id: 'transaction-session' }) })
    )
    expect(trialServiceTestState.deleteUser).toHaveBeenCalledWith('wildduck-user-1')
  })

  it('reports cleanup failure if the WildDuck trial user cannot be deleted after DB provisioning fails', async () => {
    expect.hasAssertions()

    trialServiceTestState.agentHostCreate.mockRejectedValueOnce(new Error('agent host write failed'))
    trialServiceTestState.deleteUser.mockRejectedValueOnce(new Error('wildduck delete failed'))

    const { startAgentMailTrial } = await import('./trial-service')

    await expect(startAgentMailTrial(validTrialRequest())).rejects.toThrow(AggregateError)

    expect(trialServiceTestState.deleteUser).toHaveBeenCalledWith('wildduck-user-1')
    expect(trialServiceTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'agent_mail.trial.provisioning_failed',
      metadata: expect.objectContaining({
        cleanupErrorName: 'Error',
        cleanupStatus: 'failed',
        errorName: 'Error',
        mailboxAddress: expect.stringMatching(/^trial-[a-f0-9]{16}@trial\.example\.test$/u),
        wildDuckUserId: 'wildduck-user-1'
      }),
      severity: 'high',
      status: 'failed'
    })
  })

  it('requires a signed-in user before looking up an autonomous trial claim token', async () => {
    expect.hasAssertions()

    const { getAgentMailTrialClaimForWeb } = await import('./trial-service')

    await expect(
      getAgentMailTrialClaimForWeb({
        headers: new Headers(),
        token: claimToken
      })
    ).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(trialServiceTestState.agentMailTrialClaimIntentFindOne).not.toHaveBeenCalled()
  })

  it('returns a trial claim preview only after CASL claim authorization', async () => {
    expect.hasAssertions()

    setupAuthenticatedClaimContext('admin')
    setupClaimRecords()

    const { getAgentMailTrialClaimForWeb } = await import('./trial-service')

    const result = await getAgentMailTrialClaimForWeb({
      headers: new Headers({ authorization: 'Bearer user-session' }),
      token: claimToken
    })

    expect(result).toMatchObject({
      agent: {
        name: 'Trial agent',
        status: 'active'
      },
      capabilities: ['email.status', 'email.message.read'],
      claim: {
        status: 'pending'
      },
      mailbox: {
        address: 'trial-agent@trial.example.test'
      },
      organization_id: claimOrganizationId,
      post_claim_capabilities: ['email.status', 'email.message.read']
    })
    expect(result.target_organizations).toStrictEqual([
      {
        id: claimOrganizationId,
        name: 'Claim Organization',
        slug: 'claim-organization'
      }
    ])
    expect(trialServiceTestState.memberFind).toHaveBeenCalledWith({
      userId: claimUserId
    })
    expect(trialServiceTestState.agentMailTrialClaimIntentFindOne).toHaveBeenCalledWith({
      tokenHash: hashTestClaimToken(claimToken)
    })
    expect(JSON.stringify(trialServiceTestState.agentMailTrialClaimIntentFindOne.mock.calls)).not.toContain(
      claimToken
    )
  })

  it('does not let a user without CASL claim ability probe autonomous trial claim tokens', async () => {
    expect.hasAssertions()

    setupAuthenticatedClaimContext('member')
    setupClaimRecords()

    const { decideAgentMailTrialClaimForWeb } = await import('./trial-service')

    await expect(
      decideAgentMailTrialClaimForWeb({
        headers: new Headers({ authorization: 'Bearer user-session' }),
        input: { action: 'approve' },
        token: claimToken
      })
    ).rejects.toMatchObject({
      message: 'Trial agent claim is not authorized',
      status: 403
    })
    expect(trialServiceTestState.agentMailTrialClaimIntentFindOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentCapabilityGrantUpdateOne).not.toHaveBeenCalled()
  })

  it('approves an autonomous trial claim by re-scoping grants without exposing the claim token', async () => {
    expect.hasAssertions()

    setupAuthenticatedClaimContext('admin')
    setupClaimRecords()

    const { decideAgentMailTrialClaimForWeb } = await import('./trial-service')

    const result = await decideAgentMailTrialClaimForWeb({
      headers: new Headers({ authorization: 'Bearer user-session' }),
      input: {
        action: 'approve',
        target_organization_id: claimOrganizationId
      },
      token: claimToken
    })

    expect(result).toMatchObject({
      action: 'approve',
      claim: { status: 'approved' },
      success: true,
      view: {
        claim: { status: 'approved' },
        mailbox: { address: 'trial-agent@trial.example.test' },
        organization_id: claimOrganizationId,
        post_claim_capabilities: ['email.status', 'email.message.read']
      }
    })
    expect(trialServiceTestState.transaction).toHaveBeenCalledOnce()
    expect(trialServiceTestState.agentMailTrialClaimIntentUpdateOne).toHaveBeenCalledWith(
      { _id: claimIntentId, status: 'pending' },
      {
        $set: expect.objectContaining({
          approvedByUserId: claimUserId,
          status: 'approved',
          targetOrganizationId: claimOrganizationId
        })
      }
    )
    expect(trialServiceTestState.agentMailTrialUpdateOne).toHaveBeenCalledWith(
      { _id: trialId, status: 'active' },
      {
        $set: expect.objectContaining({
          claimedByUserId: claimUserId,
          claimedOrganizationId: claimOrganizationId,
          status: 'claimed'
        })
      }
    )
    expect(trialServiceTestState.agentHostUpdateOne).toHaveBeenCalledWith(
      { _id: hostId, status: 'active' },
      {
        $set: expect.objectContaining({
          userId: claimUserId
        })
      }
    )
    expect(trialServiceTestState.agentUpdateOne).toHaveBeenCalledWith(
      { _id: agentId, status: 'active' },
      {
        $set: expect.objectContaining({
          userId: claimUserId
        })
      }
    )

    const agentUpdate = trialServiceTestState.agentUpdateOne.mock.calls[0]?.[1] as
      | { $set?: Record<string, unknown> }
      | undefined
    expect(agentUpdate?.$set).toMatchObject({
      userId: claimUserId
    })
    expect(agentUpdate?.$set).not.toHaveProperty('status')

    const grantUpdates = trialServiceTestState.agentCapabilityGrantUpdateOne.mock.calls.map(
      ([filter, update]) => ({ filter, update })
    )
    expect(grantUpdates).toHaveLength(2)
    expect(grantUpdates).toContainEqual(
      expect.objectContaining({
        filter: { _id: capabilityGrantId, agentId, status: 'active' },
        update: {
          $set: expect.objectContaining({
            constraints: { organizationId: claimOrganizationId },
            expiresAt: expect.any(Date)
          })
        }
      })
    )
    expect(grantUpdates).toContainEqual(
      expect.objectContaining({
        filter: { _id: `${capabilityGrantId}-message`, agentId, status: 'active' },
        update: {
          $set: expect.objectContaining({
            constraints: {
              mailboxAddress: 'trial-agent@trial.example.test',
              organizationId: claimOrganizationId
            },
            expiresAt: expect.any(Date)
          })
        }
      })
    )
    expect(JSON.stringify(trialServiceTestState.agentMailTrialClaimIntentFindOne.mock.calls)).not.toContain(
      claimToken
    )
    expect(JSON.stringify(trialServiceTestState.auditLogCreate.mock.calls)).not.toContain(claimToken)
    expect(trialServiceTestState.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent_mail.trial.claim.approved',
        metadata: expect.not.objectContaining({
          token: expect.anything(),
          tokenHash: expect.anything()
        })
      })
    )
  })

  it('approves an autonomous trial claim by reconciling grants to requested post-claim capabilities', async () => {
    expect.hasAssertions()

    setupAuthenticatedClaimContext('admin')
    setupClaimRecords({
      postClaimCapabilities: ['email.message.read', 'email.message.send']
    })

    const { decideAgentMailTrialClaimForWeb } = await import('./trial-service')

    const result = await decideAgentMailTrialClaimForWeb({
      headers: new Headers({ authorization: 'Bearer user-session' }),
      input: {
        action: 'approve',
        target_organization_id: claimOrganizationId
      },
      token: claimToken
    })

    expect(result.view.post_claim_capabilities).toStrictEqual(['email.message.read', 'email.message.send'])

    const grantUpdates = trialServiceTestState.agentCapabilityGrantUpdateOne.mock.calls.map(
      ([filter, update]) => ({ filter, update })
    )
    expect(grantUpdates).toContainEqual(
      expect.objectContaining({
        filter: { _id: capabilityGrantId, agentId, status: 'active' },
        update: {
          $set: expect.objectContaining({
            status: 'revoked'
          })
        }
      })
    )
    expect(grantUpdates).toContainEqual(
      expect.objectContaining({
        filter: { _id: `${capabilityGrantId}-message`, agentId, status: 'active' },
        update: {
          $set: expect.objectContaining({
            constraints: {
              mailboxAddress: 'trial-agent@trial.example.test',
              organizationId: claimOrganizationId
            },
            expiresAt: expect.any(Date),
            grantedBy: claimUserId
          })
        }
      })
    )
    expect(trialServiceTestState.agentCapabilityGrantCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          agentId,
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'trial-agent@trial.example.test',
            organizationId: claimOrganizationId
          },
          grantedBy: claimUserId,
          reason: 'autonomous_trial_claim',
          status: 'active'
        })
      ],
      { session: { id: 'transaction-session' } }
    )
  })

  it('rejects an approved trial claim race before transferring resources', async () => {
    expect.hasAssertions()

    setupAuthenticatedClaimContext('admin')
    setupClaimRecords()
    trialServiceTestState.agentMailTrialClaimIntentUpdateOne.mockReturnValueOnce({
      exec: () => Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
    })

    const { decideAgentMailTrialClaimForWeb } = await import('./trial-service')

    await expect(
      decideAgentMailTrialClaimForWeb({
        headers: new Headers({ authorization: 'Bearer user-session' }),
        input: {
          action: 'approve',
          target_organization_id: claimOrganizationId
        },
        token: claimToken
      })
    ).rejects.toMatchObject({
      message: 'Trial claim has already been resolved',
      status: 409
    })

    expect(trialServiceTestState.agentMailTrialClaimIntentUpdateOne).toHaveBeenCalledWith(
      { _id: claimIntentId, status: 'pending' },
      expect.any(Object)
    )
    expect(trialServiceTestState.agentMailTrialUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentCapabilityGrantUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('uses the active eligible organization for claim previews when multiple targets are authorized', async () => {
    expect.hasAssertions()

    const otherOrganizationId = '01960000-0000-7000-8000-0000000000d1'
    setupAuthenticatedClaimContext('admin', {
      activeOrganizationId: claimOrganizationId,
      organizations: [
        {
          id: otherOrganizationId,
          name: 'Alpha Operations',
          role: 'admin',
          slug: 'alpha-operations'
        },
        {
          id: claimOrganizationId,
          name: 'Research Lab',
          role: 'admin',
          slug: 'research-lab'
        }
      ]
    })
    setupClaimRecords()

    const { getAgentMailTrialClaimForWeb } = await import('./trial-service')

    const result = await getAgentMailTrialClaimForWeb({
      headers: new Headers({ authorization: 'Bearer user-session' }),
      token: claimToken
    })

    expect(result.organization_id).toBe(claimOrganizationId)
    expect(result.target_organizations).toStrictEqual([
      {
        id: otherOrganizationId,
        name: 'Alpha Operations',
        slug: 'alpha-operations'
      },
      {
        id: claimOrganizationId,
        name: 'Research Lab',
        slug: 'research-lab'
      }
    ])
  })

  it('approves an autonomous trial claim into an eligible non-active target organization', async () => {
    expect.hasAssertions()

    const activeOrganizationId = '01960000-0000-7000-8000-0000000000d2'
    setupAuthenticatedClaimContext('admin', {
      activeOrganizationId,
      organizations: [
        {
          id: activeOrganizationId,
          name: 'Active Workspace',
          role: 'admin',
          slug: 'active-workspace'
        },
        {
          id: claimOrganizationId,
          name: 'Target Workspace',
          role: 'admin',
          slug: 'target-workspace'
        }
      ]
    })
    setupClaimRecords()

    const { decideAgentMailTrialClaimForWeb } = await import('./trial-service')

    const result = await decideAgentMailTrialClaimForWeb({
      headers: new Headers({ authorization: 'Bearer user-session' }),
      input: {
        action: 'approve',
        target_organization_id: claimOrganizationId
      },
      token: claimToken
    })

    expect(result.view.organization_id).toBe(claimOrganizationId)
    expect(trialServiceTestState.agentMailTrialClaimIntentUpdateOne).toHaveBeenCalledWith(
      { _id: claimIntentId, status: 'pending' },
      {
        $set: expect.objectContaining({
          targetOrganizationId: claimOrganizationId
        })
      }
    )
    expect(trialServiceTestState.agentMailTrialUpdateOne).toHaveBeenCalledWith(
      { _id: trialId, status: 'active' },
      {
        $set: expect.objectContaining({
          claimedOrganizationId: claimOrganizationId
        })
      }
    )
  })

  it('rejects an unauthorized target organization before looking up the claim token', async () => {
    expect.hasAssertions()

    const unauthorizedOrganizationId = '01960000-0000-7000-8000-0000000000d3'
    setupAuthenticatedClaimContext('admin')
    setupClaimRecords()

    const { decideAgentMailTrialClaimForWeb } = await import('./trial-service')

    await expect(
      decideAgentMailTrialClaimForWeb({
        headers: new Headers({ authorization: 'Bearer user-session' }),
        input: {
          action: 'approve',
          target_organization_id: unauthorizedOrganizationId
        },
        token: claimToken
      })
    ).rejects.toMatchObject({
      message: 'Trial claim target organization is not authorized',
      status: 403
    })

    expect(trialServiceTestState.agentMailTrialClaimIntentFindOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentMailTrialClaimIntentUpdateOne).not.toHaveBeenCalled()
  })

  it('keeps claim approval writes inside a database transaction when resource transfer fails', async () => {
    expect.hasAssertions()

    setupAuthenticatedClaimContext('admin')
    setupClaimRecords()
    trialServiceTestState.agentHostUpdateOne.mockReturnValueOnce({
      exec: () => Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
    })

    const { decideAgentMailTrialClaimForWeb } = await import('./trial-service')

    await expect(
      decideAgentMailTrialClaimForWeb({
        headers: new Headers({ authorization: 'Bearer user-session' }),
        input: {
          action: 'approve',
          target_organization_id: claimOrganizationId
        },
        token: claimToken
      })
    ).rejects.toMatchObject({
      message: 'Trial host is not claimable',
      status: 409
    })

    expect(trialServiceTestState.transaction).toHaveBeenCalledOnce()
    expect(trialServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })

  it('denies an autonomous trial claim without transferring the agent or grants', async () => {
    expect.hasAssertions()

    setupAuthenticatedClaimContext('admin')
    setupClaimRecords()

    const { decideAgentMailTrialClaimForWeb } = await import('./trial-service')

    const result = await decideAgentMailTrialClaimForWeb({
      headers: new Headers({ authorization: 'Bearer user-session' }),
      input: { action: 'deny' },
      token: claimToken
    })

    expect(result).toMatchObject({
      action: 'deny',
      claim: { status: 'denied' },
      success: true,
      view: {
        claim: { status: 'denied' },
        mailbox: { address: 'trial-agent@trial.example.test' },
        organization_id: claimOrganizationId
      }
    })
    expect(trialServiceTestState.transaction).toHaveBeenCalledOnce()
    expect(trialServiceTestState.agentMailTrialClaimIntentUpdateOne).toHaveBeenCalledWith(
      { _id: claimIntentId, status: 'pending' },
      {
        $set: expect.objectContaining({
          status: 'denied'
        })
      }
    )
    expect(trialServiceTestState.agentMailTrialUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentCapabilityGrantUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent_mail.trial.claim.denied',
        metadata: expect.not.objectContaining({
          token: expect.anything(),
          tokenHash: expect.anything()
        })
      })
    )
  })

  it('rejects a denied trial claim race without writing an audit event', async () => {
    expect.hasAssertions()

    setupAuthenticatedClaimContext('admin')
    setupClaimRecords()
    trialServiceTestState.agentMailTrialClaimIntentUpdateOne.mockReturnValueOnce({
      exec: () => Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
    })

    const { decideAgentMailTrialClaimForWeb } = await import('./trial-service')

    await expect(
      decideAgentMailTrialClaimForWeb({
        headers: new Headers({ authorization: 'Bearer user-session' }),
        input: { action: 'deny' },
        token: claimToken
      })
    ).rejects.toMatchObject({
      message: 'Trial claim has already been resolved',
      status: 409
    })

    expect(trialServiceTestState.agentMailTrialUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentHostUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.agentCapabilityGrantUpdateOne).not.toHaveBeenCalled()
    expect(trialServiceTestState.auditLogCreate).not.toHaveBeenCalled()
  })
})

function validTrialRequest() {
  return {
    agent_public_key: validAgentPublicKey(),
    admission_token: 'trial-admission-token',
    host_public_key: validHostPublicKey(),
    name: 'Test trial agent'
  }
}

function validHostPublicKey() {
  return {
    alg: 'EdDSA',
    crv: 'Ed25519',
    kid: 'host-key-1',
    kty: 'OKP',
    x: 'host-public-key'
  }
}

function validAgentPublicKey() {
  return {
    alg: 'EdDSA',
    crv: 'Ed25519',
    kid: 'agent-key-1',
    kty: 'OKP',
    x: 'agent-public-key'
  }
}

type ClaimOrganizationFixture = {
  id: string
  name?: string
  role?: 'admin' | 'member' | 'owner'
  slug?: string | null
}

function setupAuthenticatedClaimContext(
  role: 'admin' | 'member',
  options: {
    activeOrganizationId?: string
    organizations?: ReadonlyArray<ClaimOrganizationFixture>
  } = {}
) {
  const organizations = options.organizations ?? [
    {
      id: claimOrganizationId,
      name: 'Claim Organization',
      role,
      slug: 'claim-organization'
    }
  ]
  trialServiceTestState.authGetSession.mockResolvedValue({
    session: {
      activeOrganizationId: options.activeOrganizationId ?? claimOrganizationId,
      id: 'session-1'
    },
    user: {
      id: claimUserId
    }
  })
  trialServiceTestState.memberFind.mockReturnValue({
    exec: () =>
      Promise.resolve(
        organizations.map((organization) => ({
          organizationId: organization.id,
          role: organization.role ?? role,
          userId: claimUserId
        }))
      )
  })
  trialServiceTestState.organizationFind.mockReturnValue({
    exec: () =>
      Promise.resolve(
        organizations.map((organization) => ({
          _id: organization.id,
          name: organization.name ?? 'Claim Organization',
          slug: organization.slug ?? null
        }))
      )
  })
}

function setupClaimRecords(
  options: {
    postClaimCapabilities?: ReadonlyArray<string>
  } = {}
) {
  const expiresAt = new Date(Date.now() + 60_000)
  const claim = {
    _id: claimIntentId,
    agentId,
    approvedByUserId: null,
    createdAt: new Date(),
    expiresAt,
    hostId,
    resolvedAt: null,
    status: 'pending',
    targetOrganizationId: null,
    tokenHash: hashTestClaimToken(claimToken),
    trialId,
    updatedAt: new Date()
  }
  const trial = {
    _id: trialId,
    agentId,
    capabilities: ['email.status', 'email.message.read'],
    claimIntentId,
    claimedAt: null,
    claimedByUserId: null,
    claimedOrganizationId: null,
    createdAt: new Date(),
    dailySendLimit: 10,
    dailySentCount: 0,
    dailyWindowStartedAt: new Date(),
    expiresAt,
    hostId,
    mailboxAddress: 'trial-agent@trial.example.test',
    postClaimCapabilities: options.postClaimCapabilities ?? ['email.status', 'email.message.read'],
    status: 'active',
    totalSendLimit: 50,
    totalSentCount: 0,
    updatedAt: new Date(),
    wildDuckUserId: 'wildduck-user-1'
  }
  const agent = {
    _id: agentId,
    hostId,
    mode: 'autonomous',
    name: 'Trial agent',
    status: 'active',
    userId: null
  }
  const host = {
    _id: hostId,
    name: 'Trial agent',
    status: 'active',
    userId: null
  }
  const grants = [
    {
      _id: capabilityGrantId,
      agentId,
      capability: 'email.status',
      constraints: { organizationId },
      expiresAt,
      status: 'active'
    },
    {
      _id: `${capabilityGrantId}-message`,
      agentId,
      capability: 'email.message.read',
      constraints: {
        mailboxAddress: 'trial-agent@trial.example.test',
        organizationId
      },
      expiresAt,
      status: 'active'
    }
  ]

  trialServiceTestState.agentMailTrialClaimIntentFindOne.mockReturnValue({
    exec: () => Promise.resolve(claim)
  })
  trialServiceTestState.agentMailTrialFindById.mockReturnValue({ exec: () => Promise.resolve(trial) })
  trialServiceTestState.agentFindById.mockReturnValue({ exec: () => Promise.resolve(agent) })
  trialServiceTestState.agentHostFindById.mockReturnValue({ exec: () => Promise.resolve(host) })
  trialServiceTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve(grants) })
}

function hashTestClaimToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
