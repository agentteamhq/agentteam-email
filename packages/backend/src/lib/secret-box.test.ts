import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeProtectedHeader } from 'jose'

describe('secret-box encrypted value envelope', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  })

  it('encrypts and decrypts secret values as compact JWE', async () => {
    expect.hasAssertions()
    const { decryptSecretValue, encryptSecretValue } = await import('./secret-box')

    const encrypted = await encryptSecretValue('worker-webhook-secret')

    expect(encrypted).not.toContain('worker-webhook-secret')
    expect(decodeProtectedHeader(encrypted)).toStrictEqual({
      alg: 'dir',
      enc: 'A256GCM'
    })
    await expect(decryptSecretValue(encrypted)).resolves.toBe('worker-webhook-secret')
  })

  it('rejects the previous custom dot-joined AES-GCM envelope', async () => {
    expect.hasAssertions()
    const { decryptSecretValue } = await import('./secret-box')

    await expect(decryptSecretValue('v1.AQID.BAQF.BgcI')).rejects.toThrow()
  })
})
