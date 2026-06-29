import { domainToASCII } from 'node:url'
import parseEmailAddress from 'email-addresses'

export interface ParsedMailboxAddress {
  address: string
  domain: string
  localPart: string
  name?: string
}

export interface ParseMailboxAddressOptions {
  allowComments?: boolean
  allowDisplayName?: boolean
}

export function parseMailboxAddress(
  value: string | null | undefined,
  options: ParseMailboxAddressOptions = {}
): ParsedMailboxAddress | null {
  const input = value?.trim()
  if (!input) {
    return null
  }

  const parsed = parseEmailAddress({ input, rejectTLD: true, rfc6532: true, strict: true })
  if (!parsed || parsed.addresses.length !== 1) {
    return null
  }
  const mailbox = parsed.addresses[0]
  if (mailbox.type !== 'mailbox' || !mailbox.local || !mailbox.address || !mailbox.domain) {
    return null
  }
  if (options.allowDisplayName === false && mailbox.name) {
    return null
  }
  if (options.allowComments === false && mailbox.parts.comments.length > 0) {
    return null
  }

  const domain = domainToASCII(mailbox.domain).toLowerCase()
  if (!domain) {
    return null
  }
  const address = `${mailbox.local}@${domain}`.toLowerCase()
  if (!canonicalAddressRoundTrips(address, mailbox.local, domain)) {
    return null
  }

  return {
    address,
    domain,
    localPart: mailbox.local.toLowerCase(),
    ...(mailbox.name?.trim() ? { name: mailbox.name.trim() } : {})
  }
}

export function normalizeMailboxAddress(
  value: string | null | undefined,
  options: ParseMailboxAddressOptions = {}
) {
  return parseMailboxAddress(value, options)?.address ?? null
}

export function normalizeMailboxIdentifier(value: string | null | undefined) {
  return normalizeMailboxAddress(value, { allowComments: false, allowDisplayName: false })
}

export function mailboxDomain(value: string | null | undefined) {
  return parseMailboxAddress(value, { allowComments: false, allowDisplayName: false })?.domain ?? ''
}

export function mailboxLocalPart(value: string | null | undefined) {
  return parseMailboxAddress(value, { allowComments: false, allowDisplayName: false })?.localPart ?? ''
}

export function normalizeMailDomain(value: string | null | undefined) {
  const input = value?.trim()
  if (!input) {
    return null
  }
  const domain = domainToASCII(input).toLowerCase()
  return domain || null
}

function canonicalAddressRoundTrips(address: string, expectedLocalPart: string, expectedDomain: string) {
  const parsed = parseEmailAddress({ input: address, rejectTLD: true, rfc6532: true, strict: true })
  if (!parsed || parsed.addresses.length !== 1) {
    return false
  }
  const mailbox = parsed.addresses[0]
  return (
    mailbox.type === 'mailbox' &&
    mailbox.local?.toLowerCase() === expectedLocalPart.toLowerCase() &&
    domainToASCII(mailbox.domain ?? '').toLowerCase() === expectedDomain
  )
}
