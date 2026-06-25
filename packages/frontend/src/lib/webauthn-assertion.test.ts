import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWebAuthnAssertionResponse } from './webauthn-assertion'

describe('createWebAuthnAssertionResponse', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('converts Agent Auth WebAuthn challenge options into a JSON assertion response', async () => {
    expect.hasAssertions()

    const get = vi.fn().mockResolvedValue({
      getClientExtensionResults: () => ({ appid: false }),
      id: 'credential-1',
      rawId: bytes(9, 10).buffer,
      response: {
        authenticatorData: bytes(11, 12).buffer,
        clientDataJSON: bytes(13, 14).buffer,
        signature: bytes(15, 16).buffer,
        userHandle: bytes(17, 18).buffer
      },
      type: 'public-key'
    })
    vi.stubGlobal('navigator', { credentials: { get } })

    const response = await createWebAuthnAssertionResponse({
      allowCredentials: [{ id: 'BAU', transports: ['internal'], type: 'public-key' }],
      challenge: 'AQID',
      rpId: 'mail.example.com',
      userVerification: 'required'
    })

    expect(get).toHaveBeenCalledOnce()
    const request = get.mock.calls[0][0] as CredentialRequestOptions
    expect(request.publicKey?.rpId).toBe('mail.example.com')
    expect(request.publicKey?.userVerification).toBe('required')
    expect(bufferSourceBytes(request.publicKey?.challenge)).toStrictEqual([1, 2, 3])
    expect(bufferSourceBytes(request.publicKey?.allowCredentials?.[0]?.id)).toStrictEqual([4, 5])
    expect(response).toStrictEqual({
      clientExtensionResults: { appid: false },
      id: 'credential-1',
      rawId: 'CQo',
      response: {
        authenticatorData: 'Cww',
        clientDataJSON: 'DQ4',
        signature: 'DxA',
        userHandle: 'ERI'
      },
      type: 'public-key'
    })
  })
})

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

function bufferSourceBytes(value: BufferSource | undefined): number[] {
  expect(value).toBeDefined()
  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value))
  }
  const view = value!
  return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
}
