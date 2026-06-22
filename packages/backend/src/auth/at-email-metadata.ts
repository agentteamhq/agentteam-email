import { PUBLIC_VARS } from '../vars.public'

const AT_EMAIL_METADATA_PATH = '/.well-known/at-email.json'

export interface AtEmailMetadata {
  apiBase: string
  authBase: string
  minCliVersion?: string
}

export function isAtEmailMetadataRequestPath(pathname: string): boolean {
  return normalizeMetadataPath(pathname) === AT_EMAIL_METADATA_PATH
}

export async function handleAtEmailMetadataRequest(request: Request): Promise<Response | null> {
  if (!isAtEmailMetadataRequestPath(new URL(request.url).pathname)) {
    return null
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      headers: { allow: 'GET, HEAD' },
      status: 405
    })
  }

  const publicHostname = trimTrailingSlash(PUBLIC_VARS.PUBLIC_HOSTNAME)
  const metadata: AtEmailMetadata = {
    apiBase: publicHostname,
    authBase: publicHostname
  }

  if (request.method === 'HEAD') {
    return new Response(null, {
      headers: metadataHeaders(),
      status: 200
    })
  }

  return Response.json(metadata, {
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
