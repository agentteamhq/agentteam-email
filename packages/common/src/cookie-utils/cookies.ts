import { parseCookie, serializeCookie } from 'cookie-es'
import { addDays, addMinutes } from 'date-fns'
import type { JsonValue } from 'type-fest'

const FLASH_COOKIE_NAME = '_flash'
const FORM_COOKIE_NAME = '_form'
const LAST_USED_AUTH_COOKIE_NAME = '_last_used_auth'

export type LastUsedAuthMethod = 'email' | 'google' | 'linkedin' | null

export type FormCookie = {
  [key: string]: JsonValue
}

export interface ReadFlashCookieResult {
  flash: string | null
  setCookieHeaders: Array<string>
}

export function deleteAllCookies(): Array<string> {
  return [deleteFlashCookie(), deleteFormCookie()]
}

export function setLastUsedAuthCookie(state: LastUsedAuthMethod, secure: boolean): string | null {
  if (!state) {
    return null
  }

  const maxAge = 60 * 60 * 24 * 180
  const expires = addDays(new Date(), 180)

  return serializeCookie(LAST_USED_AUTH_COOKIE_NAME, state, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge,
    expires,
    path: '/'
  })
}

export function setFlashCookie(state: string, secure: boolean): string {
  const maxAge = 60 * 5
  const expires = addMinutes(new Date(), 5)

  return serializeCookie(FLASH_COOKIE_NAME, state, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge,
    expires,
    path: '/'
  })
}

export function deleteFlashCookie(): string {
  return deleteCookie(FLASH_COOKIE_NAME)
}

export function readFlashCookie(headers: Headers): ReadFlashCookieResult {
  const cookies = parseRequestCookies(headers)
  const str = cookies[FLASH_COOKIE_NAME]

  return {
    flash: typeof str === 'string' ? str : null,
    setCookieHeaders: [deleteFlashCookie()]
  }
}

export function setFormCookie(state: FormCookie, secure: boolean): string {
  const maxAge = 60 * 5
  const expires = addMinutes(new Date(), 5)

  return serializeCookie(FORM_COOKIE_NAME, JSON.stringify(state), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge,
    expires,
    path: '/'
  })
}

export function deleteFormCookie(): string {
  return deleteCookie(FORM_COOKIE_NAME)
}

export function deleteLastUsedAuthCookie(): string {
  return deleteCookie(LAST_USED_AUTH_COOKIE_NAME)
}

export function getFormCookie(headers: Headers): FormCookie | null {
  const cookies = parseRequestCookies(headers)
  const str = cookies[FORM_COOKIE_NAME]

  if (typeof str === 'string' && str) {
    try {
      return JSON.parse(str) as FormCookie
    } catch {
      return null
    }
  }

  return null
}

export function getLastUsedAuthCookie(headers: Headers): LastUsedAuthMethod {
  const cookies = parseRequestCookies(headers)
  const str = cookies[LAST_USED_AUTH_COOKIE_NAME]

  if (typeof str === 'string' && str) {
    return str as LastUsedAuthMethod
  }

  return null
}

export function appendSetCookieHeaders(headers: Headers, setCookieHeaders: ReadonlyArray<string>): void {
  for (const setCookieHeader of setCookieHeaders) {
    headers.append('set-cookie', setCookieHeader)
  }
}

export function routeSetCookieHeaders(
  setCookieHeaders: ReadonlyArray<string> | undefined
): Record<string, string> | undefined {
  if (!setCookieHeaders || setCookieHeaders.length === 0) {
    return undefined
  }

  return {
    'set-cookie': setCookieHeaders.join(', ')
  }
}

function parseRequestCookies(headers: Headers): Record<string, string | undefined> {
  return parseCookie(headers.get('cookie') ?? '')
}

function deleteCookie(name: string): string {
  return serializeCookie(name, '', {
    maxAge: 0,
    expires: new Date(0),
    path: '/'
  })
}
