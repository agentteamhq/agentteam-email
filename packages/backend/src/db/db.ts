/* eslint-disable no-console */
import { createAppModels, type AppModels } from '@main/db'
import debug from 'debug'
import mongoose, { type Connection } from 'mongoose'

const log = debug('app:db')

export type Database = {
  connection: Connection
  models: AppModels
  close: () => Promise<void>
}

export async function createDatabase(connectionString: string): Promise<Database> {
  const connection = mongoose.createConnection(connectionString, {
    maxPoolSize: 40,
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
      if (connection.readyState !== 0) {
        await connection.close(false)
      }
    },
    connection,
    models
  }
}
