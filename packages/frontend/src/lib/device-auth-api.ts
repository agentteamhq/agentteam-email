export type DeviceVerificationStatus = 'pending' | 'approved' | 'denied'

export interface DeviceVerifyResult {
  status: DeviceVerificationStatus
  user_code: string
}

export interface DeviceActionResult {
  success: boolean
}

export async function verifyDeviceUserCode(userCode: string): Promise<DeviceVerifyResult> {
  const params = new URLSearchParams()
  params.set('user_code', userCode)
  return requestBetterAuthDeviceJSON<DeviceVerifyResult>(`/device?${params.toString()}`, {
    method: 'GET'
  })
}

export async function approveDeviceUserCode(userCode: string): Promise<DeviceActionResult> {
  return requestBetterAuthDeviceJSON<DeviceActionResult>('/device/approve', {
    body: JSON.stringify({ userCode }),
    method: 'POST'
  })
}

export async function denyDeviceUserCode(userCode: string): Promise<DeviceActionResult> {
  return requestBetterAuthDeviceJSON<DeviceActionResult>('/device/deny', {
    body: JSON.stringify({ userCode }),
    method: 'POST'
  })
}

export function normalizeDeviceUserCode(value: string): string {
  return value.replaceAll('-', '').trim().toUpperCase()
}

export function formatDeviceUserCode(value: string): string {
  const normalized = normalizeDeviceUserCode(value)
  if (normalized.length <= 4) {
    return normalized
  }
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`
}

async function requestBetterAuthDeviceJSON<T>(
  path: string,
  init: Omit<RequestInit, 'credentials' | 'headers'> & { headers?: HeadersInit }
): Promise<T> {
  const { headers: initHeaders, ...requestInit } = init
  const headers = new Headers(initHeaders)
  headers.set('Accept', 'application/json')
  if (init.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`/rpc/auth/api${path}`, {
    ...requestInit,
    credentials: 'include',
    headers
  })
  const text = await response.text()
  const data = parseJSONValue(text)

  if (!response.ok) {
    throw new Error(readBetterAuthErrorMessage(data, response.status))
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Device authorization returned an invalid response.')
  }

  return data as T
}

function parseJSONValue(text: string): unknown {
  if (text.trim() === '') {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function readBetterAuthErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    for (const key of ['error_description', 'message', 'error']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim() !== '') {
        return value
      }
    }
  }

  if (status === 401) {
    return 'Sign in again to authorize this device.'
  }

  return 'Device authorization failed.'
}
