import { mongodbAdapter } from '@better-auth/mongo-adapter'
import { UUID } from 'mongodb'
import { createUUIDv7, isUUIDv7 } from './ids'
import { betterAuthSchemas } from './schema/better-auth'
import type { BetterAuthOptions } from '@better-auth/core'
import type { DBAdapter } from '@better-auth/core/db/adapter'
import type { MongoDBAdapterConfig } from '@better-auth/mongo-adapter'
import type { Collection, Db, InsertOneOptions, MongoClient, OptionalUnlessRequiredId } from 'mongodb'
import type { Connection } from 'mongoose'

export type BetterAuthMongoAdapterConfig = MongoDBAdapterConfig
export type BetterAuthMongoAdapterFactory = (options: BetterAuthOptions) => DBAdapter

const betterAuthUUIDv7Models = new Set(Object.keys(betterAuthSchemas))

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
  return mongodbAdapter(withBetterAuthUUIDv7InsertIds(db), config)
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

export function ensureBetterAuthUUIDv7InsertDocumentId(
  model: string,
  document: Record<string, unknown>
): void {
  if (!betterAuthUUIDv7Models.has(model)) {
    return
  }

  const currentId = document._id
  if (currentId instanceof UUID && isUUIDv7(currentId.toString())) {
    return
  }

  document._id = createMongoUUIDv7()
}

function withBetterAuthUUIDv7InsertIds(db: Db): Db {
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'collection') {
        return getProxyProperty(target, property, receiver)
      }

      return (
        name: string,
        ...args: Parameters<Db['collection']> extends [string, ...infer TRest] ? TRest : never
      ) => wrapCollectionInsertOne(target.collection(name, ...args), name)
    }
  })
}

function wrapCollectionInsertOne<TSchema extends Record<string, unknown>>(
  collection: Collection<TSchema>,
  model: string
): Collection<TSchema> {
  if (!betterAuthUUIDv7Models.has(model)) {
    return collection
  }

  return new Proxy(collection, {
    get(target, property, receiver) {
      if (property !== 'insertOne') {
        return getProxyProperty(target, property, receiver)
      }

      return (document: OptionalUnlessRequiredId<TSchema>, options?: InsertOneOptions) => {
        ensureBetterAuthUUIDv7InsertDocumentId(model, document)
        return target.insertOne(document, options)
      }
    }
  })
}

function getProxyProperty(target: object, property: string | symbol, receiver: unknown): unknown {
  return Reflect.get(target, property, receiver)
}
