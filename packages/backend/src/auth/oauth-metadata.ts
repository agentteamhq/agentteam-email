import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client'
import type { Auth } from 'better-auth/types'

import { globals } from '../globals'
import { PUBLIC_VARS } from '../vars.public'
import {
  AGENTTEAM_API_OAUTH_AUDIENCE,
  AGENTTEAM_API_OAUTH_SCOPES,
  AGENTTEAM_OAUTH_PUBLIC_ROUTE
} from './oauth-provider-config'

const BETTER_AUTH_LOGICAL_ROUTE = new URL('/api/', PUBLIC_VARS.PUBLIC_HOSTNAME)
const BETTER_AUTH_PUBLIC_ROUTE = new URL(`${AGENTTEAM_OAUTH_PUBLIC_ROUTE}/`)
const BETTER_AUTH_LOGICAL_PATH_PREFIX = trimTrailingSlash(BETTER_AUTH_LOGICAL_ROUTE.pathname)
const BETTER_AUTH_PUBLIC_PATH_PREFIX = trimTrailingSlash(BETTER_AUTH_PUBLIC_ROUTE.pathname)
const OAUTH_AUTHORIZATION_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server'
const OPENID_CONFIGURATION_METADATA_PATH = '/.well-known/openid-configuration'
const PUBLIC_API_PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/api'

export function isOAuthMetadataRequestPath(pathname: string): boolean {
  const normalizedPath = normalizeMetadataPath(pathname)
  return (
    normalizedPath === OAUTH_AUTHORIZATION_SERVER_METADATA_PATH ||
    normalizedPath === OPENID_CONFIGURATION_METADATA_PATH ||
    normalizedPath === PUBLIC_API_PROTECTED_RESOURCE_METADATA_PATH
  )
}

export async function handleOAuthMetadataRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url)
  const normalizedPath = normalizeMetadataPath(url.pathname)
  if (!isOAuthMetadataRequestPath(normalizedPath)) {
    return null
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      headers: { allow: 'GET, HEAD' },
      status: 405
    })
  }

  if (normalizedPath === PUBLIC_API_PROTECTED_RESOURCE_METADATA_PATH) {
    return publicApiProtectedResourceMetadataResponse(request)
  }

  return authorizationServerMetadataResponse(request, normalizedPath)
}

async function authorizationServerMetadataResponse(
  request: Request,
  normalizedPath: string
): Promise<Response> {
  const { auth } = await globals()
  const metadata =
    normalizedPath === OAUTH_AUTHORIZATION_SERVER_METADATA_PATH
      ? await auth.api.getOAuthServerConfig()
      : await auth.api.getOpenIdConfig()

  return jsonMetadataResponse(
    request,
    rewritePublicOAuthMetadata(metadata as unknown as Record<string, unknown>)
  )
}

async function publicApiProtectedResourceMetadataResponse(request: Request): Promise<Response> {
  const { auth } = await globals()
  const metadata = await oauthProviderResourceClient(auth as unknown as Auth)
    .getActions()
    .getProtectedResourceMetadata({
      bearer_methods_supported: ['header'],
      resource: AGENTTEAM_API_OAUTH_AUDIENCE,
      resource_documentation: new URL('/openapi/', PUBLIC_VARS.PUBLIC_HOSTNAME).toString(),
      resource_name: 'AgentTeam Email API',
      scopes_supported: [...AGENTTEAM_API_OAUTH_SCOPES]
    })

  return jsonMetadataResponse(request, metadata as unknown as Record<string, unknown>)
}

export async function rewritePublicOAuthMetadataResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return response
  }

  const metadata = await response
    .clone()
    .json()
    .catch(() => undefined)
  if (!isJsonObject(metadata)) {
    return response
  }

  return Response.json(rewritePublicOAuthMetadata(metadata), {
    headers: copyMetadataHeaders(response.headers),
    status: response.status,
    statusText: response.statusText
  })
}

export function rewritePublicOAuthMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, rewriteMetadataValue(key, value)])
  )
}

function rewriteMetadataValue(key: string, value: unknown): unknown {
  if (key === 'issuer' && typeof value === 'string') {
    return PUBLIC_VARS.PUBLIC_HOSTNAME
  }
  if (key === 'authorization_servers' && typeof value === 'string') {
    return PUBLIC_VARS.PUBLIC_HOSTNAME
  }
  if (typeof value === 'string') {
    return rewriteLogicalAuthUrl(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteMetadataValue(key, item))
  }
  if (isJsonObject(value)) {
    return rewritePublicOAuthMetadata(value)
  }
  return value
}

function rewriteLogicalAuthUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return value
  }

  if (url.origin !== BETTER_AUTH_LOGICAL_ROUTE.origin) {
    return value
  }
  if (
    url.pathname !== BETTER_AUTH_LOGICAL_PATH_PREFIX &&
    !url.pathname.startsWith(`${BETTER_AUTH_LOGICAL_PATH_PREFIX}/`)
  ) {
    return value
  }

  const suffix = url.pathname.slice(BETTER_AUTH_LOGICAL_PATH_PREFIX.length)
  url.pathname = `${BETTER_AUTH_PUBLIC_PATH_PREFIX}${suffix}`
  return url.toString()
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function normalizeMetadataPath(pathname: string): string {
  const normalizedPath = trimTrailingSlash(pathname)
  return normalizedPath.length > 0 ? normalizedPath : '/'
}

function copyMetadataHeaders(source: Headers): Headers {
  const headers = new Headers()
  source.forEach((value, key) => {
    if (key.toLowerCase() !== 'content-length') {
      headers.set(key, value)
    }
  })
  return headers
}

function jsonMetadataResponse(request: Request, metadata: Record<string, unknown>): Response {
  if (request.method === 'HEAD') {
    return new Response(null, {
      headers: {
        'cache-control': 'public, max-age=300',
        'content-type': 'application/json'
      },
      status: 200
    })
  }

  return Response.json(metadata, {
    headers: {
      'cache-control': 'public, max-age=300'
    }
  })
}
