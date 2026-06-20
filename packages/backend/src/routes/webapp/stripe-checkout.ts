import { appendSetCookieHeaders, setFlashCookie } from '@main/common'

import { createStripeCheckoutSession } from '../../payments/create-checkout-session'
import { PUBLIC_VARS } from '../../vars.public'

export async function handleStripeCheckoutRedirect(request: Request): Promise<Response> {
  const redirectLink = await createStripeCheckoutSession(request.headers)

  if (!redirectLink) {
    const headers = createNoCacheRedirectHeaders('/settings/billing/')
    appendSetCookieHeaders(headers, [
      setFlashCookie(
        'Unable to generate Stripe Portal link. Please try again.',
        PUBLIC_VARS.PUBLIC_HTTPS_PROTO
      )
    ])

    return new Response(null, {
      status: 303,
      headers
    })
  }

  return new Response(null, {
    status: 303,
    headers: createNoCacheRedirectHeaders(redirectLink)
  })
}

function createNoCacheRedirectHeaders(location: string): Headers {
  return new Headers({
    Location: location,
    'Cache-Control': 'no-store'
  })
}
