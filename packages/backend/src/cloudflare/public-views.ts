import { publicIdFromUUIDv7 } from '@main/db'
import type {
  CloudflareConnectionDocument,
  CloudflareConnectionPublicId,
  CloudflareConnectionStatus,
  CloudflareOAuthConnectionIntentDocument,
  CloudflareOAuthConnectionIntentPublicId,
  CloudflareOAuthConnectionIntentStatus,
  CloudflareOAuthGrantDocument,
  CloudflareOAuthGrantPublicId,
  CloudflareOAuthGrantStatus,
  CloudflareProvisioningStatus
} from '@main/db'

export interface CloudflareOAuthConnectionIntentPublicView {
  createdAt?: Date
  errorCode?: string | null
  errorMessage?: string | null
  expiresAt: Date
  publicId: CloudflareOAuthConnectionIntentPublicId
  status: CloudflareOAuthConnectionIntentStatus
  updatedAt?: Date
}

export interface CloudflareOAuthGrantPublicView {
  cloudflareEmail?: string | null
  isUsable: boolean
  lastErrorMessage?: string | null
  missingRequiredScopeCount: number
  publicId: CloudflareOAuthGrantPublicId
  requiresReconnect: boolean
  status: CloudflareOAuthGrantStatus
}

export interface CloudflareConnectionPublicView {
  cloudflareAccountId: string
  cloudflareAccountName?: string | null
  cloudflareZoneId: string
  cloudflareZoneName?: string | null
  createdAt?: Date
  domain: string
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
  lastProvisionedAt?: Date | null
  provisioningStatus: CloudflareProvisioningStatus
  publicId: CloudflareConnectionPublicId
  status: CloudflareConnectionStatus
  updatedAt?: Date
  workerScriptName?: string | null
}

export function cloudflareOAuthConnectionIntentPublicView(
  intent: CloudflareOAuthConnectionIntentDocument
): CloudflareOAuthConnectionIntentPublicView {
  return {
    publicId: publicIdFromUUIDv7(intent._id) as CloudflareOAuthConnectionIntentPublicId,
    status: intent.status,
    errorCode: intent.errorCode,
    errorMessage: publicCloudflareOperationalMessage(intent.errorCode, intent.errorMessage),
    expiresAt: intent.expiresAt,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt
  }
}

export function cloudflareOAuthGrantPublicView(
  grant: CloudflareOAuthGrantDocument
): CloudflareOAuthGrantPublicView {
  const missingRequiredScopeCount = missingRequiredCloudflareScopeCount(grant)
  const isUsable = grant.status === 'active' && missingRequiredScopeCount === 0

  return {
    publicId: publicIdFromUUIDv7(grant._id) as CloudflareOAuthGrantPublicId,
    cloudflareEmail: grant.cloudflareEmail,
    isUsable,
    status: grant.status,
    missingRequiredScopeCount,
    requiresReconnect: !isUsable,
    lastErrorMessage: publicCloudflareOperationalMessage(grant.lastErrorCode, grant.lastErrorMessage)
  }
}

function missingRequiredCloudflareScopeCount(grant: CloudflareOAuthGrantDocument): number {
  const grantedScopes = new Set(grant.grantedScopes)
  return grant.requiredScopes.filter((scope) => !grantedScopes.has(scope)).length
}

export function cloudflareConnectionPublicView(
  connection: CloudflareConnectionDocument
): CloudflareConnectionPublicView {
  return {
    publicId: publicIdFromUUIDv7(connection._id) as CloudflareConnectionPublicId,
    cloudflareAccountId: connection.cloudflareAccountId,
    cloudflareAccountName: connection.cloudflareAccountName,
    cloudflareZoneId: connection.cloudflareZoneId,
    cloudflareZoneName: connection.cloudflareZoneName,
    domain: connection.domain,
    workerScriptName: connection.workerScriptName,
    status: connection.status,
    provisioningStatus: connection.provisioningStatus,
    lastProvisionedAt: connection.lastProvisionedAt,
    lastErrorCode: connection.lastErrorCode,
    lastErrorMessage: publicCloudflareOperationalMessage(
      connection.lastErrorCode,
      connection.lastErrorMessage
    ),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  }
}

function publicCloudflareOperationalMessage(
  code: string | null | undefined,
  storedMessage: string | null | undefined
): string | null {
  if (!code && !storedMessage) {
    return null
  }
  if (code === 'AT_EMAIL_ADMIN_CONTROL_SYNC_FAILED') {
    return 'Agent Mail runtime sync failed. Try again or check runtime health.'
  }
  if (code === 'BETTER_AUTH_UNLINK_FAILED') {
    return 'Cloudflare local connection was revoked, but account unlinking needs retry.'
  }
  if (code?.startsWith('CLOUDFLARE_')) {
    return 'Cloudflare request failed. Check the selected account, zone, and permissions.'
  }

  return 'The Cloudflare connection needs attention. Try again or contact support.'
}
