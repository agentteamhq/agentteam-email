/**
 * Centralized globals module for HMR-safe singletons.
 *
 * This module provides type-safe access to global singletons that survive
 * Vite HMR reloads. Instead of creating new instances, it caches references
 * on globalThis so that module reloads don't create duplicate connections.
 *
 * Usage:
 *   import { globals } from './globals'
 *
 *   const { db } = await globals()
 *   const { auth } = await globals()
 *
 * globals() is async so that future initialization can include async steps
 * (e.g. waiting for DB readiness). Callers must always await it.
 */

import { ShutdownManager } from '@main/shutdown-manager'
import debug from 'debug'

import { createGlobalAuth } from './auth/auth'
import { createDatabase } from './db/db'
import { PRIVATE_VARS } from './vars.private'
import type { GlobalAuth } from './auth/auth'
import type { Database } from './db/db'

// Unique symbol key for globalThis - guarantees no collisions
const GLOBALS_KEY = Symbol.for('server.globals')

/**
 * Shape of initialized server globals (all required fields present).
 */
export interface ServerGlobals {
  db: Database

  auth: GlobalAuth
  shutdownManager: ShutdownManager
}

/**
 * Shape of all server globals (internal storage, allows undefined during init).
 */
interface ServerGlobalsStorage extends Partial<ServerGlobals> {
  initialized?: boolean
  initializationPromise?: Promise<ServerGlobals>
}

// Typed accessor for globalThis with symbol key
type GlobalWithServerGlobals = typeof globalThis & {
  [GLOBALS_KEY]?: ServerGlobalsStorage
}

const typedGlobal = globalThis as GlobalWithServerGlobals

function assertServerGlobals(
  container: ServerGlobalsStorage
): asserts container is ServerGlobalsStorage & ServerGlobals {
  if (!container.db || !container.auth || !container.shutdownManager) {
    throw new Error('Server globals are missing required initialized singletons')
  }
}

async function createServerGlobals(container: ServerGlobalsStorage): Promise<ServerGlobals> {
  container.db ??= await createDatabase(PRIVATE_VARS.DATABASE_URL)
  container.auth ??= createGlobalAuth(container.db)
  container.shutdownManager ??= new ShutdownManager(debug('app:shutdown'))
  container.shutdownManager.add('database', container.db.close)

  container.initialized = true
  assertServerGlobals(container)
  return container
}

/**
 * Initialize all globals lazily.
 * Only runs once, subsequent calls return cached instance.
 */
async function initializeGlobals(): Promise<ServerGlobals> {
  // Return existing if already initialized
  const existingContainer = typedGlobal[GLOBALS_KEY]
  if (existingContainer?.initialized) {
    assertServerGlobals(existingContainer)
    return existingContainer
  }

  // Create container if needed
  typedGlobal[GLOBALS_KEY] ??= {}

  const container = typedGlobal[GLOBALS_KEY]

  container.initializationPromise ??= createServerGlobals(container)

  try {
    return await container.initializationPromise
  } catch (error) {
    container.initializationPromise = undefined
    throw error
  }
}

/**
 * Access server globals with HMR-safe caching.
 *
 * Returns a Promise that resolves to the initialized globals. Currently
 * initialization opens the MongoDB connection, so concurrent callers share the
 * same in-flight initialization promise.
 *
 * @example
 * ```ts
 * import { globals } from './globals'
 *
 * const { db } = await globals()
 * const users = await db.models.user.find()
 *
 * const { auth } = await globals()
 * const session = await auth.api.getSession({ headers })
 * ```
 */
export async function globals(): Promise<ServerGlobals> {
  return initializeGlobals()
}

/**
 * Shutdown and clear all cached globals.
 * Call this during graceful shutdown to clean up connections.
 */
export async function shutdownGlobals(): Promise<void> {
  const container = typedGlobal[GLOBALS_KEY]
  if (!container) {
    return
  }

  await container.db?.close()

  typedGlobal[GLOBALS_KEY] = undefined
}

/**
 * Check if globals have been initialized.
 * Useful for conditional logic during HMR or testing.
 */
export function isInitialized(): boolean {
  return typedGlobal[GLOBALS_KEY]?.initialized === true
}
