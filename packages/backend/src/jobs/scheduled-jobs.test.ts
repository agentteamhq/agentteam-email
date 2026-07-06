import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '../db/db'

const scheduledJobsTestState = vi.hoisted(() => ({
  agendaDefine: vi.fn(),
  agendaEvery: vi.fn(),
  agendaOn: vi.fn(),
  agendaStart: vi.fn(),
  agendaStop: vi.fn(),
  debugFactory: Object.assign(vi.fn(), {
    disable: vi.fn(),
    enable: vi.fn(),
    enabled: vi.fn()
  }),
  debugLog: vi.fn(),
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

vi.mock('debug', () => ({
  default: scheduledJobsTestState.debugFactory
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
    scheduledJobsTestState.debugFactory.mockClear()
    scheduledJobsTestState.debugFactory.mockImplementation(() => scheduledJobsTestState.debugLog)
    scheduledJobsTestState.debugLog.mockReset()
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

  it('logs scheduled job errors with bounded metadata', async () => {
    expect.hasAssertions()
    const {
      createScheduledJobs,
      REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_JOB,
      SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB,
      SYNC_STRIPE_CUSTOMERS_JOB
    } = await import('./scheduled-jobs')
    const db = { connection: { db: {} } } as Database
    const error = new Error(
      'worker refresh failed for recipient@example.test with token=raw-worker-token'
    ) as Error & {
      code: string
      statusCode: number
    }
    error.code = 'ECONNRESET'
    error.stack = 'stack with raw-worker-token and recipient@example.test'
    error.statusCode = 503

    await createScheduledJobs(db)

    for (const eventName of [
      'error',
      `fail:${SYNC_STRIPE_CUSTOMERS_JOB}`,
      `fail:${REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_JOB}`,
      `fail:${SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB}`
    ]) {
      const eventCall = scheduledJobsTestState.agendaOn.mock.calls.find(([registeredEventName]) => {
        return registeredEventName === eventName
      })
      expect(eventCall).toBeDefined()
      const handler = eventCall?.[1]
      if (!isScheduledJobErrorHandler(handler)) {
        throw new Error(`Expected ${eventName} handler to be registered.`)
      }
      handler(error)
    }

    expect(scheduledJobsTestState.debugLog).toHaveBeenCalledWith('agenda error %o', {
      error: {
        code: 'ECONNRESET',
        message: 'worker refresh failed for  email_redacted  with token=secret_redacted',
        name: 'Error',
        statusCode: 503,
        type: 'object'
      },
      operation: 'agenda_error'
    })
    expect(scheduledJobsTestState.debugLog).toHaveBeenCalledWith('scheduled job failed %o', {
      error: {
        code: 'ECONNRESET',
        message: 'worker refresh failed for  email_redacted  with token=secret_redacted',
        name: 'Error',
        statusCode: 503,
        type: 'object'
      },
      job: SYNC_STRIPE_CUSTOMERS_JOB
    })
    expect(scheduledJobsTestState.debugLog).toHaveBeenCalledWith('scheduled job failed %o', {
      error: {
        code: 'ECONNRESET',
        message: 'worker refresh failed for  email_redacted  with token=secret_redacted',
        name: 'Error',
        statusCode: 503,
        type: 'object'
      },
      job: REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_JOB
    })
    expect(scheduledJobsTestState.debugLog).toHaveBeenCalledWith('scheduled job failed %o', {
      error: {
        code: 'ECONNRESET',
        message: 'worker refresh failed for  email_redacted  with token=secret_redacted',
        name: 'Error',
        statusCode: 503,
        type: 'object'
      },
      job: SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB
    })
    const serializedLogCalls = JSON.stringify(scheduledJobsTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('recipient@example.test')
    expect(serializedLogCalls).not.toContain('raw-worker-token')
    expect(serializedLogCalls).toContain('worker refresh failed')
    expect(serializedLogCalls).not.toContain('stack with')
  })
})

function isScheduledJobHandler(value: unknown): value is () => Promise<void> | void {
  return typeof value === 'function'
}

function isScheduledJobErrorHandler(value: unknown): value is (error: unknown) => void {
  return typeof value === 'function'
}
