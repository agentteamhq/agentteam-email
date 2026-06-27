import { startAuthentication } from '@simplewebauthn/browser'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser'

export async function createWebAuthnAssertionResponse(
  options: PublicKeyCredentialRequestOptionsJSON
): Promise<AuthenticationResponseJSON> {
  if (typeof globalThis.navigator === 'undefined' || !globalThis.navigator.credentials) {
    throw new Error('Passkey verification is not available in this browser.')
  }

  return startAuthentication({ optionsJSON: options })
}
