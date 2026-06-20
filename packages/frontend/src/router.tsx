import { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { getRuntimePublicEnv } from '#runtime-public-env'
import { routeTree } from './routeTree.gen'
import type { FrontendRouterContext, FrontendStartRequestContext, PublicEnv } from './types'

export interface CreateFrontendRouterOptions {
  publicEnv: PublicEnv
}

export function createFrontendRouter(options: CreateFrontendRouterOptions) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000
      }
    }
  })

  const router = createTanStackRouter({
    routeTree,
    context: {
      publicEnv: options.publicEnv,
      queryClient
    } satisfies FrontendRouterContext,
    defaultPreload: 'intent',
    scrollRestoration: true,
    trailingSlash: 'always'
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient
  })

  return router
}

export function getRouter() {
  return createFrontendRouter({
    publicEnv: getRuntimePublicEnv()
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createFrontendRouter>
    server: {
      requestContext: FrontendStartRequestContext
    }
  }
}
