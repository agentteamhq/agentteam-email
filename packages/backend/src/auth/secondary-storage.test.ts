import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMongoSecondaryStorage } from './secondary-storage'
import type { Database } from '../db/db'

const secondaryStorageTestState = {
  deleteOne: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn()
}

function execResult<T>(value: T) {
  return {
    exec: () => Promise.resolve(value)
  }
}

function storage() {
  return createMongoSecondaryStorage({
    models: {
      betterAuthSecondaryStorage: secondaryStorageTestState
    }
  } as unknown as Database)
}

describe('Mongo secondary storage', () => {
  beforeEach(() => {
    vi.useRealTimers()
    secondaryStorageTestState.deleteOne.mockReset()
    secondaryStorageTestState.findOne.mockReset()
    secondaryStorageTestState.findOneAndUpdate.mockReset()
    secondaryStorageTestState.updateOne.mockReset()
    secondaryStorageTestState.deleteOne.mockReturnValue(execResult({ deletedCount: 0 }))
    secondaryStorageTestState.findOne.mockReturnValue(execResult(null))
    secondaryStorageTestState.findOneAndUpdate.mockReturnValue(execResult(null))
    secondaryStorageTestState.updateOne.mockReturnValue(execResult({ modifiedCount: 1, upsertedCount: 0 }))
  })

  it('returns durable string values and deletes expired entries', async () => {
    expect.hasAssertions()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T12:00:00.000Z'))
    try {
      secondaryStorageTestState.findOne.mockReturnValueOnce(
        execResult({
          counter: null,
          expiresAt: new Date('2026-06-23T12:00:01.000Z'),
          key: 'agent:jwks',
          value: 'cached-jwks'
        })
      )
      await expect(storage().get('agent:jwks')).resolves.toBe('cached-jwks')

      secondaryStorageTestState.findOne.mockReturnValueOnce(
        execResult({
          counter: null,
          expiresAt: new Date('2026-06-23T11:59:59.000Z'),
          key: 'agent:jti',
          value: 'used'
        })
      )
      await expect(storage().get('agent:jti')).resolves.toBeNull()
      expect(secondaryStorageTestState.deleteOne).toHaveBeenCalledWith({
        expiresAt: new Date('2026-06-23T11:59:59.000Z'),
        key: 'agent:jti'
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('stores ttl-bound values through the shared database model', async () => {
    expect.hasAssertions()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T12:00:00.000Z'))
    try {
      await storage().set('rate-limit:ip', '7', 60)
      expect(secondaryStorageTestState.updateOne).toHaveBeenCalledWith(
        { key: 'rate-limit:ip' },
        {
          $set: {
            counter: 7,
            expiresAt: new Date('2026-06-23T12:01:00.000Z'),
            updatedAt: new Date('2026-06-23T12:00:00.000Z'),
            value: '7'
          },
          $setOnInsert: {
            createdAt: new Date('2026-06-23T12:00:00.000Z'),
            key: 'rate-limit:ip'
          }
        },
        { upsert: true }
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('increments counters atomically after normalizing legacy string values', async () => {
    expect.hasAssertions()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T12:00:00.000Z'))
    try {
      secondaryStorageTestState.findOne.mockReturnValueOnce(
        execResult({
          counter: null,
          expiresAt: null,
          key: 'agent:register',
          value: '4'
        })
      )
      secondaryStorageTestState.findOneAndUpdate.mockReturnValueOnce(
        execResult({
          counter: 5,
          expiresAt: new Date('2026-06-23T12:01:00.000Z'),
          key: 'agent:register',
          value: '4'
        })
      )

      const secondaryStorage = storage()
      if (!secondaryStorage.increment) {
        throw new Error('secondary storage increment is required')
      }
      await expect(secondaryStorage.increment('agent:register', 60)).resolves.toBe(5)
      expect(secondaryStorageTestState.updateOne).toHaveBeenNthCalledWith(
        1,
        { counter: null, key: 'agent:register' },
        { $set: { counter: 4 } }
      )
      expect(secondaryStorageTestState.findOneAndUpdate).toHaveBeenCalledWith(
        { key: 'agent:register' },
        {
          $inc: {
            counter: 1
          },
          $set: {
            expiresAt: new Date('2026-06-23T12:01:00.000Z'),
            updatedAt: new Date('2026-06-23T12:00:00.000Z')
          },
          $setOnInsert: {
            createdAt: new Date('2026-06-23T12:00:00.000Z'),
            key: 'agent:register',
            value: '0'
          }
        },
        { returnDocument: 'after', upsert: true }
      )
      expect(secondaryStorageTestState.updateOne).toHaveBeenNthCalledWith(
        2,
        { key: 'agent:register' },
        {
          $set: {
            updatedAt: new Date('2026-06-23T12:00:00.000Z'),
            value: '5'
          }
        }
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
