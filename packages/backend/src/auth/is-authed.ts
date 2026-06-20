import { copyHeaders } from '@main/common'

import { globals } from '../globals'

export async function isAuthed(rawHeaders: Headers) {
  const headers = copyHeaders(rawHeaders)
  const { auth } = await globals()
  const session = await auth.api.getSession({
    headers
  })

  if (session?.user) {
    return true
  }
  return false
}
