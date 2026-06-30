import { redirect } from '@tanstack/react-router'

export interface RouteRedirectOptions {
  statusCode?: number
}

export function createSignInRedirectHref(redirectPath: string): string {
  const params = new URLSearchParams()
  params.set('redirect', redirectPath)

  return `/signin/?${params.toString()}`
}

export function throwAuthRequiredRedirect(redirectPath: string): never {
  throwRouteRedirect(createSignInRedirectHref(redirectPath))
}

export function throwRouteRedirect(href: string, options: RouteRedirectOptions = {}): never {
  redirect({
    href,
    ...(options.statusCode === undefined ? {} : { statusCode: options.statusCode }),
    throw: true,
    to: undefined as never
  })
  throw new Error(`TanStack Router did not throw redirect for ${href}`)
}
