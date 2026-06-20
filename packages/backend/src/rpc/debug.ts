import { HttpStatusCode } from '@main/common'
import { Elysia } from 'elysia'

const debugRoute = new Elysia({ name: 'debug', prefix: '/debug' })
  // Synchronous throw
  .get('/error', () => {
    throw new Error('Intentional test error (sync)')
  })
  // Async rejection
  .get('/rejection', async () => {
    return new Promise<never>((_resolve, reject) => {
      reject(new Error('Intentional test rejection (async)'))
    })
  })
  // Simple success for control testing
  .get('/ok', ({ status }) => {
    return status(HttpStatusCode.Ok, { message: 'Debug endpoint OK' })
  })

export default debugRoute
