import * as React from 'react'

import { AdminSetupRouteScreen } from '../screens/admin-setup/admin-setup-route-screen'
import { adminSetupCreateFirstAdminSuccess, adminSetupReadyRouteState } from './admin-setup-fixtures'
import type { AdminSetupCreateFirstAdminRpc } from './admin-setup-fixtures'
import type { AdminSetupRouteState } from '@main/backend/routes/webapp'

const adminSetupRpcPathname = '/rpc/admin/setup/first-admin'

export interface AdminSetupRouteStoryFrameProps {
  createFirstAdminRpc?: AdminSetupCreateFirstAdminRpc
  routeState?: AdminSetupRouteState
}

export function AdminSetupRouteStoryFrame({
  createFirstAdminRpc = adminSetupCreateFirstAdminSuccess,
  routeState = adminSetupReadyRouteState
}: AdminSetupRouteStoryFrameProps) {
  useAdminSetupRpcMock(createFirstAdminRpc)
  assertAdminSetupRouteStateAllowsRender(routeState)

  return <AdminSetupRouteScreen />
}

function assertAdminSetupRouteStateAllowsRender(routeState: AdminSetupRouteState) {
  if (routeState.setupRequired && !routeState.shouldNotFound && !routeState.shouldRedirectToAdmin) {
    return
  }

  throw new Error('The mocked admin setup route loader state would not render /admin/setup.')
}

function useAdminSetupRpcMock(createFirstAdminRpc: AdminSetupCreateFirstAdminRpc) {
  React.useLayoutEffect(() => {
    const originalFetch = globalThis.fetch
    const callOriginalFetch = originalFetch.bind(globalThis)
    const mockFetch: typeof globalThis.fetch = (input, init) => {
      if (!isAdminSetupRpcRequest(input)) {
        return callOriginalFetch(input, init)
      }

      switch (createFirstAdminRpc.status) {
        case 'error':
          return Promise.resolve(
            createJsonResponse(
              {
                error: createFirstAdminRpc.message
              },
              createFirstAdminRpc.statusCode ?? 500
            )
          )
        case 'pending':
          return new Promise<Response>(() => {})
        case 'success':
          return Promise.resolve(
            createJsonResponse(createFirstAdminRpc.result ?? adminSetupCreateFirstAdminSuccess.result, 200)
          )
      }
    }

    // eslint-disable-next-line no-restricted-syntax -- Storybook owns this scoped RPC boundary mock.
    globalThis.fetch = mockFetch

    return () => {
      if (globalThis.fetch === mockFetch) {
        // eslint-disable-next-line no-restricted-syntax -- Restore the Storybook RPC boundary mock.
        globalThis.fetch = originalFetch
      }
    }
  }, [createFirstAdminRpc])
}

function isAdminSetupRpcRequest(input: RequestInfo | URL) {
  const href = typeof input === 'string' || input instanceof URL ? input.toString() : input.url
  const url = new URL(href, globalThis.location?.origin ?? 'http://localhost')

  return url.pathname === adminSetupRpcPathname
}

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json'
    },
    status
  })
}
