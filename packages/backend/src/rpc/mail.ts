import { Elysia, t } from 'elysia'

import {
  getAgentMailStatusForWeb,
  isAgentMailAccessError,
  submitAgentMailOutboundFromWeb
} from '../agent-mail/service'

const mail = new Elysia({
  name: 'mail',
  prefix: '/mail'
})
  .get('/status', async ({ request, status }) => {
    try {
      return await getAgentMailStatusForWeb(request.headers)
    } catch (error) {
      if (isAgentMailAccessError(error)) {
        return status(error.status, { error: error.message })
      }
      throw error
    }
  })
  .post(
    '/outbound',
    async ({ body, request, status }) => {
      try {
        return await submitAgentMailOutboundFromWeb({
          headers: request.headers,
          input: {
            from: body.from,
            subject: body.subject,
            text: body.text,
            to: body.to
          }
        })
      } catch (error) {
        if (isAgentMailAccessError(error)) {
          return status(error.status, { error: error.message })
        }
        return status(400, { error: error instanceof Error ? error.message : 'Invalid send request' })
      }
    },
    {
      body: t.Object({
        from: t.String({ minLength: 3 }),
        subject: t.String({ minLength: 1 }),
        text: t.String({ minLength: 1 }),
        to: t.Array(t.String({ minLength: 3 }), { minItems: 1 })
      })
    }
  )

export default mail
