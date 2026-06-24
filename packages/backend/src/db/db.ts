/* eslint-disable no-console */
import { createAppModels } from '@main/db'
import debug from 'debug'
import mongoose, { STATES } from 'mongoose'
import type { AppModels } from '@main/db'
import type { Connection } from 'mongoose'

const log = debug('app:db')

export type Database = {
  connection: Connection
  models: AppModels
  close: () => Promise<void>
}

export type DatabaseOptions = {
  maxPoolSize?: number
}

const DEFAULT_DATABASE_MAX_POOL_SIZE = 8

export async function createDatabase(
  connectionString: string,
  options: DatabaseOptions = {}
): Promise<Database> {
  const connection = mongoose.createConnection(connectionString, {
    maxPoolSize: options.maxPoolSize ?? DEFAULT_DATABASE_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: 10_000
  })

  connection.on('connected', () => {
    log('MongoDB connected')
  })
  connection.on('disconnected', () => {
    log('MongoDB disconnected')
  })
  connection.on('error', (error) => {
    log('MongoDB connection error', error)
  })

  try {
    await connection.asPromise()
  } catch (error) {
    console.log('\n\nDATABASE NOT RUNNING!\n')
    console.log('-> Did you forget to start your database?')
    console.log('-> Make sure MongoDB is running on the expected host and port\n')
    throw error
  }

  const models = createAppModels(connection)
  await Promise.all(Object.values(models).map((model) => model.init()))

  return {
    close: async () => {
      if (connection.readyState !== STATES.disconnected) {
        await connection.close(false)
      }
    },
    connection,
    models
  }
}
