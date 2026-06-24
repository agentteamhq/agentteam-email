export async function createWebAuthnAssertionResponse(
  options: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (typeof globalThis.navigator === 'undefined' || !globalThis.navigator.credentials) {
    throw new Error('Passkey verification is not available in this browser.')
  }

  const publicKey = toPublicKeyCredentialRequestOptions(options)
  const credential = await globalThis.navigator.credentials.get({ publicKey })
  if (!credential || !isPublicKeyCredential(credential)) {
    throw new Error('Passkey verification was cancelled.')
  }

  return serializePublicKeyCredential(credential)
}

function toPublicKeyCredentialRequestOptions(
  options: Record<string, unknown>
): PublicKeyCredentialRequestOptions {
  const challenge = readRequiredBase64Url(options.challenge, 'Passkey challenge is missing.')
  const allowCredentials = Array.isArray(options.allowCredentials)
    ? options.allowCredentials.map(toPublicKeyCredentialDescriptor)
    : undefined
  return {
    allowCredentials,
    challenge: base64UrlToArrayBuffer(challenge),
    ...(typeof options.rpId === 'string' && options.rpId.trim() ? { rpId: options.rpId } : {}),
    ...(typeof options.timeout === 'number' ? { timeout: options.timeout } : {}),
    userVerification: readUserVerificationRequirement(options.userVerification)
  }
}

function toPublicKeyCredentialDescriptor(value: unknown): PublicKeyCredentialDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Passkey credential descriptor is invalid.')
  }
  const id = readRequiredBase64Url(
    'id' in value ? value.id : null,
    'Passkey credential descriptor is missing its id.'
  )
  const transports = readAuthenticatorTransports('transports' in value ? value.transports : null)
  return {
    id: base64UrlToArrayBuffer(id),
    transports,
    type: 'public-key'
  }
}

function serializePublicKeyCredential(credential: PublicKeyCredential): Record<string, unknown> {
  if (!isAuthenticatorAssertionResponse(credential.response)) {
    throw new Error('Passkey assertion response is invalid.')
  }

  return {
    clientExtensionResults: credential.getClientExtensionResults(),
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    response: {
      authenticatorData: arrayBufferToBase64Url(credential.response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(credential.response.clientDataJSON),
      signature: arrayBufferToBase64Url(credential.response.signature),
      userHandle: credential.response.userHandle
        ? arrayBufferToBase64Url(credential.response.userHandle)
        : null
    },
    type: credential.type
  }
}

function readRequiredBase64Url(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message)
  }
  return value
}

function readUserVerificationRequirement(value: unknown): UserVerificationRequirement {
  return value === 'discouraged' || value === 'preferred' || value === 'required' ? value : 'required'
}

function readAuthenticatorTransports(value: unknown): AuthenticatorTransport[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const transports = value.filter((transport): transport is AuthenticatorTransport =>
    isAuthenticatorTransport(transport)
  )
  return transports.length ? transports : undefined
}

function isAuthenticatorTransport(value: unknown): value is AuthenticatorTransport {
  return (
    value === 'ble' ||
    value === 'hybrid' ||
    value === 'internal' ||
    value === 'nfc' ||
    value === 'smart-card' ||
    value === 'usb'
  )
}

function isPublicKeyCredential(value: Credential): value is PublicKeyCredential {
  return value.type === 'public-key' && 'rawId' in value && 'response' in value
}

function isAuthenticatorAssertionResponse(
  value: AuthenticatorResponse
): value is AuthenticatorAssertionResponse {
  return 'authenticatorData' in value && 'signature' in value
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4))
  const binary = globalThis.atob(`${base64}${padding}`)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}
