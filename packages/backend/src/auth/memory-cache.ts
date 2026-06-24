/**
 * Simple in-memory LRU cache using native JavaScript Map.
 * Map preserves insertion order, so we can implement LRU by
 * deleting and re-inserting keys on access.
 */

const MAX_KEYS = 1000

interface MemoryCacheEntry {
  expiresAt: number | null
  value: string
}

export class MemoryCache {
  private cache = new Map<string, MemoryCacheEntry>()

  get(key: string): string | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }
    if (this.isExpired(entry)) {
      this.cache.delete(key)
      return null
    }

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set(key: string, value: string, ttl?: number): void {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    this.prune()
    // Evict oldest entries if at capacity
    while (this.cache.size >= MAX_KEYS) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }
    this.cache.set(key, {
      expiresAt: expiresAt(ttl),
      value
    })
  }

  increment(key: string, ttl?: number): number {
    const current = this.get(key)
    const count = Math.max(0, Number.parseInt(current ?? '0', 10) || 0) + 1
    this.set(key, String(count), ttl)
    return count
  }

  remove(key: string): void {
    this.cache.delete(key)
  }

  private prune(): void {
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key)
      }
    }
  }

  private isExpired(entry: MemoryCacheEntry): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now()
  }
}

function expiresAt(ttl: number | undefined): number | null {
  return typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0 ? Date.now() + ttl * 1000 : null
}

// Static instance
export const memoryCache = new MemoryCache()
