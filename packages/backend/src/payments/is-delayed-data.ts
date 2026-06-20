import type { UserId } from '@main/db'

import type { GlobalAuthSessionUser } from '../auth/auth'
import { globals } from '../globals'
import { isPayingSubscriber } from '../user/is-paying-subscriber'

export const MESSAGE_DELAY_MS = 6 * 60 * 1000

export async function isDelayedData(user?: GlobalAuthSessionUser | null) {
  const { db } = await globals()
  if (user) {
    const userLookup = await db.models.user
      .findById(user.id as UserId)
      .select({
        role: true,
        freeFullAccessAccount: true,
        stripeSubscriptionId: true
      })
      .exec()
    if (userLookup?.role === 'admin') {
      return false
    }
    if (userLookup?.freeFullAccessAccount === true) {
      return false
    }
    if (userLookup && isPayingSubscriber(userLookup)) {
      return false
    }
    return true
  } else {
    return true
  }
}

// export async function isDelayedDateSession()
