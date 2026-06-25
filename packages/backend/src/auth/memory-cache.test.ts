import { describe, expect, it, vi } from 'vitest'

import { MemoryCache } from './memory-cache'

describe('MemoryCache', () => {
  it('expires normal entries by ttl', () => {
    expect.hasAssertions()
    vi.useFakeTimers()
    try {
      const cache = new MemoryCache()

      cache.set('session', 'value', 1)
      expect(cache.get('session')).toBe('value')

      vi.advanceTimersByTime(1001)
      expect(cache.get('session')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('increments counters within the ttl window and resets after expiry', () => {
    expect.hasAssertions()
    vi.useFakeTimers()
    try {
      const cache = new MemoryCache()

      expect(cache.increment('rate-limit', 1)).toBe(1)
      expect(cache.increment('rate-limit', 1)).toBe(2)

      vi.advanceTimersByTime(1001)
      expect(cache.increment('rate-limit', 1)).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
