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
import type { Base62UUIDv7, StrictOmit, UUIDv7 } from '@main/common'

import type { AccountId, OrganizationId, UserId } from './better-auth'

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

declare const AgentMailDomainIdBrand: unique symbol
export type AgentMailDomainId = UUIDv7 & { readonly [AgentMailDomainIdBrand]: true }
export { AgentMailDomainIdBrand }

declare const AgentMailDomainPublicIdBrand: unique symbol
export type AgentMailDomainPublicId = Base62UUIDv7 & {
  readonly [AgentMailDomainPublicIdBrand]: true
}
export { AgentMailDomainPublicIdBrand }

declare const AgentMailWorkerDeploymentIdBrand: unique symbol
export type AgentMailWorkerDeploymentId = UUIDv7 & {
  readonly [AgentMailWorkerDeploymentIdBrand]: true
}
export { AgentMailWorkerDeploymentIdBrand }

declare const AgentMailWorkerDeploymentPublicIdBrand: unique symbol
export type AgentMailWorkerDeploymentPublicId = Base62UUIDv7 & {
  readonly [AgentMailWorkerDeploymentPublicIdBrand]: true
}
export { AgentMailWorkerDeploymentPublicIdBrand }

declare const AgentMailWorkerCredentialRefreshIdBrand: unique symbol
export type AgentMailWorkerCredentialRefreshId = UUIDv7 & {
  readonly [AgentMailWorkerCredentialRefreshIdBrand]: true
}
export { AgentMailWorkerCredentialRefreshIdBrand }

declare const AgentMailWorkerCredentialRefreshPublicIdBrand: unique symbol
export type AgentMailWorkerCredentialRefreshPublicId = Base62UUIDv7 & {
  readonly [AgentMailWorkerCredentialRefreshPublicIdBrand]: true
}
export { AgentMailWorkerCredentialRefreshPublicIdBrand }

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

export const CloudflareProvisioningStatusValues = ['not_started', 'pending', 'succeeded', 'failed'] as const
export type CloudflareProvisioningStatus = (typeof CloudflareProvisioningStatusValues)[number]

export const AgentMailDomainStatusValues = [
  'connected',
  'provisioning',
  'active',
  'degraded',
  'disconnected'
] as const
export type AgentMailDomainStatus = (typeof AgentMailDomainStatusValues)[number]

export const AgentMailWorkerDeploymentStatusValues = [
  'pending',
  'active',
  'degraded',
  'disabled',
  'disconnected'
] as const
export type AgentMailWorkerDeploymentStatus =
  (typeof AgentMailWorkerDeploymentStatusValues)[number]

export const AgentMailWorkerCredentialRefreshStatusValues = ['pending', 'succeeded', 'failed'] as const
export type AgentMailWorkerCredentialRefreshStatus =
  (typeof AgentMailWorkerCredentialRefreshStatusValues)[number]

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

export const cloudflareOAuthConnectionIntentSchema = new Schema<CloudflareOAuthConnectionIntentDocument>(
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
  grantedScopes: { required: true, type: [String] },
  requiredScopes: { required: true, type: [String] },
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

export type CloudflareOAuthGrantRawDocument = SchemaRawDocument<typeof cloudflareOAuthGrantSchemaDefinition>
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

export const cloudflareOAuthGrantSchema = new Schema<CloudflareOAuthGrantDocument>(
  cloudflareOAuthGrantSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'cloudflareOAuthGrant',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: 'cloudflareGrant_user_status_createdAt' })
  .index(
    { organizationId: 1, status: 1, createdAt: -1 },
    {
      name: 'cloudflareGrant_org_status_createdAt',
      partialFilterExpression: { organizationId: { $type: 'binData' } }
    }
  )
  .index(
    { organizationId: 1, betterAuthAccountId: 1 },
    {
      name: 'cloudflareGrant_org_betterAuthAccount_unique',
      partialFilterExpression: { organizationId: { $type: 'binData' } },
      unique: true
    }
  )
  .index(
    { organizationId: 1, userId: 1, cloudflareUserId: 1 },
    {
      name: 'cloudflareGrant_org_user_cloudflareUser_unique',
      partialFilterExpression: { organizationId: { $type: 'binData' } },
      unique: true
    }
  )

export const cloudflareConnectionSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  organizationId: optionalUUIDv7Field(),
  organizationPublicId: { default: null, type: String },
  grantId: requiredUUIDv7Field(),
  agentMailDomainId: optionalUUIDv7Field(),
  agentMailWorkerDeploymentId: optionalUUIDv7Field(),
  cloudflareAccountId: { required: true, type: String },
  cloudflareAccountName: { default: null, type: String },
  cloudflareZoneId: { required: true, type: String },
  cloudflareZoneName: { default: null, type: String },
  domain: { required: true, type: String },
  archivePrefix: { default: null, type: String },
  r2BucketName: { default: null, type: String },
  r2Endpoint: { default: null, type: String },
  r2Region: { default: null, type: String },
  workerScriptName: { default: null, type: String },
  hmacSecretReference: { default: null, type: String },
  encryptedWorkerHmacSecret: { default: null, type: String },
  workerCredentialIssuedAt: { default: null, type: Date },
  workerCredentialRefreshAfter: { default: null, type: Date },
  workerCredentialExpiresAt: { default: null, type: Date },
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

export type CloudflareConnectionRawDocument = SchemaRawDocument<typeof cloudflareConnectionSchemaDefinition>
export type CloudflareConnectionDocument = ReplaceDocumentFields<
  CloudflareConnectionRawDocument,
  {
    _id: CloudflareConnectionId
    agentMailDomainId?: AgentMailDomainId | null
    agentMailWorkerDeploymentId?: AgentMailWorkerDeploymentId | null
    grantId: CloudflareOAuthGrantId
    organizationId?: OrganizationId | null
    provisioningStatus: CloudflareProvisioningStatus
    status: CloudflareConnectionStatus
    userId: UserId
  }
>
export type CloudflareConnectionPublicView = StrictOmit<
  MongoosePublicView<CloudflareConnectionDocument, CloudflareConnectionId, CloudflareConnectionPublicId>,
  'encryptedWorkerHmacSecret' | 'hmacSecretReference'
>

export const cloudflareConnectionSchema = new Schema<CloudflareConnectionDocument>(
  cloudflareConnectionSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'cloudflareConnection',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: 'cloudflareConnection_user_status_createdAt' })
  .index(
    { organizationId: 1, status: 1, createdAt: -1 },
    {
      name: 'cloudflareConnection_org_status_createdAt',
      partialFilterExpression: { organizationId: { $type: 'binData' } }
    }
  )
  .index({ grantId: 1 }, { name: 'cloudflareConnection_grantId' })
  .index(
    { userId: 1, cloudflareAccountId: 1, cloudflareZoneId: 1, domain: 1 },
    { name: 'cloudflareConnection_user_account_zone_domain_unique', unique: true }
  )
  .index(
    { organizationId: 1, cloudflareAccountId: 1, cloudflareZoneId: 1, domain: 1 },
    {
      name: 'cloudflareConnection_org_account_zone_domain_unique',
      partialFilterExpression: { organizationId: { $type: 'binData' } },
      unique: true
    }
  )

export const agentMailDomainSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  organizationId: requiredUUIDv7Field(),
  organizationPublicId: { required: true, type: String },
  cloudflareConnectionId: requiredUUIDv7Field(),
  cloudflareAccountId: { required: true, type: String },
  cloudflareAccountName: { default: null, type: String },
  cloudflareZoneId: { required: true, type: String },
  cloudflareZoneName: { default: null, type: String },
  domain: { required: true, type: String },
  archivePrefix: { required: true, type: String },
  status: {
    enum: AgentMailDomainStatusValues,
    required: true,
    type: String
  },
  lastRuntimeSyncedAt: { default: null, type: Date },
  lastErrorCode: { default: null, type: String },
  lastErrorMessage: { default: null, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentMailDomainRawDocument = SchemaRawDocument<typeof agentMailDomainSchemaDefinition>
export type AgentMailDomainDocument = ReplaceDocumentFields<
  AgentMailDomainRawDocument,
  {
    _id: AgentMailDomainId
    cloudflareConnectionId: CloudflareConnectionId
    organizationId: OrganizationId
    status: AgentMailDomainStatus
    userId: UserId
  }
>
export type AgentMailDomainPublicView = MongoosePublicView<
  AgentMailDomainDocument,
  AgentMailDomainId,
  AgentMailDomainPublicId
>

export const agentMailDomainSchema = new Schema<AgentMailDomainDocument>(
  agentMailDomainSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'agentMailDomain',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index({ organizationId: 1, status: 1, createdAt: -1 }, { name: 'agentMailDomain_org_status_createdAt' })
  .index({ organizationId: 1, domain: 1 }, { name: 'agentMailDomain_org_domain_unique', unique: true })
  .index(
    { organizationId: 1, cloudflareAccountId: 1, cloudflareZoneId: 1, domain: 1 },
    { name: 'agentMailDomain_org_account_zone_domain_unique', unique: true }
  )
  .index({ cloudflareConnectionId: 1 }, { name: 'agentMailDomain_connection_unique', unique: true })

export const agentMailWorkerDeploymentSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  organizationId: requiredUUIDv7Field(),
  organizationPublicId: { required: true, type: String },
  agentMailDomainId: requiredUUIDv7Field(),
  cloudflareConnectionId: requiredUUIDv7Field(),
  workerConnectionId: { required: true, type: String },
  cloudflareAccountId: { required: true, type: String },
  cloudflareZoneId: { required: true, type: String },
  domain: { required: true, type: String },
  archivePrefix: { required: true, type: String },
  r2BucketName: { required: true, type: String },
  r2Endpoint: { required: true, type: String },
  r2Region: { default: null, type: String },
  workerScriptName: { required: true, type: String },
  hmacSecretReference: { default: null, type: String },
  encryptedWorkerHmacSecret: { default: null, type: String },
  credentialIssuedAt: { default: null, type: Date },
  credentialRefreshAfter: { default: null, type: Date },
  credentialExpiresAt: { default: null, type: Date },
  status: {
    enum: AgentMailWorkerDeploymentStatusValues,
    required: true,
    type: String
  },
  provisioningStatus: {
    enum: CloudflareProvisioningStatusValues,
    required: true,
    type: String
  },
  lastDeployedAt: { default: null, type: Date },
  lastErrorCode: { default: null, type: String },
  lastErrorMessage: { default: null, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentMailWorkerDeploymentRawDocument = SchemaRawDocument<
  typeof agentMailWorkerDeploymentSchemaDefinition
>
export type AgentMailWorkerDeploymentDocument = ReplaceDocumentFields<
  AgentMailWorkerDeploymentRawDocument,
  {
    _id: AgentMailWorkerDeploymentId
    agentMailDomainId: AgentMailDomainId
    cloudflareConnectionId: CloudflareConnectionId
    organizationId: OrganizationId
    provisioningStatus: CloudflareProvisioningStatus
    status: AgentMailWorkerDeploymentStatus
    userId: UserId
  }
>
export type AgentMailWorkerDeploymentPublicView = StrictOmit<
  MongoosePublicView<
    AgentMailWorkerDeploymentDocument,
    AgentMailWorkerDeploymentId,
    AgentMailWorkerDeploymentPublicId
  >,
  'encryptedWorkerHmacSecret' | 'hmacSecretReference'
>

export const agentMailWorkerDeploymentSchema = new Schema<AgentMailWorkerDeploymentDocument>(
  agentMailWorkerDeploymentSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'agentMailWorkerDeployment',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index(
    { organizationId: 1, status: 1, credentialRefreshAfter: 1 },
    { name: 'agentMailWorkerDeployment_org_status_refreshAfter' }
  )
  .index({ agentMailDomainId: 1 }, { name: 'agentMailWorkerDeployment_domain_unique', unique: true })
  .index({
    cloudflareConnectionId: 1
  }, { name: 'agentMailWorkerDeployment_connection_unique', unique: true })
  .index(
    { organizationId: 1, cloudflareAccountId: 1, cloudflareZoneId: 1, domain: 1 },
    { name: 'agentMailWorkerDeployment_org_account_zone_domain_unique', unique: true }
  )

export const agentMailWorkerCredentialRefreshSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  organizationId: requiredUUIDv7Field(),
  agentMailDomainId: requiredUUIDv7Field(),
  agentMailWorkerDeploymentId: requiredUUIDv7Field(),
  cloudflareConnectionId: requiredUUIDv7Field(),
  status: {
    enum: AgentMailWorkerCredentialRefreshStatusValues,
    required: true,
    type: String
  },
  startedAt: { required: true, type: Date },
  completedAt: { default: null, type: Date },
  credentialIssuedAt: { default: null, type: Date },
  credentialRefreshAfter: { default: null, type: Date },
  credentialExpiresAt: { default: null, type: Date },
  lastErrorCode: { default: null, type: String },
  lastErrorMessage: { default: null, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentMailWorkerCredentialRefreshRawDocument = SchemaRawDocument<
  typeof agentMailWorkerCredentialRefreshSchemaDefinition
>
export type AgentMailWorkerCredentialRefreshDocument = ReplaceDocumentFields<
  AgentMailWorkerCredentialRefreshRawDocument,
  {
    _id: AgentMailWorkerCredentialRefreshId
    agentMailDomainId: AgentMailDomainId
    agentMailWorkerDeploymentId: AgentMailWorkerDeploymentId
    cloudflareConnectionId: CloudflareConnectionId
    organizationId: OrganizationId
    status: AgentMailWorkerCredentialRefreshStatus
    userId: UserId
  }
>
export type AgentMailWorkerCredentialRefreshPublicView = MongoosePublicView<
  AgentMailWorkerCredentialRefreshDocument,
  AgentMailWorkerCredentialRefreshId,
  AgentMailWorkerCredentialRefreshPublicId
>

export const agentMailWorkerCredentialRefreshSchema =
  new Schema<AgentMailWorkerCredentialRefreshDocument>(
    agentMailWorkerCredentialRefreshSchemaDefinition,
    {
      ...mongooseTimestampSchemaOptions,
      collection: 'agentMailWorkerCredentialRefresh',
      virtuals: { publicId: publicIdVirtual }
    }
  )
    .index(
      { agentMailWorkerDeploymentId: 1, startedAt: -1 },
      { name: 'agentMailWorkerCredentialRefresh_deployment_startedAt' }
    )
    .index(
      { organizationId: 1, status: 1, startedAt: -1 },
      { name: 'agentMailWorkerCredentialRefresh_org_status_startedAt' }
    )
