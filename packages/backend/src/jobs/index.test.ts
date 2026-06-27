import { beforeEach, describe, expect, it, vi } from 'vitest'

const jobsIndexTestState = vi.hoisted(() => ({
  createScheduledJobs: vi.fn(),
  globals: vi.fn(),
  order: [] as string[],
  shutdownAdd: vi.fn(),
  syncAgentMailRuntimeProjection: vi.fn()
}))

vi.mock('../globals', () => ({
  globals: jobsIndexTestState.globals
}))

vi.mock('../agent-mail/runtime-projection', () => ({
  syncAgentMailRuntimeProjection: jobsIndexTestState.syncAgentMailRuntimeProjection
}))

vi.mock('./scheduled-jobs', () => ({
  createScheduledJobs: jobsIndexTestState.createScheduledJobs
}))

vi.mock('./sync-stripe-customers', () => ({
  syncStripeCustomers: vi.fn()
}))

describe('scheduled job startup', () => {
  beforeEach(() => {
    vi.resetModules()
    jobsIndexTestState.createScheduledJobs.mockReset()
    jobsIndexTestState.globals.mockReset()
    jobsIndexTestState.order = []
    jobsIndexTestState.shutdownAdd.mockReset()
    jobsIndexTestState.syncAgentMailRuntimeProjection.mockReset()
    const db = { connection: { db: {} } }
    jobsIndexTestState.globals.mockResolvedValue({
      db,
      shutdownManager: {
        add: jobsIndexTestState.shutdownAdd
      }
    })
    jobsIndexTestState.syncAgentMailRuntimeProjection.mockImplementation(async () => {
      jobsIndexTestState.order.push('sync')
      return { changed: false, domains: 0, reason: 'startup' }
    })
    jobsIndexTestState.createScheduledJobs.mockImplementation(async () => {
      jobsIndexTestState.order.push('create')
      return { stop: vi.fn() }
    })
  })

  it('syncs the mail-control runtime projection before starting recurring jobs', async () => {
    expect.hasAssertions()
    const { startScheduledJobs } = await import('./index')

    await startScheduledJobs()

    expect(jobsIndexTestState.order).toStrictEqual(['sync', 'create'])
    expect(jobsIndexTestState.syncAgentMailRuntimeProjection).toHaveBeenCalledWith(
      { connection: { db: {} } },
      { reason: 'startup' }
    )
  })
})
