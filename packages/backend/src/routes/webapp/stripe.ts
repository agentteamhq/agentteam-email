import { updateAfterStripeRedirect } from '../../payments/update-after-stripe-redirect'

export async function handleStripeRedirect(request: Request): Promise<Response> {
  await updateAfterStripeRedirect(request.headers)

  return new Response(null, {
    status: 307,
    headers: createNoCacheRedirectHeaders('/settings/billing/')
  })
}

function createNoCacheRedirectHeaders(location: string): Headers {
  return new Headers({
    Location: location,
    'Cache-Control': 'no-store'
  })
}
