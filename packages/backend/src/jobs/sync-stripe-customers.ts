import type { AuthUserRole, UserId } from '@main/db'
import debug from 'debug'

import type { Database } from '../db/db'
import { updateStripeCustomer } from '../payments/update-customer'

const log = debug('app:job:sync-stripe-customers')

const DEFAULT_PAGE_SIZE = 500

export type SyncStripeCustomersResult = {
  failed: number
  scanned: number
  updated: number
  verifiedEmails: number
}

export type SyncStripeCustomersOptions = {
  pageSize?: number
}

type UserSyncFilter = {
  _id?: { $gt: UserId }
  role: AuthUserRole
}

export async function syncStripeCustomers(
  db: Database,
  options: SyncStripeCustomersOptions = {}
): Promise<SyncStripeCustomersResult> {
  let cursor: UserId | null = null
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const result: SyncStripeCustomersResult = {
    failed: 0,
    scanned: 0,
    updated: 0,
    verifiedEmails: 0
  }

  while (true) {
    const filter: UserSyncFilter = { role: 'user' }
    if (cursor) {
      filter._id = { $gt: cursor }
    }

    const users = await db.models.user.find(filter).sort({ _id: 1 }).limit(pageSize).select({ _id: 1 }).exec()

    if (users.length === 0) {
      break
    }

    for (const user of users) {
      result.scanned += 1

      try {
        const stripeStatus = await updateStripeCustomer(user._id, { db })
        result.updated += 1

        if (stripeStatus.hasActiveSubscription) {
          const emailVerificationUpdate = await db.models.user
            .updateOne({ _id: user._id, emailVerified: { $ne: true } }, { $set: { emailVerified: true } })
            .exec()

          const modifiedCount = emailVerificationUpdate.modifiedCount ?? 0
          if (modifiedCount > 0) {
            result.verifiedEmails += modifiedCount
            log('marked email as verified for paying user %s', user._id)
          }
        }
      } catch (error) {
        result.failed += 1
        log('stripe customer sync failed for user %s: %O', user._id, error)
      }
    }

    const lastUser = users[users.length - 1]
    if (!lastUser) {
      break
    }
    cursor = lastUser._id

    if (users.length < pageSize) {
      break
    }
  }

  return result
}
