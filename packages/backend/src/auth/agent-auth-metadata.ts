import { globals } from '../globals'
import { rewritePublicOAuthMetadata } from './oauth-metadata'

const AGENT_AUTH_CONFIGURATION_PATH = '/.well-known/agent-configuration'

export function isAgentAuthConfigurationRequestPath(pathname: string): boolean {
  return normalizeMetadataPath(pathname) === AGENT_AUTH_CONFIGURATION_PATH
}

export async function handleAgentAuthConfigurationRequest(request: Request): Promise<Response | null> {
  if (!isAgentAuthConfigurationRequestPath(new URL(request.url).pathname)) {
    return null
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      headers: { allow: 'GET, HEAD' },
      status: 405
    })
  }

  if (request.method === 'HEAD') {
    return new Response(null, {
      headers: metadataHeaders(),
      status: 200
    })
  }

  const { auth } = await globals()
  const metadata = await auth.api.getAgentConfiguration()

  return Response.json(rewritePublicOAuthMetadata(metadata), {
    headers: metadataHeaders()
  })
}

function metadataHeaders(): HeadersInit {
  return {
    'cache-control': 'public, max-age=300',
    'content-type': 'application/json'
  }
}

function normalizeMetadataPath(pathname: string): string {
  const normalizedPath = trimTrailingSlash(pathname)
  return normalizedPath.length > 0 ? normalizedPath : '/'
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
