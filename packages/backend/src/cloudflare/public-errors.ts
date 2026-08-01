/**
 * Browser-safe public error contract for connected-account Cloudflare failures.
 *
 * This module is the single owner of the public error code and the user-facing
 * remediation copy for an expired or otherwise unusable Cloudflare OAuth grant.
 * It must stay free of server-only imports so the frontend can consume the same
 * definition through the `@main/backend/cloudflare/public-errors` export instead
 * of redeclaring the semantics.
 */

export const CLOUDFLARE_REAUTHORIZATION_REQUIRED_ERROR_CODE = 'CLOUDFLARE_REAUTHORIZATION_REQUIRED'

export const CLOUDFLARE_REAUTHORIZATION_REQUIRED_MESSAGE =
  'Cloudflare access expired. Reconnect your Cloudflare account.'

export type CloudflareReauthorizationRequiredErrorCode = typeof CLOUDFLARE_REAUTHORIZATION_REQUIRED_ERROR_CODE

export function isCloudflareReauthorizationRequiredErrorCode(
  code: unknown
): code is CloudflareReauthorizationRequiredErrorCode {
  return code === CLOUDFLARE_REAUTHORIZATION_REQUIRED_ERROR_CODE
}
