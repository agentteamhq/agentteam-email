import { Elysia, t } from 'elysia'

import {
  getAgentMailStatusForWeb,
  isAgentMailAccessError,
  submitAgentMailOutboundFromWeb
} from '../agent-mail/service'
import {
  agentMailWebErrorStatus,
  createAgentMailFolderForWeb,
  deleteAgentMailFolderForWeb,
  deleteAgentMailMessageForWeb,
  getAgentMailAccountsForWeb,
  getAgentMailAttachmentForWeb,
  getAgentMailOriginalSourceForWeb,
  getAgentMailWorkspaceForWeb,
  isAgentMailWebmailError,
  moveAgentMailMessageForWeb,
  saveAgentMailDraftForWeb,
  sendAgentMailDraftForWeb,
  sendAgentMailMessageForWeb,
  updateAgentMailMessageForWeb
} from '../agent-mail/webmail-service'

const accountParamsSchema = t.Object({
  accountId: t.String({ minLength: 3 })
})

const messageParamsSchema = t.Object({
  accountId: t.String({ minLength: 3 }),
  mailboxId: t.String({ minLength: 1 }),
  messageId: t.String({ minLength: 1 })
})

const composeReferenceSchema = t.Object({
  action: t.Union([t.Literal('forward'), t.Literal('reply'), t.Literal('replyAll')]),
  mailboxId: t.String({ minLength: 1 }),
  messageId: t.String({ minLength: 1 })
})

const composeBodySchema = t.Object({
  bcc: t.Optional(t.String()),
  body: t.String(),
  cc: t.Optional(t.String()),
  html: t.Optional(t.String()),
  reference: t.Optional(composeReferenceSchema),
  subject: t.Optional(t.String()),
  to: t.Optional(t.String())
})

const mail = new Elysia({
  name: 'mail',
  prefix: '/mail'
})
  .get('/accounts', async ({ request, status }) => {
    try {
      return await getAgentMailAccountsForWeb(request.headers)
    } catch (error) {
      return mailErrorResponse(error, status)
    }
  })
  .get(
    '/workspace',
    async ({ query, request, status }) => {
      try {
        return await getAgentMailWorkspaceForWeb({
          headers: request.headers,
          input: {
            accountId: query.accountId,
            cursor: query.cursor,
            direction: query.direction,
            folderId: query.folderId,
            limit: query.limit,
            messageId: query.messageId,
            query: query.query,
            unreadOnly: query.unreadOnly
          }
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      query: t.Object({
        accountId: t.Optional(t.String({ minLength: 3 })),
        cursor: t.Optional(t.String({ minLength: 1 })),
        direction: t.Optional(t.Union([t.Literal('next'), t.Literal('previous')])),
        folderId: t.Optional(t.String({ minLength: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        messageId: t.Optional(t.String({ minLength: 1 })),
        query: t.Optional(t.String()),
        unreadOnly: t.Optional(t.Boolean())
      })
    }
  )
  .get(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId/attachments/:attachmentId',
    async ({ params, request, status }) => {
      try {
        return await getAgentMailAttachmentForWeb({
          accountId: params.accountId,
          attachmentId: params.attachmentId,
          headers: request.headers,
          mailboxId: params.mailboxId,
          messageId: params.messageId
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      params: t.Object({
        accountId: t.String({ minLength: 3 }),
        attachmentId: t.String({ minLength: 1 }),
        mailboxId: t.String({ minLength: 1 }),
        messageId: t.String({ minLength: 1 })
      })
    }
  )
  .get(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId/source',
    async ({ params, request, status }) => {
      try {
        return await getAgentMailOriginalSourceForWeb({
          accountId: params.accountId,
          headers: request.headers,
          mailboxId: params.mailboxId,
          messageId: params.messageId
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      params: t.Object({
        accountId: t.String({ minLength: 3 }),
        mailboxId: t.String({ minLength: 1 }),
        messageId: t.String({ minLength: 1 })
      })
    }
  )
  .post(
    '/accounts/:accountId/messages',
    async ({ body, params, request, status }) => {
      try {
        return await sendAgentMailMessageForWeb({
          headers: request.headers,
          input: {
            accountId: params.accountId,
            bcc: body.bcc,
            body: body.body,
            cc: body.cc,
            html: body.html,
            reference: body.reference,
            subject: body.subject,
            to: body.to
          }
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      body: composeBodySchema,
      params: accountParamsSchema
    }
  )
  .post(
    '/accounts/:accountId/drafts',
    async ({ body, params, request, status }) => {
      try {
        return await saveAgentMailDraftForWeb({
          headers: request.headers,
          input: {
            accountId: params.accountId,
            bcc: body.bcc,
            body: body.body,
            cc: body.cc,
            draftMailboxId: body.draftMailboxId,
            draftMessageId: body.draftMessageId,
            html: body.html,
            reference: body.reference,
            subject: body.subject,
            to: body.to
          }
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      body: t.Intersect([
        composeBodySchema,
        t.Object({
          draftMailboxId: t.Optional(t.String({ minLength: 1 })),
          draftMessageId: t.Optional(t.String({ minLength: 1 }))
        })
      ]),
      params: accountParamsSchema
    }
  )
  .post(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId/send-draft',
    async ({ params, request, status }) => {
      try {
        return await sendAgentMailDraftForWeb({
          headers: request.headers,
          input: params
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      params: messageParamsSchema
    }
  )
  .patch(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId',
    async ({ body, params, request, status }) => {
      try {
        return await updateAgentMailMessageForWeb({
          headers: request.headers,
          input: {
            ...params,
            flagged: body.flagged,
            seen: body.seen
          }
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      body: t.Object({
        flagged: t.Optional(t.Boolean()),
        seen: t.Optional(t.Boolean())
      }),
      params: messageParamsSchema
    }
  )
  .post(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId/move',
    async ({ body, params, request, status }) => {
      try {
        return await moveAgentMailMessageForWeb({
          headers: request.headers,
          input: {
            ...params,
            targetMailboxId: body.targetMailboxId
          }
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      body: t.Object({
        targetMailboxId: t.String({ minLength: 1 })
      }),
      params: messageParamsSchema
    }
  )
  .delete(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId',
    async ({ params, request, status }) => {
      try {
        return await deleteAgentMailMessageForWeb({
          headers: request.headers,
          input: params
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      params: messageParamsSchema
    }
  )
  .post(
    '/accounts/:accountId/mailboxes',
    async ({ body, params, request, status }) => {
      try {
        return await createAgentMailFolderForWeb({
          accountId: params.accountId,
          headers: request.headers,
          name: body.name
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 })
      }),
      params: accountParamsSchema
    }
  )
  .delete(
    '/accounts/:accountId/mailboxes/:mailboxId',
    async ({ params, request, status }) => {
      try {
        return await deleteAgentMailFolderForWeb({
          accountId: params.accountId,
          headers: request.headers,
          mailboxId: params.mailboxId
        })
      } catch (error) {
        return mailErrorResponse(error, status)
      }
    },
    {
      params: t.Object({
        accountId: t.String({ minLength: 3 }),
        mailboxId: t.String({ minLength: 1 })
      })
    }
  )
  .get('/status', async ({ request, status }) => {
    try {
      return await getAgentMailStatusForWeb(request.headers)
    } catch (error) {
      return mailErrorResponse(error, status)
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
        if (isAgentMailAccessError(error) || isAgentMailWebmailError(error)) {
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

function mailErrorResponse(error: unknown, status: (code: number, response: { error: string }) => unknown) {
  if (isAgentMailAccessError(error) || isAgentMailWebmailError(error)) {
    return status(error.status, { error: error.message })
  }

  const webmailStatus = agentMailWebErrorStatus(error)
  if (webmailStatus) {
    return status(webmailStatus, { error: error instanceof Error ? error.message : 'Mail service failed' })
  }

  throw error
}

export default mail
