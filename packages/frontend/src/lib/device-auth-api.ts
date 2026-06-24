import { authReactClient } from './auth-react-client'

export type DeviceVerificationStatus = 'pending' | 'approved' | 'denied'

export interface DeviceVerifyResult {
  status: DeviceVerificationStatus
  user_code: string
}

export interface DeviceActionResult {
  success: boolean
}

export async function verifyDeviceUserCode(userCode: string): Promise<DeviceVerifyResult> {
  const response = await authReactClient.device({ query: { user_code: userCode } })
  const data = readAuthClientResponse(response, 'Device authorization returned an invalid response.')

  return {
    status: readDeviceVerificationStatus(data.status),
    user_code: data.user_code
  }
}

export async function approveDeviceUserCode(userCode: string): Promise<DeviceActionResult> {
  return readAuthClientResponse(
    await authReactClient.device.approve({ userCode }),
    'Device authorization failed.'
  )
}

export async function denyDeviceUserCode(userCode: string): Promise<DeviceActionResult> {
  return readAuthClientResponse(
    await authReactClient.device.deny({ userCode }),
    'Device authorization failed.'
  )
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

type AuthClientResponse<TData> =
  | {
      data: TData
      error: null
    }
  | {
      data: null
      error: AuthClientError
    }

interface AuthClientError {
  error?: string
  error_description?: string
  message?: string
  status: number
}

function readAuthClientResponse<TData>(
  response: AuthClientResponse<TData>,
  invalidResponseMessage: string
): NonNullable<TData> {
  if (response.error) {
    throw new Error(readBetterAuthErrorMessage(response.error))
  }

  if (response.data == null) {
    throw new Error(invalidResponseMessage)
  }

  return response.data
}

function readDeviceVerificationStatus(value: string): DeviceVerificationStatus {
  if (value === 'pending' || value === 'approved' || value === 'denied') {
    return value
  }

  throw new Error('Device authorization returned an invalid response.')
}

function readBetterAuthErrorMessage(error: AuthClientError): string {
  for (const value of [error.error_description, error.message, error.error]) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value
    }
  }

  if (error.status === 401) {
    return 'Sign in again to authorize this device.'
  }

  return 'Device authorization failed.'
}
