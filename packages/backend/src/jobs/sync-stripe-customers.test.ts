import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncStripeCustomersTestState = vi.hoisted(() => ({
  debugFactory: Object.assign(vi.fn(), {
    disable: vi.fn(),
    enable: vi.fn(),
    enabled: vi.fn()
  }),
  debugLog: vi.fn(),
  find: vi.fn(),
  updateOne: vi.fn(),
  updateStripeCustomer: vi.fn()
}))

vi.mock('debug', () => ({
  default: syncStripeCustomersTestState.debugFactory
}))

vi.mock('../payments/update-customer', () => ({
  updateStripeCustomer: syncStripeCustomersTestState.updateStripeCustomer
}))

describe('syncStripeCustomers', () => {
  beforeEach(() => {
    vi.resetModules()
    syncStripeCustomersTestState.debugFactory.mockClear()
    syncStripeCustomersTestState.debugFactory.mockImplementation(() => syncStripeCustomersTestState.debugLog)
    syncStripeCustomersTestState.debugLog.mockReset()
    syncStripeCustomersTestState.find.mockReset()
    syncStripeCustomersTestState.updateOne.mockReset()
    syncStripeCustomersTestState.updateStripeCustomer.mockReset()
  })

  it('logs customer sync failures with bounded error metadata', async () => {
    expect.hasAssertions()
    mockUserPages([[{ _id: 'user_123' }], []])
    const error = new Error(
      'Stripe request failed for customer@example.test with Authorization Bearer raw-stripe-token'
    ) as Error & {
      code: string
      statusCode: number
    }
    error.name = 'StripeAPIError'
    error.code = 'STRIPE_RATE_LIMIT'
    error.stack = 'stack with raw-stripe-token and customer@example.test'
    error.statusCode = 429
    syncStripeCustomersTestState.updateStripeCustomer.mockRejectedValue(error)

    const { syncStripeCustomers } = await import('./sync-stripe-customers')
    const result = await syncStripeCustomers({
      models: {
        user: {
          find: syncStripeCustomersTestState.find,
          updateOne: syncStripeCustomersTestState.updateOne
        }
      }
    } as never)

    expect(result).toStrictEqual({
      failed: 1,
      scanned: 1,
      updated: 0,
      verifiedEmails: 0
    })
    expect(syncStripeCustomersTestState.debugLog).toHaveBeenCalledWith('stripe customer sync failed %o', {
      error: {
        code: 'STRIPE_RATE_LIMIT',
        name: 'StripeAPIError',
        statusCode: 429,
        type: 'object'
      },
      userId: 'user_123'
    })
    const serializedLogCalls = JSON.stringify(syncStripeCustomersTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('customer@example.test')
    expect(serializedLogCalls).not.toContain('raw-stripe-token')
    expect(serializedLogCalls).not.toContain('Stripe request failed')
    expect(serializedLogCalls).not.toContain('stack with')
  })
})

function mockUserPages(pages: Array<Array<{ _id: string }>>) {
  syncStripeCustomersTestState.find.mockImplementation(() => ({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(pages.shift() ?? [])
        })
      })
    })
  }))
}
