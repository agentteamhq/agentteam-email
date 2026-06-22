import debug from 'debug'

import { globals } from '../globals'
import { stripeApi } from './stripe-api'
import type { Database } from '../db/db'
import type { UserId } from '@main/db'

const log = debug('app:payments')

export async function updateStripeCustomer(userId: UserId, options: { db?: Database } = {}) {
  const db = options.db ?? (await globals()).db
  const user = await db.models.user.findById(userId).exec()

  if (!user) {
    throw new Error('Unable to update customer: user not found')
  }

  if (user.role !== 'user') {
    throw new Error('Unable to update non user role customer')
  }

  if (!user.stripeCustomerId) {
    throw new Error('Unable to update customer: stripeCustomerId not found')
  }

  const res = await stripeApi.listCustomerSubscriptions(user.stripeCustomerId)

  if (!res.response.ok) {
    log('stripe list subscriptions error', res.error)
    return {
      hasActiveSubscription: false,
      subscriptionId: null,
      subscriptionStatus: null,
      priceLookupKey: null
    }
  }

  const subscriptions = res.data?.data ?? []
  const activeSubscription = subscriptions.find((subscription) => subscription.status === 'active')

  const lastTouchedSubscription =
    activeSubscription ??
    subscriptions.reduce<(typeof subscriptions)[number] | null>((latest, current) => {
      if (!latest) {
        return current
      }
      const latestActivityTimestamps = [
        latest.start_date,
        latest.created,
        latest.ended_at,
        latest.canceled_at,
        latest.trial_start,
        latest.trial_end,
        latest.cancel_at
      ].filter((value): value is number => typeof value === 'number')
      const currentActivityTimestamps = [
        current.start_date,
        current.created,
        current.ended_at,
        current.canceled_at,
        current.trial_start,
        current.trial_end,
        current.cancel_at
      ].filter((value): value is number => typeof value === 'number')

      const latestActivity =
        latestActivityTimestamps.length > 0 ? Math.max(...latestActivityTimestamps) : null
      const currentActivity =
        currentActivityTimestamps.length > 0 ? Math.max(...currentActivityTimestamps) : null
      if (currentActivity && (!latestActivity || currentActivity > latestActivity)) {
        return current
      }
      return latest
    }, null)

  const hasActiveSubscription = Boolean(activeSubscription)
  const subscriptionId = hasActiveSubscription ? (activeSubscription?.id ?? null) : null
  const priceLookupKey = activeSubscription?.items?.data?.[0]?.price?.lookup_key ?? null
  const subscriptionStatus = lastTouchedSubscription?.status ?? null

  log('stripe subscription lookup', {
    stripeCustomerId: user.stripeCustomerId,
    hasActiveSubscription,
    subscriptionId,
    priceLookupKey,
    subscriptionStatus
  })

  const stripeLastUpdated = new Date()
  const updatedUser = await db.models.user
    .findByIdAndUpdate(
      user._id,
      {
        $set: {
          stripeSubscriptionId: subscriptionId,
          stripePriceLookupKey: priceLookupKey,
          stripeSubscriptionStatus: subscriptionStatus,
          stripeLastUpdated
        }
      },
      { new: true }
    )
    .exec()

  return {
    hasActiveSubscription,
    subscriptionId,
    subscriptionStatus,
    stripeLastUpdated: updatedUser?.stripeLastUpdated ?? stripeLastUpdated,
    priceLookupKey
  }
}
