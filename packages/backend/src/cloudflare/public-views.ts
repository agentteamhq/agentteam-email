import { publicIdFromUUIDv7 } from '@main/db'
import type {
  CloudflareConnectionDocument,
  CloudflareConnectionPublicId,
  CloudflareConnectionPublicView,
  CloudflareOAuthConnectionIntentDocument,
  CloudflareOAuthConnectionIntentPublicId,
  CloudflareOAuthConnectionIntentPublicView,
  CloudflareOAuthGrantDocument,
  CloudflareOAuthGrantPublicId,
  CloudflareOAuthGrantPublicView
} from '@main/db'

export function cloudflareOAuthConnectionIntentPublicView(
  intent: CloudflareOAuthConnectionIntentDocument
): CloudflareOAuthConnectionIntentPublicView {
  return {
    id: intent._id,
    publicId: publicIdFromUUIDv7(intent._id) as CloudflareOAuthConnectionIntentPublicId,
    userId: intent.userId,
    organizationId: intent.organizationId,
    status: intent.status,
    callbackPath: intent.callbackPath,
    errorCode: intent.errorCode,
    errorMessage: intent.errorMessage,
    expiresAt: intent.expiresAt,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt
  }
}

export function cloudflareOAuthGrantPublicView(
  grant: CloudflareOAuthGrantDocument
): CloudflareOAuthGrantPublicView {
  return {
    id: grant._id,
    publicId: publicIdFromUUIDv7(grant._id) as CloudflareOAuthGrantPublicId,
    userId: grant.userId,
    organizationId: grant.organizationId,
    betterAuthAccountId: grant.betterAuthAccountId,
    cloudflareUserId: grant.cloudflareUserId,
    cloudflareEmail: grant.cloudflareEmail,
    grantedScopes: grant.grantedScopes,
    requiredScopes: grant.requiredScopes,
    status: grant.status,
    lastTokenCheckAt: grant.lastTokenCheckAt,
    lastRefreshAt: grant.lastRefreshAt,
    lastErrorCode: grant.lastErrorCode,
    lastErrorMessage: grant.lastErrorMessage,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt
  }
}

export function cloudflareConnectionPublicView(
  connection: CloudflareConnectionDocument
): CloudflareConnectionPublicView {
  return {
    id: connection._id,
    publicId: publicIdFromUUIDv7(connection._id) as CloudflareConnectionPublicId,
    userId: connection.userId,
    organizationId: connection.organizationId,
    organizationPublicId: connection.organizationPublicId,
    grantId: connection.grantId,
    agentMailDomainId: connection.agentMailDomainId,
    agentMailWorkerDeploymentId: connection.agentMailWorkerDeploymentId,
    cloudflareAccountId: connection.cloudflareAccountId,
    cloudflareAccountName: connection.cloudflareAccountName,
    cloudflareZoneId: connection.cloudflareZoneId,
    cloudflareZoneName: connection.cloudflareZoneName,
    domain: connection.domain,
    archivePrefix: connection.archivePrefix,
    r2BucketName: connection.r2BucketName,
    r2Endpoint: connection.r2Endpoint,
    r2Region: connection.r2Region,
    workerScriptName: connection.workerScriptName,
    workerCredentialIssuedAt: connection.workerCredentialIssuedAt,
    workerCredentialRefreshAfter: connection.workerCredentialRefreshAfter,
    workerCredentialExpiresAt: connection.workerCredentialExpiresAt,
    status: connection.status,
    provisioningStatus: connection.provisioningStatus,
    lastProvisionedAt: connection.lastProvisionedAt,
    lastErrorCode: connection.lastErrorCode,
    lastErrorMessage: connection.lastErrorMessage,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  }
}
