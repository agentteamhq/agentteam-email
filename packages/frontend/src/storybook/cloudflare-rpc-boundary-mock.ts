import { spyOn } from 'storybook/test'

/**
 * Storybook mock seam for the `/rpc/cloudflare/*` boundary.
 *
 * Settings stories normally inject `DomainSettingsState`, which makes the settings
 * controller treat its Cloudflare state as externally owned and skip every runtime
 * request. That is the right seam for rendering a known screen state, but it cannot
 * cover the controller's own request behavior: retries, failure latching, and the
 * status re-read that turns an expired connected account into the reconnect state.
 *
 * This seam replaces the transport instead of the state, so the production
 * controller stays the owner of every fetch decision. Only `/rpc/cloudflare/*` is
 * intercepted; anything else falls through to the real `fetch`.
 */

const CLOUDFLARE_RPC_PATH_PREFIX = '/rpc/cloudflare/'

export interface CloudflareRpcBoundaryResponse {
  body: unknown
  status: number
}

/** Receives the zero-based call index so a route can change answer between calls. */
export type CloudflareRpcBoundaryHandler = (callIndex: number) => CloudflareRpcBoundaryResponse

export type CloudflareRpcBoundaryRoute = 'accounts' | 'status' | 'zones'

export interface CloudflareRpcBoundaryMock {
  requestCount: (route: CloudflareRpcBoundaryRoute) => number
  restore: () => void
}

let activeMock: CloudflareRpcBoundaryMock | null = null

export function mockCloudflareRpcBoundary(
  handlers: Partial<Record<CloudflareRpcBoundaryRoute, CloudflareRpcBoundaryHandler>>
): CloudflareRpcBoundaryMock {
  const requestCounts = new Map<CloudflareRpcBoundaryRoute, number>()
  // Capture before spyOn replaces globalThis.fetch, or pass-through would call the spy itself.
  const originalFetch = globalThis.fetch.bind(globalThis)
  const fetchSpy = spyOn(globalThis, 'fetch')

  fetchSpy.mockImplementation(async (input, init) => {
    const route = cloudflareRpcBoundaryRoute(input)
    const handler = route ? handlers[route] : undefined

    if (!route || !handler) {
      return originalFetch(input, init)
    }

    const callIndex = requestCounts.get(route) ?? 0
    requestCounts.set(route, callIndex + 1)

    const { body, status } = handler(callIndex)

    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status
    })
  })

  const mock: CloudflareRpcBoundaryMock = {
    requestCount: (route) => requestCounts.get(route) ?? 0,
    restore: () => {
      fetchSpy.mockRestore()
      if (activeMock === mock) {
        activeMock = null
      }
    }
  }

  activeMock = mock

  return mock
}

export function requireActiveCloudflareRpcBoundaryMock(): CloudflareRpcBoundaryMock {
  if (!activeMock) {
    throw new Error('Expected an active Cloudflare RPC boundary mock for this story.')
  }

  return activeMock
}

function cloudflareRpcBoundaryRoute(input: RequestInfo | URL): CloudflareRpcBoundaryRoute | null {
  const url = new URL(cloudflareRpcRequestUrl(input), globalThis.location.href)

  if (!url.pathname.startsWith(CLOUDFLARE_RPC_PATH_PREFIX)) {
    return null
  }

  const route = url.pathname.slice(CLOUDFLARE_RPC_PATH_PREFIX.length).replace(/\/$/u, '')

  return route === 'accounts' || route === 'status' || route === 'zones' ? route : null
}

function cloudflareRpcRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }

  return input instanceof URL ? input.href : input.url
}
