import { globals } from '../globals'
import { syncAgentMailRuntimeProjection } from '../agent-mail/runtime-projection'
import { createScheduledJobs } from './scheduled-jobs'
import { syncStripeCustomers } from './sync-stripe-customers'
import type { ScheduledJobs } from './scheduled-jobs'

let scheduledJobs: ScheduledJobs | null = null

export async function startScheduledJobs(): Promise<ScheduledJobs> {
  if (scheduledJobs) {
    return scheduledJobs
  }

  const { db, shutdownManager } = await globals()
  await syncAgentMailRuntimeProjection(db, { reason: 'startup' })
  scheduledJobs = await createScheduledJobs(db)
  shutdownManager.add('scheduled-jobs', scheduledJobs.stop)

  return scheduledJobs
}

export { syncStripeCustomers }
export type { ScheduledJobs } from './scheduled-jobs'
export type { SyncStripeCustomersOptions, SyncStripeCustomersResult } from './sync-stripe-customers'
