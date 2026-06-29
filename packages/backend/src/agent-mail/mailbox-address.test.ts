import { describe, expect, it } from 'vitest'

import {
  normalizeMailDomain,
  normalizeMailboxAddress,
  normalizeMailboxIdentifier,
  parseMailboxAddress
} from './mailbox-address'

describe('Agent Mail mailbox address parsing', () => {
  it('canonicalizes mailbox case and IDNA domains', () => {
    expect.hasAssertions()

    expect(parseMailboxAddress('Person <Person@Exämple.com>')).toStrictEqual({
      address: 'person@xn--exmple-cua.com',
      domain: 'xn--exmple-cua.com',
      localPart: 'person',
      name: 'Person'
    })
  })

  it('parses RFC comments without treating comments as part of the mailbox', () => {
    expect.hasAssertions()

    expect(normalizeMailboxAddress('person@example.net (Recipient)')).toBe('person@example.net')
  })

  it('keeps mailbox identifiers stricter than decorated mailbox header values', () => {
    expect.hasAssertions()

    expect(normalizeMailboxIdentifier('Person <person@example.net>')).toBeNull()
    expect(normalizeMailboxIdentifier('person@example.net (Recipient)')).toBeNull()
    expect(normalizeMailboxIdentifier('Person@Example.Net')).toBe('person@example.net')
  })

  it('fails closed for malformed, grouped, listed, and non-round-tripping mailboxes', () => {
    expect.hasAssertions()

    expect(normalizeMailboxAddress('local@allowed.test@blocked.test')).toBeNull()
    expect(normalizeMailboxAddress('Team: one@example.net;')).toBeNull()
    expect(normalizeMailboxAddress('one@example.net, two@example.net')).toBeNull()
    expect(normalizeMailboxAddress('"local@quoted"@example.net')).toBeNull()
    expect(normalizeMailboxAddress('user@[127.0.0.1]')).toBeNull()
  })

  it('normalizes standalone mail domains through IDNA', () => {
    expect.hasAssertions()

    expect(normalizeMailDomain(' Exämple.com ')).toBe('xn--exmple-cua.com')
  })
})
