import type { UserId } from '@main/db'
import { copyHeaders } from '@main/common'

import { globals } from '../globals'

import { updateStripeCustomer } from './update-customer'

export async function updateAfterStripeRedirect(rawHeaders: Headers) {
  const headers = copyHeaders(rawHeaders)

  const { auth } = await globals()

  const session = await auth.api.getSession({ headers })

  const userId = session?.user.id as UserId | undefined
  if (!userId) {
    return
  }

  await updateStripeCustomer(userId)
  return null
}
