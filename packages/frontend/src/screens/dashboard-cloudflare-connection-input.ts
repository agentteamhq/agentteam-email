import type {
  CloudflareAccountSummary,
  CloudflareConnectionInput,
  CloudflareZoneSummary
} from '@main/backend'

export function cloudflareConnectionInputForSelectedDomain({
  account,
  domain,
  zone
}: {
  account: CloudflareAccountSummary
  domain: string
  zone: CloudflareZoneSummary
}): CloudflareConnectionInput {
  return {
    cloudflareAccountId: account.id,
    cloudflareAccountName: account.name,
    cloudflareZoneId: zone.id,
    cloudflareZoneName: zone.name,
    domain,
    grantPublicId: zone.grantPublicId
  }
}
