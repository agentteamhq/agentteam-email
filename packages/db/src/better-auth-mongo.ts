import type { BetterAuthOptions } from '@better-auth/core'
import type { DBAdapter } from '@better-auth/core/db/adapter'
import type { MongoDBAdapterConfig } from '@better-auth/mongo-adapter'
import { mongodbAdapter } from '@better-auth/mongo-adapter'
import type { Db, MongoClient } from 'mongodb'
import { UUID } from 'mongodb'
import type { Connection } from 'mongoose'

import { createUUIDv7 } from './ids'

export type BetterAuthMongoAdapterConfig = MongoDBAdapterConfig
export type BetterAuthMongoAdapterFactory = (options: BetterAuthOptions) => DBAdapter

export function createMongoUUIDv7(): UUID {
  return new UUID(createUUIDv7())
}

/*
 * Better Auth's official Mongo adapter stores native Mongo UUIDs only on its
 * built-in `generateId: "uuid"` path, which currently generates UUIDv4 values.
 * Do not use a custom Better Auth id generator that returns UUIDv7 strings if
 * native BSON UUID storage is required.
 */
export function createBetterAuthMongoAdapter(
  db: Db,
  config?: BetterAuthMongoAdapterConfig
): BetterAuthMongoAdapterFactory {
  return mongodbAdapter(db, config)
}

export function createBetterAuthMongoAdapterFromMongooseConnection(
  connection: Connection,
  config?: Omit<BetterAuthMongoAdapterConfig, 'client'> & { client?: MongoClient }
): BetterAuthMongoAdapterFactory {
  const db = connection.db

  if (!db) {
    throw new Error('Mongoose connection is not attached to a MongoDB database.')
  }

  return createBetterAuthMongoAdapter(db, {
    ...config,
    client: config?.client ?? connection.getClient()
  })
}
