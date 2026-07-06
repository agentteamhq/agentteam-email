import debug from 'debug'
import { Elysia, t } from 'elysia'

import {
  getIntegrationsViewForWeb,
  isIntegrationsError,
  revokePaperclipIntegrationForWeb
} from '../integrations/service'
import { PAPERCLIP_EMAIL_PLUGIN_ID } from '../agent-access/paperclip'
import { createSafeErrorLogDetails, createSafeRequestLogDetails } from '../auth/log-redaction'
import {
  createSafeRequestCorrelationLogDetails,
  mapPublicErrorResponse,
  publicErrorResponseBodySchema
} from '../public-error-response'
import { typedResponseSchema } from './response-schema'
import type { IntegrationsView, RevokePaperclipIntegrationResult } from '../integrations/service'
import type { PublicErrorResponseBody } from '../public-error-response'

type IntegrationsResponseSet = {
  headers: Record<string, number | string>
  status?: number | string
}
type IntegrationsRpcOperation = 'integrations_paperclip_revoke' | 'integrations_view'

const integrationsErrorResponseSchemas = {
  400: publicErrorResponseBodySchema,
  401: publicErrorResponseBodySchema,
  403: publicErrorResponseBodySchema,
  404: publicErrorResponseBodySchema,
  409: publicErrorResponseBodySchema,
  500: publicErrorResponseBodySchema
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
const log = debug('app:rpc:integrations')

const integrations = new Elysia({
  name: 'integrations',
  normalize: false,
  prefix: '/integrations'
})
  .get(
    '/',
    async ({ request, set }) =>
      handleIntegrationsError(
        () => getIntegrationsViewForWeb({ headers: request.headers }),
        set,
        request,
        'integrations_view'
      ),
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
        set,
        request,
        'integrations_paperclip_revoke'
      ),
    {
      body: revokePaperclipIntegrationBodySchema,
      response: {
        200: typedResponseSchema<RevokePaperclipIntegrationResult>(revokePaperclipIntegrationResponseSchema),
        ...integrationsErrorResponseSchemas
      }
    }
  )

async function handleIntegrationsError<T>(
  operation: () => Promise<T>,
  set: IntegrationsResponseSet,
  request: Request,
  operationName: IntegrationsRpcOperation
): Promise<T | PublicErrorResponseBody> {
  try {
    return await operation()
  } catch (error) {
    const status = isIntegrationsError(error) ? error.status : 500
    const publicError = mapPublicErrorResponse({ code: status, error, request })
    set.status = publicError.status
    if (status === 401) {
      set.headers['www-authenticate'] = 'Session realm="AgentTeam Email integrations"'
    }
    log('integrations_rpc_error %o', {
      error: createSafeErrorLogDetails(error),
      ...createSafeRequestCorrelationLogDetails(request),
      ...createSafeRequestLogDetails(request),
      operation: operationName,
      publicError: {
        code: publicError.body.code,
        status: publicError.status,
        ...(publicError.body.supportReference ? { supportReference: publicError.body.supportReference } : {})
      },
      status: publicError.status
    })
    return publicError.body
  }
}

export default integrations
