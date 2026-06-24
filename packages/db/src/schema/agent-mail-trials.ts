import { Schema } from 'mongoose'

import {
  AgentMailTrialCapabilityValues,
  AgentMailTrialClaimIntentStatusValues,
  AgentMailTrialStatusValues
} from '../agent-mail-trial-schema'
import {
  createdAtField,
  mongooseTimestampSchemaOptions,
  optionalUUIDv7Field,
  publicIdVirtual,
  requiredUUIDv7Field,
  updatedAtField,
  uuidV7IdField
} from './common'
import type { MongoosePublicView, ReplaceDocumentFields, SchemaRawDocument } from './common'
import type {
  AgentMailTrialCapability,
  AgentMailTrialClaimIntentStatus,
  AgentMailTrialStatus
} from '../agent-mail-trial-schema'
import type { Base62UUIDv7, UUIDv7 } from '@main/common'
import type { AgentHostId, AgentId, OrganizationId, UserId } from './better-auth'

declare const AgentMailTrialIdBrand: unique symbol
export type AgentMailTrialId = UUIDv7 & { readonly [AgentMailTrialIdBrand]: true }
export { AgentMailTrialIdBrand }

declare const AgentMailTrialPublicIdBrand: unique symbol
export type AgentMailTrialPublicId = Base62UUIDv7 & {
  readonly [AgentMailTrialPublicIdBrand]: true
}
export { AgentMailTrialPublicIdBrand }

declare const AgentMailTrialClaimIntentIdBrand: unique symbol
export type AgentMailTrialClaimIntentId = UUIDv7 & {
  readonly [AgentMailTrialClaimIntentIdBrand]: true
}
export { AgentMailTrialClaimIntentIdBrand }

declare const AgentMailTrialClaimIntentPublicIdBrand: unique symbol
export type AgentMailTrialClaimIntentPublicId = Base62UUIDv7 & {
  readonly [AgentMailTrialClaimIntentPublicIdBrand]: true
}
export { AgentMailTrialClaimIntentPublicIdBrand }

export const agentMailTrialSchemaDefinition = {
  _id: uuidV7IdField(),
  agentId: requiredUUIDv7Field(),
  hostId: requiredUUIDv7Field(),
  mailboxAddress: { required: true, type: String },
  wildDuckUserId: { required: true, type: String },
  capabilities: { default: () => [], enum: AgentMailTrialCapabilityValues, type: [String] },
  postClaimCapabilities: { default: () => [], enum: AgentMailTrialCapabilityValues, type: [String] },
  status: { enum: AgentMailTrialStatusValues, required: true, type: String },
  claimIntentId: optionalUUIDv7Field(),
  claimedByUserId: optionalUUIDv7Field(),
  claimedOrganizationId: optionalUUIDv7Field(),
  claimedAt: { default: null, type: Date },
  expiresAt: { required: true, type: Date },
  totalSendLimit: { required: true, type: Number },
  totalSentCount: { default: 0, required: true, type: Number },
  dailySendLimit: { required: true, type: Number },
  dailySentCount: { default: 0, required: true, type: Number },
  dailyWindowStartedAt: { required: true, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentMailTrialRawDocument = SchemaRawDocument<typeof agentMailTrialSchemaDefinition>
export type AgentMailTrialDocument = ReplaceDocumentFields<
  AgentMailTrialRawDocument,
  {
    _id: AgentMailTrialId
    agentId: AgentId
    capabilities: AgentMailTrialCapability[]
    claimIntentId?: AgentMailTrialClaimIntentId | null
    claimedByUserId?: UserId | null
    claimedOrganizationId?: OrganizationId | null
    hostId: AgentHostId
    postClaimCapabilities: AgentMailTrialCapability[]
    status: AgentMailTrialStatus
  }
>
export type AgentMailTrialPublicView = MongoosePublicView<
  AgentMailTrialDocument,
  AgentMailTrialId,
  AgentMailTrialPublicId
>

export const agentMailTrialSchema = new Schema<AgentMailTrialDocument>(agentMailTrialSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'agentMailTrial',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ agentId: 1 }, { name: 'agentMailTrial_agentId_unique', unique: true })
  .index({ hostId: 1, status: 1, createdAt: -1 }, { name: 'agentMailTrial_host_status_createdAt' })
  .index({ mailboxAddress: 1 }, { name: 'agentMailTrial_mailboxAddress_unique', unique: true })
  .index({ status: 1, expiresAt: 1 }, { name: 'agentMailTrial_status_expiresAt' })
  .index(
    { claimIntentId: 1 },
    {
      name: 'agentMailTrial_claimIntentId',
      partialFilterExpression: { claimIntentId: { $type: 'binData' } }
    }
  )

export const agentMailTrialClaimIntentSchemaDefinition = {
  _id: uuidV7IdField(),
  trialId: requiredUUIDv7Field(),
  agentId: requiredUUIDv7Field(),
  hostId: requiredUUIDv7Field(),
  tokenHash: { required: true, type: String },
  status: { enum: AgentMailTrialClaimIntentStatusValues, required: true, type: String },
  approvedByUserId: optionalUUIDv7Field(),
  targetOrganizationId: optionalUUIDv7Field(),
  expiresAt: { required: true, type: Date },
  resolvedAt: { default: null, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentMailTrialClaimIntentRawDocument = SchemaRawDocument<
  typeof agentMailTrialClaimIntentSchemaDefinition
>
export type AgentMailTrialClaimIntentDocument = ReplaceDocumentFields<
  AgentMailTrialClaimIntentRawDocument,
  {
    _id: AgentMailTrialClaimIntentId
    agentId: AgentId
    approvedByUserId?: UserId | null
    hostId: AgentHostId
    status: AgentMailTrialClaimIntentStatus
    targetOrganizationId?: OrganizationId | null
    trialId: AgentMailTrialId
  }
>
export type AgentMailTrialClaimIntentPublicView = MongoosePublicView<
  AgentMailTrialClaimIntentDocument,
  AgentMailTrialClaimIntentId,
  AgentMailTrialClaimIntentPublicId
>

export const agentMailTrialClaimIntentSchema = new Schema<AgentMailTrialClaimIntentDocument>(
  agentMailTrialClaimIntentSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'agentMailTrialClaimIntent',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index({ tokenHash: 1 }, { name: 'agentMailTrialClaimIntent_tokenHash_unique', unique: true })
  .index(
    { trialId: 1, status: 1, expiresAt: 1 },
    { name: 'agentMailTrialClaimIntent_trial_status_expiresAt' }
  )
  .index({ agentId: 1, status: 1 }, { name: 'agentMailTrialClaimIntent_agent_status' })

export const agentMailTrialSchemas = {
  agentMailTrial: agentMailTrialSchema,
  agentMailTrialClaimIntent: agentMailTrialClaimIntentSchema
} as const
