import {
  backendHttpApp,
  isBackendHttpRequestPath
} from '@main/backend'
import {
  handleEmailVerifiedRedirect,
  handleStripeCheckoutRedirect,
  handleStripePortalRedirect,
  handleStripeRedirect
} from '@main/backend/routes/webapp'

export async function handleBackendPackageRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url)

  const frontendActionResponse = await handleFrontendActionRequest(request, url)

  if (frontendActionResponse) {
    return frontendActionResponse
  }

  if (isBackendHttpRequestPath(url.pathname)) {
    return backendHttpApp.handle(request)
  }

  return null
}

async function handleFrontendActionRequest(request: Request, url: URL): Promise<Response | null> {
  if (url.pathname === '/redirect/email-verified/' || url.pathname === '/redirect/email-verified') {
    if (request.method === 'GET') {
      return handleEmailVerifiedRedirect(request)
    }
  }

  if (url.pathname === '/redirect/stripe/' || url.pathname === '/redirect/stripe') {
    if (request.method === 'GET') {
      return handleStripeRedirect(request)
    }
  }

  if (url.pathname === '/redirect/stripe-checkout/' || url.pathname === '/redirect/stripe-checkout') {
    if (request.method === 'POST') {
      return handleStripeCheckoutRedirect(request)
    }
  }

  if (url.pathname === '/redirect/stripe-portal/' || url.pathname === '/redirect/stripe-portal') {
    if (request.method === 'POST') {
      return handleStripePortalRedirect(request)
    }
  }

  return null
}
