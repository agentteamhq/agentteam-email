import { HttpStatusCode } from '@main/common'
import { Elysia } from 'elysia'

const test = new Elysia({ name: 'test', prefix: '/test' })
  .get('/stream', async ({ status, set }) => {
    // SSE test endpoint - placeholder
    set.headers['Content-Type'] = 'text/event-stream'
    set.headers['Cache-Control'] = 'no-cache, no-store, no-transform'
    set.headers['Content-Encoding'] = 'identity'
    set.headers['Connection'] = 'keep-alive'
    set.headers['X-Accel-Buffering'] = 'no'

    return status(HttpStatusCode.NotFound, { message: 'Not found' })
  })
  .get('/new', async ({ status, set }) => {
    // Another SSE test endpoint - placeholder
    set.headers['Content-Type'] = 'text/event-stream'
    set.headers['Content-Encoding'] = 'identity'
    set.headers['X-Content-Type-Options'] = 'nosniff'
    set.headers['Connection'] = 'keep-alive'

    return status(HttpStatusCode.NotFound, { message: 'Not found' })
  })

export default test
