import { copyHeaders } from '@main/common'

import { globals } from '../globals'
import type { UserId } from '@main/db'

export async function getUser(rawHeaders: Headers) {
  const headers = copyHeaders(rawHeaders)
  const { db, auth } = await globals()
  const session = await auth.api.getSession({
    headers
  })

  if (session?.user) {
    const { id, ...rest } = session.user
    return {
      id: id as UserId,
      ...rest
    }
  }
  return null
}
