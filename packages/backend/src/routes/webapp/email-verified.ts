import { appendSetCookieHeaders, setFlashCookie } from '@main/common'

import { PUBLIC_VARS } from '../../vars.public'

export async function handleEmailVerifiedRedirect(_request: Request): Promise<Response> {
  const headers = createNoCacheRedirectHeaders('/dashboard/')
  appendSetCookieHeaders(headers, [
    setFlashCookie('Your email has been verified.', PUBLIC_VARS.PUBLIC_HTTPS_PROTO)
  ])
  return new Response(null, {
    status: 302,
    headers
  })
}

function createNoCacheRedirectHeaders(location: string): Headers {
  return new Headers({
    Location: location,
    'Cache-Control': 'no-store'
  })
}
