import { HttpStatusCode } from '@main/common'
import { Elysia } from 'elysia'

import { globals } from '../globals'

const whoami = new Elysia({ name: 'whoami', prefix: '/whoami' }).get('/', async ({ status, request }) => {
  const { db, auth } = await globals()

  const res = await auth.api.getSession({ headers: request.headers })
  const session = res?.session
  const user = res?.user

  return status(HttpStatusCode.Ok, {
    whoami: {
      user: user ? { name: user.name, email: user.email } : null,
      session: session
        ? {
            userAgent: session.userAgent,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            expiresAt: session.expiresAt
          }
        : null,
      db: Boolean(db)
    }
  })
})

export default whoami
