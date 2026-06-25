import { Schema } from 'mongoose'
import {
  AgentMailGrantStatusValues,
  AgentMailMailboxGrantValues,
  AgentMailPrincipalTypeValues,
  AgentMailSystemPermissionValues
} from '../agent-mail-permission-schema'
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
  AgentMailMailboxGrantConstraintsSchema,
  AgentMailSystemGrantConstraintsSchema
} from '../agent-mail-permission-schema'
import type { Base62UUIDv7, UUIDv7 } from '@main/common'
import type { OrganizationId, UserId } from './better-auth'

declare const AgentMailMailboxGrantIdBrand: unique symbol
export type AgentMailMailboxGrantId = UUIDv7 & { readonly [AgentMailMailboxGrantIdBrand]: true }
export { AgentMailMailboxGrantIdBrand }

declare const AgentMailMailboxGrantPublicIdBrand: unique symbol
export type AgentMailMailboxGrantPublicId = Base62UUIDv7 & {
  readonly [AgentMailMailboxGrantPublicIdBrand]: true
}
export { AgentMailMailboxGrantPublicIdBrand }

declare const AgentMailSystemGrantIdBrand: unique symbol
export type AgentMailSystemGrantId = UUIDv7 & { readonly [AgentMailSystemGrantIdBrand]: true }
export { AgentMailSystemGrantIdBrand }

declare const AgentMailSystemGrantPublicIdBrand: unique symbol
export type AgentMailSystemGrantPublicId = Base62UUIDv7 & {
  readonly [AgentMailSystemGrantPublicIdBrand]: true
}
export { AgentMailSystemGrantPublicIdBrand }

export const agentMailMailboxGrantSchemaDefinition = {
  _id: uuidV7IdField(),
  organizationId: requiredUUIDv7Field(),
  mailboxAddress: { required: true, type: String },
  principalType: { enum: AgentMailPrincipalTypeValues, required: true, type: String },
  principalId: { required: true, type: String },
  capability: { enum: AgentMailMailboxGrantValues, required: true, type: String },
  status: { enum: AgentMailGrantStatusValues, required: true, type: String },
  constraints: { default: null, type: Schema.Types.Mixed },
  grantedByUserId: optionalUUIDv7Field(),
  expiresAt: { default: null, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentMailMailboxGrantRawDocument = SchemaRawDocument<typeof agentMailMailboxGrantSchemaDefinition>
export type AgentMailMailboxGrantDocument = ReplaceDocumentFields<
  AgentMailMailboxGrantRawDocument,
  {
    _id: AgentMailMailboxGrantId
    capability: (typeof AgentMailMailboxGrantValues)[number]
    constraints?: AgentMailMailboxGrantConstraintsSchema | null
    grantedByUserId?: UserId | null
    organizationId: OrganizationId
    principalType: (typeof AgentMailPrincipalTypeValues)[number]
    status: (typeof AgentMailGrantStatusValues)[number]
  }
>
export type AgentMailMailboxGrantPublicView = MongoosePublicView<
  AgentMailMailboxGrantDocument,
  AgentMailMailboxGrantId,
  AgentMailMailboxGrantPublicId
>

export const agentMailMailboxGrantSchema = new Schema<AgentMailMailboxGrantDocument>(
  agentMailMailboxGrantSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'agentMailMailboxGrant',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index(
    { organizationId: 1, mailboxAddress: 1, principalType: 1, principalId: 1, capability: 1 },
    { name: 'agentMailMailboxGrant_unique_scope', unique: true }
  )
  .index(
    { organizationId: 1, principalType: 1, principalId: 1, status: 1 },
    { name: 'agentMailMailboxGrant_org_principal_status' }
  )
  .index({ expiresAt: 1 }, { name: 'agentMailMailboxGrant_expiresAt' })

export const agentMailSystemGrantSchemaDefinition = {
  _id: uuidV7IdField(),
  organizationId: requiredUUIDv7Field(),
  principalType: { enum: AgentMailPrincipalTypeValues, required: true, type: String },
  principalId: { required: true, type: String },
  permission: { enum: AgentMailSystemPermissionValues, required: true, type: String },
  status: { enum: AgentMailGrantStatusValues, required: true, type: String },
  constraints: { default: null, type: Schema.Types.Mixed },
  grantedByUserId: optionalUUIDv7Field(),
  expiresAt: { default: null, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentMailSystemGrantRawDocument = SchemaRawDocument<typeof agentMailSystemGrantSchemaDefinition>
export type AgentMailSystemGrantDocument = ReplaceDocumentFields<
  AgentMailSystemGrantRawDocument,
  {
    _id: AgentMailSystemGrantId
    constraints?: AgentMailSystemGrantConstraintsSchema | null
    grantedByUserId?: UserId | null
    organizationId: OrganizationId
    permission: (typeof AgentMailSystemPermissionValues)[number]
    principalType: (typeof AgentMailPrincipalTypeValues)[number]
    status: (typeof AgentMailGrantStatusValues)[number]
  }
>
export type AgentMailSystemGrantPublicView = MongoosePublicView<
  AgentMailSystemGrantDocument,
  AgentMailSystemGrantId,
  AgentMailSystemGrantPublicId
>

export const agentMailSystemGrantSchema = new Schema<AgentMailSystemGrantDocument>(
  agentMailSystemGrantSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'agentMailSystemGrant',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index(
    { organizationId: 1, principalType: 1, principalId: 1, permission: 1 },
    { name: 'agentMailSystemGrant_unique_scope', unique: true }
  )
  .index(
    { organizationId: 1, principalType: 1, principalId: 1, status: 1 },
    { name: 'agentMailSystemGrant_org_principal_status' }
  )
  .index({ expiresAt: 1 }, { name: 'agentMailSystemGrant_expiresAt' })

export const agentMailPermissionSchemas = {
  agentMailMailboxGrant: agentMailMailboxGrantSchema,
  agentMailSystemGrant: agentMailSystemGrantSchema
} as const
