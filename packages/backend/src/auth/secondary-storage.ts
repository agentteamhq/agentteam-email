import type { Database } from '../db/db'
import type { BetterAuthOptions } from 'better-auth/minimal'

type BetterAuthSecondaryStorage = NonNullable<BetterAuthOptions['secondaryStorage']>

interface SecondaryStorageRecord {
  counter?: number | null
  expiresAt?: Date | null
  key: string
  value: string
}

interface QueryResult<TResult> {
  exec: () => Promise<TResult>
}

interface SecondaryStorageModel {
  deleteOne: (filter: Record<string, unknown>) => QueryResult<unknown>
  findOne: (filter: Record<string, unknown>) => QueryResult<SecondaryStorageRecord | null>
  findOneAndUpdate: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: Record<string, unknown>
  ) => QueryResult<SecondaryStorageRecord | null>
  updateOne: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => QueryResult<unknown>
}

export function createMongoSecondaryStorage(db: Database): BetterAuthSecondaryStorage {
  const model = db.models.betterAuthSecondaryStorage as unknown as SecondaryStorageModel

  return {
    get: async (key) => {
      const now = new Date()
      const record = await model.findOne({ key }).exec()
      if (!record) {
        return null
      }
      if (isExpired(record.expiresAt, now)) {
        await model.deleteOne({ key, expiresAt: record.expiresAt }).exec()
        return null
      }
      return typeof record.counter === 'number' ? String(record.counter) : record.value
    },
    set: async (key, value, ttl) => {
      const now = new Date()
      await model
        .updateOne(
          { key },
          {
            $set: {
              counter: numericCounter(value),
              expiresAt: ttlExpiresAt(ttl, now),
              updatedAt: now,
              value
            },
            $setOnInsert: {
              createdAt: now,
              key
            }
          },
          { upsert: true }
        )
        .exec()
    },
    increment: async (key, ttl) => {
      const now = new Date()
      const existing = await model.findOne({ key }).exec()
      if (existing && isExpired(existing.expiresAt, now)) {
        await model.deleteOne({ key, expiresAt: existing.expiresAt }).exec()
      } else if (existing && typeof existing.counter !== 'number') {
        await model
          .updateOne({ key, counter: null }, { $set: { counter: numericCounter(existing.value) ?? 0 } })
          .exec()
      }

      const record = await model
        .findOneAndUpdate(
          { key },
          {
            $inc: {
              counter: 1
            },
            $set: {
              expiresAt: ttlExpiresAt(ttl, now),
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now,
              key,
              value: '0'
            }
          },
          { new: true, upsert: true }
        )
        .exec()
      const count = Math.max(0, Math.trunc(record?.counter ?? 0))
      await model.updateOne({ key }, { $set: { updatedAt: new Date(), value: String(count) } }).exec()
      return count
    },
    delete: async (key) => {
      await model.deleteOne({ key }).exec()
    }
  }
}

function numericCounter(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function ttlExpiresAt(ttl: number | undefined, now: Date): Date | null {
  return typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0
    ? new Date(now.getTime() + ttl * 1000)
    : null
}

function isExpired(value: Date | null | undefined, now: Date): boolean {
  return value instanceof Date && value.getTime() <= now.getTime()
}
