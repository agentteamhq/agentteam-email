import { AbilityBuilder, PureAbility, subject } from '@casl/ability'
import {
  AgentMailAbilityActionByCapability,
  AgentMailCapability,
  AgentMailCapabilityByMailboxGrant,
  AgentMailCapabilityBySystemPermission,
  AgentMailMailboxCapabilityGrantConstraints,
  AgentMailMailboxGrantConstraints,
  AgentMailOrganizationCapabilityGrantConstraints,
  AgentMailSystemGrantConstraints
} from '@main/db'
import type { ForcedSubject, MatchConditions } from '@casl/ability'
import type {
  AgentCapabilityGrantDocument,
  AgentMailAbilityAction,
  AgentMailCapability as AgentMailCapabilityValue,
  AgentMailMailboxCapabilityGrantConstraintsSchema,
  AgentMailMailboxGrantDocument,
  AgentMailPrincipalType,
  AgentMailSubject,
  AgentMailSystemGrantDocument,
  ORG_MEMBER_ROLE,
  OrganizationId,
  UserId
} from '@main/db'

const lambdaMatcher = (matchConditions: MatchConditions) => matchConditions

export interface AgentMailPrincipal {
  capabilities?: ReadonlyArray<AgentMailCapabilityValue>
  credentialId: string
  organizationId?: OrganizationId | null
  organizationRole?: ORG_MEMBER_ROLE | null
  principalId: string
  principalType: AgentMailPrincipalType
  scopes?: ReadonlyArray<string>
  userId?: UserId | null
}

interface AgentMailOrganizationResourceSubject {
  organizationId: OrganizationId
}

interface AgentMailAgentResourceSubject extends AgentMailOrganizationResourceSubject {
  agentId?: string | null
}

interface AgentMailAgentGrantResourceSubject extends AgentMailAgentResourceSubject {
  capability?: string | null
  mailboxAddress?: string | null
  permission?: string | null
}

interface AgentMailDomainResourceSubject extends AgentMailOrganizationResourceSubject {
  domain?: string | null
}

interface AgentMailMailboxResourceSubject extends AgentMailOrganizationResourceSubject {
  mailboxAddress?: string | null
}

interface AgentMailMessageResourceSubject extends AgentMailMailboxResourceSubject {
  recipientAddresses?: ReadonlyArray<string> | null
}

interface AgentMailOAuthConnectionResourceSubject extends AgentMailOrganizationResourceSubject {
  oauthClientId?: string | null
  pluginId?: string | null
}

export interface AgentMailResourceSubjectBySubject {
  Agent: AgentMailAgentResourceSubject
  AgentGrant: AgentMailAgentGrantResourceSubject
  ApiKey: AgentMailOrganizationResourceSubject
  Domain: AgentMailDomainResourceSubject
  Draft: AgentMailMailboxResourceSubject
  ForwardingGroup: AgentMailMailboxResourceSubject
  Mailbox: AgentMailMailboxResourceSubject
  Message: AgentMailMessageResourceSubject
  OAuthConnection: AgentMailOAuthConnectionResourceSubject
  Organization: AgentMailOrganizationResourceSubject
}

export type AgentMailResourceSubject = AgentMailResourceSubjectBySubject[AgentMailSubject]
type AgentMailMailboxAddressResourceSubject =
  | AgentMailAgentGrantResourceSubject
  | AgentMailMailboxResourceSubject
  | AgentMailMessageResourceSubject
type AgentMailCapabilityResourceSubject = AgentMailAgentGrantResourceSubject

type AppSubject = 'all' | AgentMailSubject | (ForcedSubject<AgentMailSubject> & AgentMailResourceSubject)

export type AgentMailAbility = PureAbility<[AgentMailAbilityAction, AppSubject], MatchConditions>

export function buildAgentMailAbility({
  capabilityGrants = [],
  mailboxGrants,
  principal,
  systemGrants
}: {
  capabilityGrants?: ReadonlyArray<AgentCapabilityGrantDocument>
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>
  principal: AgentMailPrincipal
  systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
}): AgentMailAbility {
  const { can, build } = new AbilityBuilder<AgentMailAbility>(PureAbility)
  const now = new Date()

  if (
    principal.principalType === 'user_session' &&
    principal.organizationId &&
    isMailOrganizationAdministrator(principal.organizationRole)
  ) {
    const organizationId = principal.organizationId
    can('status', 'Organization', (resource) => sameOrganization(resource, organizationId))
    can(
      [
        'archive',
        'create',
        'createDraft',
        'list',
        'manage',
        'markRead',
        'read',
        'reply',
        'search',
        'send',
        'update'
      ],
      'Mailbox',
      (resource) => sameOrganization(resource, organizationId)
    )
    can(['archive', 'list', 'manage', 'markRead', 'read', 'reply', 'search', 'send'], 'Message', (resource) =>
      sameOrganization(resource, organizationId)
    )
    can(['createDraft', 'read', 'send'], 'Draft', (resource) => sameOrganization(resource, organizationId))
    can('manage', 'Domain', (resource) => sameOrganization(resource, organizationId))
    can('manage', 'ForwardingGroup', (resource) => sameOrganization(resource, organizationId))
    can(['claim', 'manage'], 'Agent', (resource) => sameOrganization(resource, organizationId))
    can('manage', 'AgentGrant', (resource) => sameOrganization(resource, organizationId))
    can('manage', 'OAuthConnection', (resource) => sameOrganization(resource, organizationId))
  }

  for (const grant of mailboxGrants) {
    if (
      !isGrantActive(grant, now) ||
      !matchesPrincipal(grant, principal) ||
      !hasSupportedMailboxGrantConstraints(grant)
    ) {
      continue
    }

    can('status', 'Organization', (resource) => sameOrganization(resource, grant.organizationId))

    for (const capability of AgentMailCapabilityByMailboxGrant[grant.capability]) {
      const action = AgentMailAbilityActionByCapability[capability]
      const condition = (resource: AgentMailMailboxAddressResourceSubject) =>
        sameOrganization(resource, grant.organizationId) &&
        normalizedMailbox(resource.mailboxAddress) === normalizedMailbox(grant.mailboxAddress)

      can(action, 'Mailbox', condition)
      can(action, 'Message', condition)
      can(action, 'Draft', condition)
      can(
        'manage',
        'AgentGrant',
        (resource: AgentMailCapabilityResourceSubject) =>
          condition(resource) && resource.capability === capability
      )
    }
  }

  for (const grant of systemGrants) {
    if (
      !isGrantActive(grant, now) ||
      !matchesPrincipal(grant, principal) ||
      !hasSupportedSystemGrantConstraints(grant)
    ) {
      continue
    }

    can('status', 'Organization', (resource) => sameOrganization(resource, grant.organizationId))

    for (const capability of AgentMailCapabilityBySystemPermission[grant.permission]) {
      const action = AgentMailAbilityActionByCapability[capability]
      const condition = (resource: AgentMailResourceSubject) =>
        sameOrganization(resource, grant.organizationId)

      if (grant.permission === 'createAccounts') {
        can(action, 'Mailbox', condition)
      }
      if (grant.permission === 'manageAccounts') {
        can(action, 'Mailbox', condition)
      }
      if (grant.permission === 'manageForwardingGroups') {
        can(action, 'ForwardingGroup', condition)
      }
      if (grant.permission === 'readAllMailboxes') {
        can(['list', 'read', 'search'], 'Mailbox', condition)
        can(['list', 'read', 'search'], 'Message', condition)
      }
      if (grant.permission === 'manageAgents') {
        can('manage', 'Agent', condition)
      }
      if (grant.permission === 'manageDomains') {
        can('manage', 'Domain', condition)
      }
      if (grant.permission === 'manageOAuthConnections') {
        can('manage', 'OAuthConnection', condition)
      }
      can(
        'manage',
        'AgentGrant',
        (resource: AgentMailCapabilityResourceSubject) =>
          condition(resource) && resource.capability === capability
      )
    }
  }

  for (const grant of capabilityGrants) {
    if (!isAgentCapabilityGrantActive(grant, now) || !matchesAgentCapabilityGrant(grant, principal)) {
      continue
    }

    const capability = AgentMailCapability.safeParse(grant.capability)
    if (!capability.success) {
      continue
    }

    addAgentMailCapabilityRule(can, capability.data, grant)
  }

  return build({ conditionsMatcher: lambdaMatcher })
}

export function agentMailSubject<TSubject extends keyof AgentMailResourceSubjectBySubject>(
  subjectName: TSubject,
  resource: AgentMailResourceSubjectBySubject[TSubject]
) {
  return subject(subjectName, resource)
}

function matchesPrincipal(
  grant: Pick<AgentMailMailboxGrantDocument | AgentMailSystemGrantDocument, 'principalId' | 'principalType'>,
  principal: AgentMailPrincipal
) {
  return grant.principalId === principal.principalId && grant.principalType === principal.principalType
}

function isGrantActive(
  grant: Pick<AgentMailMailboxGrantDocument | AgentMailSystemGrantDocument, 'expiresAt' | 'status'>,
  now: Date
) {
  return grant.status === 'active' && (!grant.expiresAt || grant.expiresAt > now)
}

function hasSupportedMailboxGrantConstraints(grant: Pick<AgentMailMailboxGrantDocument, 'constraints'>) {
  return AgentMailMailboxGrantConstraints.safeParse(grant.constraints ?? null).success
}

function hasSupportedSystemGrantConstraints(grant: Pick<AgentMailSystemGrantDocument, 'constraints'>) {
  return AgentMailSystemGrantConstraints.safeParse(grant.constraints ?? null).success
}

function matchesAgentCapabilityGrant(
  grant: Pick<AgentCapabilityGrantDocument, 'agentId'>,
  principal: AgentMailPrincipal
) {
  return principal.principalType === 'agent' && String(grant.agentId) === principal.principalId
}

function isAgentCapabilityGrantActive(
  grant: Pick<AgentCapabilityGrantDocument, 'expiresAt' | 'status'>,
  now: Date
) {
  return grant.status === 'active' && (!grant.expiresAt || grant.expiresAt > now)
}

function addAgentMailCapabilityRule(
  can: AbilityBuilder<AgentMailAbility>['can'],
  capability: AgentMailCapabilityValue,
  grant: AgentCapabilityGrantDocument
) {
  const action = AgentMailAbilityActionByCapability[capability]

  if (isMailboxScopedCapability(capability)) {
    const constraints = AgentMailMailboxCapabilityGrantConstraints.safeParse(
      agentMailCapabilityGrantConstraints(grant.constraints)
    )
    if (!constraints.success) {
      return
    }

    const constraintData = constraints.data
    const organizationId = constraintData.organizationId as OrganizationId
    const mailboxAddress = constraints.data.mailboxAddress
    const mailboxCondition = (resource: AgentMailMailboxAddressResourceSubject) =>
      sameOrganization(resource, organizationId) &&
      normalizedMailbox(resource.mailboxAddress) === normalizedMailbox(mailboxAddress)
    const messageCondition = (resource: AgentMailMessageResourceSubject) =>
      mailboxCondition(resource) && recipientConstraintsSatisfied(resource, capability, constraintData)

    can('status', 'Organization', (resource) => sameOrganization(resource, organizationId))
    can(action, 'Mailbox', mailboxCondition)
    can(action, 'Message', messageCondition)
    can(action, 'Draft', mailboxCondition)
    can(
      'manage',
      'AgentGrant',
      (resource: AgentMailCapabilityResourceSubject) =>
        mailboxCondition(resource) && resource.capability === capability
    )
    return
  }

  const constraints = AgentMailOrganizationCapabilityGrantConstraints.safeParse(
    agentMailCapabilityGrantConstraints(grant.constraints)
  )
  if (!constraints.success) {
    return
  }

  const organizationId = constraints.data.organizationId as OrganizationId
  const condition = (resource: AgentMailResourceSubject) => sameOrganization(resource, organizationId)

  can('status', 'Organization', condition)

  if (capability === 'email.mailbox.create' || capability === 'email.mailbox.provision') {
    can(action, 'Mailbox', condition)
  }
  if (capability === 'email.mailbox.update') {
    can(action, 'Mailbox', condition)
  }
  if (capability === 'email.forwarding_group.manage') {
    can(action, 'ForwardingGroup', condition)
  }
  if (capability === 'email.mailbox.read_all') {
    can(['list', 'read', 'search'], 'Mailbox', condition)
    can(['list', 'read', 'search'], 'Message', condition)
  }
  if (capability === 'email.agent.claim') {
    can(action, 'Agent', condition)
  }
  if (capability === 'email.agent.manage') {
    can(action, 'Agent', condition)
  }
  if (capability === 'email.oauth_connection.manage') {
    can(action, 'OAuthConnection', condition)
  }
  if (capability === 'email.domain.manage') {
    can(action, 'Domain', condition)
  }
  can(
    'manage',
    'AgentGrant',
    (resource: AgentMailCapabilityResourceSubject) =>
      condition(resource) && resource.capability === capability
  )
}

export function agentMailCapabilityGrantOrganizationId(
  grant: Pick<AgentCapabilityGrantDocument, 'capability' | 'constraints' | 'expiresAt' | 'status'>,
  now = new Date(),
  {
    statuses = ['active']
  }: {
    statuses?: ReadonlyArray<AgentCapabilityGrantDocument['status']>
  } = {}
): OrganizationId | null {
  if (!statuses.includes(grant.status) || (grant.expiresAt instanceof Date && grant.expiresAt <= now)) {
    return null
  }

  const capability = AgentMailCapability.safeParse(grant.capability)
  if (!capability.success) {
    return null
  }

  const constraints = isMailboxScopedCapability(capability.data)
    ? AgentMailMailboxCapabilityGrantConstraints.safeParse(
        agentMailCapabilityGrantConstraints(grant.constraints)
      )
    : AgentMailOrganizationCapabilityGrantConstraints.safeParse(
        agentMailCapabilityGrantConstraints(grant.constraints)
      )

  return constraints.success ? (constraints.data.organizationId as OrganizationId) : null
}

export function agentMailCapabilityGrantConstraints(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

export function agentMailMailboxGrantOrganizationId(
  grant: Pick<AgentMailMailboxGrantDocument, 'constraints' | 'expiresAt' | 'organizationId' | 'status'>,
  now = new Date(),
  {
    statuses = ['active']
  }: {
    statuses?: ReadonlyArray<AgentMailMailboxGrantDocument['status']>
  } = {}
): OrganizationId | null {
  if (!statuses.includes(grant.status) || (grant.expiresAt instanceof Date && grant.expiresAt <= now)) {
    return null
  }

  return hasSupportedMailboxGrantConstraints(grant) ? grant.organizationId : null
}

export function agentMailSystemGrantOrganizationId(
  grant: Pick<AgentMailSystemGrantDocument, 'constraints' | 'expiresAt' | 'organizationId' | 'status'>,
  now = new Date(),
  {
    statuses = ['active']
  }: {
    statuses?: ReadonlyArray<AgentMailSystemGrantDocument['status']>
  } = {}
): OrganizationId | null {
  if (!statuses.includes(grant.status) || (grant.expiresAt instanceof Date && grant.expiresAt <= now)) {
    return null
  }

  return hasSupportedSystemGrantConstraints(grant) ? grant.organizationId : null
}

function isMailboxScopedCapability(capability: AgentMailCapabilityValue) {
  return capability.startsWith('email.message.')
}

function sameOrganization(resource: AgentMailResourceSubject, organizationId: OrganizationId) {
  return String(resource.organizationId) === String(organizationId)
}

function normalizedMailbox(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function recipientConstraintsSatisfied(
  resource: AgentMailMessageResourceSubject,
  capability: AgentMailCapabilityValue,
  constraints: AgentMailMailboxCapabilityGrantConstraintsSchema
) {
  if (capability !== 'email.message.send' && capability !== 'email.message.reply') {
    return true
  }

  const allowedRecipients = new Set(
    (constraints.allowedRecipients ?? []).map((recipient) => normalizedMailbox(recipient))
  )
  const allowedDomains = new Set(
    (constraints.allowedRecipientDomains ?? []).map((domain) => domain.trim().toLowerCase())
  )
  const allowedPatterns = constraints.allowedRecipientPatterns ?? []
  if (!allowedRecipients.size && !allowedDomains.size && !allowedPatterns.length) {
    return true
  }

  const recipients = resource.recipientAddresses
    ?.map((recipient) => normalizedMailbox(recipient))
    .filter(Boolean)
  if (!recipients?.length) {
    return false
  }

  return recipients.every((recipient) => {
    const domain = recipient.split('@').at(1) ?? ''
    return (
      allowedRecipients.has(recipient) ||
      allowedDomains.has(domain) ||
      allowedPatterns.some((pattern) => wildcardMatches(pattern, recipient))
    )
  })
}

function wildcardMatches(pattern: string, value: string) {
  const expression = wildcardPatternToRegExp(pattern)
  return expression.test(value)
}

function wildcardPatternToRegExp(pattern: string) {
  const escaped = pattern
    .trim()
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replaceAll('*', '.*')
    .replaceAll('?', '.')
  return new RegExp(`^${escaped}$`, 'u')
}

function isMailOrganizationAdministrator(role: ORG_MEMBER_ROLE | null | undefined) {
  return role === 'owner' || role === 'admin'
}
