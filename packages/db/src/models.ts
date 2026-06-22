import {
  accountSchema,
  apikeySchema,
  auditLogSchema,
  deviceCodeSchema,
  invitationSchema,
  jwkSchema,
  memberSchema,
  oauthAccessTokenSchema,
  oauthClientSchema,
  oauthConsentSchema,
  oauthRefreshTokenSchema,
  organizationSchema,
  passkeySchema,
  sessionSchema,
  subscriptionSchema,
  teamSchema,
  twoFactorSchema,
  userSchema,
  verificationSchema
} from './schema/better-auth'
import {
  agentMailDomainSchema,
  agentMailWorkerCredentialRefreshSchema,
  agentMailWorkerDeploymentSchema,
  cloudflareConnectionSchema,
  cloudflareOAuthConnectionIntentSchema,
  cloudflareOAuthGrantSchema
} from './schema/cloudflare'
import { actorSchema, policyAuditEntrySchema, subjectPolicySchema } from './schema/permissions'
import type {
  AccountDocument,
  ApiKeyDocument,
  AuditLogDocument,
  DeviceCodeDocument,
  InvitationDocument,
  JwkDocument,
  MemberDocument,
  OAuthAccessTokenDocument,
  OAuthClientDocument,
  OAuthConsentDocument,
  OAuthRefreshTokenDocument,
  OrganizationDocument,
  PasskeyDocument,
  SessionDocument,
  SubscriptionDocument,
  TeamDocument,
  TwoFactorDocument,
  UserDocument,
  VerificationDocument
} from './schema/better-auth'
import type {
  AgentMailDomainDocument,
  AgentMailWorkerCredentialRefreshDocument,
  AgentMailWorkerDeploymentDocument,
  CloudflareConnectionDocument,
  CloudflareOAuthConnectionIntentDocument,
  CloudflareOAuthGrantDocument
} from './schema/cloudflare'
import type { ActorDocument, PolicyAuditEntryDocument, SubjectPolicyDocument } from './schema/permissions'
import type { Connection, Model, Schema } from 'mongoose'

export type AppModel<TDocument extends object> = Model<TDocument, object, object, object, TDocument>

export type AppModels = {
  account: AppModel<AccountDocument>
  agentMailDomain: AppModel<AgentMailDomainDocument>
  agentMailWorkerCredentialRefresh: AppModel<AgentMailWorkerCredentialRefreshDocument>
  agentMailWorkerDeployment: AppModel<AgentMailWorkerDeploymentDocument>
  actor: AppModel<ActorDocument>
  apikey: AppModel<ApiKeyDocument>
  auditLog: AppModel<AuditLogDocument>
  cloudflareConnection: AppModel<CloudflareConnectionDocument>
  cloudflareOAuthConnectionIntent: AppModel<CloudflareOAuthConnectionIntentDocument>
  cloudflareOAuthGrant: AppModel<CloudflareOAuthGrantDocument>
  deviceCode: AppModel<DeviceCodeDocument>
  invitation: AppModel<InvitationDocument>
  jwk: AppModel<JwkDocument>
  member: AppModel<MemberDocument>
  oauthAccessToken: AppModel<OAuthAccessTokenDocument>
  oauthClient: AppModel<OAuthClientDocument>
  oauthConsent: AppModel<OAuthConsentDocument>
  oauthRefreshToken: AppModel<OAuthRefreshTokenDocument>
  organization: AppModel<OrganizationDocument>
  passkey: AppModel<PasskeyDocument>
  policyAuditEntry: AppModel<PolicyAuditEntryDocument>
  session: AppModel<SessionDocument>
  subjectPolicy: AppModel<SubjectPolicyDocument>
  subscription: AppModel<SubscriptionDocument>
  team: AppModel<TeamDocument>
  twoFactor: AppModel<TwoFactorDocument>
  user: AppModel<UserDocument>
  verification: AppModel<VerificationDocument>
}

export function createAppModels(connection: Connection): AppModels {
  return {
    account: connectionModel(connection, 'account', accountSchema),
    agentMailDomain: connectionModel(connection, 'agentMailDomain', agentMailDomainSchema),
    agentMailWorkerCredentialRefresh: connectionModel(
      connection,
      'agentMailWorkerCredentialRefresh',
      agentMailWorkerCredentialRefreshSchema
    ),
    agentMailWorkerDeployment: connectionModel(
      connection,
      'agentMailWorkerDeployment',
      agentMailWorkerDeploymentSchema
    ),
    actor: connectionModel(connection, 'actor', actorSchema),
    apikey: connectionModel(connection, 'apikey', apikeySchema),
    auditLog: connectionModel(connection, 'auditLog', auditLogSchema),
    cloudflareConnection: connectionModel(connection, 'cloudflareConnection', cloudflareConnectionSchema),
    cloudflareOAuthConnectionIntent: connectionModel(
      connection,
      'cloudflareOAuthConnectionIntent',
      cloudflareOAuthConnectionIntentSchema
    ),
    cloudflareOAuthGrant: connectionModel(connection, 'cloudflareOAuthGrant', cloudflareOAuthGrantSchema),
    deviceCode: connectionModel(connection, 'deviceCode', deviceCodeSchema),
    invitation: connectionModel(connection, 'invitation', invitationSchema),
    jwk: connectionModel(connection, 'jwk', jwkSchema),
    member: connectionModel(connection, 'member', memberSchema),
    oauthAccessToken: connectionModel(connection, 'oauthAccessToken', oauthAccessTokenSchema),
    oauthClient: connectionModel(connection, 'oauthClient', oauthClientSchema),
    oauthConsent: connectionModel(connection, 'oauthConsent', oauthConsentSchema),
    oauthRefreshToken: connectionModel(connection, 'oauthRefreshToken', oauthRefreshTokenSchema),
    organization: connectionModel(connection, 'organization', organizationSchema),
    passkey: connectionModel(connection, 'passkey', passkeySchema),
    policyAuditEntry: connectionModel(connection, 'policyAuditEntry', policyAuditEntrySchema),
    session: connectionModel(connection, 'session', sessionSchema),
    subjectPolicy: connectionModel(connection, 'subjectPolicy', subjectPolicySchema),
    subscription: connectionModel(connection, 'subscription', subscriptionSchema),
    team: connectionModel(connection, 'team', teamSchema),
    twoFactor: connectionModel(connection, 'twoFactor', twoFactorSchema),
    user: connectionModel(connection, 'user', userSchema),
    verification: connectionModel(connection, 'verification', verificationSchema)
  }
}

function connectionModel<TDocument extends object>(
  connection: Connection,
  name: string,
  schema: Schema<TDocument>
): AppModel<TDocument> {
  return connection.models[name]
    ? connection.model<TDocument, AppModel<TDocument>>(name)
    : connection.model<TDocument, AppModel<TDocument>>(name, schema)
}
