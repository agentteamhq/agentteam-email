import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbTestState = vi.hoisted(() => {
  const connectionHandlers: Record<string, ((value?: unknown) => void) | undefined> = {}
  const connection = {
    asPromise: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, handler: (value?: unknown) => void) => {
      connectionHandlers[event] = handler
      return connection
    }),
    readyState: 1
  }

  return {
    connection,
    connectionHandlers,
    createAppModels: vi.fn(),
    createConnection: vi.fn(),
    debugFactory: Object.assign(vi.fn(), {
      disable: vi.fn(),
      enable: vi.fn(),
      enabled: vi.fn()
    }),
    debugLog: vi.fn()
  }
})

vi.mock('@main/db', () => ({
  createAppModels: dbTestState.createAppModels
}))

vi.mock('debug', () => ({
  default: dbTestState.debugFactory
}))

vi.mock('mongoose', () => ({
  default: {
    createConnection: dbTestState.createConnection
  },
  STATES: {
    disconnected: 0
  }
}))

describe('database connection logging', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const key of Object.keys(dbTestState.connectionHandlers)) {
      dbTestState.connectionHandlers[key] = undefined
    }
    dbTestState.connection.asPromise.mockReset()
    dbTestState.connection.asPromise.mockResolvedValue(dbTestState.connection)
    dbTestState.connection.close.mockReset()
    dbTestState.connection.on.mockClear()
    dbTestState.createAppModels.mockReset()
    dbTestState.createAppModels.mockReturnValue({})
    dbTestState.createConnection.mockReset()
    dbTestState.createConnection.mockReturnValue(dbTestState.connection)
    dbTestState.debugFactory.mockClear()
    dbTestState.debugFactory.mockImplementation(() => dbTestState.debugLog)
    dbTestState.debugLog.mockReset()
  })

  it('logs MongoDB connection errors with bounded metadata', async () => {
    expect.hasAssertions()

    const { createDatabase } = await import('./db')
    await createDatabase(
      'mongodb://SENSITIVE_URI_USERNAME:SENSITIVE_URI_PASSWORD@mongo.example.test:27017/app?authSource=admin'
    )

    const error = new Error(
      'SENSITIVE_ERROR_MESSAGE mongodb://SENSITIVE_URI_USERNAME:SENSITIVE_URI_PASSWORD@mongo.example.test:27017/app?authSource=SENSITIVE_QUERY_VALUE'
    ) as Error & {
      code: string
      statusCode: number
    }
    error.name = 'MongooseServerSelectionError'
    error.code = 'MONGODB_CONNECTION_FAILED'
    error.statusCode = 503
    error.stack = 'SENSITIVE_STACK_VALUE'

    dbTestState.connectionHandlers.error?.(error)

    expect(dbTestState.debugLog).toHaveBeenCalledWith('MongoDB connection error %o', {
      code: 'MONGODB_CONNECTION_FAILED',
      message: 'SENSITIVE_ERROR_MESSAGE  url_redacted',
      name: 'MongooseServerSelectionError',
      statusCode: 503,
      type: 'object'
    })
    const serializedLogCalls = JSON.stringify(dbTestState.debugLog.mock.calls)
    expect(serializedLogCalls).not.toContain('SENSITIVE_URI_USERNAME')
    expect(serializedLogCalls).not.toContain('SENSITIVE_URI_PASSWORD')
    expect(serializedLogCalls).not.toContain('mongo.example.test')
    expect(serializedLogCalls).not.toContain('SENSITIVE_QUERY_VALUE')
    expect(serializedLogCalls).toContain('SENSITIVE_ERROR_MESSAGE')
    expect(serializedLogCalls).not.toContain('SENSITIVE_STACK_VALUE')
  })
})
