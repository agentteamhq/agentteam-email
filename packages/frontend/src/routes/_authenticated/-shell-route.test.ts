import { describe, expect, it } from 'vitest'

import { createFrontendRouter } from '../../router'
import type { PublicEnv } from '../../types'

const SHELL_ROUTE_ID = '/_authenticated/_shell'

const SHELL_CHILD_ROUTE_PATHS = {
  '/_authenticated/_shell/dashboard': '/dashboard',
  '/_authenticated/_shell/organization/$section': '/organization/$section',
  '/_authenticated/_shell/settings': '/settings',
  '/_authenticated/_shell/settings/$section': '/settings/$section'
} as const

const publicEnv = {
  DEV: false,
  NODE_ENV: 'test',
  PROD: false,
  PUBLIC_GOOGLE_CLIENT_ID: undefined,
  PUBLIC_HOSTNAME: 'https://mail.example.com',
  PUBLIC_HTTPS_PROTO: true,
  PUBLIC_LINKEDIN_CLIENT_ID: undefined,
  TEST: true
} satisfies PublicEnv

describe('authenticated shell route ownership', () => {
  it('keeps the public dashboard, settings, and organization paths unchanged', () => {
    expect.hasAssertions()
    const routesById = createFrontendRouter({ publicEnv }).routesById

    for (const [routeId, fullPath] of Object.entries(SHELL_CHILD_ROUTE_PATHS)) {
      expect(routesById[routeId as keyof typeof routesById]?.fullPath).toBe(fullPath)
    }
  })

  it('mounts every product shell route through one shared layout owner', () => {
    expect.hasAssertions()
    const routesById = createFrontendRouter({ publicEnv }).routesById

    expect(routesById[SHELL_ROUTE_ID].options.component).toBeDefined()

    for (const routeId of Object.keys(SHELL_CHILD_ROUTE_PATHS)) {
      expect(ancestorRouteIds(routesById, routeId)).toContain(SHELL_ROUTE_ID)
    }
  })

  it('does not let a shell child route mount a second shell', () => {
    expect.hasAssertions()
    const routesById = createFrontendRouter({ publicEnv }).routesById

    for (const routeId of Object.keys(SHELL_CHILD_ROUTE_PATHS)) {
      expect(routesById[routeId as keyof typeof routesById]?.options.component).toBeUndefined()
    }
  })

  it('owns the shared search contract and the search-keyed workspace prefetch', () => {
    expect.hasAssertions()
    const shellRoute = createFrontendRouter({ publicEnv }).routesById[SHELL_ROUTE_ID]

    expect(shellRoute.options.validateSearch).toBeDefined()
    expect(shellRoute.options.loaderDeps).toBeDefined()
    expect(shellRoute.options.loader).toBeDefined()
  })
})

function ancestorRouteIds(
  routesById: ReturnType<typeof createFrontendRouter>['routesById'],
  routeId: string
) {
  const ancestorIds: Array<string> = []
  let current = routesById[routeId as keyof typeof routesById]?.parentRoute

  while (current) {
    ancestorIds.push(current.id)
    current = current.parentRoute
  }

  return ancestorIds
}
