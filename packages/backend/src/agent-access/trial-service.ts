import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { AgentMailTrialCapability, AgentMailTrialPolicyContractV1, publicIdFromUUIDv7 } from '@main/db'
import { createUUIDv7, parseUUIDv7 } from '@main/common'
import { z } from 'zod'

import { globals } from '../globals'
import { createWildDuckClient } from '../agent-mail/wildduck-client'
import { agentMailSubject, buildAgentMailAbility } from '../agent-mail/permission-policy'
import { PRIVATE_VARS } from '../vars.private'
import { PUBLIC_VARS } from '../vars.public'
import type {
  AgentCapabilityGrantDocument,
  AgentHostId,
  AgentId,
  AgentMailTrialCapability as AgentMailTrialCapabilityValue,
  AgentMailTrialClaimIntentDocument,
  AgentMailTrialClaimIntentId,
  AgentMailTrialDocument,
  AgentMailTrialId,
  OrganizationDocument,
  OrganizationId,
  UserId
} from '@main/db'
import type { Database } from '../db/db'
import type { GlobalAuthSession } from '../auth/auth'
import type { ClientSession } from 'mongoose'

export class AgentMailTrialError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 429 | 502 | 503
  ) {
    super(message)
    this.name = 'AgentMailTrialError'
  }
}

export function isAgentMailTrialError(error: unknown): error is AgentMailTrialError {
  return error instanceof AgentMailTrialError
}

const PublicJwk = z
  .object({
    alg: z.string().min(1).optional(),
    crv: z.string().min(1).optional(),
    key_ops: z.array(z.string().min(1)).optional(),
    kid: z.string().min(1).optional(),
    kty: z.string().min(1),
    use: z.string().min(1).optional(),
    x: z.string().min(1)
  })
  .strict()

export const AgentMailTrialStartInput = z
  .object({
    agent_public_key: PublicJwk,
    admission_token: z.string().min(1).max(4096).optional(),
    capabilities: z.array(AgentMailTrialCapability).min(1).optional(),
    host_public_key: PublicJwk,
    name: z.string().max(128).optional(),
    post_claim_capabilities: z.array(AgentMailTrialCapability).min(1).optional()
  })
  .strict()
export type AgentMailTrialStartInput = Readonly<z.infer<typeof AgentMailTrialStartInput>>

export const AgentMailTrialClaimDecisionInput = z
  .object({
    action: z.enum(['approve', 'deny']),
    target_organization_id: z.string().min(1).optional()
  })
  .strict()
export type AgentMailTrialClaimDecisionInput = Readonly<z.infer<typeof AgentMailTrialClaimDecisionInput>>

export interface AgentMailTrialGrantView {
  capability: AgentMailTrialCapabilityValue
  constraints: Record<string, string>
  expiresAt: string
  status: 'active'
}

export interface AgentMailTrialStartResult {
  agent_capability_grants: ReadonlyArray<AgentMailTrialGrantView>
  agent_id: string
  claim: {
    expires_at: string
    url: string
  }
  capabilities: ReadonlyArray<AgentMailTrialCapabilityValue>
  expires_at: string
  host_id: string
  mailbox: {
    address: string
  }
  mode: 'autonomous'
  name: string
  post_claim_capabilities: ReadonlyArray<AgentMailTrialCapabilityValue>
  status: 'active'
  trial_id: string
}

export interface AgentMailTrialClaimView {
  agent: {
    id: string
    name: string
    status: string
  }
  capabilities: ReadonlyArray<AgentMailTrialCapabilityValue>
  claim: {
    expires_at: string
    status: string
  }
  mailbox: {
    address: string
  }
  organization_id: string
  post_claim_capabilities: ReadonlyArray<AgentMailTrialCapabilityValue>
  target_organizations: ReadonlyArray<AgentMailTrialClaimTargetOrganization>
  trial_id: string
}

export interface AgentMailTrialClaimTargetOrganization {
  id: string
  name: string
  slug: string | null
}

export interface AgentMailTrialClaimDecisionResult {
  action: 'approve' | 'deny'
  claim: {
    status: 'approved' | 'denied'
  }
  success: true
  view: AgentMailTrialClaimView
}

interface TrialCapabilityGrantInput {
  agentId: AgentId
  capability: AgentMailTrialCapabilityValue
  constraints: Record<string, string>
  createdAt: Date
  deniedBy: null
  expiresAt: Date
  grantedBy: null
  reason: 'autonomous_trial'
  status: 'active'
  updatedAt: Date
}

export async function startAgentMailTrial(input: unknown): Promise<AgentMailTrialStartResult> {
  const parsedInput = parseTrialInput(input)
  const policy = resolveTrialPolicy({
    requestedCapabilities: parsedInput.capabilities,
    requestedPostClaimCapabilities: parsedInput.post_claim_capabilities
  })
  const { db } = await globals()
  const now = new Date()
  requireTrialAdmissionToken(parsedInput.admission_token, policy.admissionToken)
  await enforceActiveTrialLimit({ db, maxActiveTrials: policy.maxActiveTrials, now })
  const hostPublicKey = parsedInput.host_public_key
  const agentPublicKey = parsedInput.agent_public_key
  const hostPublicKeyString = JSON.stringify(hostPublicKey)
  const agentPublicKeyString = JSON.stringify(agentPublicKey)

  if (hostPublicKeyString === agentPublicKeyString) {
    throw new AgentMailTrialError('Trial host and agent keys must be distinct', 400)
  }

  const [existingHost, existingAgent] = await Promise.all([
    db.models.agentHost
      .findOne({
        $or: [{ publicKey: hostPublicKeyString }, ...(hostPublicKey.kid ? [{ kid: hostPublicKey.kid }] : [])]
      })
      .exec(),
    db.models.agent.findOne({ publicKey: agentPublicKeyString }).exec()
  ])
  if (existingHost || existingAgent) {
    throw new AgentMailTrialError('Trial host or agent key is already registered', 409)
  }

  const expiresAt = new Date(now.getTime() + policy.mailboxLifetimeSeconds * 1000)
  const claimIntentExpiresAt = new Date(now.getTime() + policy.claimIntentTtlSeconds * 1000)
  const hostId = createUUIDv7() as AgentHostId
  const agentId = createUUIDv7() as AgentId
  const trialId = createUUIDv7() as AgentMailTrialId
  const claimIntentId = createUUIDv7() as AgentMailTrialClaimIntentId
  const name = normalizeTrialAgentName(parsedInput.name)
  const mailboxAddress = createTrialMailboxAddress(
    policy.hostedDomain,
    PRIVATE_VARS.AGENT_MAIL_TRIAL_MAILBOX_LOCAL_PREFIX
  )
  const claimToken = randomBytes(32).toString('base64url')
  const claimTokenHash = hashClaimToken(claimToken)
  const wildDuckClient = createWildDuckClient()
  const wildDuckResult = await wildDuckClient.createUser({
    address: mailboxAddress,
    allowUnsafe: false,
    name,
    password: randomUUID(),
    spamLevel: 0,
    username: mailboxAddress
  })
  const wildDuckUserId = readWildDuckUserId(wildDuckResult)

  if (!wildDuckUserId) {
    throw new AgentMailTrialError('WildDuck did not return a trial mailbox user id', 502)
  }

  const grants = policy.capabilities.map((capability) =>
    trialGrantForCapability({
      agentId,
      capability,
      expiresAt,
      mailboxAddress,
      organizationId: policy.organizationId
    })
  )

  try {
    await withDatabaseTransaction(db, async (session) => {
      await db.models.agentHost.create(
        [
          {
            _id: hostId,
            activatedAt: now,
            createdAt: now,
            defaultCapabilities: '[]',
            enrollmentTokenExpiresAt: null,
            enrollmentTokenHash: null,
            expiresAt,
            jwksUrl: null,
            kid: hostPublicKey.kid ?? null,
            lastUsedAt: null,
            name,
            publicKey: hostPublicKeyString,
            status: 'active',
            updatedAt: now,
            userId: null
          }
        ],
        { session }
      )
      await db.models.agent.create(
        [
          {
            _id: agentId,
            activatedAt: now,
            createdAt: now,
            expiresAt,
            hostId,
            jwksUrl: null,
            kid: agentPublicKey.kid ?? null,
            lastUsedAt: null,
            metadata: {
              trialId: String(trialId)
            },
            mode: 'autonomous',
            name,
            publicKey: agentPublicKeyString,
            status: 'active',
            updatedAt: now,
            userId: null
          }
        ],
        { session }
      )
      for (const grant of grants) {
        await db.models.agentCapabilityGrant.create([grant], { session })
      }
      await db.models.agentMailTrial.create(
        [
          {
            _id: trialId,
            agentId,
            capabilities: [...policy.capabilities],
            claimIntentId,
            claimedAt: null,
            claimedByUserId: null,
            claimedOrganizationId: null,
            createdAt: now,
            dailySendLimit: policy.dailySendLimit,
            dailySentCount: 0,
            dailyWindowStartedAt: now,
            expiresAt,
            hostId,
            mailboxAddress,
            postClaimCapabilities: [...policy.postClaimCapabilities],
            status: 'active',
            totalSendLimit: policy.totalSendLimit,
            totalSentCount: 0,
            updatedAt: now,
            wildDuckUserId
          }
        ],
        { session }
      )
      await db.models.agentMailTrialClaimIntent.create(
        [
          {
            _id: claimIntentId,
            agentId,
            approvedByUserId: null,
            createdAt: now,
            expiresAt: claimIntentExpiresAt,
            hostId,
            resolvedAt: null,
            status: 'pending',
            targetOrganizationId: null,
            tokenHash: claimTokenHash,
            trialId,
            updatedAt: now
          }
        ],
        { session }
      )
    })
  } catch (error) {
    try {
      await cleanupProvisionedTrialMailbox(wildDuckClient, wildDuckUserId)
    } catch (cleanupError) {
      await auditTrialProvisioningFailure(db, {
        agentId: String(agentId),
        cleanupErrorName: errorName(cleanupError),
        cleanupStatus: 'failed',
        errorName: errorName(error),
        hostId: String(hostId),
        mailboxAddress,
        trialId: String(trialId),
        wildDuckUserId
      }).catch(() => undefined)
      throw new AggregateError(
        [error, cleanupError],
        'Agent Mail trial provisioning failed after WildDuck mailbox creation and mailbox cleanup failed'
      )
    }
    await auditTrialProvisioningFailure(db, {
      agentId: String(agentId),
      cleanupStatus: 'deleted',
      errorName: errorName(error),
      hostId: String(hostId),
      mailboxAddress,
      trialId: String(trialId),
      wildDuckUserId
    }).catch(() => undefined)
    throw error
  }

  await db.models.auditLog.create({
    action: 'agent_mail.trial.started',
    metadata: {
      agentId: String(agentId),
      capabilityCount: policy.capabilities.length,
      hostId: String(hostId),
      mailboxAddress,
      organizationId: String(policy.organizationId),
      trialId: String(trialId)
    },
    severity: 'low',
    status: 'success'
  })

  return {
    agent_capability_grants: grants.map((grant) => toGrantView(grant)),
    agent_id: String(agentId),
    capabilities: [...policy.capabilities],
    claim: {
      expires_at: claimIntentExpiresAt.toISOString(),
      url: createClaimUrl(claimToken)
    },
    expires_at: expiresAt.toISOString(),
    host_id: String(hostId),
    mailbox: {
      address: mailboxAddress
    },
    mode: 'autonomous',
    name,
    post_claim_capabilities: [...policy.postClaimCapabilities],
    status: 'active',
    trial_id: publicIdFromUUIDv7(trialId)
  }
}

export async function getAgentMailTrialClaimForWeb({
  headers,
  token
}: {
  headers: Headers
  token: string
}): Promise<AgentMailTrialClaimView> {
  const { db } = await globals()
  const claimAccess = await requireTrialClaimUserAccess(headers)
  const context = selectTrialClaimContext(claimAccess)
  const claim = await requirePendingTrialClaim(token)
  const [trial, agent] = await Promise.all([
    db.models.agentMailTrial.findById(claim.trialId).exec(),
    db.models.agent.findById(claim.agentId).exec()
  ])
  const activeTrial = requireClaimableTrial(trial)
  if (!agent) {
    throw new AgentMailTrialError('Trial agent was not found', 404)
  }

  return toClaimView({
    agent,
    claim,
    organizationId: context.organizationId,
    targetOrganizations: claimAccess.contexts,
    trial: activeTrial
  })
}

export async function decideAgentMailTrialClaimForWeb({
  headers,
  input,
  token
}: {
  headers: Headers
  input: unknown
  token: string
}): Promise<AgentMailTrialClaimDecisionResult> {
  const { db } = await globals()
  const claimAccess = await requireTrialClaimUserAccess(headers)
  const parsedInput = parseTrialClaimDecisionInput(input)
  const context = selectTrialClaimContext(claimAccess, parsedInput.target_organization_id)
  const claim = await requirePendingTrialClaim(token)
  const [trial, agent, host, grants] = await Promise.all([
    db.models.agentMailTrial.findById(claim.trialId).exec(),
    db.models.agent.findById(claim.agentId).exec(),
    db.models.agentHost.findById(claim.hostId).exec(),
    db.models.agentCapabilityGrant.find({ agentId: claim.agentId }).exec()
  ])
  const activeTrial = requireClaimableTrial(trial)
  if (!agent || !host) {
    throw new AgentMailTrialError('Trial agent was not found', 404)
  }

  const now = new Date()

  if (parsedInput.action === 'deny') {
    await withDatabaseTransaction(db, async (session) => {
      const claimUpdate = await execQuery(
        db.models.agentMailTrialClaimIntent.updateOne(
          { _id: claim._id, status: 'pending' },
          {
            $set: {
              resolvedAt: now,
              status: 'denied',
              updatedAt: now
            }
          }
        ),
        session
      )
      requireUpdated(claimUpdate, 'Trial claim has already been resolved')
    })
    await auditTrialClaim('agent_mail.trial.claim.denied', {
      agentId: String(agent._id),
      approvedByUserId: String(context.userId),
      organizationId: String(context.organizationId),
      trialId: String(activeTrial._id)
    })
    return {
      action: 'deny',
      claim: { status: 'denied' },
      success: true,
      view: toClaimView({
        agent,
        claim: {
          expiresAt: claim.expiresAt,
          status: 'denied'
        },
        organizationId: context.organizationId,
        targetOrganizations: claimAccess.contexts,
        trial: activeTrial
      })
    }
  }

  await withDatabaseTransaction(db, async (session) => {
    const claimUpdate = await execQuery(
      db.models.agentMailTrialClaimIntent.updateOne(
        { _id: claim._id, status: 'pending' },
        {
          $set: {
            approvedByUserId: context.userId,
            resolvedAt: now,
            status: 'approved',
            targetOrganizationId: context.organizationId,
            updatedAt: now
          }
        }
      ),
      session
    )
    requireUpdated(claimUpdate, 'Trial claim has already been resolved')

    const postClaimCapabilities = trialPostClaimCapabilities(activeTrial)
    const activeGrants = grants.filter((grant) => grant.status === 'active')
    const existingActiveCapabilities = new Set(activeGrants.map((grant) => grant.capability))
    const grantWrites: unknown[] = []
    for (const grant of activeGrants) {
      grantWrites.push(
        await execQuery(
          db.models.agentCapabilityGrant.updateOne(
            { _id: grant._id, agentId: claim.agentId, status: 'active' },
            postClaimCapabilities.includes(grant.capability as AgentMailTrialCapabilityValue)
              ? {
                  $set: {
                    constraints: trialClaimGrantConstraints({
                      grant,
                      mailboxAddress: activeTrial.mailboxAddress,
                      organizationId: context.organizationId
                    }),
                    expiresAt: activeTrial.expiresAt,
                    grantedBy: context.userId,
                    updatedAt: now
                  }
                }
              : {
                  $set: {
                    status: 'revoked',
                    updatedAt: now
                  }
                }
          ),
          session
        )
      )
    }
    for (const capability of postClaimCapabilities.filter(
      (candidateCapability) => !existingActiveCapabilities.has(candidateCapability)
    )) {
      await db.models.agentCapabilityGrant.create(
        [
          {
            agentId: claim.agentId,
            capability,
            constraints: trialClaimGrantConstraints({
              grant: { capability },
              mailboxAddress: activeTrial.mailboxAddress,
              organizationId: context.organizationId
            }),
            createdAt: now,
            deniedBy: null,
            expiresAt: activeTrial.expiresAt,
            grantedBy: context.userId,
            reason: 'autonomous_trial_claim',
            status: 'active',
            updatedAt: now
          }
        ],
        { session }
      )
    }

    const trialUpdate = await execQuery(
      db.models.agentMailTrial.updateOne(
        { _id: activeTrial._id, status: 'active' },
        {
          $set: {
            claimedAt: now,
            claimedByUserId: context.userId,
            claimedOrganizationId: context.organizationId,
            status: 'claimed',
            updatedAt: now
          }
        }
      ),
      session
    )
    const hostUpdate = await execQuery(
      db.models.agentHost.updateOne(
        { _id: host._id, status: 'active' },
        { $set: { updatedAt: now, userId: context.userId } }
      ),
      session
    )
    const agentUpdate = await execQuery(
      db.models.agent.updateOne(
        { _id: agent._id, status: 'active' },
        {
          $set: {
            metadata: {
              claimedAt: now.toISOString(),
              trialId: String(activeTrial._id)
            },
            updatedAt: now,
            userId: context.userId
          }
        }
      ),
      session
    )
    requireUpdated(trialUpdate, 'Trial is not claimable')
    requireUpdated(hostUpdate, 'Trial host is not claimable')
    requireUpdated(agentUpdate, 'Trial agent is not claimable')
    for (const grantUpdate of grantWrites) {
      requireUpdated(grantUpdate, 'Trial grant is not claimable')
    }
  })
  await auditTrialClaim('agent_mail.trial.claim.approved', {
    agentId: String(agent._id),
    approvedByUserId: String(context.userId),
    organizationId: String(context.organizationId),
    trialId: String(activeTrial._id)
  })

  return {
    action: 'approve',
    claim: { status: 'approved' },
    success: true,
    view: toClaimView({
      agent,
      claim: {
        expiresAt: claim.expiresAt,
        status: 'approved'
      },
      organizationId: context.organizationId,
      targetOrganizations: claimAccess.contexts,
      trial: activeTrial
    })
  }
}

function parseTrialInput(input: unknown): AgentMailTrialStartInput {
  const parsed = AgentMailTrialStartInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailTrialError('Invalid Agent Mail trial request', 400)
  }
  return parsed.data
}

function parseTrialClaimDecisionInput(input: unknown): AgentMailTrialClaimDecisionInput {
  const parsed = AgentMailTrialClaimDecisionInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailTrialError('Invalid Agent Mail trial claim request', 400)
  }
  return parsed.data
}

interface TrialClaimAuthorizedContext {
  ability: ReturnType<typeof buildAgentMailAbility>
  organizationId: OrganizationId
  organizationName: string
  organizationSlug: string | null
  userId: UserId
}

interface TrialClaimUserAccess {
  activeOrganizationId: OrganizationId | null
  contexts: ReadonlyArray<TrialClaimAuthorizedContext>
  userId: UserId
}

async function requireTrialClaimUserAccess(headers: Headers): Promise<TrialClaimUserAccess> {
  const { auth, db } = await globals()
  const session = await auth.api.getSession({ headers })
  if (!session?.user) {
    throw new AgentMailTrialError('Authentication required', 401)
  }
  const userId = session.user.id as UserId
  const members = await db.models.member.find({ userId }).exec()
  if (members.length === 0) {
    throw new AgentMailTrialError('Organization access is required', 403)
  }
  const organizationIds = members.map((member) => member.organizationId)
  const [mailboxGrants, systemGrants, organizations] = await Promise.all([
    db.models.agentMailMailboxGrant
      .find({ organizationId: { $in: organizationIds }, principalId: userId, principalType: 'user_session' })
      .exec(),
    db.models.agentMailSystemGrant
      .find({ organizationId: { $in: organizationIds }, principalId: userId, principalType: 'user_session' })
      .exec(),
    db.models.organization.find({ _id: { $in: organizationIds } }).exec()
  ])
  const organizationsById = new Map(
    organizations.map((organization) => [String(organization._id), organization])
  )
  const contexts = members.flatMap((member) => {
    const organizationId = member.organizationId
    const organizationMailboxGrants = mailboxGrants.filter((grant) =>
      sameId(grant.organizationId, organizationId)
    )
    const organizationSystemGrants = systemGrants.filter((grant) =>
      sameId(grant.organizationId, organizationId)
    )
    const organization = organizationsById.get(String(organizationId))
    const ability = buildAgentMailAbility({
      mailboxGrants: organizationMailboxGrants,
      principal: {
        credentialId: session.session.id,
        organizationId,
        organizationRole: member.role,
        principalId: userId,
        principalType: 'user_session',
        userId
      },
      systemGrants: organizationSystemGrants
    })

    if (!canClaimTrialAgent(ability, organizationId)) {
      return []
    }

    return [
      {
        ability,
        organizationId,
        organizationName: organizationName(organization),
        organizationSlug: organizationSlug(organization),
        userId
      }
    ]
  })

  if (contexts.length === 0) {
    throw new AgentMailTrialError('Trial agent claim is not authorized', 403)
  }

  return {
    activeOrganizationId: activeSessionOrganizationId(session),
    contexts: contexts.sort((left, right) => left.organizationName.localeCompare(right.organizationName)),
    userId
  }
}

function activeSessionOrganizationId(session: GlobalAuthSession): OrganizationId | null {
  const organizationId = session.session.activeOrganizationId
  return typeof organizationId === 'string' && organizationId ? (organizationId as OrganizationId) : null
}

function selectTrialClaimContext(
  claimAccess: TrialClaimUserAccess,
  requestedOrganizationId?: string
): TrialClaimAuthorizedContext {
  if (requestedOrganizationId) {
    const context = claimAccess.contexts.find((candidate) =>
      sameId(candidate.organizationId, requestedOrganizationId)
    )
    if (!context) {
      throw new AgentMailTrialError('Trial claim target organization is not authorized', 403)
    }
    return context
  }

  const activeContext = claimAccess.activeOrganizationId
    ? claimAccess.contexts.find((context) => sameId(context.organizationId, claimAccess.activeOrganizationId))
    : null
  const context = activeContext ?? claimAccess.contexts[0]
  if (!context) {
    throw new AgentMailTrialError('Trial agent claim is not authorized', 403)
  }
  return context
}

function canClaimTrialAgent(
  ability: ReturnType<typeof buildAgentMailAbility>,
  organizationId: OrganizationId
) {
  return ability.can('claim', agentMailSubject('Agent', { organizationId }))
}

function sameId(left: unknown, right: unknown) {
  return String(left) === String(right)
}

function organizationName(organization: Pick<OrganizationDocument, 'name'> | undefined) {
  return organization?.name?.trim() || 'Organization'
}

function organizationSlug(organization: Pick<OrganizationDocument, 'slug'> | undefined) {
  return organization?.slug?.trim() || null
}

async function requirePendingTrialClaim(token: string): Promise<AgentMailTrialClaimIntentDocument> {
  const trimmedToken = token.trim()
  if (!trimmedToken) {
    throw new AgentMailTrialError('Trial claim token is required', 400)
  }
  const { db } = await globals()
  const claim = await db.models.agentMailTrialClaimIntent
    .findOne({ tokenHash: hashClaimToken(trimmedToken) })
    .exec()
  if (!claim) {
    throw new AgentMailTrialError('Trial claim was not found', 404)
  }
  if (claim.status !== 'pending') {
    throw new AgentMailTrialError('Trial claim has already been resolved', 409)
  }
  if (claim.expiresAt instanceof Date && claim.expiresAt.getTime() <= Date.now()) {
    throw new AgentMailTrialError('Trial claim has expired', 410)
  }
  return claim
}

function requireClaimableTrial(trial: AgentMailTrialDocument | null): AgentMailTrialDocument {
  if (!trial) {
    throw new AgentMailTrialError('Trial was not found', 404)
  }
  if (trial.status !== 'active') {
    throw new AgentMailTrialError('Trial is not claimable', 409)
  }
  if (trial.expiresAt instanceof Date && trial.expiresAt.getTime() <= Date.now()) {
    throw new AgentMailTrialError('Trial has expired', 410)
  }
  return trial
}

function resolveTrialPolicy({
  requestedCapabilities,
  requestedPostClaimCapabilities
}: {
  requestedCapabilities: ReadonlyArray<AgentMailTrialCapabilityValue> | undefined
  requestedPostClaimCapabilities: ReadonlyArray<AgentMailTrialCapabilityValue> | undefined
}) {
  if (!PRIVATE_VARS.AGENT_MAIL_TRIAL_ENABLED) {
    throw new AgentMailTrialError('Agent Mail trials are not enabled', 503)
  }
  if (!PRIVATE_VARS.AGENT_MAIL_TRIAL_ORGANIZATION_ID) {
    throw new AgentMailTrialError('Agent Mail trial organization is not configured', 503)
  }
  if (!PRIVATE_VARS.AGENT_MAIL_TRIAL_DOMAIN) {
    throw new AgentMailTrialError('Agent Mail trial domain is not configured', 503)
  }

  const organizationId = parseTrialOrganizationId(PRIVATE_VARS.AGENT_MAIL_TRIAL_ORGANIZATION_ID)
  const hostedDomain = parseTrialHostedDomain(PRIVATE_VARS.AGENT_MAIL_TRIAL_DOMAIN)
  const configuredCapabilities = parseTrialCapabilities(PRIVATE_VARS.AGENT_MAIL_TRIAL_CAPABILITIES)
  const allowedCapabilities = new Set(configuredCapabilities)
  const capabilities = requestedCapabilities?.length ? requestedCapabilities : configuredCapabilities
  const postClaimCapabilities = requestedPostClaimCapabilities?.length
    ? requestedPostClaimCapabilities
    : capabilities

  for (const capability of [...capabilities, ...postClaimCapabilities]) {
    if (!allowedCapabilities.has(capability)) {
      throw new AgentMailTrialError('Requested trial capability is not allowed by server policy', 400)
    }
  }

  const policy = AgentMailTrialPolicyContractV1.safeParse({
    capabilities,
    claimIntentTtlSeconds: PRIVATE_VARS.AGENT_MAIL_TRIAL_CLAIM_INTENT_TTL_SECONDS,
    dailySendLimit: PRIVATE_VARS.AGENT_MAIL_TRIAL_DAILY_SEND_LIMIT,
    hostedDomain,
    mailboxLifetimeSeconds: PRIVATE_VARS.AGENT_MAIL_TRIAL_MAILBOX_LIFETIME_SECONDS,
    totalSendLimit: PRIVATE_VARS.AGENT_MAIL_TRIAL_TOTAL_SEND_LIMIT,
    version: 1
  })
  if (!policy.success) {
    throw new AgentMailTrialError('Agent Mail trial policy is invalid', 503)
  }

  return {
    ...policy.data,
    capabilities: [...new Set(policy.data.capabilities)],
    postClaimCapabilities: [...new Set(postClaimCapabilities)],
    admissionToken: PRIVATE_VARS.AGENT_MAIL_TRIAL_ADMISSION_TOKEN,
    maxActiveTrials: PRIVATE_VARS.AGENT_MAIL_TRIAL_MAX_ACTIVE,
    organizationId
  }
}

function requireTrialAdmissionToken(requestedToken: string | undefined, configuredToken: string | undefined) {
  if (!configuredToken) {
    throw new AgentMailTrialError('Agent Mail trial admission is not configured', 503)
  }

  const token = requestedToken?.trim()
  if (!token) {
    throw new AgentMailTrialError('Agent Mail trial admission is required', 403)
  }

  if (!timingSafeEqual(sha256Buffer(token), sha256Buffer(configuredToken))) {
    throw new AgentMailTrialError('Agent Mail trial admission is not authorized', 403)
  }
}

async function enforceActiveTrialLimit({
  db,
  maxActiveTrials,
  now
}: {
  db: Pick<Database, 'models'>
  maxActiveTrials: number
  now: Date
}) {
  const activeTrialCount = await db.models.agentMailTrial
    .countDocuments({
      expiresAt: { $gt: now },
      status: 'active'
    })
    .exec()

  if (activeTrialCount >= maxActiveTrials) {
    throw new AgentMailTrialError('Agent Mail trial capacity has been reached', 429)
  }
}

function parseTrialOrganizationId(value: string): OrganizationId {
  try {
    return parseUUIDv7(value) as OrganizationId
  } catch {
    throw new AgentMailTrialError('Agent Mail trial organization is invalid', 503)
  }
}

function parseTrialHostedDomain(value: string): string {
  const domain = value.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(domain)) {
    throw new AgentMailTrialError('Agent Mail trial domain is invalid', 503)
  }
  return domain
}

function parseTrialCapabilities(value: string): AgentMailTrialCapabilityValue[] {
  const capabilities = value
    .split(',')
    .map((capability) => capability.trim())
    .filter(Boolean)
    .map((capability) => {
      const parsed = AgentMailTrialCapability.safeParse(capability)
      if (!parsed.success) {
        throw new AgentMailTrialError('Agent Mail trial capabilities are invalid', 503)
      }
      return parsed.data
    })

  if (capabilities.length === 0) {
    throw new AgentMailTrialError('Agent Mail trial capabilities are not configured', 503)
  }

  return [...new Set(capabilities)]
}

function normalizeTrialAgentName(value: string | undefined): string {
  const name = value?.replace(/\s+/gu, ' ').trim()
  return name && name.length > 0 ? name : 'Trial agent'
}

function createTrialMailboxAddress(domain: string, rawPrefix: string): string {
  const prefix = rawPrefix.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/u.test(prefix)) {
    throw new AgentMailTrialError('Agent Mail trial mailbox prefix is invalid', 503)
  }

  return `${prefix}-${randomBytes(8).toString('hex')}@${domain}`
}

function trialGrantForCapability({
  agentId,
  capability,
  expiresAt,
  mailboxAddress,
  organizationId
}: {
  agentId: AgentId
  capability: AgentMailTrialCapabilityValue
  expiresAt: Date
  mailboxAddress: string
  organizationId: OrganizationId
}): TrialCapabilityGrantInput {
  const constraints: Record<string, string> = capability.startsWith('email.message.')
    ? {
        mailboxAddress,
        organizationId: String(organizationId)
      }
    : {
        organizationId: String(organizationId)
      }
  const now = new Date()

  return {
    agentId,
    capability,
    constraints,
    createdAt: now,
    deniedBy: null,
    expiresAt,
    grantedBy: null,
    reason: 'autonomous_trial',
    status: 'active',
    updatedAt: now
  }
}

function toGrantView(grant: TrialCapabilityGrantInput): AgentMailTrialGrantView {
  return {
    capability: grant.capability,
    constraints: grant.constraints,
    expiresAt: grant.expiresAt.toISOString(),
    status: 'active'
  }
}

async function cleanupProvisionedTrialMailbox(
  client: ReturnType<typeof createWildDuckClient>,
  wildDuckUserId: string
) {
  await client.deleteUser(wildDuckUserId)
}

function toClaimView({
  agent,
  claim,
  organizationId,
  targetOrganizations,
  trial
}: {
  agent: { _id: AgentId | string; name: string; status: string }
  claim: Pick<AgentMailTrialClaimIntentDocument, 'expiresAt' | 'status'>
  organizationId: OrganizationId
  targetOrganizations: ReadonlyArray<TrialClaimAuthorizedContext>
  trial: Pick<AgentMailTrialDocument, '_id' | 'capabilities' | 'mailboxAddress'> & {
    postClaimCapabilities?: ReadonlyArray<AgentMailTrialCapabilityValue> | null
  }
}): AgentMailTrialClaimView {
  const postClaimCapabilities = trialPostClaimCapabilities(trial)

  return {
    agent: {
      id: publicIdFromUUIDv7(agent._id),
      name: agent.name,
      status: agent.status
    },
    capabilities: [...trial.capabilities],
    claim: {
      expires_at: claim.expiresAt.toISOString(),
      status: claim.status
    },
    mailbox: {
      address: trial.mailboxAddress
    },
    organization_id: String(organizationId),
    post_claim_capabilities: postClaimCapabilities,
    target_organizations: targetOrganizations.map((organization) => ({
      id: String(organization.organizationId),
      name: organization.organizationName,
      slug: organization.organizationSlug
    })),
    trial_id: publicIdFromUUIDv7(trial._id)
  }
}

function trialPostClaimCapabilities(
  trial: Pick<AgentMailTrialDocument, 'capabilities'> & {
    postClaimCapabilities?: ReadonlyArray<AgentMailTrialCapabilityValue> | null
  }
): AgentMailTrialCapabilityValue[] {
  const capabilities = trial.postClaimCapabilities?.length ? trial.postClaimCapabilities : trial.capabilities
  return [...new Set(capabilities)]
}

function trialClaimGrantConstraints({
  grant,
  mailboxAddress,
  organizationId
}: {
  grant: Pick<AgentCapabilityGrantDocument, 'capability'>
  mailboxAddress: string
  organizationId: OrganizationId
}): Record<string, string> {
  if (grant.capability.startsWith('email.message.')) {
    return {
      mailboxAddress,
      organizationId: String(organizationId)
    }
  }
  return {
    organizationId: String(organizationId)
  }
}

function requireUpdated(result: unknown, message: string) {
  if (!updateMatched(result)) {
    throw new AgentMailTrialError(message, 409)
  }
}

function updateMatched(result: unknown) {
  if (!result || typeof result !== 'object') {
    return false
  }
  const record = result as {
    matchedCount?: unknown
    modifiedCount?: unknown
    n?: unknown
    nModified?: unknown
  }
  return [record.modifiedCount, record.matchedCount, record.nModified, record.n].some(
    (value) => typeof value === 'number' && value > 0
  )
}

type ExecutableQuery<T> = {
  exec: () => Promise<T>
  session?: (session: ClientSession) => ExecutableQuery<T>
}

async function execQuery<T>(query: ExecutableQuery<T>, session: ClientSession | null): Promise<T> {
  return session ? (query.session?.(session) ?? query).exec() : query.exec()
}

async function withDatabaseTransaction<T>(
  db: Pick<Database, 'connection'>,
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  const transaction = db.connection.transaction.bind(db.connection)
  return transaction((session) => operation(session))
}

async function auditTrialClaim(action: string, metadata: Record<string, unknown>) {
  const { db } = await globals()
  await db.models.auditLog.create({
    action,
    metadata,
    severity: 'low',
    status: 'success'
  })
}

async function auditTrialProvisioningFailure(
  db: Pick<Database, 'models'>,
  metadata: Record<string, unknown>
) {
  await db.models.auditLog.create({
    action: 'agent_mail.trial.provisioning_failed',
    metadata,
    severity: 'high',
    status: 'failed'
  })
}

function errorName(error: unknown) {
  return error instanceof Error && error.name ? error.name : typeof error
}

function readWildDuckUserId(value: { id?: string; user?: string }): string | null {
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : null
  const user = typeof value.user === 'string' && value.user.trim() ? value.user.trim() : null
  return id ?? user
}

function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function sha256Buffer(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function createClaimUrl(token: string): string {
  return new URL(`/agent/claim/${encodeURIComponent(token)}`, PUBLIC_VARS.PUBLIC_HOSTNAME).toString()
}
