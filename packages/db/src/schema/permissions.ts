import { Schema } from 'mongoose'
import {
  createdAtField,
  mongooseCreatedAtOnlySchemaOptions,
  mongooseTimestampSchemaOptions,
  optionalUUIDv7Field,
  publicIdVirtual,
  requiredUUIDv7Field,
  updatedAtField,
  uuidV7IdField
} from './common'
import type { MongoosePublicView, ReplaceDocumentFields, SchemaRawDocument } from './common'
import type { Base62UUIDv7, StrictOmit, UUIDv7 } from '@main/common'

import type { ActorType, AuditEntrySchema, PermissionPolicyV1Schema } from '../permission-schema'
import type { UserId } from './better-auth'

declare const SubjectPolicyIdBrand: unique symbol
export type SubjectPolicyId = UUIDv7 & { readonly [SubjectPolicyIdBrand]: true }
export { SubjectPolicyIdBrand }

declare const SubjectPolicyPublicIdBrand: unique symbol
export type SubjectPolicyPublicId = Base62UUIDv7 & { readonly [SubjectPolicyPublicIdBrand]: true }
export { SubjectPolicyPublicIdBrand }

export const subjectPolicySchemaDefinition = {
  _id: uuidV7IdField(),
  policy: { required: true, type: Schema.Types.Mixed },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type SubjectPolicyRawDocument = SchemaRawDocument<typeof subjectPolicySchemaDefinition>
export type SubjectPolicyDocument = ReplaceDocumentFields<
  SubjectPolicyRawDocument,
  { _id: SubjectPolicyId; policy: PermissionPolicyV1Schema }
>
export type SubjectPolicyPublicView = MongoosePublicView<
  SubjectPolicyDocument,
  SubjectPolicyId,
  SubjectPolicyPublicId
>
export type SubjectPolicyDTOType = StrictOmit<SubjectPolicyPublicView, 'id'>

export const subjectPolicySchema = new Schema<SubjectPolicyDocument>(subjectPolicySchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'subjectPolicy',
  virtuals: { publicId: publicIdVirtual }
})

declare const ActorIdBrand: unique symbol
export type ActorId = UUIDv7 & { readonly [ActorIdBrand]: true }
export { ActorIdBrand }

declare const ActorPublicIdBrand: unique symbol
export type ActorPublicId = Base62UUIDv7 & { readonly [ActorPublicIdBrand]: true }
export { ActorPublicIdBrand }

export const actorSchemaDefinition = {
  _id: uuidV7IdField(),
  type: { required: true, type: String },
  userId: optionalUUIDv7Field(),
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type ActorRawDocument = SchemaRawDocument<typeof actorSchemaDefinition>
export type ActorDocument = ReplaceDocumentFields<
  ActorRawDocument,
  { _id: ActorId; type: ActorType; userId?: UserId | null }
>
export type ActorPublicView = MongoosePublicView<ActorDocument, ActorId, ActorPublicId>

export const actorSchema = new Schema<ActorDocument>(actorSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'actor',
  virtuals: { publicId: publicIdVirtual }
}).index({ userId: 1 }, { name: 'actor_userId' })

declare const PolicyAuditEntryIdBrand: unique symbol
export type PolicyAuditEntryId = UUIDv7 & { readonly [PolicyAuditEntryIdBrand]: true }
export { PolicyAuditEntryIdBrand }

declare const PolicyAuditEntryPublicIdBrand: unique symbol
export type PolicyAuditEntryPublicId = Base62UUIDv7 & {
  readonly [PolicyAuditEntryPublicIdBrand]: true
}
export { PolicyAuditEntryPublicIdBrand }

export const policyAuditEntrySchemaDefinition = {
  _id: uuidV7IdField(),
  subjectPolicyId: requiredUUIDv7Field(),
  entry: { required: true, type: Schema.Types.Mixed },
  createdAt: createdAtField()
} as const

export type PolicyAuditEntryRawDocument = SchemaRawDocument<typeof policyAuditEntrySchemaDefinition>
export type PolicyAuditEntryDocument = ReplaceDocumentFields<
  PolicyAuditEntryRawDocument,
  {
    _id: PolicyAuditEntryId
    entry: AuditEntrySchema
    subjectPolicyId: SubjectPolicyId
  }
>
export type PolicyAuditEntryPublicView = MongoosePublicView<
  PolicyAuditEntryDocument,
  PolicyAuditEntryId,
  PolicyAuditEntryPublicId
>

export const policyAuditEntrySchema = new Schema<PolicyAuditEntryDocument>(policyAuditEntrySchemaDefinition, {
  ...mongooseCreatedAtOnlySchemaOptions,
  collection: 'policyAuditEntry',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ subjectPolicyId: 1 }, { name: 'policyAuditEntry_subjectPolicyId' })
  .index({ createdAt: -1 }, { name: 'policyAuditEntry_createdAt' })

export const permissionSchemas = {
  actor: actorSchema,
  policyAuditEntry: policyAuditEntrySchema,
  subjectPolicy: subjectPolicySchema
} as const
