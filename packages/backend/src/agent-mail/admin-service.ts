import { randomUUID } from 'node:crypto'
import { parseUUIDv7 } from '@main/common'
import {
  AgentMailCapabilityByMailboxGrant,
  AgentMailCapabilityBySystemPermission,
  AgentMailCapability as AgentMailCapabilitySchema,
  AgentMailDefaultMailboxGrantValues,
  AgentMailMailboxCapabilityGrantConstraints,
  AgentMailMailboxGrant as AgentMailMailboxGrantSchema,
  AgentMailMailboxGrantValues,
  AgentMailSystemPermission as AgentMailSystemPermissionSchema,
  AgentMailSystemPermissionValues,
  agentMailAdminPermissionCatalog,
  base62UUIDv7ToUUIDv7,
  publicIdFromUUIDv7
} from '@main/db'
import { z } from 'zod'

import { globals } from '../globals'
import { createAgentMailEnrollmentGrantRequest } from './enrollment-grants'
import {
  agentMailCapabilityGrantConstraints,
  agentMailCapabilityGrantOrganizationId,
  agentMailSubject
} from './permission-policy'
import {
  AgentMailAccessError,
  requireAgentMailOrganizationContext,
  requireAgentMailPaperclipOperation
} from './service'
import { getAgentMailAccountsForWeb } from './webmail-service'
import { WildDuckAPIError, createWildDuckClient } from './wildduck-client'
import type {
  AgentCapabilityGrantDocument,
  AgentDocument,
  AgentHostDocument,
  AgentHostId,
  AgentId,
  AgentMailAdminPermissionCatalog,
  AgentMailAgentEnrollmentGrantRequestDocument,
  AgentMailAgentEnrollmentGrantRequestId,
  AgentMailCapability,
  AgentMailForwardingGroupDocument,
  AgentMailMailboxGrant,
  AgentMailMailboxGrantDocument,
  AgentMailSystemGrantDocument,
  AgentMailSystemPermission,
  ApiKeyDocument,
  ApiKeyId,
  OAuthClientDocument,
  OrganizationId
} from '@main/db'
import type { AgentMailEnrollmentMailboxGrantRequest } from './enrollment-grants'
import type { GlobalAuth } from '../auth/auth'
import type { Database } from '../db/db'
import type { ClientSession, QueryFilter } from 'mongoose'

export type AgentMailAdminSectionId = 'accounts' | 'agents' | 'groups'
export type AgentMailAdminViewState = 'empty' | 'loading' | 'ready'
export type AgentMailAdminStatus = 'active' | 'disabled' | 'limited' | 'pending'
export type AgentMailAdminStatusFilter = AgentMailAdminStatus | 'all'
const AgentMailAdminStatusFilterSchema = z.enum(['active', 'disabled', 'limited', 'pending', 'all'])
const AgentMailForwardingGroupWriteStatus = z.enum(['active', 'disabled', 'pending'])
const AgentMailAdminGrantPrincipalTypeSchema = z.enum(['api_key', 'oauth_client'])
export type AgentMailAdminGrantPrincipalType = 'api_key' | 'oauth_client'
const DEFAULT_ADMIN_PAGE_SIZE = 25
const MAX_ADMIN_PAGE_SIZE = 100

export const AgentMailAdminAccountInput = z
  .object({
    address: z.email(),
    agentId: z.string().min(1).optional(),
    grants: z.array(AgentMailMailboxGrantSchema).max(AgentMailMailboxGrantValues.length).optional(),
    name: z.string().max(128).optional(),
    type: z.literal('mailbox').optional()
  })
  .strict()
export type AgentMailAdminAccountInput = Readonly<z.infer<typeof AgentMailAdminAccountInput>>

export const AgentMailAdminUpdateAccountInput = z
  .object({
    address: z.email().optional(),
    name: z.string().max(128).optional(),
    status: z.enum(['active', 'disabled']).optional()
  })
  .strict()
export type AgentMailAdminUpdateAccountInput = Readonly<z.infer<typeof AgentMailAdminUpdateAccountInput>>

export const AgentMailAdminAgentSystemPermissionsInput = z
  .object({
    permissions: z.array(AgentMailSystemPermissionSchema).max(AgentMailSystemPermissionValues.length)
  })
  .strict()
export type AgentMailAdminAgentSystemPermissionsInput = Readonly<
  z.infer<typeof AgentMailAdminAgentSystemPermissionsInput>
>

const AgentMailAdminAgentEnrollmentMailboxGrantInput = z
  .object({
    accountId: z.email(),
    capabilities: z.array(AgentMailMailboxGrantSchema).min(1).max(AgentMailMailboxGrantValues.length)
  })
  .strict()

export const AgentMailAdminAgentInput = z
  .object({
    grantExpiresAt: z.iso.datetime().nullable().optional(),
    mailboxGrants: z.array(AgentMailAdminAgentEnrollmentMailboxGrantInput).max(100).optional(),
    name: z.string().min(1).max(128),
    systemPermissions: z
      .array(AgentMailSystemPermissionSchema)
      .max(AgentMailSystemPermissionValues.length)
      .optional()
  })
  .strict()
export type AgentMailAdminAgentInput = Readonly<z.infer<typeof AgentMailAdminAgentInput>>

const AgentMailAdminAgentMailboxGrantInput = z
  .object({
    accountId: z.email(),
    capabilities: z.array(AgentMailMailboxGrantSchema).min(1).max(AgentMailMailboxGrantValues.length)
  })
  .strict()

export const AgentMailAdminAgentMailboxGrantsInput = z
  .object({
    grants: z.array(AgentMailAdminAgentMailboxGrantInput).max(100)
  })
  .strict()
export type AgentMailAdminAgentMailboxGrantsInput = Readonly<
  z.infer<typeof AgentMailAdminAgentMailboxGrantsInput>
>

export const AgentMailAdminGrantPrincipalTargetInput = z
  .object({
    principalId: z.string().min(1).max(256),
    principalType: AgentMailAdminGrantPrincipalTypeSchema
  })
  .strict()
export type AgentMailAdminGrantPrincipalTargetInput = Readonly<
  z.infer<typeof AgentMailAdminGrantPrincipalTargetInput>
>

interface AgentMailAdminResolvedGrantPrincipalTarget extends AgentMailAdminGrantPrincipalTargetInput {
  publicPrincipalId: string
}

export const AgentMailAdminForwardingGroupInput = z
  .object({
    address: z.email(),
    description: z.string().max(256).optional(),
    recipients: z.array(z.email()).max(100).optional(),
    status: AgentMailForwardingGroupWriteStatus.optional()
  })
  .strict()
export type AgentMailAdminForwardingGroupInput = Readonly<z.infer<typeof AgentMailAdminForwardingGroupInput>>

export const AgentMailAdminUpdateForwardingGroupInput = z
  .object({
    address: z.email().optional(),
    description: z.string().max(256).optional(),
    recipients: z.array(z.email()).max(100).optional(),
    status: AgentMailForwardingGroupWriteStatus.optional()
  })
  .strict()
export type AgentMailAdminUpdateForwardingGroupInput = Readonly<
  z.infer<typeof AgentMailAdminUpdateForwardingGroupInput>
>

export interface AgentMailAdminMailboxGrant {
  accountAddress: string
  accountId: string
  capabilities: ReadonlyArray<AgentMailMailboxGrant>
}

export interface AgentMailAdminAccount {
  accessCount: number
  address: string
  agentName?: string
  domain: string
  groups: ReadonlyArray<string>
  id: string
  lastActivity: string
  name: string
  status: AgentMailAdminStatus
  type: 'alias' | 'mailbox'
}

export interface AgentMailAdminGroup {
  address: string
  description: string
  domain: string
  id: string
  lastDelivered: string
  lastUpdated: string
  recipients: ReadonlyArray<string>
  status: AgentMailAdminStatus
}

export interface AgentMailAdminAgent {
  grants: ReadonlyArray<AgentMailAdminMailboxGrant>
  groups: ReadonlyArray<string>
  handle: string
  id: string
  lastSeen: string
  name: string
  permissions: ReadonlyArray<AgentMailSystemPermission>
  primaryAccount?: string
  status: AgentMailAdminStatus
}

export interface AgentMailAdminExternalPrincipal {
  grants: ReadonlyArray<AgentMailAdminMailboxGrant>
  id: string
  kind: AgentMailAdminGrantPrincipalType
  lastUsed: string
  name: string
  permissions: ReadonlyArray<AgentMailSystemPermission>
  scope: 'organization' | 'user'
  status: AgentMailAdminStatus
}

type AgentMailAdminApiKeyRecord = Pick<
  ApiKeyDocument,
  | '_id'
  | 'configId'
  | 'createdAt'
  | 'enabled'
  | 'expiresAt'
  | 'lastRequest'
  | 'name'
  | 'referenceId'
  | 'updatedAt'
>

type AgentMailAdminOAuthClientRecord = Pick<
  OAuthClientDocument,
  'clientId' | 'createdAt' | 'disabled' | 'name' | 'referenceId' | 'updatedAt' | 'userId'
>

const AT_EMAIL_ADMIN_ADMIN_API_KEY_PROJECTION = {
  _id: 1,
  configId: 1,
  createdAt: 1,
  enabled: 1,
  expiresAt: 1,
  lastRequest: 1,
  name: 1,
  referenceId: 1,
  updatedAt: 1
} as const satisfies Record<keyof AgentMailAdminApiKeyRecord, 1>

const AT_EMAIL_ADMIN_ADMIN_OAUTH_CLIENT_PROJECTION = {
  clientId: 1,
  createdAt: 1,
  disabled: 1,
  name: 1,
  referenceId: 1,
  updatedAt: 1,
  userId: 1
} as const satisfies Record<keyof AgentMailAdminOAuthClientRecord, 1>

export interface AgentMailAdminAgentEnrollment {
  enrollmentToken: string
  enrollmentTokenExpiresAt: string | null
  grantExpiresAt: string | null
  hostId: string
  mailboxGrantCount: number
  name: string
  status: 'pending_enrollment'
  systemPermissionCount: number
}

export interface AgentMailAdminPendingAgentEnrollment {
  canRevoke: boolean
  createdAt: string
  grantExpiresAt: string | null
  grants: ReadonlyArray<AgentMailAdminMailboxGrant>
  hostId: string
  id: string
  lastUpdated: string
  mailboxGrantCount: number
  name: string
  permissions: ReadonlyArray<AgentMailSystemPermission>
  status: 'pending'
  systemPermissionCount: number
  tokenExpiresAt: string | null
}

export interface AgentMailAdminAllowedActions {
  createAccount: boolean
  createAgent: boolean
  createGroup: boolean
  disableAccount: boolean
  disableGroup: boolean
  manageAgentMailboxGrants: boolean
  manageAgentSystemPermissions: boolean
  provisionAccount: boolean
  revokeAgent: boolean
  updateAccount: boolean
  updateAgent: boolean
  updateGroup: boolean
}

export interface AgentMailAdminPagination {
  filteredRecords: number
  page: number
  pageSize: number
  totalRecords: number
}

export interface AgentMailAdminView {
  accounts: ReadonlyArray<AgentMailAdminAccount>
  agents: ReadonlyArray<AgentMailAdminAgent>
  allowedActions: AgentMailAdminAllowedActions
  allowedSections: ReadonlyArray<AgentMailAdminSectionId>
  domain: string
  groups: ReadonlyArray<AgentMailAdminGroup>
  pagination?: AgentMailAdminPagination
  pendingEnrollments: ReadonlyArray<AgentMailAdminPendingAgentEnrollment>
  permissionCatalog: AgentMailAdminPermissionCatalog
  principals: ReadonlyArray<AgentMailAdminExternalPrincipal>
  searchQuery?: string
  section: AgentMailAdminSectionId
  state: AgentMailAdminViewState
  statusFilter?: AgentMailAdminStatusFilter
}

export interface AgentMailAdminNavigation {
  allowedSections: ReadonlyArray<AgentMailAdminSectionId>
}

export interface AgentMailAdminRevokeAgentResult {
  agentId: string
  revokedCapabilityGrantCount: number
  revokedMailboxGrantCount: number
  revokedSystemGrantCount: number
  status: 'revoked'
  success: true
}

export interface AgentMailAdminRevokeAgentEnrollmentResult {
  enrollmentId: string
  hostId: string
  status: 'revoked'
  success: true
}

export interface AgentMailAdminSaveAccountResult {
  account: AgentMailAdminAccount
  success: true
}

export interface AgentMailAdminSaveAgentPermissionsResult {
  agent: AgentMailAdminAgent
  success: true
}

export interface AgentMailAdminSaveAgentResult {
  agent: AgentMailAdminAgent
  success: true
}

export interface AgentMailAdminCreateAgentResult {
  enrollment: AgentMailAdminAgentEnrollment
  success: true
}

export interface AgentMailAdminSavePrincipalMailboxGrantsResult {
  grants: ReadonlyArray<AgentMailAdminMailboxGrant>
  principalId: string
  principalType: AgentMailAdminGrantPrincipalType
  revokedGrantCount: number
  success: true
}

export interface AgentMailAdminSavePrincipalSystemPermissionsResult {
  permissions: ReadonlyArray<AgentMailSystemPermission>
  principalId: string
  principalType: AgentMailAdminGrantPrincipalType
  revokedPermissionCount: number
  success: true
}

export interface AgentMailAdminSaveAgentMailboxGrantsResult {
  agent: AgentMailAdminAgent
  success: true
}

export interface AgentMailAdminSaveForwardingGroupResult {
  group: AgentMailAdminGroup
  success: true
}

export class AgentMailAdminError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 502
  ) {
    super(message)
    this.name = 'AgentMailAdminError'
  }
}

export function isAgentMailAdminError(error: unknown): error is AgentMailAdminError {
  return error instanceof AgentMailAdminError
}

export async function createAgentMailForwardingGroupForWeb({
  headers,
  input
}: {
  headers: Headers
  input: unknown
}): Promise<AgentMailAdminSaveForwardingGroupResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'groups')
  const parsedInput = parseForwardingGroupInput(input)
  const domains = await listManageableMailDomains(context.organizationId)
  const address = normalizeGroupAddress(parsedInput.address, domains)
  const recipients = normalizeGroupRecipients(parsedInput.recipients ?? [], domains)
  const status = toPersistedForwardingGroupStatus(parsedInput.status ?? 'active')
  const description = normalizeOptionalText(parsedInput.description)
  const client = createWildDuckClient()
  const wildDuckResult = await client.createForwardedAddress({
    address,
    forwardedDisabled: status !== 'active',
    name: description,
    targets: recipients
  })

  if (!wildDuckResult.id) {
    throw new AgentMailAdminError('Forwarding group could not be created', 400)
  }

  const group = await db.models.agentMailForwardingGroup.create({
    address,
    createdByUserId: context.userId,
    description,
    lastDeliveredAt: null,
    organizationId: context.organizationId,
    recipients,
    status,
    wildDuckAddressId: wildDuckResult.id
  })
  await auditAgentMailAdmin(context, 'agent_mail.forwarding_group.created', {
    address,
    forwardingGroupId: String(group._id),
    organizationId: String(context.organizationId),
    recipientCount: recipients.length,
    wildDuckAddressId: wildDuckResult.id
  })

  return {
    group: toAdminGroup(group),
    success: true
  }
}

export async function createAgentMailAccountForWeb({
  headers,
  input
}: {
  headers: Headers
  input: unknown
}): Promise<AgentMailAdminSaveAccountResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAgentMailPaperclipOperation(context, 'provision')
  const parsedInput = parseAccountInput(input)
  requireAdminAccountCreateAccess(context)
  if (parsedInput.agentId) {
    requireAdminSectionAccess(getAdminSectionAccess(context), 'agents')
  }

  const domains = await listManageableMailDomains(context.organizationId)
  const address = normalizeAccountAddress(parsedInput.address, domains)
  const displayName = normalizeAccountDisplayName(parsedInput.name, address)
  const initialGrantPlan = parsedInput.agentId
    ? await validateInitialMailboxGrantsForAgent({
        agentId: parsedInput.agentId,
        capabilities: parsedInput.grants,
        context,
        db,
        mailboxAddress: address
      })
    : null
  const client = createWildDuckClient()
  await requireMailboxAvailable(client, address)
  const wildDuckResult = await client.createUser({
    address,
    allowUnsafe: true,
    name: displayName,
    password: randomUUID(),
    spamLevel: 25,
    username: usernameForMailbox(address)
  })

  if (!wildDuckResult.id) {
    throw new AgentMailAdminError('Mailbox account could not be created', 502)
  }

  const mailboxGrants = initialGrantPlan
    ? await createInitialMailboxGrantsForAgent({
        context,
        grantPlan: initialGrantPlan,
        mailboxAddress: address,
        organizationId: context.organizationId
      })
    : []

  await auditAgentMailAdmin(context, 'agent_mail.account.created', {
    assignedAgentId: parsedInput.agentId ?? null,
    capabilityCount: mailboxGrants.length,
    mailboxAddress: address,
    organizationId: String(context.organizationId),
    wildDuckUserId: wildDuckResult.id
  })

  return {
    account: toAdminAccount({
      address,
      groups: [],
      mailboxGrants,
      name: displayName,
      state: 'ready'
    }),
    success: true
  }
}

export async function updateAgentMailAccountForWeb({
  accountId,
  headers,
  input
}: {
  accountId: string
  headers: Headers
  input: unknown
}): Promise<AgentMailAdminSaveAccountResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  const parsedInput = parseAccountUpdateInput(input)
  const domains = await listManageableMailDomains(context.organizationId)
  const address = normalizeAccountAddress(accountId, domains)
  requireAdminAccountManageAccess(context, address)
  if (parsedInput.address && normalizeAccountAddress(parsedInput.address, domains) !== address) {
    throw new AgentMailAdminError('Mailbox address updates are not supported', 400)
  }

  const name = parsedInput.name === undefined ? undefined : normalizeOptionalText(parsedInput.name)
  const disabled = parsedInput.status === undefined ? undefined : parsedInput.status === 'disabled'
  const client = createWildDuckClient()
  const userId = await resolveExistingMailboxUser(client, address)
  await client.updateUser(userId, {
    ...(disabled === undefined ? {} : { disabled }),
    ...(name === undefined ? {} : { name })
  })
  const updatedUser = await client.getUser(userId)

  const [mailboxGrants, forwardingGroups] = await Promise.all([
    db.models.agentMailMailboxGrant.find({ organizationId: context.organizationId }).exec(),
    db.models.agentMailForwardingGroup.find({ organizationId: context.organizationId }).exec()
  ])
  const groupLabelsByRecipient = toGroupLabelsByRecipient(forwardingGroups)
  await auditAgentMailAdmin(context, 'agent_mail.account.updated', {
    disabled: disabled ?? null,
    mailboxAddress: address,
    organizationId: String(context.organizationId)
  })

  return {
    account: toAdminAccount({
      address,
      groups: groupLabelsByRecipient.get(address) ?? [],
      mailboxGrants,
      name: updatedUser.name?.trim() || localPart(address),
      state: updatedUser.disabled || updatedUser.suspended ? 'disabled' : 'ready'
    }),
    success: true
  }
}

export async function updateAgentMailForwardingGroupForWeb({
  groupId,
  headers,
  input
}: {
  groupId: string
  headers: Headers
  input: unknown
}): Promise<AgentMailAdminSaveForwardingGroupResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'groups')
  const parsedInput = parseForwardingGroupUpdateInput(input)
  const groupUuid = parseForwardingGroupPublicId(groupId)
  const group = await db.models.agentMailForwardingGroup
    .findOne({ _id: groupUuid, organizationId: context.organizationId })
    .exec()

  if (!group) {
    throw new AgentMailAdminError('Forwarding group was not found', 404)
  }
  if (!group.wildDuckAddressId) {
    throw new AgentMailAdminError('Forwarding group is missing its WildDuck address id', 400)
  }

  const domains = await listManageableMailDomains(context.organizationId)
  const nextAddress =
    parsedInput.address === undefined
      ? normalizedMailbox(group.address)
      : normalizeGroupAddress(parsedInput.address, domains)
  const nextDescription =
    parsedInput.description === undefined ? group.description : normalizeOptionalText(parsedInput.description)
  const nextRecipients =
    parsedInput.recipients === undefined
      ? normalizeGroupRecipients(group.recipients, domains)
      : normalizeGroupRecipients(parsedInput.recipients, domains)
  const nextStatus =
    parsedInput.status === undefined ? group.status : toPersistedForwardingGroupStatus(parsedInput.status)
  const client = createWildDuckClient()
  await client.updateForwardedAddress(group.wildDuckAddressId, {
    address: nextAddress,
    forwardedDisabled: nextStatus !== 'active',
    name: nextDescription,
    targets: nextRecipients
  })
  const now = new Date()
  await db.models.agentMailForwardingGroup
    .updateOne(
      { _id: group._id, organizationId: context.organizationId },
      {
        $set: {
          address: nextAddress,
          description: nextDescription,
          recipients: nextRecipients,
          status: nextStatus,
          updatedAt: now
        }
      }
    )
    .exec()
  const updatedGroup: AgentMailForwardingGroupDocument = {
    ...group,
    address: nextAddress,
    description: nextDescription,
    recipients: nextRecipients,
    status: nextStatus,
    updatedAt: now
  }
  await auditAgentMailAdmin(context, 'agent_mail.forwarding_group.updated', {
    address: nextAddress,
    forwardingGroupId: String(group._id),
    organizationId: String(context.organizationId),
    recipientCount: nextRecipients.length,
    status: nextStatus,
    wildDuckAddressId: group.wildDuckAddressId
  })

  return {
    group: toAdminGroup(updatedGroup),
    success: true
  }
}

export async function updateAgentMailAgentSystemPermissionsForWeb({
  agentId,
  headers,
  input
}: {
  agentId: string
  headers: Headers
  input: unknown
}): Promise<AgentMailAdminSaveAgentPermissionsResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'agents')
  const parsedInput = parseAgentSystemPermissionsInput(input)
  const agentUuid = parseAgentPublicId(agentId)
  const agent = await db.models.agent.findById(agentUuid).exec()

  if (!agent) {
    throw new AgentMailAdminError('Agent access was not found', 404)
  }
  await requireOrganizationScopedAgentAccess({ agent, context, db })
  requireAdminAgentManageAccess(context, String(agent._id))

  const principalId = String(agent._id)
  const desiredPermissions = [...new Set(parsedInput.permissions)].sort()
  const desiredPermissionSet = new Set<AgentMailSystemPermission>(desiredPermissions)
  const now = new Date()
  const currentSystemGrants = await db.models.agentMailSystemGrant
    .find({
      organizationId: context.organizationId,
      principalId,
      principalType: 'agent'
    })
    .exec()
  const staleSystemGrants = currentSystemGrants.filter(
    (grant) =>
      (grant.status === 'active' || grant.status === 'pending') && !desiredPermissionSet.has(grant.permission)
  )
  for (const grant of staleSystemGrants) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: principalId,
      permission: grant.permission
    })
  }
  for (const permission of desiredPermissions) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: principalId,
      permission
    })
  }

  await Promise.all([
    ...staleSystemGrants.map((grant) =>
      db.models.agentMailSystemGrant
        .updateOne({ _id: grant._id }, { $set: { status: 'revoked', updatedAt: now } })
        .exec()
    ),
    ...desiredPermissions.map((permission) =>
      db.models.agentMailSystemGrant
        .updateOne(
          {
            organizationId: context.organizationId,
            permission,
            principalId,
            principalType: 'agent'
          },
          {
            $set: {
              constraints: null,
              expiresAt: null,
              grantedByUserId: context.userId ?? undefined,
              status: 'active',
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now,
              organizationId: context.organizationId,
              permission,
              principalId,
              principalType: 'agent'
            }
          },
          { upsert: true }
        )
        .exec()
    )
  ])
  await auditAgentMailAdmin(context, 'agent_mail.agent.system_permissions.updated', {
    agentId: String(agent._id),
    agentPublicId: agentId,
    organizationId: String(context.organizationId),
    permissionCount: desiredPermissions.length,
    revokedPermissionCount: staleSystemGrants.length
  })

  const [forwardingGroups, mailboxGrants] = await Promise.all([
    db.models.agentMailForwardingGroup.find({ organizationId: context.organizationId }).exec(),
    db.models.agentMailMailboxGrant.find({ organizationId: context.organizationId }).exec()
  ])
  const systemGrants = desiredPermissions.map(
    (permission) =>
      ({
        constraints: null,
        expiresAt: null,
        organizationId: context.organizationId,
        permission,
        principalId,
        principalType: 'agent',
        status: 'active'
      }) satisfies Partial<AgentMailSystemGrantDocument>
  ) as AgentMailSystemGrantDocument[]

  return {
    agent: toAdminAgent(agent, mailboxGrants, systemGrants, toGroupLabelsByRecipient(forwardingGroups)),
    success: true
  }
}

export async function updateAgentMailAgentForWeb({
  agentId,
  headers,
  input
}: {
  agentId: string
  headers: Headers
  input: unknown
}): Promise<AgentMailAdminSaveAgentResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'agents')
  const parsedInput = parseAgentInput(input)
  const agentUuid = parseAgentPublicId(agentId)
  const agent = await db.models.agent.findById(agentUuid).exec()

  if (!agent) {
    throw new AgentMailAdminError('Agent access was not found', 404)
  }
  await requireOrganizationScopedAgentAccess({ agent, context, db })
  requireAdminAgentManageAccess(context, String(agent._id))

  const now = new Date()
  const name = normalizeRequiredText(parsedInput.name, 'Agent name')
  await db.models.agent.updateOne({ _id: agent._id }, { $set: { name, updatedAt: now } }).exec()
  await auditAgentMailAdmin(context, 'agent_mail.agent.updated', {
    agentId: String(agent._id),
    agentPublicId: agentId,
    organizationId: String(context.organizationId)
  })

  const [forwardingGroups, mailboxGrants, systemGrants] = await Promise.all([
    db.models.agentMailForwardingGroup.find({ organizationId: context.organizationId }).exec(),
    db.models.agentMailMailboxGrant.find({ organizationId: context.organizationId }).exec(),
    db.models.agentMailSystemGrant.find({ organizationId: context.organizationId }).exec()
  ])

  return {
    agent: toAdminAgent(
      {
        ...agent,
        name,
        updatedAt: now
      },
      mailboxGrants,
      systemGrants,
      toGroupLabelsByRecipient(forwardingGroups)
    ),
    success: true
  }
}

export async function createAgentMailAgentEnrollmentForWeb({
  headers,
  input
}: {
  headers: Headers
  input: unknown
}): Promise<AgentMailAdminCreateAgentResult> {
  const { auth, db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'agents')
  const parsedInput = parseAgentInput(input)
  const name = normalizeRequiredText(parsedInput.name, 'Agent name')
  const domains = await listManageableMailDomains(context.organizationId)
  const mailboxGrants = normalizeAgentMailboxGrantInputs(parsedInput.mailboxGrants ?? [], domains)
  const systemPermissions = [...new Set(parsedInput.systemPermissions ?? [])].sort()
  const grantExpiresAt = normalizeGrantExpiresAt(parsedInput.grantExpiresAt)

  for (const grant of mailboxGrants) {
    for (const capability of grant.capabilities) {
      requireAdminAgentGrantManageAccess(context, {
        agentId: null,
        capability,
        mailboxAddress: grant.mailboxAddress
      })
    }
  }
  for (const permission of systemPermissions) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: null,
      permission
    })
  }

  const host = await readAgentAuthCreateHostResult(
    await auth.api.createHost({
      body: {
        default_capabilities: [],
        name
      },
      headers
    })
  )
  const enrollment = toAgentEnrollment(host, {
    grantExpiresAt,
    mailboxGrantCount: mailboxGrants.reduce((count, grant) => count + grant.capabilities.length, 0),
    name,
    systemPermissionCount: systemPermissions.length
  })
  try {
    await createAgentMailEnrollmentGrantRequest({
      db,
      grantExpiresAt,
      hostId: enrollment.hostId,
      mailboxGrants,
      name,
      organizationId: context.organizationId,
      requestedByUserId: context.userId,
      systemPermissions
    })
  } catch (error) {
    await revokePendingEnrollmentHost(db, enrollment.hostId)
    throw error
  }
  await auditAgentMailAdmin(context, 'agent_mail.agent.enrollment.created', {
    defaultCapabilityCount: 0,
    enrollmentTokenExpiresAt: enrollment.enrollmentTokenExpiresAt,
    grantExpiresAt: enrollment.grantExpiresAt,
    hostId: enrollment.hostId,
    mailboxGrantCount: enrollment.mailboxGrantCount,
    name,
    organizationId: String(context.organizationId),
    status: enrollment.status,
    systemPermissionCount: enrollment.systemPermissionCount
  })

  return {
    enrollment,
    success: true
  }
}

export async function updateAgentMailAgentMailboxGrantsForWeb({
  agentId,
  headers,
  input
}: {
  agentId: string
  headers: Headers
  input: unknown
}): Promise<AgentMailAdminSaveAgentMailboxGrantsResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'agents')
  const parsedInput = parseAgentMailboxGrantsInput(input)
  const agentUuid = parseAgentPublicId(agentId)
  const agent = await db.models.agent.findById(agentUuid).exec()

  if (!agent) {
    throw new AgentMailAdminError('Agent access was not found', 404)
  }
  await requireOrganizationScopedAgentAccess({ agent, context, db })
  requireAdminAgentManageAccess(context, String(agent._id))

  const domains = await listManageableMailDomains(context.organizationId)
  const principalId = String(agent._id)
  const desiredGrants = normalizeAgentMailboxGrantInputs(parsedInput.grants, domains)
  const desiredGrantKeys = new Set(
    desiredGrants.flatMap((grant) =>
      grant.capabilities.map((capability) => mailboxGrantKey(grant.mailboxAddress, capability))
    )
  )
  const now = new Date()
  const currentMailboxGrants = await db.models.agentMailMailboxGrant
    .find({
      organizationId: context.organizationId,
      principalId,
      principalType: 'agent'
    })
    .exec()
  const staleMailboxGrants = currentMailboxGrants.filter(
    (grant) =>
      (grant.status === 'active' || grant.status === 'pending') &&
      !desiredGrantKeys.has(mailboxGrantKey(grant.mailboxAddress, grant.capability))
  )
  for (const grant of staleMailboxGrants) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: principalId,
      capability: grant.capability,
      mailboxAddress: grant.mailboxAddress
    })
  }
  for (const grant of desiredGrants) {
    for (const capability of grant.capabilities) {
      requireAdminAgentGrantManageAccess(context, {
        agentId: principalId,
        capability,
        mailboxAddress: grant.mailboxAddress
      })
    }
  }

  await Promise.all([
    ...staleMailboxGrants.map((grant) =>
      db.models.agentMailMailboxGrant
        .updateOne({ _id: grant._id }, { $set: { status: 'revoked', updatedAt: now } })
        .exec()
    ),
    ...desiredGrants.flatMap((grant) =>
      grant.capabilities.map((capability) =>
        db.models.agentMailMailboxGrant
          .updateOne(
            {
              capability,
              mailboxAddress: grant.mailboxAddress,
              organizationId: context.organizationId,
              principalId,
              principalType: 'agent'
            },
            {
              $set: {
                constraints: null,
                expiresAt: null,
                grantedByUserId: context.userId ?? undefined,
                status: 'active',
                updatedAt: now
              },
              $setOnInsert: {
                capability,
                createdAt: now,
                mailboxAddress: grant.mailboxAddress,
                organizationId: context.organizationId,
                principalId,
                principalType: 'agent'
              }
            },
            { upsert: true }
          )
          .exec()
      )
    )
  ])
  await auditAgentMailAdmin(context, 'agent_mail.agent.mailbox_grants.updated', {
    agentId: String(agent._id),
    agentPublicId: agentId,
    grantCount: desiredGrantKeys.size,
    mailboxCount: desiredGrants.length,
    organizationId: String(context.organizationId),
    revokedGrantCount: staleMailboxGrants.length
  })

  const [forwardingGroups, systemGrants] = await Promise.all([
    db.models.agentMailForwardingGroup.find({ organizationId: context.organizationId }).exec(),
    db.models.agentMailSystemGrant.find({ organizationId: context.organizationId }).exec()
  ])
  const mailboxGrants = desiredGrants.flatMap((grant) =>
    grant.capabilities.map(
      (capability) =>
        ({
          capability,
          constraints: null,
          expiresAt: null,
          mailboxAddress: grant.mailboxAddress,
          organizationId: context.organizationId,
          principalId,
          principalType: 'agent',
          status: 'active'
        }) satisfies Partial<AgentMailMailboxGrantDocument>
    )
  ) as AgentMailMailboxGrantDocument[]

  return {
    agent: toAdminAgent(agent, mailboxGrants, systemGrants, toGroupLabelsByRecipient(forwardingGroups)),
    success: true
  }
}

export async function updateAgentMailPrincipalMailboxGrantsForWeb({
  headers,
  input,
  principalId,
  principalType
}: {
  headers: Headers
  input: unknown
  principalId: string
  principalType: string
}): Promise<AgentMailAdminSavePrincipalMailboxGrantsResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'agents')
  const target = await requireGrantPrincipalForOrganization({
    context,
    db,
    target: parseGrantPrincipalTarget({ principalId, principalType })
  })
  const parsedInput = parseAgentMailboxGrantsInput(input)
  const domains = await listManageableMailDomains(context.organizationId)
  const desiredGrants = normalizeAgentMailboxGrantInputs(parsedInput.grants, domains)
  const desiredGrantKeys = new Set(
    desiredGrants.flatMap((grant) =>
      grant.capabilities.map((capability) => mailboxGrantKey(grant.mailboxAddress, capability))
    )
  )
  const now = new Date()
  const currentMailboxGrants = await db.models.agentMailMailboxGrant
    .find({
      organizationId: context.organizationId,
      principalId: target.principalId,
      principalType: target.principalType
    })
    .exec()
  const staleMailboxGrants = currentMailboxGrants.filter(
    (grant) =>
      (grant.status === 'active' || grant.status === 'pending') &&
      !desiredGrantKeys.has(mailboxGrantKey(grant.mailboxAddress, grant.capability))
  )

  for (const grant of staleMailboxGrants) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: null,
      capability: grant.capability,
      mailboxAddress: grant.mailboxAddress
    })
  }
  for (const grant of desiredGrants) {
    for (const capability of grant.capabilities) {
      requireAdminAgentGrantManageAccess(context, {
        agentId: null,
        capability,
        mailboxAddress: grant.mailboxAddress
      })
    }
  }

  await Promise.all([
    ...staleMailboxGrants.map((grant) =>
      db.models.agentMailMailboxGrant
        .updateOne({ _id: grant._id }, { $set: { status: 'revoked', updatedAt: now } })
        .exec()
    ),
    ...desiredGrants.flatMap((grant) =>
      grant.capabilities.map((capability) =>
        db.models.agentMailMailboxGrant
          .updateOne(
            {
              capability,
              mailboxAddress: grant.mailboxAddress,
              organizationId: context.organizationId,
              principalId: target.principalId,
              principalType: target.principalType
            },
            {
              $set: {
                constraints: null,
                expiresAt: null,
                grantedByUserId: context.userId ?? undefined,
                status: 'active',
                updatedAt: now
              },
              $setOnInsert: {
                capability,
                createdAt: now,
                mailboxAddress: grant.mailboxAddress,
                organizationId: context.organizationId,
                principalId: target.principalId,
                principalType: target.principalType
              }
            },
            { upsert: true }
          )
          .exec()
      )
    )
  ])
  await auditAgentMailAdmin(context, 'agent_mail.principal.mailbox_grants.updated', {
    grantCount: desiredGrantKeys.size,
    mailboxCount: desiredGrants.length,
    organizationId: String(context.organizationId),
    principalId: target.principalId,
    principalPublicId: target.publicPrincipalId,
    principalType: target.principalType,
    revokedGrantCount: staleMailboxGrants.length
  })

  return {
    grants: desiredGrants.map((grant) => ({
      accountAddress: grant.mailboxAddress,
      accountId: grant.mailboxAddress,
      capabilities: grant.capabilities
    })),
    principalId: target.publicPrincipalId,
    principalType: target.principalType,
    revokedGrantCount: staleMailboxGrants.length,
    success: true
  }
}

export async function updateAgentMailPrincipalSystemPermissionsForWeb({
  headers,
  input,
  principalId,
  principalType
}: {
  headers: Headers
  input: unknown
  principalId: string
  principalType: string
}): Promise<AgentMailAdminSavePrincipalSystemPermissionsResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'agents')
  const target = await requireGrantPrincipalForOrganization({
    context,
    db,
    target: parseGrantPrincipalTarget({ principalId, principalType })
  })
  const parsedInput = parseAgentSystemPermissionsInput(input)
  const desiredPermissions = [...new Set(parsedInput.permissions)].sort()
  const desiredPermissionSet = new Set<AgentMailSystemPermission>(desiredPermissions)
  const now = new Date()
  const currentSystemGrants = await db.models.agentMailSystemGrant
    .find({
      organizationId: context.organizationId,
      principalId: target.principalId,
      principalType: target.principalType
    })
    .exec()
  const staleSystemGrants = currentSystemGrants.filter(
    (grant) =>
      (grant.status === 'active' || grant.status === 'pending') && !desiredPermissionSet.has(grant.permission)
  )

  for (const grant of staleSystemGrants) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: null,
      permission: grant.permission
    })
  }
  for (const permission of desiredPermissions) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: null,
      permission
    })
  }

  await Promise.all([
    ...staleSystemGrants.map((grant) =>
      db.models.agentMailSystemGrant
        .updateOne({ _id: grant._id }, { $set: { status: 'revoked', updatedAt: now } })
        .exec()
    ),
    ...desiredPermissions.map((permission) =>
      db.models.agentMailSystemGrant
        .updateOne(
          {
            organizationId: context.organizationId,
            permission,
            principalId: target.principalId,
            principalType: target.principalType
          },
          {
            $set: {
              constraints: null,
              expiresAt: null,
              grantedByUserId: context.userId ?? undefined,
              status: 'active',
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now,
              organizationId: context.organizationId,
              permission,
              principalId: target.principalId,
              principalType: target.principalType
            }
          },
          { upsert: true }
        )
        .exec()
    )
  ])
  await auditAgentMailAdmin(context, 'agent_mail.principal.system_permissions.updated', {
    organizationId: String(context.organizationId),
    permissionCount: desiredPermissions.length,
    principalId: target.principalId,
    principalPublicId: target.publicPrincipalId,
    principalType: target.principalType,
    revokedPermissionCount: staleSystemGrants.length
  })

  return {
    permissions: desiredPermissions,
    principalId: target.publicPrincipalId,
    principalType: target.principalType,
    revokedPermissionCount: staleSystemGrants.length,
    success: true
  }
}

export async function disableAgentMailForwardingGroupForWeb({
  groupId,
  headers
}: {
  groupId: string
  headers: Headers
}): Promise<AgentMailAdminSaveForwardingGroupResult> {
  return updateAgentMailForwardingGroupForWeb({
    groupId,
    headers,
    input: { status: 'disabled' }
  })
}

export async function disableAgentMailAccountForWeb({
  accountId,
  headers
}: {
  accountId: string
  headers: Headers
}): Promise<AgentMailAdminSaveAccountResult> {
  return updateAgentMailAccountForWeb({
    accountId,
    headers,
    input: { status: 'disabled' }
  })
}

export async function getAgentMailAdminViewForWeb({
  headers,
  page,
  pageSize,
  searchQuery,
  section,
  statusFilter
}: {
  headers: Headers
  page?: number
  pageSize?: number
  searchQuery?: string
  section?: AgentMailAdminSectionId
  statusFilter?: AgentMailAdminStatusFilter
}): Promise<AgentMailAdminView> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  const access = getAdminSectionAccess(context)
  const allowedActions = getAdminAllowedActions(context)
  const allowedSections = allowedSectionsFromAccess(access)
  const resolvedSection = section ?? allowedSections[0]
  if (!resolvedSection) {
    throw new AgentMailAccessError('Mailbox administration access is not authorized', 403)
  }
  requireAdminSectionAccess(access, resolvedSection)
  const shouldLoadAccountData = access.accountData || allowedActions.manageAgentMailboxGrants
  const shouldLoadGroups = access.groups || access.agents
  const shouldLoadMailboxGrants = shouldLoadAccountData || access.agents
  const [{ accounts: webmailAccounts }, forwardingGroups, mailboxGrants, systemGrants, capabilityGrants] =
    await Promise.all([
      shouldLoadAccountData
        ? getAgentMailAccountsForWeb(headers, { includeDisabled: true })
        : Promise.resolve({ accounts: [] }),
      shouldLoadGroups
        ? db.models.agentMailForwardingGroup.find({ organizationId: context.organizationId }).exec()
        : Promise.resolve([]),
      shouldLoadMailboxGrants
        ? db.models.agentMailMailboxGrant.find({ organizationId: context.organizationId }).exec()
        : Promise.resolve([]),
      access.agents
        ? db.models.agentMailSystemGrant.find({ organizationId: context.organizationId }).exec()
        : Promise.resolve([]),
      access.agents
        ? listAdminCapabilityGrantsForOrganization(db, context.organizationId)
        : Promise.resolve([])
    ])

  const groupLabelsByRecipient: ReadonlyMap<string, ReadonlyArray<string>> = access.groups
    ? toGroupLabelsByRecipient(forwardingGroups)
    : new Map()
  const normalizedSearchQuery = normalizeAdminSearchQuery(searchQuery)
  const normalizedStatusFilter = normalizeAdminStatusFilter(statusFilter)
  const normalizedPageSize = normalizeAdminPageSize(pageSize)
  const requestedPage = normalizeAdminPage(page)
  const accounts = shouldLoadAccountData
    ? webmailAccounts.map((account) => {
        const address = normalizedMailbox(account.address)
        return toAdminAccount({
          address,
          groups: groupLabelsByRecipient.get(address) ?? [],
          mailboxGrants,
          name: account.name,
          state: account.state
        })
      })
    : []
  const agents = access.agents
    ? await listAdminAgents({
        capabilityGrants,
        forwardingGroups,
        mailboxGrants,
        organizationId: context.organizationId,
        systemGrants
      })
    : []
  const groups = access.groups
    ? forwardingGroups.map(toAdminGroup).sort((left, right) => left.address.localeCompare(right.address))
    : []
  const principals = access.agents
    ? await listAdminExternalPrincipals({
        context,
        db,
        mailboxGrants,
        systemGrants
      })
    : []
  const pendingEnrollments = access.agents
    ? await listAdminPendingAgentEnrollments({
        context,
        db,
        organizationId: context.organizationId
      })
    : []
  const pagedSection = paginateAdminSection({
    accounts,
    agents,
    groups,
    page: requestedPage,
    pageSize: normalizedPageSize,
    pendingEnrollments,
    principals,
    query: normalizedSearchQuery,
    section: resolvedSection,
    statusFilter: normalizedStatusFilter
  })
  const domain =
    accounts[0]?.domain ??
    groups[0]?.domain ??
    (await db.models.agentMailDomain.findOne({ organizationId: context.organizationId }).exec())?.domain ??
    'mailbox'

  return {
    accounts: resolvedSection === 'accounts' ? pagedSection.accounts : accounts,
    agents: resolvedSection === 'agents' ? pagedSection.agents : agents,
    allowedActions,
    allowedSections,
    domain,
    groups: resolvedSection === 'groups' ? pagedSection.groups : groups,
    pagination: pagedSection.pagination,
    pendingEnrollments: resolvedSection === 'agents' ? pagedSection.pendingEnrollments : pendingEnrollments,
    permissionCatalog: agentMailAdminPermissionCatalog,
    principals: resolvedSection === 'agents' ? pagedSection.principals : principals,
    searchQuery: normalizedSearchQuery,
    section: resolvedSection,
    state:
      accounts.length + agents.length + groups.length + principals.length + pendingEnrollments.length === 0
        ? 'empty'
        : 'ready',
    statusFilter: normalizedStatusFilter
  }
}

export async function getAgentMailAdminNavigationForWeb({
  headers
}: {
  headers: Headers
}): Promise<AgentMailAdminNavigation> {
  const context = await requireAgentMailOrganizationContext(headers)
  return {
    allowedSections: allowedSectionsFromAccess(getAdminSectionAccess(context))
  }
}

function paginateAdminSection({
  accounts,
  agents,
  groups,
  page,
  pageSize,
  pendingEnrollments,
  principals,
  query,
  section,
  statusFilter
}: {
  accounts: ReadonlyArray<AgentMailAdminAccount>
  agents: ReadonlyArray<AgentMailAdminAgent>
  groups: ReadonlyArray<AgentMailAdminGroup>
  page: number
  pageSize: number
  pendingEnrollments: ReadonlyArray<AgentMailAdminPendingAgentEnrollment>
  principals: ReadonlyArray<AgentMailAdminExternalPrincipal>
  query: string
  section: AgentMailAdminSectionId
  statusFilter: AgentMailAdminStatusFilter
}) {
  if (section === 'groups') {
    const filtered = groups.filter((group) => matchesAdminGroupFilter(group, query, statusFilter))
    const pagination = toAdminPagination({
      filteredRecords: filtered.length,
      page,
      pageSize,
      totalRecords: groups.length
    })
    return {
      accounts,
      agents,
      groups: filtered.slice(pagination.startIndex, pagination.startIndex + pagination.view.pageSize),
      pendingEnrollments,
      principals,
      pagination: pagination.view
    }
  }

  if (section === 'agents') {
    const filtered = [
      ...agents
        .filter((agent) => matchesAdminAgentFilter(agent, query, statusFilter))
        .map((agent) => ({ agent, type: 'agent' as const })),
      ...principals
        .filter((principal) => matchesAdminExternalPrincipalFilter(principal, query, statusFilter))
        .map((principal) => ({ principal, type: 'principal' as const })),
      ...pendingEnrollments
        .filter((enrollment) => matchesAdminPendingEnrollmentFilter(enrollment, query, statusFilter))
        .map((enrollment) => ({ enrollment, type: 'pendingEnrollment' as const }))
    ]
    const pagination = toAdminPagination({
      filteredRecords: filtered.length,
      page,
      pageSize,
      totalRecords: agents.length + principals.length + pendingEnrollments.length
    })
    const pagedRecords = filtered.slice(
      pagination.startIndex,
      pagination.startIndex + pagination.view.pageSize
    )
    return {
      accounts,
      agents: pagedRecords.flatMap((record) => (record.type === 'agent' ? [record.agent] : [])),
      groups,
      pendingEnrollments: pagedRecords.flatMap((record) =>
        record.type === 'pendingEnrollment' ? [record.enrollment] : []
      ),
      principals: pagedRecords.flatMap((record) => (record.type === 'principal' ? [record.principal] : [])),
      pagination: pagination.view
    }
  }

  const filtered = accounts.filter((account) => matchesAdminAccountFilter(account, query, statusFilter))
  const pagination = toAdminPagination({
    filteredRecords: filtered.length,
    page,
    pageSize,
    totalRecords: accounts.length
  })
  return {
    accounts: filtered.slice(pagination.startIndex, pagination.startIndex + pagination.view.pageSize),
    agents,
    groups,
    pendingEnrollments,
    principals,
    pagination: pagination.view
  }
}

function toAdminPagination({
  filteredRecords,
  page,
  pageSize,
  totalRecords
}: {
  filteredRecords: number
  page: number
  pageSize: number
  totalRecords: number
}) {
  const totalPages = Math.max(1, Math.ceil(filteredRecords / pageSize))
  const boundedPage = Math.min(page, totalPages)
  return {
    startIndex: (boundedPage - 1) * pageSize,
    view: {
      filteredRecords,
      page: boundedPage,
      pageSize,
      totalRecords
    }
  }
}

function matchesAdminAccountFilter(
  account: AgentMailAdminAccount,
  query: string,
  statusFilter: AgentMailAdminStatusFilter
) {
  return (
    matchesAdminStatusFilter(account.status, statusFilter) &&
    matchesAdminQuery(query, [
      account.address,
      account.agentName,
      account.domain,
      ...account.groups,
      account.name,
      account.status,
      account.type
    ])
  )
}

function matchesAdminAgentFilter(
  agent: AgentMailAdminAgent,
  query: string,
  statusFilter: AgentMailAdminStatusFilter
) {
  return (
    matchesAdminStatusFilter(agent.status, statusFilter) &&
    matchesAdminQuery(query, [
      agent.handle,
      ...agent.groups,
      agent.name,
      ...agent.permissions,
      agent.primaryAccount,
      agent.status,
      ...agent.grants.flatMap((grant) => [grant.accountAddress, ...grant.capabilities])
    ])
  )
}

function matchesAdminExternalPrincipalFilter(
  principal: AgentMailAdminExternalPrincipal,
  query: string,
  statusFilter: AgentMailAdminStatusFilter
) {
  return (
    matchesAdminStatusFilter(principal.status, statusFilter) &&
    matchesAdminQuery(query, [
      principal.id,
      principal.kind,
      principal.lastUsed,
      principal.name,
      ...principal.permissions,
      principal.scope,
      principal.status,
      ...principal.grants.flatMap((grant) => [grant.accountAddress, ...grant.capabilities])
    ])
  )
}

function matchesAdminPendingEnrollmentFilter(
  enrollment: AgentMailAdminPendingAgentEnrollment,
  query: string,
  statusFilter: AgentMailAdminStatusFilter
) {
  return (
    matchesAdminStatusFilter(enrollment.status, statusFilter) &&
    matchesAdminQuery(query, [
      enrollment.createdAt,
      enrollment.grantExpiresAt ?? undefined,
      enrollment.hostId,
      enrollment.id,
      enrollment.lastUpdated,
      enrollment.name,
      ...enrollment.permissions,
      enrollment.status,
      enrollment.tokenExpiresAt ?? undefined,
      ...enrollment.grants.flatMap((grant) => [grant.accountAddress, ...grant.capabilities])
    ])
  )
}

function matchesAdminGroupFilter(
  group: AgentMailAdminGroup,
  query: string,
  statusFilter: AgentMailAdminStatusFilter
) {
  return (
    matchesAdminStatusFilter(group.status, statusFilter) &&
    matchesAdminQuery(query, [
      group.address,
      group.description,
      group.domain,
      ...group.recipients,
      group.status
    ])
  )
}

function matchesAdminStatusFilter(status: AgentMailAdminStatus, statusFilter: AgentMailAdminStatusFilter) {
  return statusFilter === 'all' || status === statusFilter
}

function matchesAdminQuery(query: string, values: ReadonlyArray<string | undefined>) {
  if (!query) {
    return true
  }

  return values.some((value) => value?.toLowerCase().includes(query))
}

function normalizeAdminSearchQuery(value: string | undefined) {
  return value?.replace(/\s+/gu, ' ').trim().toLowerCase().slice(0, 256) ?? ''
}

function normalizeAdminStatusFilter(value: AgentMailAdminStatusFilter | undefined) {
  const parsed = AgentMailAdminStatusFilterSchema.safeParse(value ?? 'all')
  return parsed.success ? parsed.data : 'all'
}

function normalizeAdminPage(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1
}

function normalizeAdminPageSize(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ADMIN_PAGE_SIZE
  }
  return Math.min(MAX_ADMIN_PAGE_SIZE, Math.max(1, Math.floor(value)))
}

export async function revokeAgentMailAgentForWeb({
  agentId,
  headers
}: {
  agentId: string
  headers: Headers
}): Promise<AgentMailAdminRevokeAgentResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'agents')
  const agentUuid = parseAgentPublicId(agentId)
  const agent = await db.models.agent.findById(agentUuid).exec()

  if (!agent) {
    throw new AgentMailAdminError('Agent access was not found', 404)
  }
  requireAdminAgentManageAccess(context, String(agent._id))

  const now = new Date()
  const [activeMailboxGrants, activeSystemGrants, capabilityGrants] = await Promise.all([
    db.models.agentMailMailboxGrant
      .find({
        principalId: String(agent._id),
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      })
      .exec(),
    db.models.agentMailSystemGrant
      .find({
        principalId: String(agent._id),
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      })
      .exec(),
    db.models.agentCapabilityGrant
      .find({
        agentId: agent._id,
        status: { $in: ['active', 'pending'] }
      })
      .exec()
  ])
  const organizationCapabilityGrants = capabilityGrants.filter(
    (grant) =>
      String(agentMailCapabilityGrantOrganizationId(grant, now, { statuses: ['active', 'pending'] })) ===
      String(context.organizationId)
  )
  const organizationMailboxGrants = activeMailboxGrants.filter(
    (grant) => String(grant.organizationId) === String(context.organizationId)
  )
  const organizationSystemGrants = activeSystemGrants.filter(
    (grant) => String(grant.organizationId) === String(context.organizationId)
  )

  if (
    !organizationMailboxGrants.length &&
    !organizationSystemGrants.length &&
    !organizationCapabilityGrants.length
  ) {
    throw new AgentMailAdminError('Agent access was not found', 404)
  }
  for (const grant of organizationMailboxGrants) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: String(agent._id),
      capability: grant.capability,
      mailboxAddress: grant.mailboxAddress
    })
  }
  for (const grant of organizationSystemGrants) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: String(agent._id),
      permission: grant.permission
    })
  }
  for (const grant of organizationCapabilityGrants) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: String(agent._id),
      capability: grant.capability
    })
  }
  const organizationCapabilityGrantIds = organizationCapabilityGrants.map((grant) => grant._id)

  const hasOtherActiveAccess =
    activeMailboxGrants.some((grant) => String(grant.organizationId) !== String(context.organizationId)) ||
    activeSystemGrants.some((grant) => String(grant.organizationId) !== String(context.organizationId)) ||
    capabilityGrants.some((grant) => {
      const organizationId = agentMailCapabilityGrantOrganizationId(grant, now, {
        statuses: ['active', 'pending']
      })
      return organizationId && String(organizationId) !== String(context.organizationId)
    })

  const [mailboxGrantUpdate, systemGrantUpdate] = await Promise.all([
    db.models.agentMailMailboxGrant
      .updateMany(
        {
          organizationId: context.organizationId,
          principalId: String(agent._id),
          principalType: 'agent',
          status: { $in: ['active', 'pending'] }
        },
        { $set: { status: 'revoked', updatedAt: now } }
      )
      .exec(),
    db.models.agentMailSystemGrant
      .updateMany(
        {
          organizationId: context.organizationId,
          principalId: String(agent._id),
          principalType: 'agent',
          status: { $in: ['active', 'pending'] }
        },
        { $set: { status: 'revoked', updatedAt: now } }
      )
      .exec()
  ])

  const [capabilityGrantUpdate] = await Promise.all([
    organizationCapabilityGrantIds.length
      ? db.models.agentCapabilityGrant
          .updateMany(
            { _id: { $in: organizationCapabilityGrantIds } },
            { $set: { status: 'revoked', updatedAt: now } }
          )
          .exec()
      : Promise.resolve({ modifiedCount: 0 }),
    hasOtherActiveAccess
      ? Promise.resolve({ modifiedCount: 0 })
      : db.models.agent.updateOne({ _id: agent._id }, { $set: { status: 'revoked', updatedAt: now } }).exec(),
    db.models.auditLog.create({
      action: 'agent_mail.agent.revoked',
      metadata: {
        agentId: String(agent._id),
        agentPublicId: agentId,
        agentStatusRevoked: !hasOtherActiveAccess,
        organizationId: String(context.organizationId),
        revokedCapabilityGrantCount: organizationCapabilityGrantIds.length,
        revokedMailboxGrantCount: modifiedCount(mailboxGrantUpdate),
        revokedSystemGrantCount: modifiedCount(systemGrantUpdate)
      },
      severity: 'medium',
      status: 'success',
      userId: context.userId ?? null
    })
  ])

  return {
    agentId,
    revokedCapabilityGrantCount: modifiedCount(capabilityGrantUpdate),
    revokedMailboxGrantCount: modifiedCount(mailboxGrantUpdate),
    revokedSystemGrantCount: modifiedCount(systemGrantUpdate),
    status: 'revoked',
    success: true
  }
}

export async function revokeAgentMailAgentEnrollmentForWeb({
  enrollmentId,
  headers
}: {
  enrollmentId: string
  headers: Headers
}): Promise<AgentMailAdminRevokeAgentEnrollmentResult> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAdminSectionAccess(getAdminSectionAccess(context), 'agents')
  const enrollmentUuid = parseAgentEnrollmentPublicId(enrollmentId)

  return await withAdminTransaction(db, async (session) => {
    const request = await execAdminQuery(
      db.models.agentMailAgentEnrollmentGrantRequest.findOne({
        _id: enrollmentUuid,
        organizationId: context.organizationId,
        status: 'pending'
      }),
      session
    )

    if (!request) {
      throw new AgentMailAdminError('Agent enrollment was not found', 404)
    }
    for (const grant of request.mailboxGrants) {
      for (const capability of grant.capabilities) {
        requireAdminAgentGrantManageAccess(context, {
          agentId: null,
          capability,
          mailboxAddress: grant.mailboxAddress
        })
      }
    }
    for (const permission of request.systemPermissions) {
      requireAdminAgentGrantManageAccess(context, {
        agentId: null,
        permission
      })
    }

    const now = new Date()
    const requestUpdate = await execAdminQuery(
      db.models.agentMailAgentEnrollmentGrantRequest.updateOne(
        { _id: request._id, status: 'pending' },
        {
          $set: {
            status: 'revoked',
            updatedAt: now
          }
        }
      ),
      session
    )
    if (!updateMatched(requestUpdate)) {
      throw new AgentMailAdminError('Agent enrollment was not found', 404)
    }
    await execAdminQuery(
      db.models.agentHost.updateOne(
        { _id: request.hostId, status: 'pending_enrollment' },
        { $set: { status: 'revoked', updatedAt: now } }
      ),
      session
    )
    await auditAgentMailAdmin(
      context,
      'agent_mail.agent.enrollment.revoked',
      {
        enrollmentId,
        hostId: String(request.hostId),
        organizationId: String(context.organizationId)
      },
      { db, session }
    )

    return {
      enrollmentId,
      hostId: String(request.hostId),
      status: 'revoked',
      success: true
    }
  })
}

function parseAgentPublicId(value: string): AgentId {
  try {
    return base62UUIDv7ToUUIDv7(value) as AgentId
  } catch {
    throw new AgentMailAdminError('Agent id is invalid', 400)
  }
}

function parseAgentEnrollmentPublicId(value: string): AgentMailAgentEnrollmentGrantRequestId {
  try {
    return base62UUIDv7ToUUIDv7(value) as AgentMailAgentEnrollmentGrantRequestId
  } catch {
    throw new AgentMailAdminError('Agent enrollment id is invalid', 400)
  }
}

function parseAgentAuthHostId(value: string): AgentHostId {
  return parseUUIDv7(value) as AgentHostId
}

function parseForwardingGroupPublicId(value: string): AgentMailForwardingGroupDocument['_id'] {
  try {
    return base62UUIDv7ToUUIDv7(value) as AgentMailForwardingGroupDocument['_id']
  } catch {
    throw new AgentMailAdminError('Forwarding group id is invalid', 400)
  }
}

function parseApiKeyPublicId(value: string): ApiKeyId {
  try {
    return base62UUIDv7ToUUIDv7(value) as ApiKeyId
  } catch {
    throw new AgentMailAdminError('API key id is invalid', 400)
  }
}

function parseAccountInput(input: unknown): AgentMailAdminAccountInput {
  const parsed = AgentMailAdminAccountInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailAdminError('Mailbox account input is invalid', 400)
  }
  return parsed.data
}

function parseAccountUpdateInput(input: unknown): AgentMailAdminUpdateAccountInput {
  const parsed = AgentMailAdminUpdateAccountInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailAdminError('Mailbox account update input is invalid', 400)
  }
  return parsed.data
}

function parseAgentSystemPermissionsInput(input: unknown): AgentMailAdminAgentSystemPermissionsInput {
  const parsed = AgentMailAdminAgentSystemPermissionsInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailAdminError('Agent system permission input is invalid', 400)
  }
  return parsed.data
}

function parseAgentInput(input: unknown): AgentMailAdminAgentInput {
  const parsed = AgentMailAdminAgentInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailAdminError('Agent input is invalid', 400)
  }
  return parsed.data
}

function parseAgentMailboxGrantsInput(input: unknown): AgentMailAdminAgentMailboxGrantsInput {
  const parsed = AgentMailAdminAgentMailboxGrantsInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailAdminError('Agent mailbox grant input is invalid', 400)
  }
  return parsed.data
}

function parseGrantPrincipalTarget(input: unknown): AgentMailAdminGrantPrincipalTargetInput {
  const parsed = AgentMailAdminGrantPrincipalTargetInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailAdminError('Grant principal target is invalid', 400)
  }
  return parsed.data
}

function parseForwardingGroupInput(input: unknown): AgentMailAdminForwardingGroupInput {
  const parsed = AgentMailAdminForwardingGroupInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailAdminError('Forwarding group input is invalid', 400)
  }
  return parsed.data
}

function parseForwardingGroupUpdateInput(input: unknown): AgentMailAdminUpdateForwardingGroupInput {
  const parsed = AgentMailAdminUpdateForwardingGroupInput.safeParse(input)
  if (!parsed.success) {
    throw new AgentMailAdminError('Forwarding group input is invalid', 400)
  }
  return parsed.data
}

async function requireGrantPrincipalForOrganization({
  context,
  db,
  target
}: {
  context: AgentMailOrganizationContext
  db: Database
  target: AgentMailAdminGrantPrincipalTargetInput
}): Promise<AgentMailAdminResolvedGrantPrincipalTarget> {
  if (target.principalType === 'api_key') {
    const apiKeyId = parseApiKeyPublicId(target.principalId)
    const apiKey = await db.models.apikey.findById(apiKeyId, AT_EMAIL_ADMIN_ADMIN_API_KEY_PROJECTION).exec()
    if (!apiKey || !apiKey.enabled || (apiKey.expiresAt instanceof Date && apiKey.expiresAt <= new Date())) {
      throw new AgentMailAdminError('Grant principal was not found', 404)
    }
    if (apiKey.configId === 'organization') {
      if (String(apiKey.referenceId) !== String(context.organizationId)) {
        throw new AgentMailAdminError('Grant principal was not found', 404)
      }
      return {
        principalId: String(apiKey._id),
        principalType: target.principalType,
        publicPrincipalId: target.principalId
      }
    }
    if (!context.userId || String(apiKey.referenceId) !== String(context.userId)) {
      throw new AgentMailAdminError('Grant principal was not found', 404)
    }
    return {
      principalId: String(apiKey._id),
      principalType: target.principalType,
      publicPrincipalId: target.principalId
    }
  }

  const oauthClient = await db.models.oauthClient
    .findOne({ clientId: target.principalId }, AT_EMAIL_ADMIN_ADMIN_OAUTH_CLIENT_PROJECTION)
    .exec()
  if (!oauthClient || oauthClient.disabled) {
    throw new AgentMailAdminError('Grant principal was not found', 404)
  }
  if (!oauthClient.referenceId) {
    throw new AgentMailAdminError('Grant principal was not found', 404)
  }
  const referenceId = String(oauthClient.referenceId)
  const currentUserId = context.userId ? String(context.userId) : null
  if (referenceId !== String(context.organizationId) && referenceId !== currentUserId) {
    throw new AgentMailAdminError('Grant principal was not found', 404)
  }
  if (oauthClient.userId && (!context.userId || String(oauthClient.userId) !== String(context.userId))) {
    throw new AgentMailAdminError('Grant principal was not found', 404)
  }
  return {
    ...target,
    publicPrincipalId: target.principalId
  }
}

function requireAdminAccountCreateAccess(
  context: AgentMailOrganizationContext,
  options: { provision?: boolean } = {}
) {
  const mailboxSubject = agentMailSubject('Mailbox', { organizationId: context.organizationId })

  if (options.provision || isAgentMailboxProvisionRequest(context)) {
    if (!context.ability.can('provision', mailboxSubject)) {
      throw new AgentMailAccessError('Mailbox provisioning is not authorized', 403)
    }
    return
  }

  if (!context.ability.can('create', mailboxSubject)) {
    throw new AgentMailAccessError('Mailbox account creation is not authorized', 403)
  }
}

function isAgentMailboxProvisionRequest(context: AgentMailOrganizationContext) {
  return context.principal.principalType === 'agent' && context.paperclipContext?.operation === 'provision'
}

function requireAdminAccountManageAccess(context: AgentMailOrganizationContext, accountId: string) {
  if (
    !context.ability.can(
      'update',
      agentMailSubject('Mailbox', {
        mailboxAddress: accountId,
        organizationId: context.organizationId
      })
    )
  ) {
    throw new AgentMailAccessError('Mailbox account management is not authorized', 403)
  }
}

function requireAdminAgentManageAccess(context: AgentMailOrganizationContext, agentId: string) {
  if (
    !context.ability.can(
      'manage',
      agentMailSubject('Agent', {
        agentId,
        organizationId: context.organizationId
      })
    )
  ) {
    throw new AgentMailAccessError('Agent management is not authorized', 403)
  }
}

function requireAdminAgentGrantManageAccess(
  context: AgentMailOrganizationContext,
  grant: {
    agentId?: string | null
    capability?: string | null
    mailboxAddress?: string | null
    permission?: string | null
  }
) {
  if (!canManageAdminAgentGrant(context, grant)) {
    throw new AgentMailAccessError('Agent grant management is not authorized', 403)
  }
}

function canManageAdminAgentGrant(
  context: AgentMailOrganizationContext,
  grant: {
    agentId?: string | null
    capability?: string | null
    mailboxAddress?: string | null
    permission?: string | null
  }
) {
  const requiredCapabilities = requiredGrantCapabilities(grant)
  if (!requiredCapabilities.length) {
    return false
  }

  return requiredCapabilities.every((capability) =>
    context.ability.can(
      'manage',
      agentMailSubject('AgentGrant', {
        agentId: grant.agentId ?? null,
        capability,
        mailboxAddress: grant.mailboxAddress ?? null,
        organizationId: context.organizationId,
        permission: grant.permission ?? null
      })
    )
  )
}

function canRevokePendingEnrollment(
  context: AgentMailOrganizationContext,
  request: AgentMailAgentEnrollmentGrantRequestDocument
) {
  return (
    request.mailboxGrants.every((grant) =>
      grant.capabilities.every((capability) =>
        canManageAdminAgentGrant(context, {
          agentId: null,
          capability,
          mailboxAddress: grant.mailboxAddress
        })
      )
    ) &&
    request.systemPermissions.every((permission) =>
      canManageAdminAgentGrant(context, {
        agentId: null,
        permission
      })
    )
  )
}

function requiredGrantCapabilities(grant: {
  capability?: string | null
  permission?: string | null
}): ReadonlyArray<AgentMailCapability> {
  const mailboxGrant = AgentMailMailboxGrantSchema.safeParse(grant.capability)
  if (mailboxGrant.success) {
    return AgentMailCapabilityByMailboxGrant[mailboxGrant.data]
  }

  const capabilityGrant = AgentMailCapabilitySchema.safeParse(grant.capability)
  if (capabilityGrant.success) {
    return [capabilityGrant.data]
  }

  const systemPermission = AgentMailSystemPermissionSchema.safeParse(grant.permission)
  if (systemPermission.success) {
    return AgentMailCapabilityBySystemPermission[systemPermission.data]
  }

  return []
}

async function requireOrganizationScopedAgentAccess({
  agent,
  context,
  db
}: {
  agent: AgentDocument
  context: AgentMailOrganizationContext
  db: Database
}) {
  if (agent.userId && String(agent.userId) === String(context.userId)) {
    return
  }

  if (agent.hostId) {
    const host = await db.models.agentHost.findById(agent.hostId).exec()
    if (host?.userId && String(host.userId) === String(context.userId)) {
      return
    }
  }

  const now = new Date()
  const [mailboxGrants, systemGrants, capabilityGrants] = await Promise.all([
    db.models.agentMailMailboxGrant
      .find({
        organizationId: context.organizationId,
        principalId: String(agent._id),
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      })
      .exec(),
    db.models.agentMailSystemGrant
      .find({
        organizationId: context.organizationId,
        principalId: String(agent._id),
        principalType: 'agent',
        status: { $in: ['active', 'pending'] }
      })
      .exec(),
    db.models.agentCapabilityGrant
      .find({
        agentId: agent._id,
        status: { $in: ['active', 'pending'] }
      })
      .exec()
  ])
  const hasCapabilityGrant = capabilityGrants.some(
    (grant) =>
      String(agentMailCapabilityGrantOrganizationId(grant, now, { statuses: ['active', 'pending'] })) ===
      String(context.organizationId)
  )

  if (!mailboxGrants.length && !systemGrants.length && !hasCapabilityGrant) {
    throw new AgentMailAdminError('Agent access was not found', 404)
  }
}

function modifiedCount(value: { modifiedCount?: number } | null | undefined) {
  return typeof value?.modifiedCount === 'number' ? value.modifiedCount : 0
}

function updateMatched(result: unknown) {
  if (!result || typeof result !== 'object') {
    return false
  }
  const record = result as {
    matchedCount?: unknown
    n?: unknown
  }
  return record.matchedCount === undefined ? Number(record.n ?? 0) > 0 : Number(record.matchedCount) > 0
}

type AdminExecutableQuery<T> = {
  exec: () => Promise<T>
  session?: (session: ClientSession) => AdminExecutableQuery<T>
}

async function execAdminQuery<T>(query: AdminExecutableQuery<T>, session: ClientSession): Promise<T> {
  return (query.session?.(session) ?? query).exec()
}

async function withAdminTransaction<T>(
  db: Pick<Database, 'connection'>,
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  return await db.connection.transaction((session) => operation(session))
}

async function listManageableMailDomains(organizationId: OrganizationId) {
  const { db } = await globals()
  const domains = new Set<string>()
  const [mailDomains, fallbackConnections] = await Promise.all([
    db.models.agentMailDomain
      .find({
        organizationId,
        status: { $in: ['active', 'degraded'] }
      })
      .exec(),
    db.models.cloudflareConnection
      .find({
        organizationId,
        status: 'active'
      })
      .exec()
  ])

  for (const domain of mailDomains) {
    addNormalizedDomain(domains, domain.domain)
  }
  for (const connection of fallbackConnections) {
    addNormalizedDomain(domains, connection.domain)
  }

  return [...domains].sort()
}

interface InitialMailboxGrantPlan {
  agent: AgentDocument
  grantCapabilities: ReadonlyArray<AgentMailMailboxGrant>
}

async function validateInitialMailboxGrantsForAgent({
  agentId,
  capabilities,
  context,
  db,
  mailboxAddress
}: {
  agentId: string
  capabilities?: ReadonlyArray<AgentMailMailboxGrant>
  context: AgentMailOrganizationContext
  db: Database
  mailboxAddress: string
}): Promise<InitialMailboxGrantPlan> {
  const agentUuid = parseAgentPublicId(agentId)
  const agent = await db.models.agent.findById(agentUuid).exec()
  if (!agent) {
    throw new AgentMailAdminError('Assigned agent was not found', 404)
  }
  await requireOrganizationScopedAgentAccess({ agent, context, db })

  const grantCapabilities = [
    ...new Set(capabilities?.length ? capabilities : AgentMailDefaultMailboxGrantValues)
  ]

  for (const capability of grantCapabilities) {
    requireAdminAgentGrantManageAccess(context, {
      agentId: String(agent._id),
      capability,
      mailboxAddress
    })
  }

  return { agent, grantCapabilities }
}

async function createInitialMailboxGrantsForAgent({
  context,
  grantPlan,
  mailboxAddress,
  organizationId
}: {
  context: AgentMailOrganizationContext
  grantPlan: InitialMailboxGrantPlan
  mailboxAddress: string
  organizationId: OrganizationId
}): Promise<AgentMailMailboxGrantDocument[]> {
  const { db } = await globals()
  const grants: AgentMailMailboxGrantDocument[] = []

  for (const capability of grantPlan.grantCapabilities) {
    grants.push(
      await db.models.agentMailMailboxGrant.create({
        capability,
        constraints: null,
        expiresAt: null,
        grantedByUserId: context.userId ?? undefined,
        mailboxAddress,
        organizationId,
        principalId: String(grantPlan.agent._id),
        principalType: 'agent',
        status: 'active'
      })
    )
  }

  return grants
}

async function resolveExistingMailboxUser(client: ReturnType<typeof createWildDuckClient>, address: string) {
  const resolution = await client.resolveAddress(address)
  const userId = resolution.user || resolution.id
  if (!userId) {
    throw new AgentMailAdminError('Mailbox account was not found', 404)
  }
  return userId
}

function normalizeAgentMailboxGrantInputs(
  grants: ReadonlyArray<AgentMailAdminAgentMailboxGrantsInput['grants'][number]>,
  domains: ReadonlyArray<string>
): AgentMailEnrollmentMailboxGrantRequest[] {
  const grantsByMailbox = new Map<string, Set<AgentMailMailboxGrant>>()

  for (const grant of grants) {
    const mailboxAddress = normalizeAccountAddress(grant.accountId, domains)
    const capabilities = grantsByMailbox.get(mailboxAddress) ?? new Set<AgentMailMailboxGrant>()
    for (const capability of grant.capabilities) {
      capabilities.add(capability)
    }
    grantsByMailbox.set(mailboxAddress, capabilities)
  }

  return [...grantsByMailbox.entries()]
    .map(([mailboxAddress, capabilities]) => ({
      capabilities: [...capabilities].sort(),
      mailboxAddress
    }))
    .sort((left, right) => left.mailboxAddress.localeCompare(right.mailboxAddress))
}

function normalizeGrantExpiresAt(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null
  }

  const expiresAt = new Date(value)
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new AgentMailAdminError('Agent grant expiration input is invalid', 400)
  }

  return expiresAt
}

async function auditAgentMailAdmin(
  context: AgentMailOrganizationContext,
  action: string,
  metadata: Record<string, unknown>,
  options?: {
    db?: Database
    session?: ClientSession
  }
) {
  const db = options?.db ?? (await globals()).db
  const auditEvent = {
    action,
    metadata,
    severity: 'medium' as const,
    status: 'success' as const,
    userId: context.userId ?? null
  }

  if (options?.session) {
    await db.models.auditLog.create([auditEvent], { session: options.session })
    return
  }

  await db.models.auditLog.create(auditEvent)
}

async function revokePendingEnrollmentHost(db: Database, hostId: string): Promise<void> {
  const now = new Date()
  await db.models.agentHost
    .updateOne(
      { _id: parseAgentAuthHostId(hostId), status: 'pending_enrollment' },
      { $set: { status: 'revoked', updatedAt: now } }
    )
    .exec()
}

async function listAdminCapabilityGrantsForOrganization(
  db: Database,
  organizationId: OrganizationId
): Promise<AgentCapabilityGrantDocument[]> {
  const now = new Date()
  const capabilityGrants = await db.models.agentCapabilityGrant
    .find({ status: { $in: ['active', 'pending'] } })
    .exec()

  return capabilityGrants.filter(
    (grant) =>
      String(agentMailCapabilityGrantOrganizationId(grant, now, { statuses: ['active', 'pending'] })) ===
      String(organizationId)
  )
}

async function listAdminAgents({
  capabilityGrants,
  forwardingGroups,
  mailboxGrants,
  organizationId,
  systemGrants
}: {
  capabilityGrants: ReadonlyArray<AgentCapabilityGrantDocument>
  forwardingGroups: ReadonlyArray<AgentMailForwardingGroupDocument>
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>
  organizationId: OrganizationId
  systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
}): Promise<AgentMailAdminAgent[]> {
  const { db } = await globals()
  const agentIds = new Set<string>()

  for (const grant of [...mailboxGrants, ...systemGrants]) {
    if (grant.principalType === 'agent') {
      agentIds.add(grant.principalId)
    }
  }
  const now = new Date()
  for (const grant of capabilityGrants) {
    const grantOrganizationId = agentMailCapabilityGrantOrganizationId(grant, now, {
      statuses: ['active', 'pending']
    })
    if (grantOrganizationId && String(grantOrganizationId) === String(organizationId)) {
      agentIds.add(String(grant.agentId))
    }
  }

  if (!agentIds.size) {
    return []
  }

  const agents = await db.models.agent
    .find()
    .where('_id')
    .in([...agentIds])
    .exec()
  const groupLabelsByRecipient = toGroupLabelsByRecipient(forwardingGroups)
  return agents
    .map((agent) => toAdminAgent(agent, mailboxGrants, systemGrants, groupLabelsByRecipient))
    .sort((left, right) => left.name.localeCompare(right.name))
}

async function listAdminPendingAgentEnrollments({
  context,
  db,
  organizationId
}: {
  context: AgentMailOrganizationContext
  db: Database
  organizationId: OrganizationId
}): Promise<AgentMailAdminPendingAgentEnrollment[]> {
  const requests = await db.models.agentMailAgentEnrollmentGrantRequest
    .find({ organizationId, status: 'pending' })
    .exec()
  if (!requests.length) {
    return []
  }
  const hostIds = [...new Set(requests.map((request) => String(request.hostId)))]
  const hosts = await db.models.agentHost.find().where('_id').in(hostIds).exec()
  const hostsById = new Map(hosts.map((host) => [String(host._id), host]))

  return requests
    .map((request) => toAdminPendingAgentEnrollment(context, request, hostsById.get(String(request.hostId))))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

async function listAdminExternalPrincipals({
  context,
  db,
  mailboxGrants,
  systemGrants
}: {
  context: AgentMailOrganizationContext
  db: Database
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>
  systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
}): Promise<AgentMailAdminExternalPrincipal[]> {
  const apiKeyGrantPrincipalIds = principalIdsByType<ApiKeyId>([...mailboxGrants, ...systemGrants], 'api_key')
  const oauthGrantPrincipalIds = principalIdsByType([...mailboxGrants, ...systemGrants], 'oauth_client')
  const apiKeyQuery: QueryFilter<ApiKeyDocument> = {
    $or: compactQueryClauses<QueryFilter<ApiKeyDocument>>([
      { configId: 'organization', referenceId: context.organizationId },
      context.userId ? { referenceId: context.userId } : null,
      apiKeyGrantPrincipalIds.size ? { _id: { $in: [...apiKeyGrantPrincipalIds] } } : null
    ])
  }
  const oauthClientQuery: QueryFilter<OAuthClientDocument> = {
    $or: compactQueryClauses<QueryFilter<OAuthClientDocument>>([
      { referenceId: context.organizationId },
      context.userId ? { referenceId: context.userId } : null,
      context.userId ? { userId: context.userId } : null,
      oauthGrantPrincipalIds.size ? { clientId: { $in: [...oauthGrantPrincipalIds] } } : null
    ])
  }
  const [apiKeys, oauthClients] = await Promise.all([
    db.models.apikey.find(apiKeyQuery, AT_EMAIL_ADMIN_ADMIN_API_KEY_PROJECTION).exec(),
    db.models.oauthClient.find(oauthClientQuery, AT_EMAIL_ADMIN_ADMIN_OAUTH_CLIENT_PROJECTION).exec()
  ])

  return [
    ...apiKeys.map((apiKey) => toAdminApiKeyPrincipal(apiKey, context, mailboxGrants, systemGrants)),
    ...oauthClients.map((client) => toAdminOAuthClientPrincipal(client, context, mailboxGrants, systemGrants))
  ].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

function principalIdsByType(
  grants: ReadonlyArray<AgentMailMailboxGrantDocument | AgentMailSystemGrantDocument>,
  principalType: AgentMailAdminGrantPrincipalType
): Set<string>
function principalIdsByType<TPrincipalId extends string>(
  grants: ReadonlyArray<AgentMailMailboxGrantDocument | AgentMailSystemGrantDocument>,
  principalType: AgentMailAdminGrantPrincipalType
): Set<TPrincipalId>
function principalIdsByType<TPrincipalId extends string>(
  grants: ReadonlyArray<AgentMailMailboxGrantDocument | AgentMailSystemGrantDocument>,
  principalType: AgentMailAdminGrantPrincipalType
) {
  return new Set(
    grants
      .filter((grant) => grant.principalType === principalType)
      .map((grant) => grant.principalId as TPrincipalId)
  )
}

function compactQueryClauses<TClause>(clauses: ReadonlyArray<TClause | null>): TClause[] {
  return clauses.filter((clause): clause is TClause => clause !== null)
}

function toAdminApiKeyPrincipal(
  apiKey: AgentMailAdminApiKeyRecord,
  context: AgentMailOrganizationContext,
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>,
  systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
): AgentMailAdminExternalPrincipal {
  const storageId = String(apiKey._id)
  const id = publicIdFromUUIDv7(apiKey._id)
  const grants = mailboxGrants.filter(
    (grant) => grant.principalType === 'api_key' && grant.principalId === storageId
  )
  const permissions = systemGrants.filter(
    (grant) => grant.principalType === 'api_key' && grant.principalId === storageId
  )
  const disabled = !apiKey.enabled || (apiKey.expiresAt instanceof Date && apiKey.expiresAt <= new Date())

  return {
    grants: toMailboxGrantViews(grants),
    id,
    kind: 'api_key',
    lastUsed: dateLabel(apiKey.lastRequest ?? apiKey.updatedAt ?? apiKey.createdAt),
    name: apiKey.name?.trim() || `API key ${shortId(id)}`,
    permissions: uniqueSystemPermissions(permissions),
    scope:
      apiKey.configId === 'organization' && String(apiKey.referenceId) === String(context.organizationId)
        ? 'organization'
        : 'user',
    status: externalPrincipalStatus(disabled, grants, permissions)
  }
}

function toAdminOAuthClientPrincipal(
  client: AgentMailAdminOAuthClientRecord,
  context: AgentMailOrganizationContext,
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>,
  systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
): AgentMailAdminExternalPrincipal {
  const grants = mailboxGrants.filter(
    (grant) => grant.principalType === 'oauth_client' && grant.principalId === client.clientId
  )
  const permissions = systemGrants.filter(
    (grant) => grant.principalType === 'oauth_client' && grant.principalId === client.clientId
  )

  return {
    grants: toMailboxGrantViews(grants),
    id: client.clientId,
    kind: 'oauth_client',
    lastUsed: dateLabel(client.updatedAt ?? client.createdAt),
    name: client.name?.trim() || `OAuth client ${shortId(client.clientId)}`,
    permissions: uniqueSystemPermissions(permissions),
    scope: String(client.referenceId) === String(context.organizationId) ? 'organization' : 'user',
    status: externalPrincipalStatus(client.disabled, grants, permissions)
  }
}

function externalPrincipalStatus(
  disabled: boolean,
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>,
  systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>
): AgentMailAdminStatus {
  if (disabled) {
    return 'disabled'
  }
  return [...mailboxGrants, ...systemGrants].some((grant) => grant.status === 'pending')
    ? 'pending'
    : 'active'
}

function uniqueSystemPermissions(grants: ReadonlyArray<AgentMailSystemGrantDocument>) {
  return [...new Set(grants.map((grant) => grant.permission))].sort()
}

function toAdminAccount({
  address,
  groups,
  mailboxGrants,
  name,
  state
}: {
  address: string
  groups: ReadonlyArray<string>
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>
  name: string
  state: 'disabled' | 'ready'
}): AgentMailAdminAccount {
  const grants = mailboxGrants.filter((grant) => normalizedMailbox(grant.mailboxAddress) === address)
  const agentName =
    grants[0]?.principalType === 'agent' ? `Agent ${shortId(grants[0].principalId)}` : undefined

  return {
    accessCount: grants.length,
    address,
    agentName,
    domain: domainPart(address),
    groups,
    id: address,
    lastActivity: 'No recent activity',
    name,
    status:
      state === 'disabled'
        ? 'disabled'
        : grants.some((grant) => grant.status === 'pending')
          ? 'pending'
          : 'active',
    type: 'mailbox'
  }
}

function toAdminAgent(
  agent: AgentDocument,
  mailboxGrants: ReadonlyArray<AgentMailMailboxGrantDocument>,
  systemGrants: ReadonlyArray<AgentMailSystemGrantDocument>,
  groupLabelsByRecipient: ReadonlyMap<string, ReadonlyArray<string>>
): AgentMailAdminAgent {
  const principalId = String(agent._id)
  const mailboxGrantsForAgent = mailboxGrants.filter(
    (grant) => grant.principalType === 'agent' && grant.principalId === principalId
  )
  const systemGrantsForAgent = systemGrants.filter(
    (grant) => grant.principalType === 'agent' && grant.principalId === principalId
  )
  const grants = toMailboxGrantViews(mailboxGrantsForAgent)
  const groups = [
    ...new Set(grants.flatMap((grant) => groupLabelsByRecipient.get(grant.accountAddress) ?? []))
  ].sort()

  return {
    grants,
    groups,
    handle: `agent:${shortId(principalId)}`,
    id: publicIdFromUUIDv7(agent._id),
    lastSeen: dateLabel(agent.lastUsedAt ?? agent.updatedAt),
    name: agent.name,
    permissions: [...new Set(systemGrantsForAgent.map((grant) => grant.permission))].sort(),
    primaryAccount: grants[0]?.accountAddress,
    status: toAgentStatus(agent.status)
  }
}

function toAdminPendingAgentEnrollment(
  context: AgentMailOrganizationContext,
  request: AgentMailAgentEnrollmentGrantRequestDocument,
  host: AgentHostDocument | undefined
): AgentMailAdminPendingAgentEnrollment {
  const grants = toEnrollmentMailboxGrantViews(request.mailboxGrants)
  const permissions = [...new Set(request.systemPermissions)].sort()

  return {
    canRevoke: canRevokePendingEnrollment(context, request),
    createdAt: dateLabel(request.createdAt),
    grantExpiresAt: toOptionalISOString(request.grantExpiresAt),
    grants,
    hostId: String(request.hostId),
    id: publicIdFromUUIDv7(request._id),
    lastUpdated: dateLabel(request.updatedAt),
    mailboxGrantCount: grants.reduce((count, grant) => count + grant.capabilities.length, 0),
    name: request.name,
    permissions,
    status: 'pending',
    systemPermissionCount: permissions.length,
    tokenExpiresAt: toOptionalISOString(host?.enrollmentTokenExpiresAt)
  }
}

function toEnrollmentMailboxGrantViews(
  mailboxGrants: AgentMailAgentEnrollmentGrantRequestDocument['mailboxGrants']
): AgentMailAdminMailboxGrant[] {
  return mailboxGrants
    .map((grant) => {
      const accountAddress = normalizedMailbox(grant.mailboxAddress)
      return {
        accountAddress,
        accountId: accountAddress,
        capabilities: [...new Set(grant.capabilities)].sort()
      }
    })
    .sort((left, right) => left.accountAddress.localeCompare(right.accountAddress))
}

type AgentAuthCreateHostResponse = Awaited<ReturnType<GlobalAuth['api']['createHost']>>

interface AgentAuthCreateHostResult {
  enrollmentToken?: unknown
  enrollmentTokenExpiresAt?: unknown
  hostId?: unknown
  status?: unknown
}

async function readAgentAuthCreateHostResult(
  result: AgentAuthCreateHostResponse | AgentAuthCreateHostResult
): Promise<AgentAuthCreateHostResult> {
  if (result instanceof Response) {
    if (!result.ok) {
      throw new AgentMailAdminError('Agent enrollment token could not be created', 502)
    }
    const body = await result.json().catch(() => null)
    return isRecord(body) ? body : {}
  }
  return result
}

function toAgentEnrollment(
  host: AgentAuthCreateHostResult,
  {
    grantExpiresAt,
    mailboxGrantCount,
    name,
    systemPermissionCount
  }: {
    grantExpiresAt: Date | null
    mailboxGrantCount: number
    name: string
    systemPermissionCount: number
  }
): AgentMailAdminAgentEnrollment {
  if (
    host.status !== 'pending_enrollment' ||
    typeof host.hostId !== 'string' ||
    !host.hostId ||
    typeof host.enrollmentToken !== 'string' ||
    !host.enrollmentToken
  ) {
    throw new AgentMailAdminError('Agent enrollment token could not be created', 502)
  }

  return {
    enrollmentToken: host.enrollmentToken,
    enrollmentTokenExpiresAt: toOptionalISOString(host.enrollmentTokenExpiresAt),
    grantExpiresAt: toOptionalISOString(grantExpiresAt),
    hostId: host.hostId,
    mailboxGrantCount,
    name,
    status: 'pending_enrollment',
    systemPermissionCount
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toAdminGroup(group: AgentMailForwardingGroupDocument): AgentMailAdminGroup {
  const address = normalizedMailbox(group.address)

  return {
    address,
    description: group.description,
    domain: domainPart(address),
    id: publicIdFromUUIDv7(group._id),
    lastDelivered: dateLabel(group.lastDeliveredAt),
    lastUpdated: dateLabel(group.updatedAt),
    recipients: normalizeRecipients(group.recipients),
    status: toForwardingGroupStatus(group.status)
  }
}

function toGroupLabelsByRecipient(
  groups: ReadonlyArray<AgentMailForwardingGroupDocument>
): ReadonlyMap<string, ReadonlyArray<string>> {
  const labelsByRecipient = new Map<string, string[]>()

  for (const group of groups) {
    const label = normalizedMailbox(group.address)
    for (const recipient of normalizeRecipients(group.recipients)) {
      const labels = labelsByRecipient.get(recipient) ?? []
      labels.push(label)
      labelsByRecipient.set(recipient, labels)
    }
  }

  return new Map(
    [...labelsByRecipient.entries()].map(([recipient, labels]) => [recipient, [...new Set(labels)].sort()])
  )
}

function toMailboxGrantViews(
  grants: ReadonlyArray<AgentMailMailboxGrantDocument>
): AgentMailAdminMailboxGrant[] {
  const byAddress = new Map<string, Set<AgentMailMailboxGrant>>()

  for (const grant of grants) {
    const accountAddress = normalizedMailbox(grant.mailboxAddress)
    const capabilities = byAddress.get(accountAddress) ?? new Set<AgentMailMailboxGrant>()
    capabilities.add(grant.capability)
    byAddress.set(accountAddress, capabilities)
  }

  return [...byAddress.entries()]
    .map(([accountAddress, capabilities]) => ({
      accountAddress,
      accountId: accountAddress,
      capabilities: [...capabilities].sort()
    }))
    .sort((left, right) => left.accountAddress.localeCompare(right.accountAddress))
}

function toAgentStatus(status: AgentDocument['status']): AgentMailAdminStatus {
  if (status === 'active') {
    return 'active'
  }
  if (status === 'pending') {
    return 'pending'
  }
  return 'disabled'
}

function toForwardingGroupStatus(status: AgentMailForwardingGroupDocument['status']): AgentMailAdminStatus {
  if (status === 'active' || status === 'pending') {
    return status
  }
  if (status === 'degraded') {
    return 'limited'
  }
  return 'disabled'
}

type AgentMailOrganizationContext = Awaited<ReturnType<typeof requireAgentMailOrganizationContext>>

interface AdminSectionAccess {
  accountData: boolean
  accounts: boolean
  agents: boolean
  groups: boolean
}

function getAdminSectionAccess(context: AgentMailOrganizationContext): AdminSectionAccess {
  const canReadAccounts = context.ability.can(
    'read',
    agentMailSubject('Mailbox', { organizationId: context.organizationId })
  )
  const canCreateAccounts = context.ability.can(
    'create',
    agentMailSubject('Mailbox', { organizationId: context.organizationId })
  )
  const canUpdateAccounts = context.ability.can(
    'update',
    agentMailSubject('Mailbox', { organizationId: context.organizationId })
  )

  return {
    accountData: canReadAccounts || canUpdateAccounts,
    accounts: canReadAccounts || canCreateAccounts || canUpdateAccounts,
    agents: context.ability.can(
      'manage',
      agentMailSubject('Agent', { organizationId: context.organizationId })
    ),
    groups: context.ability.can(
      'manage',
      agentMailSubject('ForwardingGroup', { organizationId: context.organizationId })
    )
  }
}

function getAdminAllowedActions(context: AgentMailOrganizationContext): AgentMailAdminAllowedActions {
  const accountWrite = context.ability.can(
    'create',
    agentMailSubject('Mailbox', { organizationId: context.organizationId })
  )
  const accountProvision = context.ability.can(
    'provision',
    agentMailSubject('Mailbox', { organizationId: context.organizationId })
  )
  const accountManage = context.ability.can(
    'update',
    agentMailSubject('Mailbox', { organizationId: context.organizationId })
  )
  const agentManage = context.ability.can(
    'manage',
    agentMailSubject('Agent', { organizationId: context.organizationId })
  )
  const agentMailboxGrantManage = agentManage && canManageAnyMailboxAgentGrant(context)
  const agentSystemGrantManage = agentManage && canManageAnySystemAgentGrant(context)
  const groupManage = context.ability.can(
    'manage',
    agentMailSubject('ForwardingGroup', { organizationId: context.organizationId })
  )

  return {
    createAccount: accountWrite,
    createAgent: agentManage,
    createGroup: groupManage,
    disableAccount: accountManage,
    disableGroup: groupManage,
    manageAgentMailboxGrants: agentMailboxGrantManage,
    manageAgentSystemPermissions: agentSystemGrantManage,
    provisionAccount: accountProvision,
    revokeAgent: agentMailboxGrantManage || agentSystemGrantManage,
    updateAccount: accountManage,
    updateAgent: agentManage,
    updateGroup: groupManage
  }
}

function canManageAnyMailboxAgentGrant(context: AgentMailOrganizationContext) {
  if (canManageBroadAgentGrant(context)) {
    return true
  }
  const mailboxAddresses = agentGrantMailboxAddresses(context)
  return AgentMailMailboxGrantValues.some((grant) =>
    AgentMailCapabilityByMailboxGrant[grant].some((capability) =>
      mailboxAddresses.some((mailboxAddress) =>
        context.ability.can(
          'manage',
          agentMailSubject('AgentGrant', {
            capability,
            mailboxAddress,
            organizationId: context.organizationId
          })
        )
      )
    )
  )
}

function canManageAnySystemAgentGrant(context: AgentMailOrganizationContext) {
  if (canManageBroadAgentGrant(context)) {
    return true
  }
  return AgentMailSystemPermissionValues.some((permission) =>
    AgentMailCapabilityBySystemPermission[permission].some((capability) =>
      context.ability.can(
        'manage',
        agentMailSubject('AgentGrant', {
          capability,
          organizationId: context.organizationId
        })
      )
    )
  )
}

function canManageBroadAgentGrant(context: AgentMailOrganizationContext) {
  return context.ability.can(
    'manage',
    agentMailSubject('AgentGrant', { organizationId: context.organizationId })
  )
}

function agentGrantMailboxAddresses(context: AgentMailOrganizationContext) {
  const addresses = new Set<string>()
  for (const grant of context.mailboxGrants) {
    if (String(grant.organizationId) === String(context.organizationId)) {
      addresses.add(normalizedMailbox(grant.mailboxAddress))
    }
  }
  for (const grant of context.capabilityGrants) {
    const constraints = AgentMailMailboxCapabilityGrantConstraints.safeParse(
      agentMailCapabilityGrantConstraints(grant.constraints)
    )
    if (constraints.success && constraints.data.organizationId === String(context.organizationId)) {
      addresses.add(normalizedMailbox(constraints.data.mailboxAddress))
    }
  }
  return [...addresses].filter(Boolean).sort()
}

function allowedSectionsFromAccess(access: AdminSectionAccess): ReadonlyArray<AgentMailAdminSectionId> {
  return (['accounts', 'groups', 'agents'] as const).filter((section) => access[section])
}

function requireAdminSectionAccess(access: AdminSectionAccess, section: AgentMailAdminSectionId) {
  if (!access[section]) {
    throw new AgentMailAccessError('Mailbox administration access is not authorized', 403)
  }
}

function normalizedMailbox(value: string) {
  return value.trim().toLowerCase()
}

function normalizeAccountAddress(value: string, domains: ReadonlyArray<string>) {
  const address = normalizedMailbox(value)
  if (!isValidMailbox(address) || address.includes('+')) {
    throw new AgentMailAdminError('Mailbox account address must be a valid mailbox address', 400)
  }
  requireMailboxDomain(address, domains, 'Mailbox account address')
  return address
}

function normalizeGroupAddress(value: string, domains: ReadonlyArray<string>) {
  const address = normalizedMailbox(value)
  if (!isValidMailbox(address) || address.includes('+')) {
    throw new AgentMailAdminError('Forwarding group address must be a valid mailbox address', 400)
  }
  requireMailboxDomain(address, domains, 'Forwarding group address')
  return address
}

function normalizeRecipients(values: ReadonlyArray<string>) {
  return [...new Set(values.map(normalizedMailbox).filter(Boolean))].sort()
}

function normalizeGroupRecipients(values: ReadonlyArray<string>, domains: ReadonlyArray<string>) {
  return [...new Set(values.map((value) => normalizeGroupRecipient(value, domains)))].sort()
}

function normalizeGroupRecipient(value: string, domains: ReadonlyArray<string>) {
  const recipient = normalizedMailbox(value)
  if (!isValidMailbox(recipient)) {
    throw new AgentMailAdminError('Forwarding group recipients must be valid mailbox addresses', 400)
  }
  requireMailboxDomain(recipient, domains, 'Forwarding group recipient')
  return recipient
}

function normalizeOptionalText(value: string | undefined) {
  return value?.replace(/\s+/gu, ' ').trim() ?? ''
}

function normalizeRequiredText(value: string, label: string) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (!normalized) {
    throw new AgentMailAdminError(`${label} is required`, 400)
  }
  return normalized
}

function normalizeAccountDisplayName(value: string | undefined, address: string) {
  return normalizeOptionalText(value) || localPart(address)
}

function toPersistedForwardingGroupStatus(
  status: Extract<AgentMailAdminStatus, 'active' | 'disabled' | 'pending'>
): AgentMailForwardingGroupDocument['status'] {
  return status
}

function requireMailboxDomain(address: string, domains: ReadonlyArray<string>, label: string) {
  if (!mailboxBelongsToDomains(address, domains)) {
    throw new AgentMailAdminError(`${label} must belong to an active mail domain`, 400)
  }
}

function mailboxBelongsToDomains(address: string, domains: ReadonlyArray<string>) {
  const domain = domainPart(address)
  return domains.some((candidate) => normalizedDomain(candidate) === domain)
}

async function requireMailboxAvailable(client: ReturnType<typeof createWildDuckClient>, address: string) {
  try {
    const resolution = await client.resolveAddress(address)
    if (resolution.user || resolution.id || resolution.address) {
      throw new AgentMailAdminError('Mailbox account already exists', 400)
    }
  } catch (error) {
    if (error instanceof WildDuckAPIError && error.status === 404) {
      return
    }
    throw error
  }
}

function addNormalizedDomain(target: Set<string>, value: string | null | undefined) {
  const domain = normalizedDomain(value)
  if (domain) {
    target.add(domain)
  }
}

function normalizedDomain(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function isValidMailbox(value: string) {
  return /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/u.test(value)
}

function domainPart(address: string) {
  const at = address.lastIndexOf('@')
  return at === -1 ? '' : address.slice(at + 1)
}

function localPart(address: string) {
  const at = address.indexOf('@')
  return at === -1 ? address : address.slice(0, at)
}

function usernameForMailbox(address: string) {
  return address
    .replace('@', '-at-')
    .replace(/[^\d.a-z-]/giu, '-')
    .slice(0, 128)
}

function mailboxGrantKey(mailboxAddress: string, capability: AgentMailMailboxGrant) {
  return `${normalizedMailbox(mailboxAddress)}\u0000${capability}`
}

function shortId(value: string) {
  return value.slice(0, 8)
}

function dateLabel(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : 'Never'
}

function toOptionalISOString(value: unknown) {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value !== 'string') {
    return null
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
