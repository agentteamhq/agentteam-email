import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { PRIVATE_VARS } from '../vars.private'

export const CONTROL_TO_WEB_TOKEN_HEADER = 'x-agent-mail-control-web-token'

export function hasValidControlToWebToken(request: Request): boolean {
  const expected = PRIVATE_VARS.AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN
  const actual = request.headers.get(CONTROL_TO_WEB_TOKEN_HEADER)
  return Boolean(expected && actual && constantTimeStringEqual(actual, expected))
}

function constantTimeStringEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }
  return timingSafeEqual(actualBuffer, expectedBuffer)
}
