import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWebAuthnAssertionResponse } from './webauthn-assertion'

const webauthnAssertionTestState = vi.hoisted(() => ({
  startAuthentication: vi.fn()
}))

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: webauthnAssertionTestState.startAuthentication
}))

describe('createWebAuthnAssertionResponse', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    webauthnAssertionTestState.startAuthentication.mockReset()
  })

  it('uses the Better Auth-compatible SimpleWebAuthn browser assertion helper', async () => {
    expect.hasAssertions()
    vi.stubGlobal('navigator', { credentials: { get: vi.fn() } })
    webauthnAssertionTestState.startAuthentication.mockResolvedValue({
      clientExtensionResults: {},
      id: 'credential-1',
      rawId: 'raw-id',
      response: {
        authenticatorData: 'authenticator-data',
        clientDataJSON: 'client-data-json',
        signature: 'signature',
        userHandle: null
      },
      type: 'public-key'
    })

    const options = {
      allowCredentials: [{ id: 'BAU', transports: ['internal' as const], type: 'public-key' as const }],
      challenge: 'AQID',
      rpId: 'mail.example.com',
      userVerification: 'required' as const
    }

    await expect(createWebAuthnAssertionResponse(options)).resolves.toStrictEqual({
      clientExtensionResults: {},
      id: 'credential-1',
      rawId: 'raw-id',
      response: {
        authenticatorData: 'authenticator-data',
        clientDataJSON: 'client-data-json',
        signature: 'signature',
        userHandle: null
      },
      type: 'public-key'
    })

    expect(webauthnAssertionTestState.startAuthentication).toHaveBeenCalledWith({
      optionsJSON: options
    })
  })

  it('fails before starting a passkey ceremony when WebAuthn is unavailable', async () => {
    expect.hasAssertions()
    vi.stubGlobal('navigator', {})

    await expect(
      createWebAuthnAssertionResponse({
        challenge: 'AQID',
        rpId: 'mail.example.com',
        userVerification: 'required'
      })
    ).rejects.toThrow('Passkey verification is not available in this browser.')
    expect(webauthnAssertionTestState.startAuthentication).not.toHaveBeenCalled()
  })
})
