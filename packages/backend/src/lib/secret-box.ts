import { base64urlnopad as base64url } from '@scure/base'
import { CompactEncrypt, compactDecrypt } from 'jose'

import { PRIVATE_VARS } from '../vars.private'

const SECRET_BOX_KEY_BYTES = 32
const SECRET_BOX_JWE_ALG = 'dir'
const SECRET_BOX_JWE_ENC = 'A256GCM'

export async function encryptSecretValue(value: string): Promise<string> {
  const key = readSecretBoxKey()
  return new CompactEncrypt(new TextEncoder().encode(value))
    .setProtectedHeader({
      alg: SECRET_BOX_JWE_ALG,
      enc: SECRET_BOX_JWE_ENC
    })
    .encrypt(key)
}

export async function decryptSecretValue(value: string): Promise<string> {
  const key = readSecretBoxKey()
  const { plaintext, protectedHeader } = await compactDecrypt(value, key, {
    contentEncryptionAlgorithms: [SECRET_BOX_JWE_ENC],
    keyManagementAlgorithms: [SECRET_BOX_JWE_ALG],
    maxDecompressedLength: 0
  })

  if (
    protectedHeader.alg !== SECRET_BOX_JWE_ALG ||
    protectedHeader.enc !== SECRET_BOX_JWE_ENC ||
    protectedHeader.zip !== undefined
  ) {
    throw new Error('encrypted secret value has an unsupported format')
  }

  return new TextDecoder().decode(plaintext)
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
