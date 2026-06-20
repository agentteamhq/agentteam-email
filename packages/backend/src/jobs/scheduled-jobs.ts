import { MongoBackend } from '@agendajs/mongo-backend'
import { Agenda } from 'agenda'
import debug from 'debug'

import type { Database } from '../db/db'

import { syncStripeCustomers } from './sync-stripe-customers'

const log = debug('app:jobs')

export const SYNC_STRIPE_CUSTOMERS_JOB = 'sync-stripe-customers'
export const SYNC_STRIPE_CUSTOMERS_CRON = '0 0 * * *'
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

  await agenda.start()
  await agenda.every(SYNC_STRIPE_CUSTOMERS_CRON, SYNC_STRIPE_CUSTOMERS_JOB, undefined, {
    skipImmediate: true,
    timezone: SCHEDULED_JOBS_TIMEZONE
  })

  log('scheduled jobs started', {
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
