import { Elysia, t } from 'elysia'

import {
  getIntegrationsViewForWeb,
  isIntegrationsError,
  revokePaperclipIntegrationForWeb
} from '../integrations/service'
import { PAPERCLIP_EMAIL_PLUGIN_ID } from '../agent-access/paperclip'
import { typedResponseSchema } from './response-schema'
import type {
  IntegrationsView,
  RevokePaperclipIntegrationResult
} from '../integrations/service'

type IntegrationsErrorBody = {
  error: string
}
type IntegrationsResponseSet = {
  headers: Record<string, number | string>
  status?: number | string
}

const integrationsErrorResponseSchema = t.Object({
  error: t.String()
})
const integrationsErrorResponseSchemas = {
  400: integrationsErrorResponseSchema,
  401: integrationsErrorResponseSchema,
  403: integrationsErrorResponseSchema,
  404: integrationsErrorResponseSchema,
  409: integrationsErrorResponseSchema
}
const paperclipIntegrationStatusSchema = t.Union([
  t.Literal('connected'),
  t.Literal('needs_reauthorization'),
  t.Literal('unavailable')
])
const paperclipIntegrationResponseSchema = t.Object({
  clientId: t.String(),
  name: t.String(),
  pluginId: t.Literal(PAPERCLIP_EMAIL_PLUGIN_ID),
  requiresReauthorization: t.Boolean(),
  status: paperclipIntegrationStatusSchema
})
const integrationsViewResponseSchema = t.Object({
  allowedActions: t.Object({
    revokePaperclip: t.Boolean()
  }),
  organizationId: t.String(),
  paperclip: t.Object({
    available: t.Boolean(),
    connections: t.Array(paperclipIntegrationResponseSchema)
  }),
  state: t.Union([t.Literal('empty'), t.Literal('ready')])
})
const revokePaperclipIntegrationBodySchema = t.Object(
  {
    clientId: t.String({ maxLength: 256, minLength: 1 })
  },
  { additionalProperties: false }
)
const revokePaperclipIntegrationResponseSchema = t.Object({
  status: t.Literal('revoked'),
  success: t.Literal(true),
  view: integrationsViewResponseSchema
})

const integrations = new Elysia({
  name: 'integrations',
  normalize: false,
  prefix: '/integrations'
})
  .get(
    '/',
    async ({ request, set }) =>
      handleIntegrationsError(() => getIntegrationsViewForWeb({ headers: request.headers }), set),
    {
      response: {
        200: typedResponseSchema<IntegrationsView>(integrationsViewResponseSchema),
        ...integrationsErrorResponseSchemas
      }
    }
  )
  .post(
    '/paperclip/revoke',
    async ({ body, request, set }) =>
      handleIntegrationsError(
        () => revokePaperclipIntegrationForWeb({ headers: request.headers, input: body }),
        set
      ),
    {
      body: revokePaperclipIntegrationBodySchema,
      response: {
        200: typedResponseSchema<RevokePaperclipIntegrationResult>(
          revokePaperclipIntegrationResponseSchema
        ),
        ...integrationsErrorResponseSchemas
      }
    }
  )

async function handleIntegrationsError<T>(
  operation: () => Promise<T>,
  set: IntegrationsResponseSet
): Promise<T | IntegrationsErrorBody> {
  try {
    return await operation()
  } catch (error) {
    const status = isIntegrationsError(error) ? error.status : 409
    set.status = status
    if (status === 401) {
      set.headers['www-authenticate'] = 'Session realm="AgentTeam Email integrations"'
    }
    return { error: error instanceof Error ? error.message : 'Integrations request failed' }
  }
}

export default integrations
