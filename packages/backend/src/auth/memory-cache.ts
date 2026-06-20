/**
 * Simple in-memory LRU cache using native JavaScript Map.
 * Map preserves insertion order, so we can implement LRU by
 * deleting and re-inserting keys on access.
 */

const MAX_KEYS = 1000

class MemoryCache {
  private cache = new Map<string, string>()

  get(key: string): string | null {
    const value = this.cache.get(key)
    if (value === undefined) {
      return null
    }
    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key: string, value: string, _ttl?: number): void {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Evict oldest entries if at capacity
    while (this.cache.size >= MAX_KEYS) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }
    this.cache.set(key, value)
  }

  remove(key: string): void {
    this.cache.delete(key)
  }
}

// Static instance
export const memoryCache = new MemoryCache()
