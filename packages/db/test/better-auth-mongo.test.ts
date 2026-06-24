import { randomUUID } from 'node:crypto'
import { UUID } from 'mongodb'
import { describe, expect, it } from 'vitest'

import { createMongoUUIDv7, ensureBetterAuthUUIDv7InsertDocumentId } from '../src/better-auth-mongo'
import { parseUUIDv7 } from '../src/ids'

describe('Better Auth Mongo adapter UUID policy', () => {
  it('replaces generated UUID ids with UUIDv7 for repo-owned Better Auth models', () => {
    expect.hasAssertions()

    const document = {
      _id: new UUID(randomUUID()),
      name: 'Research host'
    }

    ensureBetterAuthUUIDv7InsertDocumentId('agentHost', document)

    expect(document.name).toBe('Research host')
    expect(document._id).toBeInstanceOf(UUID)
    expect(parseUUIDv7(document._id.toString())).toBe(document._id.toString())
  })

  it('preserves existing UUIDv7 ids', () => {
    expect.hasAssertions()

    const id = createMongoUUIDv7()
    const document = {
      _id: id,
      name: 'Research host'
    }

    ensureBetterAuthUUIDv7InsertDocumentId('agentHost', document)

    expect(document._id).toBe(id)
    expect(parseUUIDv7(document._id.toString())).toBe(document._id.toString())
  })

  it('does not replace ids for non-Better Auth models', () => {
    expect.hasAssertions()

    const id = new UUID(randomUUID())
    const document = {
      _id: id,
      name: 'Mail account'
    }

    ensureBetterAuthUUIDv7InsertDocumentId('agentMailMailboxGrant', document)

    expect(document._id).toBe(id)
  })
})
