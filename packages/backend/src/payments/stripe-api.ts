import { PRIVATE_VARS } from '../vars.private'

type StripeResult<T> = {
  response: Response
  data?: T
  error?: unknown
}

function appendFormValue(params: URLSearchParams, key: string, value: unknown) {
  if (value === null || value === undefined) {
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendFormValue(params, `${key}[${index}]`, item)
    })
    return
  }
  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendFormValue(params, `${key}[${childKey}]`, childValue)
    }
    return
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    params.append(key, String(value))
  }
}

function toFormBody(body: Record<string, unknown>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    appendFormValue(params, key, value)
  }
  return params
}

async function stripeRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  options?: { query?: Record<string, string>; body?: Record<string, unknown> }
): Promise<StripeResult<T>> {
  const url = new URL(`https://api.stripe.com${path}`)
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${PRIVATE_VARS.STRIPE_SECRET_KEY}`,
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
    },
    body: method === 'POST' ? toFormBody(options?.body ?? {}) : undefined
  })

  const data = (await response.json().catch(() => undefined)) as T | undefined
  return response.ok ? { response, data } : { response, data, error: data }
}

export type StripeCustomer = {
  id: string
}

export type StripePriceSearch = {
  data: Array<{ id: string }>
}

export type StripeCheckoutSession = {
  url?: string
}

export type StripePortalSession = {
  url?: string
}

export type StripeSubscription = {
  id: string
  status: string
  start_date?: number
  created?: number
  ended_at?: number | null
  canceled_at?: number | null
  trial_start?: number | null
  trial_end?: number | null
  cancel_at?: number | null
  items?: {
    data?: Array<{
      price?: {
        lookup_key?: string | null
      }
    }>
  }
}

export type StripeSubscriptionList = {
  data: StripeSubscription[]
}

export const stripeApi = {
  createCustomer(body: Record<string, unknown>) {
    return stripeRequest<StripeCustomer>('POST', '/v1/customers', { body })
  },
  searchPrices(query: string) {
    return stripeRequest<StripePriceSearch>('GET', '/v1/prices/search', { query: { query } })
  },
  createCheckoutSession(body: Record<string, unknown>) {
    return stripeRequest<StripeCheckoutSession>('POST', '/v1/checkout/sessions', { body })
  },
  createPortalSession(body: Record<string, unknown>) {
    return stripeRequest<StripePortalSession>('POST', '/v1/billing_portal/sessions', { body })
  },
  listCustomerSubscriptions(customer: string) {
    return stripeRequest<StripeSubscriptionList>('GET', `/v1/customers/${customer}/subscriptions`)
  }
}
