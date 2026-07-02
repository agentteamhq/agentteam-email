import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadOrganizationSettingsRouteState } from './organization.$section'
import type { OrganizationSettingsRouteLoaderInput } from './organization.$section'

type SettingsRouteState = NonNullable<
  OrganizationSettingsRouteLoaderInput['context']['authenticatedRouteState']
>

const organizationRouteTestState = vi.hoisted(() => {
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
    notFound: organizationRouteTestState.notFound
  }
})

describe('organization settings route loader', () => {
  beforeEach(() => {
    organizationRouteTestState.notFound.mockClear()
  })

  it('accepts the organization settings route state', () => {
    expect.hasAssertions()
    const routeState = createSettingsRouteState()

    expect(loadOrganizationSettingsRouteState(createOrganizationRouteInput('settings', routeState))).toBe(
      routeState
    )
    expect(organizationRouteTestState.notFound).not.toHaveBeenCalled()
  })

  it('accepts the organization people route state', () => {
    expect.hasAssertions()
    const routeState = createSettingsRouteState()

    expect(loadOrganizationSettingsRouteState(createOrganizationRouteInput('people', routeState))).toBe(
      routeState
    )
    expect(organizationRouteTestState.notFound).not.toHaveBeenCalled()
  })

  it('fails closed for unknown organization route states', () => {
    expect.hasAssertions()
    const routeState = createSettingsRouteState()
    let thrown: unknown

    try {
      loadOrganizationSettingsRouteState(createOrganizationRouteInput('nope', routeState))
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(organizationRouteTestState.notFoundError)
    expect(organizationRouteTestState.notFound).toHaveBeenCalledWith({ throw: true })
  })
})

function createSettingsRouteState(): SettingsRouteState {
  return {
    flash: null,
    redirectTo: '/signin/',
    setCookieHeaders: [],
    shouldRedirectToSetup: false,
    shouldRedirectToSignIn: false,
    user: null
  }
}

function createOrganizationRouteInput(
  section: string,
  routeState: SettingsRouteState
): OrganizationSettingsRouteLoaderInput {
  return {
    context: {
      authenticatedRouteState: routeState
    },
    params: {
      section
    }
  }
}
