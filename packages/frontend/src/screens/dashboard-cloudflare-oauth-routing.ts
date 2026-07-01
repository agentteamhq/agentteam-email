export function cloudflareOAuthCompletionPath(pathname: string): string {
  const normalizedPathname = pathname.endsWith('/') ? pathname : `${pathname}/`

  if (
    normalizedPathname === '/settings/' ||
    normalizedPathname.startsWith('/settings/') ||
    normalizedPathname.startsWith('/organization/')
  ) {
    return normalizedPathname
  }

  return '/dashboard/'
}
