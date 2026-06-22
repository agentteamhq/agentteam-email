import { copyHeaders } from '@main/common'
import { formatISO } from 'date-fns'
import debug from 'debug'
import startCase from 'lodash.startcase'

import { globals } from '../globals'
import type { UserId } from '@main/db'

const log = debug('app:customer-status')

export async function getCustomerStripeStatus(rawHeaders: Headers) {
  const headers = copyHeaders(rawHeaders)

  const { auth, db } = await globals()

  const session = await auth.api.getSession({ headers })

  const userId = session?.user.id as UserId | undefined
  if (!userId) {
    log('Invalid session')
    return null
  }

  const user = await db.models.user.findById(userId).exec()

  if (!user) {
    log('User not found!', userId)
    return null
  }

  const { stripeSubscriptionId, stripePriceLookupKey, stripeSubscriptionStatus, stripeLastUpdated } = user

  const lastUpdatedIso8604 = stripeLastUpdated ? formatISO(stripeLastUpdated) : null
  return {
    stripeSubscriptionId,
    stripeSubscriptionStatus,
    stripePriceLookupKey,
    stripeLastUpdatedISO8604: lastUpdatedIso8604,
    label: {
      plan: stripePriceLookupKey ? startCase(stripePriceLookupKey) : 'None',
      status: stripeSubscriptionStatus ? startCase(stripeSubscriptionStatus) : 'Inactive'
    }
  }
}
