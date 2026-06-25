import {
  backendRpcApp,
  handleAgentAuthConfigurationRequest,
  handleAtEmailMetadataRequest,
  handleCloudflareOAuthCallbackRequest,
  handleOAuthMetadataRequest,
  isAgentAuthConfigurationRequestPath,
  isAtEmailMetadataRequestPath,
  isCloudflareOAuthCallbackRequestPath,
  isOAuthMetadataRequestPath
} from '@main/backend'
import {
  handleEmailVerifiedRedirect,
  handleStripeCheckoutRedirect,
  handleStripePortalRedirect,
  handleStripeRedirect
} from '@main/backend/routes/webapp'

function isRoutePath(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`)
}

export async function handleBackendPackageRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url)

  const frontendActionResponse = await handleFrontendActionRequest(request, url)

  if (frontendActionResponse) {
    return frontendActionResponse
  }

  if (isOAuthMetadataRequestPath(url.pathname)) {
    return handleOAuthMetadataRequest(request)
  }

  if (isAgentAuthConfigurationRequestPath(url.pathname)) {
    return handleAgentAuthConfigurationRequest(request)
  }

  if (isAtEmailMetadataRequestPath(url.pathname)) {
    return handleAtEmailMetadataRequest(request)
  }

  if (isCloudflareOAuthCallbackRequestPath(url.pathname)) {
    return handleCloudflareOAuthCallbackRequest(request)
  }

  if (isRoutePath(url.pathname, '/api/auth')) {
    return handlePublicAuthBridgeRequest(request, url)
  }

  if (isRoutePath(url.pathname, '/rpc')) {
    return backendRpcApp.handle(request)
  }

  if (url.pathname === '/health') {
    return handleHealthRequest(request)
  }

  return null
}

function handlePublicAuthBridgeRequest(request: Request, url: URL): Promise<Response> {
  const bridgedUrl = new URL(request.url)
  bridgedUrl.pathname = `/rpc/auth/api${url.pathname.slice('/api/auth'.length)}`
  return backendRpcApp.handle(new Request(bridgedUrl, request))
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

async function handleHealthRequest(request: Request): Promise<Response> {
  const healthUrl = new URL('/rpc/health', request.url)
  const response = await backendRpcApp.handle(
    new Request(healthUrl, {
      headers: request.headers,
      method: 'GET'
    })
  )

  if (!response.ok) {
    return response
  }

  const healthStatus = (await response.json()) as { message?: string }
  const body = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Health Check</title></head><body><h1>${healthStatus.message ?? 'Backend is healthy'}</h1></body></html>`

  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8'
    },
    status: response.status
  })
}
