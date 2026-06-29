import { describe, expect, it } from 'vitest'

import { mailboxAddress, mailboxAddressOrRaw, mailboxDisplayName } from './mail-addresses'

describe('mail address helpers', () => {
  it('canonicalizes display-name and IDNA mailbox values', () => {
    expect.hasAssertions()

    expect(mailboxAddress('Person <Person@Exämple.com>')).toBe('person@xn--exmple-cua.com')
    expect(mailboxDisplayName('Person <Person@Exämple.com>')).toBe('Person')
  })

  it('uses canonical mailbox addresses as the display fallback', () => {
    expect.hasAssertions()

    expect(mailboxDisplayName('person@example.net (Recipient)')).toBe('person@example.net')
    expect(mailboxAddressOrRaw('person@example.net (Recipient)')).toBe('person@example.net')
  })

  it('does not guess mailbox addresses from malformed values', () => {
    expect.hasAssertions()

    expect(mailboxAddress('local@example.net@blocked.test')).toBe('')
    expect(mailboxAddress('Team: one@example.net;')).toBe('')
    expect(mailboxAddressOrRaw('Team: one@example.net;')).toBe('Team: one@example.net;')
  })
})
