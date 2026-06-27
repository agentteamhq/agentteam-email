import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadAdminSetupRouteState } from './setup'
import type { AdminSetupRouteState } from '@main/backend/routes/webapp'
import type { AdminSetupLoaderInput } from './setup'

const adminSetupRouteTestState = vi.hoisted(() => {
  const notFoundError = new Error('not found')

  return {
    notFound: vi.fn(() => {
      throw notFoundError
    }),
    notFoundError
  }
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()

  return {
    ...actual,
    notFound: adminSetupRouteTestState.notFound
  }
})

describe('admin setup route loader', () => {
  beforeEach(() => {
    adminSetupRouteTestState.notFound.mockClear()
  })

  it('fails closed when the server setup route context is unavailable', async () => {
    expect.hasAssertions()

    await expect(loadAdminSetupRouteState(createAdminSetupLoaderInput())).rejects.toBe(
      adminSetupRouteTestState.notFoundError
    )
    expect(adminSetupRouteTestState.notFound).toHaveBeenCalledWith({ throw: true })
  })

  it('loads setup state through the server setup route handler', async () => {
    expect.hasAssertions()
    const request = new Request('https://mail.example.com/admin/setup/')
    const routeState = {
      redirectTo: '/admin/',
      setupRequired: true,
      shouldNotFound: false,
      shouldRedirectToAdmin: false,
      user: null
    } satisfies AdminSetupRouteState
    const loadAdminSetupRoute = vi.fn(async (_request: Request) => routeState)

    await expect(
      loadAdminSetupRouteState(
        createAdminSetupLoaderInput({
          serverContext: {
            request,
            serverRouteHandlers: {
              loadAdminSetupRoute
            }
          }
        })
      )
    ).resolves.toBe(routeState)
    expect(loadAdminSetupRoute).toHaveBeenCalledWith(request)
    expect(adminSetupRouteTestState.notFound).not.toHaveBeenCalled()
  })
})

function createAdminSetupLoaderInput(overrides: Partial<AdminSetupLoaderInput> = {}): AdminSetupLoaderInput {
  return {
    context: {
      publicEnv: {} as AdminSetupLoaderInput['context']['publicEnv'],
      queryClient: new QueryClient()
    },
    ...overrides
  }
}
