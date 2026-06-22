import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { base64urlnopad as base64url } from '@scure/base'

import { PRIVATE_VARS } from '../vars.private'

const SECRET_BOX_VERSION = 'v1'
const SECRET_BOX_KEY_BYTES = 32
const NONCE_BYTES = 12

export function encryptSecretValue(value: string): string {
  const key = readSecretBoxKey()
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    SECRET_BOX_VERSION,
    base64url.encode(nonce),
    base64url.encode(ciphertext),
    base64url.encode(tag)
  ].join('.')
}

export function decryptSecretValue(value: string): string {
  const key = readSecretBoxKey()

  const [version, nonceValue, ciphertextValue, tagValue, extra] = value.split('.')
  if (version !== SECRET_BOX_VERSION || !nonceValue || !ciphertextValue || !tagValue || extra) {
    throw new Error('encrypted secret value has an unsupported format')
  }

  const decipher = createDecipheriv('aes-256-gcm', key, base64url.decode(nonceValue))
  decipher.setAuthTag(Buffer.from(base64url.decode(tagValue)))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(base64url.decode(ciphertextValue))),
    decipher.final()
  ])

  return plaintext.toString('utf8')
}

function readSecretBoxKey(): Uint8Array {
  if (!PRIVATE_VARS.ENCRYPT_SECRET_KEY) {
    throw new Error('ENCRYPT_SECRET_KEY is required for secret storage')
  }

  let key: Uint8Array
  try {
    key = base64url.decode(PRIVATE_VARS.ENCRYPT_SECRET_KEY)
  } catch {
    throw new Error('ENCRYPT_SECRET_KEY must be a base64url-encoded 32-byte key')
  }

  if (key.byteLength !== SECRET_BOX_KEY_BYTES) {
    throw new Error('ENCRYPT_SECRET_KEY must be a base64url-encoded 32-byte key')
  }

  return key
}
