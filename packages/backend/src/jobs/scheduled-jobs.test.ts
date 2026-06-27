import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '../db/db'

const scheduledJobsTestState = vi.hoisted(() => ({
  agendaDefine: vi.fn(),
  agendaEvery: vi.fn(),
  agendaOn: vi.fn(),
  agendaStart: vi.fn(),
  agendaStop: vi.fn(),
  refreshDueAgentMailWorkerCredentials: vi.fn(),
  syncAgentMailRuntimeProjection: vi.fn(),
  syncStripeCustomers: vi.fn()
}))

vi.mock('agenda', () => ({
  Agenda: vi.fn().mockImplementation(function Agenda() {
    return {
      define: scheduledJobsTestState.agendaDefine,
      every: scheduledJobsTestState.agendaEvery,
      on: scheduledJobsTestState.agendaOn,
      start: scheduledJobsTestState.agendaStart,
      stop: scheduledJobsTestState.agendaStop
    }
  })
}))

vi.mock('@agendajs/mongo-backend', () => ({
  MongoBackend: vi.fn().mockImplementation(function MongoBackend(input: unknown): unknown {
    return input
  })
}))

vi.mock('../agent-mail/runtime-projection', () => ({
  syncAgentMailRuntimeProjection: scheduledJobsTestState.syncAgentMailRuntimeProjection
}))

vi.mock('../cloudflare/service', () => ({
  refreshDueAgentMailWorkerCredentials: scheduledJobsTestState.refreshDueAgentMailWorkerCredentials
}))

vi.mock('./sync-stripe-customers', () => ({
  syncStripeCustomers: scheduledJobsTestState.syncStripeCustomers
}))

describe('scheduled jobs', () => {
  beforeEach(() => {
    vi.resetModules()
    scheduledJobsTestState.agendaDefine.mockReset()
    scheduledJobsTestState.agendaEvery.mockReset()
    scheduledJobsTestState.agendaOn.mockReset()
    scheduledJobsTestState.agendaStart.mockReset()
    scheduledJobsTestState.agendaStop.mockReset()
    scheduledJobsTestState.refreshDueAgentMailWorkerCredentials.mockReset()
    scheduledJobsTestState.syncAgentMailRuntimeProjection.mockReset()
    scheduledJobsTestState.syncStripeCustomers.mockReset()
    scheduledJobsTestState.agendaStart.mockResolvedValue(undefined)
    scheduledJobsTestState.agendaEvery.mockResolvedValue(undefined)
    scheduledJobsTestState.agendaStop.mockResolvedValue(undefined)
    scheduledJobsTestState.syncAgentMailRuntimeProjection.mockResolvedValue({
      changed: false,
      domains: 1,
      reason: 'scheduled-repair'
    })
  })

  it('registers the Agent Mail runtime projection repair every 30 minutes', async () => {
    expect.hasAssertions()
    const { createScheduledJobs, SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB } =
      await import('./scheduled-jobs')
    const db = { connection: { db: {} } } as Database

    await createScheduledJobs(db)

    expect(scheduledJobsTestState.agendaEvery).toHaveBeenCalledWith(
      '30 minutes',
      SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB,
      undefined,
      {
        skipImmediate: true,
        timezone: 'UTC'
      }
    )

    const defineCall = scheduledJobsTestState.agendaDefine.mock.calls.find(
      ([jobName]) => jobName === SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB
    )
    expect(defineCall).toBeDefined()
    const handler = defineCall?.[1] as unknown
    if (!isScheduledJobHandler(handler)) {
      throw new Error('scheduled runtime projection repair handler was not registered')
    }

    await handler()

    expect(scheduledJobsTestState.syncAgentMailRuntimeProjection).toHaveBeenCalledWith(db, {
      reason: 'scheduled-repair'
    })
  })
})

function isScheduledJobHandler(value: unknown): value is () => Promise<void> | void {
  return typeof value === 'function'
}
