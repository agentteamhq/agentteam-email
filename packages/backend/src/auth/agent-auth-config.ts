import {
  AgentMailCapability,
  AgentMailCapabilityValues,
  AgentMailMailboxCapabilityRequestConstraints,
  AgentMailOrganizationCapabilityRequestConstraints
} from '@main/db'

import { applyAgentMailEnrollmentGrantRequestForAgent } from '../agent-mail/enrollment-grants'
import { STRINGS } from '../strings'
import type { AgentAuthEvent, AgentAuthOptions, AgentAuthPath, Capability } from '@better-auth/agent-auth'
import type { Database } from '../db/db'

export const AGENT_AUTH_PUBLIC_RATE_LIMIT_RULES = {
  '/agent/register': {
    window: 60,
    max: 5
  },
  '/agent/claim': {
    window: 60,
    max: 10
  },
  '/host/enroll': {
    window: 60,
    max: 5
  }
} as const satisfies Partial<Record<AgentAuthPath, { window: number; max: number }>>

const AGENT_AUTH_GRANT_TTLS_SECONDS = {
  'email.agent.claim': 60 * 60 * 24,
  'email.agent.manage': 60 * 60 * 24,
  'email.domain.manage': 60 * 60 * 24,
  'email.forwarding_group.manage': 60 * 60 * 24,
  'email.mailbox.create': 60 * 60 * 24,
  'email.mailbox.provision': 60 * 60 * 24,
  'email.mailbox.read_all': 60 * 60 * 24 * 7,
  'email.mailbox.update': 60 * 60 * 24,
  'email.message.archive': 60 * 60 * 24 * 7,
  'email.message.create_draft': 60 * 60 * 24 * 7,
  'email.message.list': 60 * 60 * 24 * 30,
  'email.message.manage': 60 * 60 * 24 * 7,
  'email.message.mark_read': 60 * 60 * 24 * 7,
  'email.message.read': 60 * 60 * 24 * 30,
  'email.message.reply': 60 * 60 * 24 * 7,
  'email.message.search': 60 * 60 * 24 * 30,
  'email.message.send': 60 * 60 * 24,
  'email.oauth_connection.manage': 60 * 60 * 24,
  'email.status': 60 * 60 * 24 * 30
} as const satisfies Record<AgentMailCapability, number>

export const AGENT_AUTH_AGENT_SESSION_TTL_SECONDS = 60 * 60

export const AGENT_AUTH_CAPABILITIES = [
  {
    name: 'email.domain.manage',
    description: 'Connect, provision, and disconnect mail domains for an authorized organization.',
    approvalStrength: 'webauthn',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.domain.manage']
  },
  {
    name: 'email.status',
    description: 'Read AgentTeam Email service status for an authorized organization.',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.status']
  },
  {
    name: 'email.mailbox.provision',
    description: 'Provision mailbox infrastructure for an authorized organization.',
    approvalStrength: 'webauthn',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.mailbox.provision']
  },
  {
    name: 'email.message.list',
    description: 'List messages in an authorized mailbox.',
    requiredConstraints: ['mailboxAddress'],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.message.list']
  },
  {
    name: 'email.message.read',
    description: 'Read messages and threads in an authorized mailbox.',
    requiredConstraints: ['mailboxAddress'],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.message.read']
  },
  {
    name: 'email.message.search',
    description: 'Search messages in an authorized mailbox.',
    requiredConstraints: ['mailboxAddress'],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.message.search']
  },
  {
    name: 'email.message.create_draft',
    description: 'Create or update drafts in an authorized mailbox Drafts folder.',
    requiredConstraints: ['mailboxAddress'],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.message.create_draft']
  },
  {
    name: 'email.message.mark_read',
    description: 'Mark messages read or unread in an authorized mailbox.',
    requiredConstraints: ['mailboxAddress'],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.message.mark_read']
  },
  {
    name: 'email.message.archive',
    description: 'Archive messages in an authorized mailbox.',
    requiredConstraints: ['mailboxAddress'],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.message.archive']
  },
  {
    name: 'email.message.manage',
    description: 'Manage folders, flags, and deletion in an authorized mailbox.',
    requiredConstraints: ['mailboxAddress'],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.message.manage']
  },
  {
    name: 'email.message.send',
    description: 'Send new messages as an authorized mailbox.',
    approvalStrength: 'webauthn',
    requiredConstraints: ['mailboxAddress'],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.message.send']
  },
  {
    name: 'email.message.reply',
    description: 'Reply to messages as an authorized mailbox.',
    approvalStrength: 'webauthn',
    requiredConstraints: ['mailboxAddress'],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.message.reply']
  },
  {
    name: 'email.agent.claim',
    description: 'Claim an autonomous agent into an authorized user or organization.',
    approvalStrength: 'webauthn',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.agent.claim']
  },
  {
    name: 'email.agent.manage',
    description: 'Manage and revoke agents for an authorized organization.',
    approvalStrength: 'webauthn',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.agent.manage']
  },
  {
    name: 'email.oauth_connection.manage',
    description: 'Register and manage OAuth clients for authorized integrations.',
    approvalStrength: 'webauthn',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.oauth_connection.manage']
  },
  {
    name: 'email.mailbox.create',
    description: 'Create mailbox accounts for an authorized organization.',
    approvalStrength: 'webauthn',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.mailbox.create']
  },
  {
    name: 'email.mailbox.update',
    description: 'Update and disable mailbox accounts for an authorized organization.',
    approvalStrength: 'webauthn',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.mailbox.update']
  },
  {
    name: 'email.forwarding_group.manage',
    description: 'Manage forwarding groups for an authorized organization.',
    approvalStrength: 'webauthn',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.forwarding_group.manage']
  },
  {
    name: 'email.mailbox.read_all',
    description: 'Read all mailboxes in an authorized organization.',
    approvalStrength: 'webauthn',
    requiredConstraints: [],
    grantTTL: AGENT_AUTH_GRANT_TTLS_SECONDS['email.mailbox.read_all']
  }
] as const satisfies readonly Capability[]

export function createAgentAuthOptions(db: Database): AgentAuthOptions {
  return {
    allowDynamicHostRegistration: true,
    blockedCapabilities: [],
    capabilities: [...AGENT_AUTH_CAPABILITIES],
    defaultHostCapabilities: [],
    deviceAuthorizationPage: '/device/capabilities',
    agentSessionTTL: AGENT_AUTH_AGENT_SESSION_TTL_SECONDS,
    jtiCacheStorage: 'secondary-storage',
    jwksCacheStorage: 'secondary-storage',
    modes: ['delegated', 'autonomous'],
    providerDescription: 'Email accounts, message operations, and mailbox administration for AI agents.',
    providerName: STRINGS.BRAND_NAME,
    proofOfPresence: {
      enabled: true
    },
    rateLimit: AGENT_AUTH_PUBLIC_RATE_LIMIT_RULES,
    resolveAutonomousUser: ({ agentId }) => ({
      email: `${agentId}@autonomous.agent.invalid`,
      id: agentId,
      name: 'Autonomous agent'
    }),
    resolveGrantTTL: ({ capability }) =>
      isAgentMailCapability(capability) ? AGENT_AUTH_GRANT_TTLS_SECONDS[capability] : null,
    trustProxy: true,
    validateCapabilities: (capabilities) => capabilities.every(isAgentMailCapability),
    onEvent: async (event) => {
      if (event.type === 'agent.created' && event.agentId && event.hostId) {
        await applyEnrollmentGrantRequestFromEvent(db, event.agentId, event.hostId)
      }
      await db.models.auditLog.create({
        action: `agent_auth.${event.type}`,
        metadata: agentAuthAuditMetadata(event),
        severity: eventSeverity(event),
        status: eventStatus(event)
      })
    }
  }
}

export function isAgentMailCapability(value: string): value is AgentMailCapability {
  return AgentMailCapability.safeParse(value).success
}

export function isValidAgentMailCapabilityRequestBody(body: unknown): boolean {
  if (!isRecord(body) || !('capabilities' in body)) {
    return true
  }

  const capabilities = body.capabilities
  return Array.isArray(capabilities) && capabilities.every(isValidAgentMailCapabilityRequest)
}

function isValidAgentMailCapabilityRequest(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  const capability = value.name
  if (typeof capability !== 'string' || !isAgentMailCapability(capability)) {
    return false
  }

  return capability.startsWith('email.message.')
    ? AgentMailMailboxCapabilityRequestConstraints.safeParse(value.constraints).success
    : AgentMailOrganizationCapabilityRequestConstraints.safeParse(value.constraints ?? {}).success
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function applyEnrollmentGrantRequestFromEvent(db: Database, agentId: string, hostId: string) {
  try {
    await applyAgentMailEnrollmentGrantRequestForAgent({ agentId, db, hostId })
  } catch (error) {
    await db.models.auditLog.create({
      action: 'agent_mail.agent.enrollment_grants.apply_failed',
      metadata: {
        agentId,
        error: error instanceof Error ? error.message : 'Unknown enrollment grant application error',
        hostId
      },
      severity: 'high',
      status: 'failed'
    })
  }
}

function eventStatus(event: AgentAuthEvent) {
  return 'status' in event && event.status === 'error' ? 'failed' : 'success'
}

function eventSeverity(event: AgentAuthEvent) {
  if ('status' in event && event.status === 'error') {
    return 'medium'
  }
  if (event.type.includes('revoked') || event.type.includes('denied')) {
    return 'medium'
  }
  return 'low'
}

function agentAuthAuditMetadata(event: AgentAuthEvent): Record<string, unknown> {
  return {
    actorId: event.actorId ?? null,
    actorType: event.actorType ?? null,
    agentId: event.agentId ?? null,
    capability: 'capability' in event ? event.capability : null,
    hostId: event.hostId ?? null,
    orgId: event.orgId ?? null,
    status: 'status' in event ? event.status : null,
    targetId: event.targetId ?? null,
    targetType: event.targetType ?? null,
    type: event.type
  }
}
