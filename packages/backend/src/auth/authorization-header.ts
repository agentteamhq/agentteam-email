import { parse as parseAuthorizationHeader } from '@mitmaro/http-authorization-header'
import { decodeJwt, decodeProtectedHeader } from 'jose'

export type BearerAuthorization =
  | {
      status: 'absent'
    }
  | {
      status: 'malformed'
    }
  | {
      status: 'present'
      token: string
    }

export function parseBearerAuthorization(headers: Headers): BearerAuthorization {
  const authorization = headers.get('authorization')
  if (!authorization) {
    return { status: 'absent' }
  }

  let parsed: ReturnType<typeof parseAuthorizationHeader>
  try {
    parsed = parseAuthorizationHeader(authorization)
  } catch {
    return { status: 'malformed' }
  }

  if (parsed.scheme.toLowerCase() !== 'bearer') {
    return { status: 'absent' }
  }

  if (parsed.values !== null || !parsed.value) {
    return { status: 'malformed' }
  }

  return {
    status: 'present',
    token: parsed.value
  }
}

export function hasBearerCredential(headers: Headers): boolean {
  return parseBearerAuthorization(headers).status === 'present'
}

export function hasBearerJwt(headers: Headers): boolean {
  const bearer = parseBearerAuthorization(headers)
  return bearer.status === 'present' && isDecodableJwt(bearer.token)
}

function isDecodableJwt(token: string): boolean {
  try {
    const payload = decodeJwt(token)
    const protectedHeader = decodeProtectedHeader(token)
    return (
      payload !== null &&
      typeof payload === 'object' &&
      protectedHeader !== null &&
      typeof protectedHeader === 'object'
    )
  } catch {
    return false
  }
}
