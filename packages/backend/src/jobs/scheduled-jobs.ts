import { MongoBackend } from '@agendajs/mongo-backend'
import { Agenda } from 'agenda'
import debug from 'debug'

import { syncAgentMailRuntimeProjection } from '../agent-mail/runtime-projection'
import { refreshDueAgentMailWorkerCredentials } from '../cloudflare/service'
import { syncStripeCustomers } from './sync-stripe-customers'
import type { Database } from '../db/db'

const log = debug('app:jobs')

export const SYNC_STRIPE_CUSTOMERS_JOB = 'sync-stripe-customers'
export const SYNC_STRIPE_CUSTOMERS_CRON = '0 0 * * *'
export const REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_JOB = 'refresh-agent-mail-worker-credentials'
export const REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_CRON = '15 0 * * *'
export const SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB = 'sync-agent-mail-runtime-projection'
export const SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_CRON = '30 minutes'
export const SCHEDULED_JOBS_TIMEZONE = 'UTC'

export type ScheduledJobs = {
  agenda: Agenda
  stop: () => Promise<void>
}

export async function createScheduledJobs(db: Database): Promise<ScheduledJobs> {
  const mongoDb = db.connection.db

  if (!mongoDb) {
    throw new Error('Unable to start scheduled jobs before MongoDB connection is ready')
  }

  const agenda = new Agenda({
    backend: new MongoBackend({
      collection: 'agendaJobs',
      mongo: mongoDb
    }),
    defaultConcurrency: 1,
    defaultLockLifetime: 30 * 60 * 1000,
    lockLimit: 1,
    maxConcurrency: 1,
    name: 'agentteam-email-server',
    processEvery: '1 minute'
  })

  agenda.on('error', (error) => {
    log('agenda error: %O', error)
  })

  agenda.on(`fail:${SYNC_STRIPE_CUSTOMERS_JOB}`, (error) => {
    log('scheduled stripe customer sync failed: %O', error)
  })
  agenda.on(`fail:${REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_JOB}`, (error) => {
    log('scheduled Agent Mail Worker credential refresh failed: %O', error)
  })
  agenda.on(`fail:${SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB}`, (error) => {
    log('scheduled Agent Mail runtime projection sync failed: %O', error)
  })

  agenda.define(
    SYNC_STRIPE_CUSTOMERS_JOB,
    async () => {
      log('scheduled stripe customer sync starting')
      const result = await syncStripeCustomers(db)
      log('scheduled stripe customer sync finished', result)
    },
    {
      concurrency: 1,
      lockLimit: 1,
      lockLifetime: 30 * 60 * 1000
    }
  )
  agenda.define(
    REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_JOB,
    async () => {
      log('scheduled Agent Mail Worker credential refresh starting')
      const result = await refreshDueAgentMailWorkerCredentials(db)
      log('scheduled Agent Mail Worker credential refresh finished', result)
    },
    {
      concurrency: 1,
      lockLimit: 1,
      lockLifetime: 30 * 60 * 1000
    }
  )
  agenda.define(
    SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB,
    async () => {
      log('scheduled Agent Mail runtime projection sync starting')
      const result = await syncAgentMailRuntimeProjection(db, { reason: 'scheduled-repair' })
      log('scheduled Agent Mail runtime projection sync finished', result)
    },
    {
      concurrency: 1,
      lockLimit: 1,
      lockLifetime: 30 * 60 * 1000
    }
  )

  await agenda.start()
  await agenda.every(SYNC_STRIPE_CUSTOMERS_CRON, SYNC_STRIPE_CUSTOMERS_JOB, undefined, {
    skipImmediate: true,
    timezone: SCHEDULED_JOBS_TIMEZONE
  })
  await agenda.every(
    REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_CRON,
    REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_JOB,
    undefined,
    {
      skipImmediate: true,
      timezone: SCHEDULED_JOBS_TIMEZONE
    }
  )
  await agenda.every(
    SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_CRON,
    SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB,
    undefined,
    {
      skipImmediate: true,
      timezone: SCHEDULED_JOBS_TIMEZONE
    }
  )

  log('scheduled jobs started', {
    refreshAtEmailAdminWorkerCredentialsCron: REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_CRON,
    refreshAtEmailAdminWorkerCredentialsJob: REFRESH_AT_EMAIL_ADMIN_WORKER_CREDENTIALS_JOB,
    syncAtEmailAdminRuntimeProjectionCron: SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_CRON,
    syncAtEmailAdminRuntimeProjectionJob: SYNC_AT_EMAIL_ADMIN_RUNTIME_PROJECTION_JOB,
    job: SYNC_STRIPE_CUSTOMERS_JOB,
    syncStripeCustomersCron: SYNC_STRIPE_CUSTOMERS_CRON,
    timezone: SCHEDULED_JOBS_TIMEZONE
  })

  return {
    agenda,
    async stop() {
      await agenda.stop(false)
      log('scheduled jobs stopped')
    }
  }
}
