import type { UserId } from '@main/db'
import { copyHeaders } from '@main/common'

import { globals } from '../globals'

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
