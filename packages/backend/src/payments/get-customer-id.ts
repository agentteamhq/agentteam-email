import { normalizeMongooseUUIDv7, publicIdFromUUIDv7, type UserId } from '@main/db'
import debug from 'debug'

import { globals } from '../globals'
import { stripeApi } from './stripe-api'

const log = debug('app:payments')

export async function getStripeCustomerId(userId: UserId) {
  const { db } = await globals()

  const user = await db.models.user.findById(userId).exec()

  if (user?.stripeCustomerId) {
    return user.stripeCustomerId
  }

  if (user && !user.stripeCustomerId && user.email) {
    const res = await stripeApi.createCustomer({
      name: user.name ?? '',
      email: user.email,
      metadata: {
        uid: normalizeMongooseUUIDv7(user._id),
        pid: publicIdFromUUIDv7(user._id)
      }
    })

    if (res.response.ok) {
      const stripeCustomerId = res.data?.id
      if (stripeCustomerId) {
        await db.models.user.updateOne({ _id: user._id }, { $set: { stripeCustomerId } }).exec()
      }
      return stripeCustomerId
    } else {
      log('stripe create customer error', res.error)
    }
  }
  return null
}
