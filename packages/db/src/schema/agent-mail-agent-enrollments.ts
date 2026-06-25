import { Schema } from 'mongoose'
import {
  AgentMailAgentEnrollmentGrantRequestStatusValues,
  AgentMailMailboxGrantValues,
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
import type { Base62UUIDv7, UUIDv7 } from '@main/common'
import type { AgentHostId, AgentId, OrganizationId, UserId } from './better-auth'
import type {
  AgentMailAgentEnrollmentGrantRequestStatus,
  AgentMailMailboxGrant,
  AgentMailSystemPermission
} from '../agent-mail-permission-schema'

declare const AgentMailAgentEnrollmentGrantRequestIdBrand: unique symbol
export type AgentMailAgentEnrollmentGrantRequestId = UUIDv7 & {
  readonly [AgentMailAgentEnrollmentGrantRequestIdBrand]: true
}
export { AgentMailAgentEnrollmentGrantRequestIdBrand }

declare const AgentMailAgentEnrollmentGrantRequestPublicIdBrand: unique symbol
export type AgentMailAgentEnrollmentGrantRequestPublicId = Base62UUIDv7 & {
  readonly [AgentMailAgentEnrollmentGrantRequestPublicIdBrand]: true
}
export { AgentMailAgentEnrollmentGrantRequestPublicIdBrand }

export const agentMailAgentEnrollmentMailboxGrantRequestSchema = new Schema(
  {
    capabilities: {
      default: undefined,
      enum: AgentMailMailboxGrantValues,
      required: true,
      type: [String]
    },
    mailboxAddress: { required: true, type: String }
  },
  { _id: false }
)

export const agentMailAgentEnrollmentGrantRequestSchemaDefinition = {
  _id: uuidV7IdField(),
  appliedAgentId: optionalUUIDv7Field(),
  appliedAt: { default: null, type: Date },
  grantExpiresAt: { default: null, type: Date },
  hostId: requiredUUIDv7Field(),
  mailboxGrants: { default: undefined, type: [agentMailAgentEnrollmentMailboxGrantRequestSchema] },
  name: { required: true, type: String },
  organizationId: requiredUUIDv7Field(),
  requestedByUserId: optionalUUIDv7Field(),
  status: {
    default: 'pending',
    enum: AgentMailAgentEnrollmentGrantRequestStatusValues,
    required: true,
    type: String
  },
  systemPermissions: { default: undefined, enum: AgentMailSystemPermissionValues, type: [String] },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentMailAgentEnrollmentGrantRequestRawDocument = SchemaRawDocument<
  typeof agentMailAgentEnrollmentGrantRequestSchemaDefinition
>
export type AgentMailAgentEnrollmentGrantRequestDocument = ReplaceDocumentFields<
  AgentMailAgentEnrollmentGrantRequestRawDocument,
  {
    _id: AgentMailAgentEnrollmentGrantRequestId
    appliedAgentId?: AgentId | null
    hostId: AgentHostId
    mailboxGrants: ReadonlyArray<{
      capabilities: ReadonlyArray<AgentMailMailboxGrant>
      mailboxAddress: string
    }>
    organizationId: OrganizationId
    requestedByUserId?: UserId | null
    status: AgentMailAgentEnrollmentGrantRequestStatus
    systemPermissions: ReadonlyArray<AgentMailSystemPermission>
  }
>
export type AgentMailAgentEnrollmentGrantRequestPublicView = MongoosePublicView<
  AgentMailAgentEnrollmentGrantRequestDocument,
  AgentMailAgentEnrollmentGrantRequestId,
  AgentMailAgentEnrollmentGrantRequestPublicId
>

export const agentMailAgentEnrollmentGrantRequestSchema =
  new Schema<AgentMailAgentEnrollmentGrantRequestDocument>(
    agentMailAgentEnrollmentGrantRequestSchemaDefinition,
    {
      ...mongooseTimestampSchemaOptions,
      collection: 'agentMailAgentEnrollmentGrantRequest',
      virtuals: { publicId: publicIdVirtual }
    }
  )
    .index({ hostId: 1 }, { name: 'agentMailAgentEnrollmentGrantRequest_host_unique', unique: true })
    .index(
      { organizationId: 1, status: 1, createdAt: -1 },
      { name: 'agentMailAgentEnrollmentGrantRequest_org_status' }
    )
    .index({ grantExpiresAt: 1 }, { name: 'agentMailAgentEnrollmentGrantRequest_grantExpiresAt' })
