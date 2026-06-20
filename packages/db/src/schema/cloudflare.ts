import type { Base62UUIDv7, StrictOmit, UUIDv7 } from '@main/common'
import { Schema } from 'mongoose'

import type { AccountId, OrganizationId, UserId } from './better-auth'
import {
  createdAtField,
  mongooseTimestampSchemaOptions,
  type MongoosePublicView,
  optionalUUIDv7Field,
  publicIdVirtual,
  type ReplaceDocumentFields,
  requiredUUIDv7Field,
  type SchemaRawDocument,
  updatedAtField,
  uuidV7IdField
} from './common'

declare const CloudflareOAuthConnectionIntentIdBrand: unique symbol
export type CloudflareOAuthConnectionIntentId = UUIDv7 & {
  readonly [CloudflareOAuthConnectionIntentIdBrand]: true
}
export { CloudflareOAuthConnectionIntentIdBrand }

declare const CloudflareOAuthConnectionIntentPublicIdBrand: unique symbol
export type CloudflareOAuthConnectionIntentPublicId = Base62UUIDv7 & {
  readonly [CloudflareOAuthConnectionIntentPublicIdBrand]: true
}
export { CloudflareOAuthConnectionIntentPublicIdBrand }

declare const CloudflareOAuthGrantIdBrand: unique symbol
export type CloudflareOAuthGrantId = UUIDv7 & { readonly [CloudflareOAuthGrantIdBrand]: true }
export { CloudflareOAuthGrantIdBrand }

declare const CloudflareOAuthGrantPublicIdBrand: unique symbol
export type CloudflareOAuthGrantPublicId = Base62UUIDv7 & {
  readonly [CloudflareOAuthGrantPublicIdBrand]: true
}
export { CloudflareOAuthGrantPublicIdBrand }

declare const CloudflareConnectionIdBrand: unique symbol
export type CloudflareConnectionId = UUIDv7 & { readonly [CloudflareConnectionIdBrand]: true }
export { CloudflareConnectionIdBrand }

declare const CloudflareConnectionPublicIdBrand: unique symbol
export type CloudflareConnectionPublicId = Base62UUIDv7 & {
  readonly [CloudflareConnectionPublicIdBrand]: true
}
export { CloudflareConnectionPublicIdBrand }

export const CloudflareOAuthConnectionIntentStatusValues = [
  'pending',
  'completed',
  'failed',
  'expired'
] as const
export type CloudflareOAuthConnectionIntentStatus =
  (typeof CloudflareOAuthConnectionIntentStatusValues)[number]

export const CloudflareOAuthGrantStatusValues = ['active', 'degraded', 'revoked'] as const
export type CloudflareOAuthGrantStatus = (typeof CloudflareOAuthGrantStatusValues)[number]

export const CloudflareConnectionStatusValues = [
  'draft',
  'connected',
  'provisioning',
  'active',
  'degraded',
  'disconnected'
] as const
export type CloudflareConnectionStatus = (typeof CloudflareConnectionStatusValues)[number]

export const CloudflareProvisioningStatusValues = [
  'not_started',
  'pending',
  'succeeded',
  'failed'
] as const
export type CloudflareProvisioningStatus = (typeof CloudflareProvisioningStatusValues)[number]

export const cloudflareOAuthConnectionIntentSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  organizationId: optionalUUIDv7Field(),
  status: {
    enum: CloudflareOAuthConnectionIntentStatusValues,
    required: true,
    type: String
  },
  callbackPath: { default: null, type: String },
  errorCode: { default: null, type: String },
  errorMessage: { default: null, type: String },
  expiresAt: { required: true, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type CloudflareOAuthConnectionIntentRawDocument = SchemaRawDocument<
  typeof cloudflareOAuthConnectionIntentSchemaDefinition
>
export type CloudflareOAuthConnectionIntentDocument = ReplaceDocumentFields<
  CloudflareOAuthConnectionIntentRawDocument,
  {
    _id: CloudflareOAuthConnectionIntentId
    organizationId?: OrganizationId | null
    status: CloudflareOAuthConnectionIntentStatus
    userId: UserId
  }
>
export type CloudflareOAuthConnectionIntentPublicView = MongoosePublicView<
  CloudflareOAuthConnectionIntentDocument,
  CloudflareOAuthConnectionIntentId,
  CloudflareOAuthConnectionIntentPublicId
>

export const cloudflareOAuthConnectionIntentSchema = new Schema(
  cloudflareOAuthConnectionIntentSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'cloudflareOAuthConnectionIntent',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: 'cloudflareIntent_user_status_createdAt' })
  .index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'cloudflareIntent_expiresAt_ttl' })

export const cloudflareOAuthGrantSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  organizationId: optionalUUIDv7Field(),
  betterAuthAccountId: requiredUUIDv7Field(),
  cloudflareUserId: { required: true, type: String },
  cloudflareEmail: { default: null, type: String },
  grantedScopes: { default: [], required: true, type: [String] },
  requiredScopes: { default: [], required: true, type: [String] },
  status: {
    enum: CloudflareOAuthGrantStatusValues,
    required: true,
    type: String
  },
  lastTokenCheckAt: { default: null, type: Date },
  lastRefreshAt: { default: null, type: Date },
  lastErrorCode: { default: null, type: String },
  lastErrorMessage: { default: null, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type CloudflareOAuthGrantRawDocument = SchemaRawDocument<
  typeof cloudflareOAuthGrantSchemaDefinition
>
export type CloudflareOAuthGrantDocument = ReplaceDocumentFields<
  CloudflareOAuthGrantRawDocument,
  {
    _id: CloudflareOAuthGrantId
    betterAuthAccountId: AccountId
    grantedScopes: string[]
    organizationId?: OrganizationId | null
    requiredScopes: string[]
    status: CloudflareOAuthGrantStatus
    userId: UserId
  }
>
export type CloudflareOAuthGrantPublicView = MongoosePublicView<
  CloudflareOAuthGrantDocument,
  CloudflareOAuthGrantId,
  CloudflareOAuthGrantPublicId
>

export const cloudflareOAuthGrantSchema = new Schema(cloudflareOAuthGrantSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'cloudflareOAuthGrant',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: 'cloudflareGrant_user_status_createdAt' })
  .index(
    { betterAuthAccountId: 1 },
    { name: 'cloudflareGrant_betterAuthAccount_unique', unique: true }
  )
  .index(
    { userId: 1, cloudflareUserId: 1 },
    { name: 'cloudflareGrant_user_cloudflareUser_unique', unique: true }
  )

export const cloudflareConnectionSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  organizationId: optionalUUIDv7Field(),
  grantId: requiredUUIDv7Field(),
  cloudflareAccountId: { required: true, type: String },
  cloudflareAccountName: { default: null, type: String },
  cloudflareZoneId: { required: true, type: String },
  cloudflareZoneName: { default: null, type: String },
  domain: { required: true, type: String },
  r2BucketName: { default: null, type: String },
  workerScriptName: { default: null, type: String },
  hmacSecretReference: { default: null, type: String },
  status: {
    enum: CloudflareConnectionStatusValues,
    required: true,
    type: String
  },
  provisioningStatus: {
    enum: CloudflareProvisioningStatusValues,
    required: true,
    type: String
  },
  lastProvisionedAt: { default: null, type: Date },
  lastErrorCode: { default: null, type: String },
  lastErrorMessage: { default: null, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type CloudflareConnectionRawDocument = SchemaRawDocument<
  typeof cloudflareConnectionSchemaDefinition
>
export type CloudflareConnectionDocument = ReplaceDocumentFields<
  CloudflareConnectionRawDocument,
  {
    _id: CloudflareConnectionId
    grantId: CloudflareOAuthGrantId
    organizationId?: OrganizationId | null
    provisioningStatus: CloudflareProvisioningStatus
    status: CloudflareConnectionStatus
    userId: UserId
  }
>
export type CloudflareConnectionPublicView = StrictOmit<
  MongoosePublicView<
    CloudflareConnectionDocument,
    CloudflareConnectionId,
    CloudflareConnectionPublicId
  >,
  'hmacSecretReference'
>

export const cloudflareConnectionSchema = new Schema(cloudflareConnectionSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'cloudflareConnection',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: 'cloudflareConnection_user_status_createdAt' })
  .index({ grantId: 1 }, { name: 'cloudflareConnection_grantId' })
  .index(
    { userId: 1, cloudflareAccountId: 1, cloudflareZoneId: 1, domain: 1 },
    { name: 'cloudflareConnection_user_account_zone_domain_unique', unique: true }
  )
