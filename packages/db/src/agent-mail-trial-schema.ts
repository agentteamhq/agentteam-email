import { z } from 'zod'
import type { AgentMailCapability as AgentMailCapabilityValue } from './agent-mail-permission-schema'

export const AgentMailTrialStatusValues = ['active', 'claimed', 'expired', 'revoked'] as const
export type AgentMailTrialStatus = (typeof AgentMailTrialStatusValues)[number]

export const AgentMailTrialClaimIntentStatusValues = ['approved', 'denied', 'expired', 'pending'] as const
export type AgentMailTrialClaimIntentStatus = (typeof AgentMailTrialClaimIntentStatusValues)[number]

export const AgentMailTrialCapabilityValues = [
  'email.status',
  'email.message.list',
  'email.message.read',
  'email.message.search',
  'email.message.create_draft',
  'email.message.send',
  'email.message.reply'
] as const satisfies ReadonlyArray<AgentMailCapabilityValue>
export type AgentMailTrialCapability = (typeof AgentMailTrialCapabilityValues)[number]

export const AgentMailTrialStatus = z.enum(AgentMailTrialStatusValues)
export const AgentMailTrialClaimIntentStatus = z.enum(AgentMailTrialClaimIntentStatusValues)
export const AgentMailTrialCapability = z.enum(AgentMailTrialCapabilityValues)

export const AgentMailTrialPolicyContractV1 = z
  .object({
    claimIntentTtlSeconds: z
      .number()
      .int()
      .positive()
      .max(60 * 60 * 24 * 7),
    capabilities: z.array(AgentMailTrialCapability).min(1),
    dailySendLimit: z.number().int().nonnegative().max(100),
    hostedDomain: z.string().min(1),
    mailboxLifetimeSeconds: z
      .number()
      .int()
      .positive()
      .max(60 * 60 * 24 * 30),
    totalSendLimit: z.number().int().nonnegative().max(500),
    version: z.literal(1).default(1)
  })
  .strict()
export type AgentMailTrialPolicyContractV1Schema = Readonly<z.infer<typeof AgentMailTrialPolicyContractV1>>

export const AgentMailTrialResourceContractV1 = z
  .object({
    agentId: z.string().min(1),
    capabilities: z.array(AgentMailTrialCapability).min(1),
    claimIntentId: z.string().min(1).nullable().default(null),
    claimedAt: z.iso.datetime().nullable().default(null),
    claimedByUserId: z.string().min(1).nullable().default(null),
    claimedOrganizationId: z.string().min(1).nullable().default(null),
    dailySendLimit: z.number().int().nonnegative().max(100),
    dailySentCount: z.number().int().nonnegative(),
    dailyWindowStartedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    hostId: z.string().min(1),
    mailboxAddress: z.email().transform((value) => value.toLowerCase()),
    postClaimCapabilities: z.array(AgentMailTrialCapability).default([]),
    status: AgentMailTrialStatus,
    totalSendLimit: z.number().int().nonnegative().max(500),
    totalSentCount: z.number().int().nonnegative(),
    version: z.literal(1).default(1),
    wildDuckUserId: z.string().min(1)
  })
  .strict()
export type AgentMailTrialResourceContractV1Schema = Readonly<
  z.infer<typeof AgentMailTrialResourceContractV1>
>

export const AgentMailTrialClaimIntentContractV1 = z
  .object({
    agentId: z.string().min(1),
    approvedByUserId: z.string().min(1).nullable().default(null),
    expiresAt: z.iso.datetime(),
    hostId: z.string().min(1),
    resolvedAt: z.iso.datetime().nullable().default(null),
    status: AgentMailTrialClaimIntentStatus,
    targetOrganizationId: z.string().min(1).nullable().default(null),
    tokenHash: z.string().min(1),
    trialId: z.string().min(1),
    version: z.literal(1).default(1)
  })
  .strict()
export type AgentMailTrialClaimIntentContractV1Schema = Readonly<
  z.infer<typeof AgentMailTrialClaimIntentContractV1>
>
