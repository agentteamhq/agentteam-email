import { z } from 'zod'

export const AgentMailCapabilityValues = [
  'email.domain.manage',
  'email.status',
  'email.mailbox.provision',
  'email.message.list',
  'email.message.read',
  'email.message.search',
  'email.message.create_draft',
  'email.message.mark_read',
  'email.message.archive',
  'email.message.manage',
  'email.message.send',
  'email.message.reply',
  'email.agent.claim',
  'email.agent.manage',
  'email.oauth_connection.manage',
  'email.mailbox.create',
  'email.mailbox.update',
  'email.forwarding_group.manage',
  'email.mailbox.read_all'
] as const
export type AgentMailCapability = (typeof AgentMailCapabilityValues)[number]

export const AgentMailMailboxGrantValues = [
  'createDrafts',
  'manageMessages',
  'readMailbox',
  'sendAs'
] as const
export type AgentMailMailboxGrant = (typeof AgentMailMailboxGrantValues)[number]

export const AgentMailDefaultMailboxGrantValues = [
  'readMailbox',
  'sendAs',
  'createDrafts',
  'manageMessages'
] as const satisfies ReadonlyArray<AgentMailMailboxGrant>

export const AgentMailSystemPermissionValues = [
  'createAccounts',
  'manageAccounts',
  'manageAgents',
  'manageDomains',
  'manageForwardingGroups',
  'manageOAuthConnections',
  'readAllMailboxes'
] as const
export type AgentMailSystemPermission = (typeof AgentMailSystemPermissionValues)[number]

export interface AgentMailAdminPermissionMetadata {
  description: string
  label: string
}

export interface AgentMailAdminPermissionOption<
  TValue extends string
> extends AgentMailAdminPermissionMetadata {
  value: TValue
}

export interface AgentMailCapabilityCatalog {
  capabilities: ReadonlyArray<AgentMailCapability>
  capabilityOptions: ReadonlyArray<AgentMailAdminPermissionOption<AgentMailCapability>>
}

export interface AgentMailAdminPermissionCatalog {
  defaultMailboxGrants: ReadonlyArray<AgentMailMailboxGrant>
  mailboxGrantOptions: ReadonlyArray<AgentMailAdminPermissionOption<AgentMailMailboxGrant>>
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrant>
  systemPermissionOptions: ReadonlyArray<AgentMailAdminPermissionOption<AgentMailSystemPermission>>
  systemPermissions: ReadonlyArray<AgentMailSystemPermission>
}

const agentMailCapabilityMetadata = {
  'email.agent.claim': {
    description: 'Claim autonomous trial agents into an organization.',
    label: 'Claim agents'
  },
  'email.agent.manage': {
    description: 'Approve, revoke, and manage organization agent access.',
    label: 'Manage agents'
  },
  'email.oauth_connection.manage': {
    description: 'Register and manage OAuth clients for authorized integrations.',
    label: 'Manage OAuth connections'
  },
  'email.domain.manage': {
    description: 'Connect, provision, and disconnect organization mail domains.',
    label: 'Manage domains'
  },
  'email.forwarding_group.manage': {
    description: 'Create and manage forwarding groups.',
    label: 'Manage forwarding groups'
  },
  'email.mailbox.create': {
    description: 'Create mailbox accounts.',
    label: 'Create mailboxes'
  },
  'email.mailbox.provision': {
    description: 'Provision mailbox infrastructure.',
    label: 'Provision mailboxes'
  },
  'email.mailbox.read_all': {
    description: 'Read and search all organization mailboxes.',
    label: 'Read all mailboxes'
  },
  'email.mailbox.update': {
    description: 'Update mailbox account settings and status.',
    label: 'Manage mailboxes'
  },
  'email.message.archive': {
    description: 'Archive messages in authorized mailboxes.',
    label: 'Archive messages'
  },
  'email.message.create_draft': {
    description: 'Create and replace drafts in authorized mailboxes.',
    label: 'Create drafts'
  },
  'email.message.list': {
    description: 'List messages in authorized mailboxes.',
    label: 'List messages'
  },
  'email.message.manage': {
    description: 'Manage messages in authorized mailboxes.',
    label: 'Manage messages'
  },
  'email.message.mark_read': {
    description: 'Mark messages read or unread in authorized mailboxes.',
    label: 'Mark read'
  },
  'email.message.read': {
    description: 'Read messages in authorized mailboxes.',
    label: 'Read messages'
  },
  'email.message.reply': {
    description: 'Reply from authorized mailbox addresses.',
    label: 'Reply to messages'
  },
  'email.message.search': {
    description: 'Search messages in authorized mailboxes.',
    label: 'Search messages'
  },
  'email.message.send': {
    description: 'Send from authorized mailbox addresses.',
    label: 'Send messages'
  },
  'email.status': {
    description: 'Read mailbox status and service health.',
    label: 'Mailbox status'
  }
} as const satisfies Record<AgentMailCapability, AgentMailAdminPermissionMetadata>

const agentMailMailboxGrantMetadata = {
  createDrafts: {
    description: 'Create and replace drafts in granted mailboxes.',
    label: 'Create drafts'
  },
  manageMessages: {
    description: 'Archive, mark read, and manage messages in granted mailboxes.',
    label: 'Manage messages'
  },
  readMailbox: {
    description: 'List, read, and search messages in granted mailboxes.',
    label: 'Read mailbox'
  },
  sendAs: {
    description: 'Send and reply from granted mailbox addresses.',
    label: 'Send as mailbox'
  }
} as const satisfies Record<AgentMailMailboxGrant, AgentMailAdminPermissionMetadata>

const agentMailSystemPermissionMetadata = {
  createAccounts: {
    description: 'Create mailbox accounts in the organization.',
    label: 'Create accounts'
  },
  manageAccounts: {
    description: 'Update and disable mailbox accounts in the organization.',
    label: 'Manage accounts'
  },
  manageAgents: {
    description: 'Create, update, revoke, and grant access to agents.',
    label: 'Manage agents'
  },
  manageDomains: {
    description: 'Connect, provision, and disconnect organization mail domains.',
    label: 'Manage domains'
  },
  manageForwardingGroups: {
    description: 'Create and manage forwarding groups in the organization.',
    label: 'Manage forwarding groups'
  },
  manageOAuthConnections: {
    description: 'Register and manage OAuth clients for authorized integrations.',
    label: 'Manage OAuth connections'
  },
  readAllMailboxes: {
    description: 'Read and search every mailbox in the organization.',
    label: 'Read all mailboxes'
  }
} as const satisfies Record<AgentMailSystemPermission, AgentMailAdminPermissionMetadata>

export const agentMailAdminPermissionCatalog = {
  defaultMailboxGrants: AgentMailDefaultMailboxGrantValues,
  mailboxGrants: AgentMailMailboxGrantValues,
  mailboxGrantOptions: AgentMailMailboxGrantValues.map((value) => ({
    value,
    ...agentMailMailboxGrantMetadata[value]
  })),
  systemPermissionOptions: AgentMailSystemPermissionValues.map((value) => ({
    value,
    ...agentMailSystemPermissionMetadata[value]
  })),
  systemPermissions: AgentMailSystemPermissionValues
} satisfies AgentMailAdminPermissionCatalog

export const agentMailCapabilityCatalog = {
  capabilities: AgentMailCapabilityValues,
  capabilityOptions: AgentMailCapabilityValues.map((value) => ({
    value,
    ...agentMailCapabilityMetadata[value]
  }))
} satisfies AgentMailCapabilityCatalog

export const AgentMailPrincipalTypeValues = [
  'agent',
  'api_key',
  'oauth_client',
  'service',
  'user_session'
] as const
export type AgentMailPrincipalType = (typeof AgentMailPrincipalTypeValues)[number]

export const AgentMailGrantStatusValues = ['active', 'expired', 'pending', 'revoked'] as const
export type AgentMailGrantStatus = (typeof AgentMailGrantStatusValues)[number]

export const AgentMailAgentEnrollmentGrantRequestStatusValues = [
  'applied',
  'expired',
  'pending',
  'revoked'
] as const
export type AgentMailAgentEnrollmentGrantRequestStatus =
  (typeof AgentMailAgentEnrollmentGrantRequestStatusValues)[number]

export const AgentMailSubjectValues = [
  'Agent',
  'AgentGrant',
  'ApiKey',
  'Domain',
  'Draft',
  'ForwardingGroup',
  'Mailbox',
  'Message',
  'OAuthConnection',
  'Organization'
] as const
export type AgentMailSubject = (typeof AgentMailSubjectValues)[number]

export const AgentMailAbilityActionValues = [
  'archive',
  'claim',
  'create',
  'createDraft',
  'delete',
  'list',
  'manage',
  'markRead',
  'provision',
  'read',
  'reply',
  'search',
  'send',
  'status',
  'update'
] as const
export type AgentMailAbilityAction = (typeof AgentMailAbilityActionValues)[number]

export const AgentMailCapability = z.enum(AgentMailCapabilityValues)
export const AgentMailMailboxGrant = z.enum(AgentMailMailboxGrantValues)
export const AgentMailSystemPermission = z.enum(AgentMailSystemPermissionValues)
export const AgentMailPrincipalType = z.enum(AgentMailPrincipalTypeValues)
export const AgentMailGrantStatus = z.enum(AgentMailGrantStatusValues)
export const AgentMailSubject = z.enum(AgentMailSubjectValues)
export const AgentMailAbilityAction = z.enum(AgentMailAbilityActionValues)

const ConstraintPrimitive = z.union([z.string(), z.number(), z.boolean()])
const ConstraintOperators = z
  .object({
    eq: ConstraintPrimitive.optional(),
    in: z.array(ConstraintPrimitive).optional(),
    max: z.number().optional(),
    min: z.number().optional(),
    not_in: z.array(ConstraintPrimitive).optional()
  })
  .strict()

export const AgentMailCapabilityConstraints = z.record(
  z.string().min(1),
  z.union([ConstraintPrimitive, ConstraintOperators])
)
export type AgentMailCapabilityConstraintsSchema = Readonly<z.infer<typeof AgentMailCapabilityConstraints>>

export const AgentMailUnconstrainedGrantConstraints = z.object({}).strict()
export type AgentMailUnconstrainedGrantConstraintsSchema = Readonly<
  z.infer<typeof AgentMailUnconstrainedGrantConstraints>
>

export const AgentMailMailboxGrantConstraints =
  AgentMailUnconstrainedGrantConstraints.nullable().default(null)
export type AgentMailMailboxGrantConstraintsSchema = Readonly<
  z.infer<typeof AgentMailMailboxGrantConstraints>
>

export const AgentMailSystemGrantConstraints = AgentMailUnconstrainedGrantConstraints.nullable().default(null)
export type AgentMailSystemGrantConstraintsSchema = Readonly<z.infer<typeof AgentMailSystemGrantConstraints>>

const AgentMailRecipientDomainConstraint = z
  .string()
  .min(1)
  .max(253)
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => /^[a-z0-9.-]+$/u.test(value) && value.includes('.'))

const AgentMailRecipientPatternConstraint = z
  .string()
  .min(1)
  .max(256)
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => /^[a-z0-9@._%+\-*!?]+$/u.test(value))

export const AgentMailMailboxCapabilityGrantConstraints = z
  .object({
    allowedRecipientDomains: z.array(AgentMailRecipientDomainConstraint).max(100).optional(),
    allowedRecipientPatterns: z.array(AgentMailRecipientPatternConstraint).max(100).optional(),
    allowedRecipients: z
      .array(z.email().transform((value) => value.toLowerCase()))
      .max(100)
      .optional(),
    mailboxAddress: z.email().transform((value) => value.toLowerCase()),
    organizationId: z.string().min(1)
  })
  .strict()
export type AgentMailMailboxCapabilityGrantConstraintsSchema = Readonly<
  z.infer<typeof AgentMailMailboxCapabilityGrantConstraints>
>

export const AgentMailMailboxCapabilityRequestConstraints = AgentMailMailboxCapabilityGrantConstraints.omit({
  organizationId: true
})
export type AgentMailMailboxCapabilityRequestConstraintsSchema = Readonly<
  z.infer<typeof AgentMailMailboxCapabilityRequestConstraints>
>

export const AgentMailOrganizationCapabilityGrantConstraints = z
  .object({
    organizationId: z.string().min(1)
  })
  .strict()
export type AgentMailOrganizationCapabilityGrantConstraintsSchema = Readonly<
  z.infer<typeof AgentMailOrganizationCapabilityGrantConstraints>
>

export const AgentMailOrganizationCapabilityRequestConstraints = z.object({}).strict()
export type AgentMailOrganizationCapabilityRequestConstraintsSchema = Readonly<
  z.infer<typeof AgentMailOrganizationCapabilityRequestConstraints>
>

export const AgentMailCapabilityByMailboxGrant = {
  createDrafts: ['email.message.create_draft'],
  manageMessages: ['email.message.mark_read', 'email.message.archive', 'email.message.manage'],
  readMailbox: ['email.message.list', 'email.message.read', 'email.message.search'],
  sendAs: ['email.message.send', 'email.message.reply']
} as const satisfies Record<AgentMailMailboxGrant, readonly AgentMailCapability[]>

export const AgentMailCapabilityBySystemPermission = {
  createAccounts: ['email.mailbox.create'],
  manageAccounts: ['email.mailbox.update'],
  manageAgents: ['email.agent.manage'],
  manageDomains: ['email.domain.manage'],
  manageForwardingGroups: ['email.forwarding_group.manage'],
  manageOAuthConnections: ['email.oauth_connection.manage'],
  readAllMailboxes: ['email.mailbox.read_all']
} as const satisfies Record<AgentMailSystemPermission, readonly AgentMailCapability[]>

export const AgentMailAbilityActionByCapability = {
  'email.agent.claim': 'claim',
  'email.agent.manage': 'manage',
  'email.domain.manage': 'manage',
  'email.forwarding_group.manage': 'manage',
  'email.mailbox.create': 'create',
  'email.mailbox.provision': 'provision',
  'email.mailbox.read_all': 'read',
  'email.mailbox.update': 'update',
  'email.oauth_connection.manage': 'manage',
  'email.message.archive': 'archive',
  'email.message.create_draft': 'createDraft',
  'email.message.list': 'list',
  'email.message.manage': 'manage',
  'email.message.mark_read': 'markRead',
  'email.message.read': 'read',
  'email.message.reply': 'reply',
  'email.message.search': 'search',
  'email.message.send': 'send',
  'email.status': 'status'
} as const satisfies Record<AgentMailCapability, AgentMailAbilityAction>

export const AgentMailGrantPrincipal = z
  .object({
    principalId: z.string().min(1),
    principalType: AgentMailPrincipalType
  })
  .strict()
export type AgentMailGrantPrincipalSchema = Readonly<z.infer<typeof AgentMailGrantPrincipal>>

export const AgentMailMailboxGrantContractV1 = z
  .object({
    capability: AgentMailMailboxGrant,
    constraints: AgentMailMailboxGrantConstraints,
    expiresAt: z.iso.datetime().nullable().default(null),
    mailboxAddress: z.email().transform((value) => value.toLowerCase()),
    organizationId: z.string().min(1),
    principal: AgentMailGrantPrincipal,
    status: AgentMailGrantStatus,
    version: z.literal(1).default(1)
  })
  .strict()
export type AgentMailMailboxGrantContractV1Schema = Readonly<z.infer<typeof AgentMailMailboxGrantContractV1>>

export const AgentMailSystemGrantContractV1 = z
  .object({
    constraints: AgentMailSystemGrantConstraints,
    expiresAt: z.iso.datetime().nullable().default(null),
    organizationId: z.string().min(1),
    permission: AgentMailSystemPermission,
    principal: AgentMailGrantPrincipal,
    status: AgentMailGrantStatus,
    version: z.literal(1).default(1)
  })
  .strict()
export type AgentMailSystemGrantContractV1Schema = Readonly<z.infer<typeof AgentMailSystemGrantContractV1>>

export const AgentMailAgentEnrollmentMailboxGrantRequest = z
  .object({
    capabilities: z.array(AgentMailMailboxGrant).min(1).max(4),
    mailboxAddress: z.email().transform((value) => value.toLowerCase())
  })
  .strict()
export type AgentMailAgentEnrollmentMailboxGrantRequestSchema = Readonly<
  z.infer<typeof AgentMailAgentEnrollmentMailboxGrantRequest>
>

export const AgentMailAgentEnrollmentGrantRequestContractV1 = z
  .object({
    grantExpiresAt: z.iso.datetime().nullable().default(null),
    hostId: z.string().min(1),
    mailboxGrants: z.array(AgentMailAgentEnrollmentMailboxGrantRequest).max(100).default([]),
    name: z.string().min(1).max(128),
    organizationId: z.string().min(1),
    requestedByUserId: z.string().min(1).nullable().default(null),
    status: z.enum(AgentMailAgentEnrollmentGrantRequestStatusValues),
    systemPermissions: z
      .array(AgentMailSystemPermission)
      .max(AgentMailSystemPermissionValues.length)
      .default([]),
    version: z.literal(1).default(1)
  })
  .strict()
export type AgentMailAgentEnrollmentGrantRequestContractV1Schema = Readonly<
  z.infer<typeof AgentMailAgentEnrollmentGrantRequestContractV1>
>
