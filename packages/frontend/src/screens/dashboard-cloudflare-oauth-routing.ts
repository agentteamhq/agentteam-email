const cloudflareOAuthCompletionPaths = new Set([
  '/settings/',
  '/settings/account/',
  '/settings/security/',
  '/settings/agent-access/',
  '/settings/connected-accounts/',
  '/settings/organizations/',
  '/settings/domains/',
  '/organization/settings/',
  '/organization/people/'
])

export function cloudflareOAuthCompletionPath(pathname: string): string {
  const normalizedPathname = normalizeCloudflareOAuthCompletionPathname(pathname)

  if (cloudflareOAuthCompletionPaths.has(normalizedPathname)) {
    return normalizedPathname
  }

  return '/dashboard/'
}

function normalizeCloudflareOAuthCompletionPathname(pathname: string): string {
  let parsedPathname: string

  try {
    parsedPathname = new URL(pathname, 'https://example.invalid').pathname
  } catch {
    return '/dashboard/'
  }

  return parsedPathname.endsWith('/') ? parsedPathname : `${parsedPathname}/`
}
