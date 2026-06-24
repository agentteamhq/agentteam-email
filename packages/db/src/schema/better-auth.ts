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
import type { Base62UUIDv7, UUIDv7 } from '@main/common'

declare const UserIdBrand: unique symbol
export type UserId = UUIDv7 & { readonly [UserIdBrand]: true }
export { UserIdBrand }

declare const UserPublicIdBrand: unique symbol
export type UserPublicId = Base62UUIDv7 & { readonly [UserPublicIdBrand]: true }
export { UserPublicIdBrand }

declare const TwoFactorIdBrand: unique symbol
export type TwoFactorId = UUIDv7 & { readonly [TwoFactorIdBrand]: true }
export { TwoFactorIdBrand }

declare const PasskeyIdBrand: unique symbol
export type PasskeyId = UUIDv7 & { readonly [PasskeyIdBrand]: true }
export { PasskeyIdBrand }

declare const SessionIdBrand: unique symbol
export type SessionId = UUIDv7 & { readonly [SessionIdBrand]: true }
export { SessionIdBrand }

declare const AccountIdBrand: unique symbol
export type AccountId = UUIDv7 & { readonly [AccountIdBrand]: true }
export { AccountIdBrand }

declare const VerificationIdBrand: unique symbol
export type VerificationId = UUIDv7 & { readonly [VerificationIdBrand]: true }
export { VerificationIdBrand }

declare const DeviceCodeIdBrand: unique symbol
export type DeviceCodeId = UUIDv7 & { readonly [DeviceCodeIdBrand]: true }
export { DeviceCodeIdBrand }

declare const AuditLogIdBrand: unique symbol
export type AuditLogId = UUIDv7 & { readonly [AuditLogIdBrand]: true }
export { AuditLogIdBrand }

declare const AuditLogPublicIdBrand: unique symbol
export type AuditLogPublicId = Base62UUIDv7 & { readonly [AuditLogPublicIdBrand]: true }
export { AuditLogPublicIdBrand }

declare const AgentHostIdBrand: unique symbol
export type AgentHostId = UUIDv7 & { readonly [AgentHostIdBrand]: true }
export { AgentHostIdBrand }

declare const AgentHostPublicIdBrand: unique symbol
export type AgentHostPublicId = Base62UUIDv7 & { readonly [AgentHostPublicIdBrand]: true }
export { AgentHostPublicIdBrand }

declare const AgentIdBrand: unique symbol
export type AgentId = UUIDv7 & { readonly [AgentIdBrand]: true }
export { AgentIdBrand }

declare const AgentPublicIdBrand: unique symbol
export type AgentPublicId = Base62UUIDv7 & { readonly [AgentPublicIdBrand]: true }
export { AgentPublicIdBrand }

declare const AgentCapabilityGrantIdBrand: unique symbol
export type AgentCapabilityGrantId = UUIDv7 & { readonly [AgentCapabilityGrantIdBrand]: true }
export { AgentCapabilityGrantIdBrand }

declare const AgentCapabilityGrantPublicIdBrand: unique symbol
export type AgentCapabilityGrantPublicId = Base62UUIDv7 & {
  readonly [AgentCapabilityGrantPublicIdBrand]: true
}
export { AgentCapabilityGrantPublicIdBrand }

declare const AgentJwtReplayIdBrand: unique symbol
export type AgentJwtReplayId = UUIDv7 & { readonly [AgentJwtReplayIdBrand]: true }
export { AgentJwtReplayIdBrand }

declare const AgentJwtReplayPublicIdBrand: unique symbol
export type AgentJwtReplayPublicId = Base62UUIDv7 & { readonly [AgentJwtReplayPublicIdBrand]: true }
export { AgentJwtReplayPublicIdBrand }

declare const BetterAuthSecondaryStorageIdBrand: unique symbol
export type BetterAuthSecondaryStorageId = UUIDv7 & {
  readonly [BetterAuthSecondaryStorageIdBrand]: true
}
export { BetterAuthSecondaryStorageIdBrand }

declare const ApprovalRequestIdBrand: unique symbol
export type ApprovalRequestId = UUIDv7 & { readonly [ApprovalRequestIdBrand]: true }
export { ApprovalRequestIdBrand }

declare const ApprovalRequestPublicIdBrand: unique symbol
export type ApprovalRequestPublicId = Base62UUIDv7 & {
  readonly [ApprovalRequestPublicIdBrand]: true
}
export { ApprovalRequestPublicIdBrand }

declare const OrganizationIdBrand: unique symbol
export type OrganizationId = UUIDv7 & { readonly [OrganizationIdBrand]: true }
export { OrganizationIdBrand }

declare const OrganizationPublicIdBrand: unique symbol
export type OrganizationPublicId = Base62UUIDv7 & { readonly [OrganizationPublicIdBrand]: true }
export { OrganizationPublicIdBrand }

declare const MemberIdBrand: unique symbol
export type MemberId = UUIDv7 & { readonly [MemberIdBrand]: true }
export { MemberIdBrand }

declare const MemberPublicIdBrand: unique symbol
export type MemberPublicId = Base62UUIDv7 & { readonly [MemberPublicIdBrand]: true }
export { MemberPublicIdBrand }

declare const TeamIdBrand: unique symbol
export type TeamId = UUIDv7 & { readonly [TeamIdBrand]: true }
export { TeamIdBrand }

declare const TeamPublicIdBrand: unique symbol
export type TeamPublicId = Base62UUIDv7 & { readonly [TeamPublicIdBrand]: true }
export { TeamPublicIdBrand }

declare const InvitationIdBrand: unique symbol
export type InvitationId = UUIDv7 & { readonly [InvitationIdBrand]: true }
export { InvitationIdBrand }

declare const ApiKeyIdBrand: unique symbol
export type ApiKeyId = UUIDv7 & { readonly [ApiKeyIdBrand]: true }
export { ApiKeyIdBrand }

declare const ApiKeyPublicIdBrand: unique symbol
export type ApiKeyPublicId = Base62UUIDv7 & { readonly [ApiKeyPublicIdBrand]: true }
export { ApiKeyPublicIdBrand }

declare const JwkIdBrand: unique symbol
export type JwkId = UUIDv7 & { readonly [JwkIdBrand]: true }
export { JwkIdBrand }

declare const JwkPublicIdBrand: unique symbol
export type JwkPublicId = Base62UUIDv7 & { readonly [JwkPublicIdBrand]: true }
export { JwkPublicIdBrand }

declare const OAuthClientIdBrand: unique symbol
export type OAuthClientId = UUIDv7 & { readonly [OAuthClientIdBrand]: true }
export { OAuthClientIdBrand }

declare const OAuthRefreshTokenIdBrand: unique symbol
export type OAuthRefreshTokenId = UUIDv7 & { readonly [OAuthRefreshTokenIdBrand]: true }
export { OAuthRefreshTokenIdBrand }

declare const OAuthAccessTokenIdBrand: unique symbol
export type OAuthAccessTokenId = UUIDv7 & { readonly [OAuthAccessTokenIdBrand]: true }
export { OAuthAccessTokenIdBrand }

declare const OAuthConsentIdBrand: unique symbol
export type OAuthConsentId = UUIDv7 & { readonly [OAuthConsentIdBrand]: true }
export { OAuthConsentIdBrand }

declare const SubscriptionIdBrand: unique symbol
export type SubscriptionId = UUIDv7 & { readonly [SubscriptionIdBrand]: true }
export { SubscriptionIdBrand }

declare const SubscriptionPublicIdBrand: unique symbol
export type SubscriptionPublicId = Base62UUIDv7 & {
  readonly [SubscriptionPublicIdBrand]: true
}
export { SubscriptionPublicIdBrand }

export const AuthUserRoleValues = ['user', 'admin'] as const
export type AuthUserRole = (typeof AuthUserRoleValues)[number]

export type ORG_MEMBER_ROLE = 'owner' | 'admin' | 'member'
export type OrganizationRole = ORG_MEMBER_ROLE | (string & {})

export const AuditLogStatusValues = ['success', 'failed'] as const
export type AuditLogStatus = (typeof AuditLogStatusValues)[number]

export const AuditLogSeverityValues = ['low', 'medium', 'high', 'critical'] as const
export type AuditLogSeverity = (typeof AuditLogSeverityValues)[number]

export const AgentAuthHostStatusValues = [
  'active',
  'pending',
  'pending_enrollment',
  'revoked',
  'rejected'
] as const
export type AgentAuthHostStatus = (typeof AgentAuthHostStatusValues)[number]

export const AgentAuthAgentStatusValues = [
  'active',
  'pending',
  'expired',
  'revoked',
  'rejected',
  'claimed'
] as const
export type AgentAuthAgentStatus = (typeof AgentAuthAgentStatusValues)[number]

export const AgentAuthModeValues = ['autonomous', 'delegated'] as const
export type AgentAuthMode = (typeof AgentAuthModeValues)[number]

export const AgentAuthGrantStatusValues = ['active', 'pending', 'denied', 'revoked', 'consumed'] as const
export type AgentAuthGrantStatus = (typeof AgentAuthGrantStatusValues)[number]

export const AgentAuthApprovalMethodValues = ['ciba', 'device_authorization'] as const
export type AgentAuthApprovalMethod = (typeof AgentAuthApprovalMethodValues)[number]

export const AgentAuthApprovalStatusValues = ['approved', 'denied', 'expired', 'pending'] as const
export type AgentAuthApprovalStatus = (typeof AgentAuthApprovalStatusValues)[number]

export const OAuthClientSubjectTypeValues = ['public', 'pairwise'] as const
export type OAuthClientSubjectType = (typeof OAuthClientSubjectTypeValues)[number]

export const OAuthClientAuthMethodValues = ['none', 'client_secret_basic', 'client_secret_post'] as const
export type OAuthClientAuthMethod = (typeof OAuthClientAuthMethodValues)[number]

export const OAuthClientTypeValues = ['web', 'native', 'user-agent-based'] as const
export type OAuthClientType = (typeof OAuthClientTypeValues)[number]

export const userSchemaDefinition = {
  _id: uuidV7IdField(),
  email: { default: null, type: String },
  emailVerified: { default: null, type: Boolean },
  isGenerated: { default: false, required: true, type: Boolean },
  generatedFromSeed: { default: null, type: String },
  name: { default: null, type: String },
  username: { default: null, type: String },
  displayUsername: { default: null, type: String },
  image: { default: null, type: String },
  isAnonymous: { default: null, type: Boolean },
  twoFactorEnabled: { default: null, type: Boolean },
  lastLoginMethod: { default: null, type: String },
  role: { default: null, enum: AuthUserRoleValues, type: String },
  banned: { default: false, required: true, type: Boolean },
  banReason: { default: null, type: String },
  banExpires: { default: null, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField(),
  lastVerificationEmailSent: { default: null, type: Date },
  freeFullAccessAccount: { default: false, required: true, type: Boolean },
  stripeCustomerId: { default: null, type: String },
  stripeSubscriptionId: { default: null, type: String },
  stripePriceLookupKey: { default: null, type: String },
  stripeSubscriptionStatus: { default: null, type: String },
  stripeLastUpdated: { default: null, type: Date }
} as const

export type UserRawDocument = SchemaRawDocument<typeof userSchemaDefinition>
export type UserDocument = ReplaceDocumentFields<UserRawDocument, { _id: UserId; role?: AuthUserRole | null }>
export type UserPublicView = MongoosePublicView<UserDocument, UserId, UserPublicId>

export const userSchema = new Schema<UserDocument>(userSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'user',
  virtuals: { publicId: publicIdVirtual }
})
  .index(
    { email: 1 },
    {
      name: 'user_email_unique',
      partialFilterExpression: { email: { $type: 'string' } },
      unique: true
    }
  )
  .index(
    { username: 1 },
    {
      name: 'user_username_unique',
      partialFilterExpression: { username: { $type: 'string' } },
      unique: true
    }
  )

export const twoFactorSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  secret: { default: null, type: String },
  backupCodes: { default: null, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type TwoFactorRawDocument = SchemaRawDocument<typeof twoFactorSchemaDefinition>
export type TwoFactorDocument = ReplaceDocumentFields<
  TwoFactorRawDocument,
  { _id: TwoFactorId; userId: UserId }
>

export const twoFactorSchema = new Schema<TwoFactorDocument>(twoFactorSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'twoFactor'
}).index({ userId: 1 }, { name: 'twoFactor_userId' })

export const passkeySchemaDefinition = {
  _id: uuidV7IdField(),
  name: { default: null, type: String },
  publicKey: { required: true, type: String },
  userId: requiredUUIDv7Field(),
  credentialID: { required: true, type: String },
  counter: { required: true, type: Number },
  deviceType: { required: true, type: String },
  backedUp: { required: true, type: Boolean },
  transports: { default: null, type: String },
  createdAt: createdAtField(),
  aaguid: { default: null, type: String }
} as const

export type PasskeyRawDocument = SchemaRawDocument<typeof passkeySchemaDefinition>
export type PasskeyDocument = ReplaceDocumentFields<PasskeyRawDocument, { _id: PasskeyId; userId: UserId }>

export const passkeySchema = new Schema<PasskeyDocument>(passkeySchemaDefinition, {
  ...mongooseCreatedAtOnlySchemaOptions,
  collection: 'passkey'
})
  .index({ userId: 1 }, { name: 'passkey_userId' })
  .index({ credentialID: 1 }, { name: 'passkey_credentialID_unique', unique: true })

export const sessionSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  activeOrganizationId: optionalUUIDv7Field(),
  token: { required: true, type: String },
  expiresAt: { required: true, type: Date },
  ipAddress: { default: null, type: String },
  userAgent: { default: null, type: String },
  impersonatedBy: optionalUUIDv7Field(),
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type SessionRawDocument = SchemaRawDocument<typeof sessionSchemaDefinition>
export type SessionDocument = ReplaceDocumentFields<
  SessionRawDocument,
  {
    _id: SessionId
    activeOrganizationId?: OrganizationId | null
    impersonatedBy?: UserId | null
    userId: UserId
  }
>

export const sessionSchema = new Schema<SessionDocument>(sessionSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'session'
})
  .index({ userId: 1 }, { name: 'session_userId' })
  .index({ token: 1 }, { name: 'session_token_unique', unique: true })
  .index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'session_expiresAt_ttl' })

export const accountSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  accountId: { required: true, type: String },
  providerId: { required: true, type: String },
  accessToken: { default: null, type: String },
  refreshToken: { default: null, type: String },
  accessTokenExpiresAt: { default: null, type: Date },
  refreshTokenExpiresAt: { default: null, type: Date },
  scope: { default: null, type: String },
  idToken: { default: null, type: String },
  password: { default: null, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AccountRawDocument = SchemaRawDocument<typeof accountSchemaDefinition>
export type AccountDocument = ReplaceDocumentFields<AccountRawDocument, { _id: AccountId; userId: UserId }>

export const accountSchema = new Schema<AccountDocument>(accountSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'account'
})
  .index({ userId: 1 }, { name: 'account_userId' })
  .index({ providerId: 1, accountId: 1 }, { name: 'account_provider_account_unique', unique: true })

export const verificationSchemaDefinition = {
  _id: uuidV7IdField(),
  identifier: { required: true, type: String },
  value: { required: true, type: String },
  expiresAt: { required: true, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type VerificationRawDocument = SchemaRawDocument<typeof verificationSchemaDefinition>
export type VerificationDocument = ReplaceDocumentFields<VerificationRawDocument, { _id: VerificationId }>

export const verificationSchema = new Schema<VerificationDocument>(verificationSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'verification'
})
  .index({ identifier: 1 }, { name: 'verification_identifier' })
  .index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'verification_expiresAt_ttl' })

export const deviceCodeSchemaDefinition = {
  _id: uuidV7IdField(),
  deviceCode: { required: true, type: String },
  userCode: { required: true, type: String },
  userId: optionalUUIDv7Field(),
  expiresAt: { required: true, type: Date },
  status: { required: true, type: String },
  lastPolledAt: { default: null, type: Date },
  pollingInterval: { default: null, type: Number },
  clientId: { default: null, type: String },
  scope: { default: null, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type DeviceCodeRawDocument = SchemaRawDocument<typeof deviceCodeSchemaDefinition>
export type DeviceCodeDocument = ReplaceDocumentFields<
  DeviceCodeRawDocument,
  { _id: DeviceCodeId; userId?: UserId | null }
>

export const deviceCodeSchema = new Schema<DeviceCodeDocument>(deviceCodeSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'deviceCode'
})
  .index({ deviceCode: 1 }, { name: 'deviceCode_deviceCode' })
  .index({ userCode: 1 }, { name: 'deviceCode_userCode' })
  .index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'deviceCode_expiresAt_ttl' })

export const auditLogSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: optionalUUIDv7Field(),
  action: { required: true, type: String },
  status: { enum: AuditLogStatusValues, required: true, type: String },
  severity: { enum: AuditLogSeverityValues, required: true, type: String },
  ipAddress: { default: null, type: String },
  userAgent: { default: null, type: String },
  metadata: { default: () => ({}), required: true, type: Schema.Types.Mixed },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AuditLogRawDocument = SchemaRawDocument<typeof auditLogSchemaDefinition>
export type AuditLogDocument = ReplaceDocumentFields<
  AuditLogRawDocument,
  {
    _id: AuditLogId
    metadata: Record<string, unknown>
    severity: AuditLogSeverity
    status: AuditLogStatus
    userId?: UserId | null
  }
>
export type AuditLogPublicView = MongoosePublicView<AuditLogDocument, AuditLogId, AuditLogPublicId>

export const auditLogSchema = new Schema<AuditLogDocument>(auditLogSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'auditLog',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ userId: 1 }, { name: 'auditLog_userId' })
  .index({ createdAt: -1 }, { name: 'auditLog_createdAt' })
  .index({ action: 1 }, { name: 'auditLog_action' })

export const agentHostSchemaDefinition = {
  _id: uuidV7IdField(),
  name: { default: null, type: String },
  userId: optionalUUIDv7Field(),
  defaultCapabilities: { default: null, type: String },
  publicKey: { default: null, type: String },
  kid: { default: null, type: String },
  jwksUrl: { default: null, type: String },
  enrollmentTokenHash: { default: null, type: String },
  enrollmentTokenExpiresAt: { default: null, type: Date },
  status: {
    default: 'pending',
    enum: AgentAuthHostStatusValues,
    required: true,
    type: String
  },
  activatedAt: { default: null, type: Date },
  expiresAt: { default: null, type: Date },
  lastUsedAt: { default: null, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentHostRawDocument = SchemaRawDocument<typeof agentHostSchemaDefinition>
export type AgentHostDocument = ReplaceDocumentFields<
  AgentHostRawDocument,
  {
    _id: AgentHostId
    status: AgentAuthHostStatus
    userId?: UserId | null
  }
>
export type AgentHostPublicView = MongoosePublicView<AgentHostDocument, AgentHostId, AgentHostPublicId>

export const agentHostSchema = new Schema<AgentHostDocument>(agentHostSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'agentHost',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: 'agentHost_user_status_createdAt' })
  .index({ kid: 1 }, { name: 'agentHost_kid' })
  .index({ enrollmentTokenHash: 1 }, { name: 'agentHost_enrollmentTokenHash' })
  .index({ expiresAt: 1 }, { name: 'agentHost_expiresAt' })

export const agentSchemaDefinition = {
  _id: uuidV7IdField(),
  name: { required: true, type: String },
  userId: optionalUUIDv7Field(),
  hostId: requiredUUIDv7Field(),
  status: {
    default: 'pending',
    enum: AgentAuthAgentStatusValues,
    required: true,
    type: String
  },
  mode: {
    default: 'delegated',
    enum: AgentAuthModeValues,
    required: true,
    type: String
  },
  publicKey: { required: true, type: String },
  kid: { default: null, type: String },
  jwksUrl: { default: null, type: String },
  lastUsedAt: { default: null, type: Date },
  activatedAt: { default: null, type: Date },
  expiresAt: { default: null, type: Date },
  metadata: { default: null, type: Schema.Types.Mixed },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentRawDocument = SchemaRawDocument<typeof agentSchemaDefinition>
export type AgentDocument = ReplaceDocumentFields<
  AgentRawDocument,
  {
    _id: AgentId
    hostId: AgentHostId
    metadata?: Record<string, string | number | boolean | null> | string | null
    mode: AgentAuthMode
    status: AgentAuthAgentStatus
    userId?: UserId | null
  }
>
export type AgentPublicView = MongoosePublicView<AgentDocument, AgentId, AgentPublicId>

export const agentSchema = new Schema<AgentDocument>(agentSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'agent',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ hostId: 1, status: 1, createdAt: -1 }, { name: 'agent_host_status_createdAt' })
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: 'agent_user_status_createdAt' })
  .index({ kid: 1 }, { name: 'agent_kid' })
  .index({ expiresAt: 1 }, { name: 'agent_expiresAt' })

export const agentCapabilityGrantSchemaDefinition = {
  _id: uuidV7IdField(),
  agentId: requiredUUIDv7Field(),
  capability: { required: true, type: String },
  deniedBy: optionalUUIDv7Field(),
  grantedBy: optionalUUIDv7Field(),
  expiresAt: { default: null, type: Date },
  status: {
    default: 'pending',
    enum: AgentAuthGrantStatusValues,
    required: true,
    type: String
  },
  reason: { default: null, type: String },
  constraints: { default: null, type: Schema.Types.Mixed },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type AgentCapabilityGrantRawDocument = SchemaRawDocument<typeof agentCapabilityGrantSchemaDefinition>
export type AgentCapabilityGrantDocument = ReplaceDocumentFields<
  AgentCapabilityGrantRawDocument,
  {
    _id: AgentCapabilityGrantId
    agentId: AgentId
    constraints?: Record<string, unknown> | string | null
    deniedBy?: UserId | null
    grantedBy?: UserId | null
    status: AgentAuthGrantStatus
  }
>
export type AgentCapabilityGrantPublicView = MongoosePublicView<
  AgentCapabilityGrantDocument,
  AgentCapabilityGrantId,
  AgentCapabilityGrantPublicId
>

export const agentCapabilityGrantSchema = new Schema<AgentCapabilityGrantDocument>(
  agentCapabilityGrantSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'agentCapabilityGrant',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index({ agentId: 1, capability: 1, status: 1 }, { name: 'agentCapabilityGrant_agent_capability_status' })
  .index({ grantedBy: 1, status: 1, createdAt: -1 }, { name: 'agentCapabilityGrant_grantedBy' })
  .index({ expiresAt: 1 }, { name: 'agentCapabilityGrant_expiresAt' })

export const agentJwtReplaySchemaDefinition = {
  _id: uuidV7IdField(),
  agentId: requiredUUIDv7Field(),
  expiresAt: { required: true, type: Date },
  jtiHash: { required: true, type: String },
  replayKey: { required: true, type: String },
  createdAt: createdAtField()
} as const

export type AgentJwtReplayRawDocument = SchemaRawDocument<typeof agentJwtReplaySchemaDefinition>
export type AgentJwtReplayDocument = ReplaceDocumentFields<
  AgentJwtReplayRawDocument,
  {
    _id: AgentJwtReplayId
    agentId: AgentId
  }
>
export type AgentJwtReplayPublicView = MongoosePublicView<
  AgentJwtReplayDocument,
  AgentJwtReplayId,
  AgentJwtReplayPublicId
>

export const agentJwtReplaySchema = new Schema<AgentJwtReplayDocument>(agentJwtReplaySchemaDefinition, {
  ...mongooseCreatedAtOnlySchemaOptions,
  collection: 'agentJwtReplay',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ replayKey: 1 }, { name: 'agentJwtReplay_replayKey_unique', unique: true })
  .index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'agentJwtReplay_expiresAt_ttl' })

export const betterAuthSecondaryStorageSchemaDefinition = {
  _id: uuidV7IdField(),
  counter: { default: null, type: Number },
  expiresAt: { default: null, type: Date },
  key: { required: true, type: String },
  value: { required: true, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type BetterAuthSecondaryStorageRawDocument = SchemaRawDocument<
  typeof betterAuthSecondaryStorageSchemaDefinition
>
export type BetterAuthSecondaryStorageDocument = ReplaceDocumentFields<
  BetterAuthSecondaryStorageRawDocument,
  {
    _id: BetterAuthSecondaryStorageId
  }
>

export const betterAuthSecondaryStorageSchema = new Schema<BetterAuthSecondaryStorageDocument>(
  betterAuthSecondaryStorageSchemaDefinition,
  {
    ...mongooseTimestampSchemaOptions,
    collection: 'betterAuthSecondaryStorage',
    virtuals: { publicId: publicIdVirtual }
  }
)
  .index({ key: 1 }, { name: 'betterAuthSecondaryStorage_key_unique', unique: true })
  .index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'betterAuthSecondaryStorage_expiresAt_ttl' })

export const approvalRequestSchemaDefinition = {
  _id: uuidV7IdField(),
  method: { enum: AgentAuthApprovalMethodValues, required: true, type: String },
  agentId: optionalUUIDv7Field(),
  hostId: optionalUUIDv7Field(),
  userId: optionalUUIDv7Field(),
  capabilities: { default: null, type: String },
  status: {
    default: 'pending',
    enum: AgentAuthApprovalStatusValues,
    required: true,
    type: String
  },
  userCodeHash: { default: null, type: String },
  loginHint: { default: null, type: String },
  bindingMessage: { default: null, type: String },
  clientNotificationToken: { default: null, type: String },
  clientNotificationEndpoint: { default: null, type: String },
  deliveryMode: { default: null, type: String },
  interval: { default: 5, required: true, type: Number },
  lastPolledAt: { default: null, type: Date },
  expiresAt: { required: true, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type ApprovalRequestRawDocument = SchemaRawDocument<typeof approvalRequestSchemaDefinition>
export type ApprovalRequestDocument = ReplaceDocumentFields<
  ApprovalRequestRawDocument,
  {
    _id: ApprovalRequestId
    agentId?: AgentId | null
    hostId?: AgentHostId | null
    method: AgentAuthApprovalMethod
    status: AgentAuthApprovalStatus
    userId?: UserId | null
  }
>
export type ApprovalRequestPublicView = MongoosePublicView<
  ApprovalRequestDocument,
  ApprovalRequestId,
  ApprovalRequestPublicId
>

export const approvalRequestSchema = new Schema<ApprovalRequestDocument>(approvalRequestSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'approvalRequest',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ agentId: 1, status: 1, createdAt: -1 }, { name: 'approvalRequest_agent_status' })
  .index({ hostId: 1, status: 1, createdAt: -1 }, { name: 'approvalRequest_host_status' })
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: 'approvalRequest_user_status' })
  .index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'approvalRequest_expiresAt_ttl' })

export const organizationSchemaDefinition = {
  _id: uuidV7IdField(),
  name: { required: true, type: String },
  slug: { required: true, type: String },
  logo: { default: null, type: String },
  metadata: { default: null, type: Schema.Types.Mixed },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type OrganizationRawDocument = SchemaRawDocument<typeof organizationSchemaDefinition>
export type OrganizationDocument = ReplaceDocumentFields<
  OrganizationRawDocument,
  { _id: OrganizationId; metadata?: Record<string, unknown> | string | null }
>
export type OrganizationPublicView = MongoosePublicView<
  OrganizationDocument,
  OrganizationId,
  OrganizationPublicId
>

export const organizationSchema = new Schema<OrganizationDocument>(organizationSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'organization',
  virtuals: { publicId: publicIdVirtual }
}).index({ slug: 1 }, { name: 'organization_slug_unique', unique: true })

export const memberSchemaDefinition = {
  _id: uuidV7IdField(),
  userId: requiredUUIDv7Field(),
  organizationId: requiredUUIDv7Field(),
  role: { required: true, type: String },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type MemberRawDocument = SchemaRawDocument<typeof memberSchemaDefinition>
export type MemberDocument = ReplaceDocumentFields<
  MemberRawDocument,
  { _id: MemberId; organizationId: OrganizationId; role: ORG_MEMBER_ROLE; userId: UserId }
>
export type MemberPublicView = MongoosePublicView<MemberDocument, MemberId, MemberPublicId>

export const memberSchema = new Schema<MemberDocument>(memberSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'member',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ userId: 1 }, { name: 'member_userId' })
  .index({ organizationId: 1 }, { name: 'member_organizationId' })
  .index({ userId: 1, organizationId: 1 }, { name: 'member_user_organization_unique', unique: true })

export const teamSchemaDefinition = {
  _id: uuidV7IdField(),
  name: { required: true, type: String },
  organizationId: requiredUUIDv7Field(),
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type TeamRawDocument = SchemaRawDocument<typeof teamSchemaDefinition>
export type TeamDocument = ReplaceDocumentFields<
  TeamRawDocument,
  { _id: TeamId; organizationId: OrganizationId }
>
export type TeamPublicView = MongoosePublicView<TeamDocument, TeamId, TeamPublicId>

export const teamSchema = new Schema<TeamDocument>(teamSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'team',
  virtuals: { publicId: publicIdVirtual }
}).index({ organizationId: 1 }, { name: 'team_organizationId' })

export const invitationSchemaDefinition = {
  _id: uuidV7IdField(),
  email: { required: true, type: String },
  inviterId: requiredUUIDv7Field(),
  organizationId: requiredUUIDv7Field(),
  role: { required: true, type: String },
  status: { required: true, type: String },
  expiresAt: { required: true, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type InvitationRawDocument = SchemaRawDocument<typeof invitationSchemaDefinition>
export type InvitationDocument = ReplaceDocumentFields<
  InvitationRawDocument,
  {
    _id: InvitationId
    inviterId: UserId
    organizationId: OrganizationId
    role: OrganizationRole
  }
>

export const invitationSchema = new Schema<InvitationDocument>(invitationSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'invitation'
})
  .index({ email: 1, organizationId: 1 }, { name: 'invitation_email_organization' })
  .index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'invitation_expiresAt_ttl' })

export const apikeySchemaDefinition = {
  _id: uuidV7IdField(),
  configId: { default: 'default', required: true, type: String },
  name: { default: null, type: String },
  start: { default: null, type: String },
  prefix: { default: null, type: String },
  key: { required: true, type: String },
  referenceId: requiredUUIDv7Field(),
  refillInterval: { default: null, type: Number },
  refillAmount: { default: null, type: Number },
  lastRefillAt: { default: null, type: Date },
  enabled: { default: true, required: true, type: Boolean },
  rateLimitEnabled: { default: true, required: true, type: Boolean },
  rateLimitTimeWindow: { default: 60_000, type: Number },
  rateLimitMax: { default: 200, type: Number },
  requestCount: { default: 0, required: true, type: Number },
  remaining: { default: null, type: Number },
  lastRequest: { default: null, type: Date },
  expiresAt: { default: null, type: Date },
  permissions: { default: null, type: String },
  metadata: { default: null, type: Schema.Types.Mixed },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type ApiKeyRawDocument = SchemaRawDocument<typeof apikeySchemaDefinition>
export type ApiKeyDocument = ReplaceDocumentFields<
  ApiKeyRawDocument,
  {
    _id: ApiKeyId
    metadata?: Record<string, unknown> | string | null
    referenceId: UserId | OrganizationId
  }
>
export type ApiKeyPublicView = MongoosePublicView<ApiKeyDocument, ApiKeyId, ApiKeyPublicId>

export const apikeySchema = new Schema<ApiKeyDocument>(apikeySchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'apikey',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ configId: 1 }, { name: 'apikey_configId' })
  .index({ key: 1 }, { name: 'apikey_key_unique', unique: true })
  .index({ referenceId: 1 }, { name: 'apikey_referenceId' })

export const jwkSchemaDefinition = {
  _id: uuidV7IdField(),
  publicKey: { required: true, type: String },
  privateKey: { required: true, type: String },
  expiresAt: { default: null, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type JwkRawDocument = SchemaRawDocument<typeof jwkSchemaDefinition>
export type JwkDocument = ReplaceDocumentFields<JwkRawDocument, { _id: JwkId }>
export type JwkPublicView = MongoosePublicView<JwkDocument, JwkId, JwkPublicId>

export const jwkSchema = new Schema<JwkDocument>(jwkSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'jwk',
  virtuals: { publicId: publicIdVirtual }
}).index({ expiresAt: 1 }, { name: 'jwk_expiresAt' })

export const oauthClientSchemaDefinition = {
  _id: uuidV7IdField(),
  clientId: { required: true, type: String },
  clientSecret: { default: null, type: String },
  disabled: { default: false, required: true, type: Boolean },
  skipConsent: { default: null, type: Boolean },
  enableEndSession: { default: null, type: Boolean },
  subjectType: { default: null, enum: OAuthClientSubjectTypeValues, type: String },
  scopes: { default: undefined, type: [String] },
  userId: optionalUUIDv7Field(),
  name: { default: null, type: String },
  uri: { default: null, type: String },
  icon: { default: null, type: String },
  contacts: { default: undefined, type: [String] },
  tos: { default: null, type: String },
  policy: { default: null, type: String },
  softwareId: { default: null, type: String },
  softwareVersion: { default: null, type: String },
  softwareStatement: { default: null, type: String },
  redirectUris: { required: true, type: [String] },
  postLogoutRedirectUris: { default: undefined, type: [String] },
  tokenEndpointAuthMethod: { default: null, enum: OAuthClientAuthMethodValues, type: String },
  grantTypes: { default: undefined, type: [String] },
  responseTypes: { default: undefined, type: [String] },
  public: { default: null, type: Boolean },
  type: { default: null, enum: OAuthClientTypeValues, type: String },
  requirePKCE: { default: null, type: Boolean },
  referenceId: optionalUUIDv7Field(),
  metadata: { default: null, type: Schema.Types.Mixed },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type OAuthClientRawDocument = SchemaRawDocument<typeof oauthClientSchemaDefinition>
export type OAuthClientDocument = ReplaceDocumentFields<
  OAuthClientRawDocument,
  {
    _id: OAuthClientId
    metadata?: Record<string, unknown> | null
    referenceId?: UserId | OrganizationId | null
    subjectType?: OAuthClientSubjectType | null
    tokenEndpointAuthMethod?: OAuthClientAuthMethod | null
    type?: OAuthClientType | null
    userId?: UserId | null
  }
>

export const oauthClientSchema = new Schema<OAuthClientDocument>(oauthClientSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'oauthClient'
})
  .index({ clientId: 1 }, { name: 'oauthClient_clientId_unique', unique: true })
  .index({ userId: 1 }, { name: 'oauthClient_userId' })
  .index({ referenceId: 1 }, { name: 'oauthClient_referenceId' })

export const oauthRefreshTokenSchemaDefinition = {
  _id: uuidV7IdField(),
  token: { required: true, type: String },
  clientId: { required: true, type: String },
  sessionId: optionalUUIDv7Field(),
  userId: requiredUUIDv7Field(),
  referenceId: optionalUUIDv7Field(),
  expiresAt: { required: true, type: Date },
  createdAt: createdAtField(),
  revoked: { default: null, type: Date },
  authTime: { default: null, type: Date },
  scopes: { required: true, type: [String] }
} as const

export type OAuthRefreshTokenRawDocument = SchemaRawDocument<typeof oauthRefreshTokenSchemaDefinition>
export type OAuthRefreshTokenDocument = ReplaceDocumentFields<
  OAuthRefreshTokenRawDocument,
  {
    _id: OAuthRefreshTokenId
    referenceId?: UserId | OrganizationId | null
    sessionId?: SessionId | null
    userId: UserId
  }
>

export const oauthRefreshTokenSchema = new Schema<OAuthRefreshTokenDocument>(
  oauthRefreshTokenSchemaDefinition,
  {
    ...mongooseCreatedAtOnlySchemaOptions,
    collection: 'oauthRefreshToken'
  }
)
  .index({ token: 1 }, { name: 'oauthRefreshToken_token_unique', unique: true })
  .index({ clientId: 1 }, { name: 'oauthRefreshToken_clientId' })
  .index({ sessionId: 1 }, { name: 'oauthRefreshToken_sessionId' })
  .index({ userId: 1 }, { name: 'oauthRefreshToken_userId' })
  .index({ referenceId: 1 }, { name: 'oauthRefreshToken_referenceId' })

export const oauthAccessTokenSchemaDefinition = {
  _id: uuidV7IdField(),
  token: { default: null, type: String },
  clientId: { required: true, type: String },
  sessionId: optionalUUIDv7Field(),
  userId: optionalUUIDv7Field(),
  referenceId: optionalUUIDv7Field(),
  refreshId: optionalUUIDv7Field(),
  expiresAt: { required: true, type: Date },
  createdAt: createdAtField(),
  scopes: { required: true, type: [String] }
} as const

export type OAuthAccessTokenRawDocument = SchemaRawDocument<typeof oauthAccessTokenSchemaDefinition>
export type OAuthAccessTokenDocument = ReplaceDocumentFields<
  OAuthAccessTokenRawDocument,
  {
    _id: OAuthAccessTokenId
    referenceId?: UserId | OrganizationId | null
    refreshId?: OAuthRefreshTokenId | null
    sessionId?: SessionId | null
    userId?: UserId | null
  }
>

export const oauthAccessTokenSchema = new Schema<OAuthAccessTokenDocument>(oauthAccessTokenSchemaDefinition, {
  ...mongooseCreatedAtOnlySchemaOptions,
  collection: 'oauthAccessToken'
})
  .index({ token: 1 }, { name: 'oauthAccessToken_token_unique', unique: true })
  .index({ clientId: 1 }, { name: 'oauthAccessToken_clientId' })
  .index({ sessionId: 1 }, { name: 'oauthAccessToken_sessionId' })
  .index({ userId: 1 }, { name: 'oauthAccessToken_userId' })
  .index({ referenceId: 1 }, { name: 'oauthAccessToken_referenceId' })
  .index({ refreshId: 1 }, { name: 'oauthAccessToken_refreshId' })

export const oauthConsentSchemaDefinition = {
  _id: uuidV7IdField(),
  clientId: { required: true, type: String },
  userId: optionalUUIDv7Field(),
  referenceId: optionalUUIDv7Field(),
  scopes: { required: true, type: [String] },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type OAuthConsentRawDocument = SchemaRawDocument<typeof oauthConsentSchemaDefinition>
export type OAuthConsentDocument = ReplaceDocumentFields<
  OAuthConsentRawDocument,
  {
    _id: OAuthConsentId
    referenceId?: UserId | OrganizationId | null
    userId?: UserId | null
  }
>

export const oauthConsentSchema = new Schema<OAuthConsentDocument>(oauthConsentSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'oauthConsent'
})
  .index({ clientId: 1 }, { name: 'oauthConsent_clientId' })
  .index({ userId: 1 }, { name: 'oauthConsent_userId' })
  .index({ referenceId: 1 }, { name: 'oauthConsent_referenceId' })

export const subscriptionSchemaDefinition = {
  _id: uuidV7IdField(),
  plan: { required: true, type: String },
  referenceId: { required: true, type: String },
  stripeCustomerId: { default: null, type: String },
  stripeSubscriptionId: { default: null, type: String },
  status: { required: true, type: String },
  periodStart: { default: null, type: Date },
  periodEnd: { default: null, type: Date },
  cancelAtPeriodEnd: { default: null, type: Date },
  seats: { default: null, type: Number },
  trialStart: { default: null, type: Date },
  trialEnd: { default: null, type: Date },
  createdAt: createdAtField(),
  updatedAt: updatedAtField()
} as const

export type SubscriptionRawDocument = SchemaRawDocument<typeof subscriptionSchemaDefinition>
export type SubscriptionDocument = ReplaceDocumentFields<SubscriptionRawDocument, { _id: SubscriptionId }>
export type SubscriptionPublicView = MongoosePublicView<
  SubscriptionDocument,
  SubscriptionId,
  SubscriptionPublicId
>

export const subscriptionSchema = new Schema<SubscriptionDocument>(subscriptionSchemaDefinition, {
  ...mongooseTimestampSchemaOptions,
  collection: 'subscription',
  virtuals: { publicId: publicIdVirtual }
})
  .index({ referenceId: 1 }, { name: 'subscription_referenceId' })
  .index({ stripeCustomerId: 1 }, { name: 'subscription_stripeCustomerId' })
  .index({ stripeSubscriptionId: 1 }, { name: 'subscription_stripeSubscriptionId' })

export const betterAuthSchemas = {
  account: accountSchema,
  agent: agentSchema,
  agentCapabilityGrant: agentCapabilityGrantSchema,
  agentHost: agentHostSchema,
  agentJwtReplay: agentJwtReplaySchema,
  betterAuthSecondaryStorage: betterAuthSecondaryStorageSchema,
  apikey: apikeySchema,
  approvalRequest: approvalRequestSchema,
  auditLog: auditLogSchema,
  deviceCode: deviceCodeSchema,
  invitation: invitationSchema,
  jwk: jwkSchema,
  member: memberSchema,
  oauthAccessToken: oauthAccessTokenSchema,
  oauthClient: oauthClientSchema,
  oauthConsent: oauthConsentSchema,
  oauthRefreshToken: oauthRefreshTokenSchema,
  organization: organizationSchema,
  passkey: passkeySchema,
  session: sessionSchema,
  subscription: subscriptionSchema,
  team: teamSchema,
  twoFactor: twoFactorSchema,
  user: userSchema,
  verification: verificationSchema
} as const
