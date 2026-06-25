import { Schema } from 'mongoose'

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
import type { OrganizationId, UserId } from './better-auth'

declare const AgentMailForwardingGroupIdBrand: unique symbol
export type AgentMailForwardingGroupId = UUIDv7 & {
  readonly [AgentMailForwardingGroupIdBrand]: true
}
export { AgentMailForwardingGroupIdBrand }

declare const AgentMailForwardingGroupPublicIdBrand: unique symbol
export type AgentMailForwardingGroupPublicId = Base62UUIDv7 & {
  readonly [AgentMailForwardingGroupPublicIdBrand]: true
}
export { AgentMailForwardingGroupPublicIdBrand }

export const AgentMailForwardingGroupStatusValues = ['active', 'degraded', 'disabled', 'pending'] as const
export type AgentMailForwardingGroupStatus = (typeof AgentMailForwardingGroupStatusValues)[number]

export const agentMailForwardingGroupSchemaDefinition = {
  _id: uuidV7IdField(),
  organizationId: requiredUUIDv7Field(),
  address: { required: true, type: String },
  description: { default: '', type: String },
  wildDuckAddressId: { default: null, type: String },
  recipients: { default: () => [], type: [String] },
  status: { enum: AgentMailForwardingGroupStatusValues, required: true, type: String },
  lastDeliveredAt: { default: null, type: Date },
  createdByUserId: optionalUUIDv7Field(),
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentMailForwardingGroupRawDocument = SchemaRawDocument<
  typeof agentMailForwardingGroupSchemaDefinition
>
export type AgentMailForwardingGroupDocument = ReplaceDocumentFields<
  AgentMailForwardingGroupRawDocument,
  {
    _id: AgentMailForwardingGroupId
    createdByUserId?: UserId | null
    description: string
    organizationId: OrganizationId
    recipients: string[]
    status: AgentMailForwardingGroupStatus
    wildDuckAddressId?: string | null
  }
>
export type AgentMailForwardingGroupPublicView = MongoosePublicView<
  AgentMailForwardingGroupDocument,
  AgentMailForwardingGroupId,
  AgentMailForwardingGroupPublicId
>

export const agentMailForwardingGroupSchema = new Schema<AgentMailForwardingGroupDocument>(
  agentMailForwardingGroupSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'agentMailForwardingGroup',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index(
    { organizationId: 1, address: 1 },
    { name: 'agentMailForwardingGroup_org_address_unique', unique: true }
  )
  .index(
    { organizationId: 1, status: 1, updatedAt: -1 },
    { name: 'agentMailForwardingGroup_org_status_updatedAt' }
  )
  .index(
    { organizationId: 1, wildDuckAddressId: 1 },
    {
      name: 'agentMailForwardingGroup_org_wildDuckAddressId',
      partialFilterExpression: { wildDuckAddressId: { $type: 'string' } }
    }
  )

export const agentMailForwardingSchemas = {
  agentMailForwardingGroup: agentMailForwardingGroupSchema
} as const
