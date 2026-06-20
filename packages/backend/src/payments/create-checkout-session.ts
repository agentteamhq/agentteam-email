import type { UserId } from '@main/db'
import { copyHeaders } from '@main/common'
import debug from 'debug'

import { globals } from '../globals'
import { STRINGS } from '../strings'
import { PUBLIC_VARS } from '../vars.public'

import { getStripeCustomerId } from './get-customer-id'
import { stripeApi } from './stripe-api'

const log = debug('app:payments')

export async function createStripeCheckoutSession(rawHeaders: Headers) {
  const headers = copyHeaders(rawHeaders)

  const { auth } = await globals()

  const session = await auth.api.getSession({ headers })

  const userId = session?.user.id as UserId | undefined
  if (!userId) {
    return
  }

  const stripeCustomerId = await getStripeCustomerId(userId)

  if (!stripeCustomerId) {
    return null
  }

  const pricesRes = await stripeApi.searchPrices(
    `active:'true' AND lookup_key:"${STRINGS.EARLY_SUPPORTER_LOOKUP_KEY}"`
  )

  if (!pricesRes.response.ok) {
    log('Unable to find price', pricesRes.error)
    return null
  }

  const price = pricesRes.data?.data[0].id

  if (!price) {
    log('Unable to find lookup_key price ', pricesRes.data)
    return null
  }

  const res = await stripeApi.createCheckoutSession({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [
      {
        price: price,
        quantity: 1
      }
    ],
    success_url: `${PUBLIC_VARS.PUBLIC_HOSTNAME}/redirect/stripe/`
  })

  if (res.response.ok && res.data?.url) {
    return res.data.url
  } else {
    log('stripe create portal link error', res.error)
  }
  return null
}
