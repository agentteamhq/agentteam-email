import { describe, expect, it } from 'vitest'

import {
  base62UUIDv7ToUUIDv7,
  bytesToBase62UUIDv7,
  bytesToUUIDv7,
  createUUIDv7,
  isBase62UUIDv7,
  isUUIDv7,
  parseUUIDv7,
  uuidv7ToBase62UUIDv7,
  uuidv7ToBytes
} from './uuidv7'

describe('UUIDv7 helpers', () => {
  it('creates canonical UUIDv7 values', () => {
    const id = createUUIDv7()

    expect(isUUIDv7(id)).toBe(true)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  })

  it('round-trips UUIDv7 values through bytes and base62 public IDs', () => {
    const id = createUUIDv7()
    const bytes = uuidv7ToBytes(id)
    const publicId = uuidv7ToBase62UUIDv7(id)

    expect(bytes.byteLength).toBe(16)
    expect(bytesToUUIDv7(bytes)).toBe(id)
    expect(bytesToBase62UUIDv7(bytes)).toBe(publicId)
    expect(isBase62UUIDv7(publicId)).toBe(true)
    expect(base62UUIDv7ToUUIDv7(publicId)).toBe(id)
  })

  it('rejects UUIDs that are not version 7', () => {
    expect(() => parseUUIDv7('00000000-0000-4000-8000-000000000000')).toThrow(TypeError)
  })

  it('rejects base62 values that do not decode to UUIDv7', () => {
    expect(() => base62UUIDv7ToUUIDv7('not-a-base62-id')).toThrow()
  })
})
