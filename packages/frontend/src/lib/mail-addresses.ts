import parseEmailAddress from 'email-addresses'

export interface ParsedMailboxAddress {
  address: string
  domain: string
  localPart: string
  name?: string
}

export function parseMailboxAddress(value: string | null | undefined): ParsedMailboxAddress | null {
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

  const domain = domainToASCII(mailbox.domain)
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

export function mailboxAddress(value: string | null | undefined) {
  return parseMailboxAddress(value)?.address ?? ''
}

export function mailboxAddressOrRaw(value: string | null | undefined) {
  return mailboxAddress(value) || value?.trim() || ''
}

export function mailboxDisplayName(value: string | null | undefined) {
  const parsed = parseMailboxAddress(value)
  return parsed?.name || parsed?.address || value?.trim() || ''
}

function domainToASCII(value: string) {
  try {
    return new URL(`http://${value}/`).hostname.toLowerCase()
  } catch {
    return ''
  }
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
    domainToASCII(mailbox.domain ?? '') === expectedDomain
  )
}
