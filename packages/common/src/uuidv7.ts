import { utils } from '@scure/base'
import {
  v7 as createUuidV7,
  parse as parseUuid,
  stringify as stringifyUuid,
  version as uuidVersion,
  validate as validateUuid
} from 'uuid'
import type { BytesCoder } from '@scure/base'

declare const UUIDv7Brand: unique symbol
export type UUIDv7 = string & { readonly [UUIDv7Brand]: true }
export { UUIDv7Brand }

declare const Base62UUIDv7Brand: unique symbol
export type Base62UUIDv7 = string & { readonly [Base62UUIDv7Brand]: true }
export { Base62UUIDv7Brand }

export const UUID_V7_BYTE_LENGTH = 16
export const BASE62_UUID_V7_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export const base62UUIDv7: BytesCoder = utils.chain(
  utils.radix(62),
  utils.alphabet(BASE62_UUID_V7_ALPHABET),
  utils.join('')
)

export function createUUIDv7(): UUIDv7 {
  return createUuidV7() as UUIDv7
}

export function createUUIDv7Bytes(): Uint8Array {
  return uuidv7ToBytes(createUUIDv7())
}

export function isUUIDv7(value: string): value is UUIDv7 {
  return validateUuid(value) && uuidVersion(value) === 7
}

export function assertUUIDv7(value: string): asserts value is UUIDv7 {
  if (!isUUIDv7(value)) {
    throw new TypeError(`Expected UUIDv7, received: ${value}`)
  }
}

export function parseUUIDv7(value: string): UUIDv7 {
  assertUUIDv7(value)
  return value
}

export function uuidv7ToBytes(value: UUIDv7 | string): Uint8Array {
  return parseUuid(parseUUIDv7(value))
}

export function bytesToUUIDv7(bytes: Uint8Array): UUIDv7 {
  assertUUIDByteLength(bytes)
  const uuid = stringifyUuid(bytes)
  assertUUIDv7(uuid)
  return uuid
}

export function uuidv7ToBase62UUIDv7(value: UUIDv7 | string): Base62UUIDv7 {
  return bytesToBase62UUIDv7(uuidv7ToBytes(value))
}

export function bytesToBase62UUIDv7(bytes: Uint8Array): Base62UUIDv7 {
  assertUUIDByteLength(bytes)
  return base62UUIDv7.encode(bytes) as Base62UUIDv7
}

export function base62UUIDv7ToBytes(value: Base62UUIDv7 | string): Uint8Array {
  const bytes = base62UUIDv7.decode(value)
  assertUUIDByteLength(bytes)
  bytesToUUIDv7(bytes)
  return bytes
}

export function base62UUIDv7ToUUIDv7(value: Base62UUIDv7 | string): UUIDv7 {
  return bytesToUUIDv7(base62UUIDv7ToBytes(value))
}

export function parseBase62UUIDv7(value: string): Base62UUIDv7 {
  assertBase62UUIDv7(value)
  return value
}

export function isBase62UUIDv7(value: string): value is Base62UUIDv7 {
  try {
    base62UUIDv7ToUUIDv7(value)
    return true
  } catch {
    return false
  }
}

export function assertBase62UUIDv7(value: string): asserts value is Base62UUIDv7 {
  if (!isBase62UUIDv7(value)) {
    throw new TypeError(`Expected base62 UUIDv7, received: ${value}`)
  }
}

function assertUUIDByteLength(bytes: Uint8Array): void {
  if (bytes.byteLength !== UUID_V7_BYTE_LENGTH) {
    throw new RangeError(`Expected ${UUID_V7_BYTE_LENGTH} UUID bytes, received ${bytes.byteLength}`)
  }
}
