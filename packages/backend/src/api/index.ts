import { HttpStatusCode } from '@main/common'
import { AgentMailTrialCapabilityValues } from '@main/db'
import debug from 'debug'
import { Elysia, t } from 'elysia'

import { isAgentMailTrialError, startAgentMailTrial } from '../agent-access/trial-service'
import { createSafeErrorLogDetails, createSafeRequestLogDetails } from '../auth/log-redaction'
import { handleBetterAuthProtocolRequest } from '../auth/protocol-handler'
import {
  createSafeRequestCorrelationLogDetails,
  mapPublicErrorResponse,
  publicErrorResponseBodySchema
} from '../public-error-response'
import { typedResponseSchema } from '../rpc/response-schema'
import { createMailHttpRoutes } from '../rpc/mail'
import type { PublicErrorResponse } from '../public-error-response'
import type { AgentMailTrialStartResult } from '../agent-access/trial-service'

type ApiResponseSet = {
  headers: Record<string, number | string>
  status?: number | string
}
type ApiErrorBody = {
  code?: string
  error: string
  supportReference?: string
}
const HTTP_STATUS_UNAUTHORIZED: number = HttpStatusCode.Unauthorized
const log = debug('app:api')

const publicJwkBodySchema = t.Object(
  {
    alg: t.Optional(t.String({ minLength: 1 })),
    crv: t.Optional(t.String({ minLength: 1 })),
    key_ops: t.Optional(t.Array(t.String({ minLength: 1 }))),
    kid: t.Optional(t.String({ minLength: 1 })),
    kty: t.String({ minLength: 1 }),
    use: t.Optional(t.String({ minLength: 1 })),
    x: t.String({ minLength: 1 })
  },
  { additionalProperties: false }
)

function enumObject<const TValues extends readonly string[]>(
  values: TValues
): { [TValue in TValues[number]]: TValue } {
  return Object.fromEntries(values.map((value) => [value, value])) as { [TValue in TValues[number]]: TValue }
}

const agentMailTrialCapabilitySchema = t.Enum(enumObject(AgentMailTrialCapabilityValues))
const agentMailTrialStartBodySchema = t.Object(
  {
    agent_public_key: publicJwkBodySchema,
    admission_token: t.Optional(t.String({ maxLength: 4096, minLength: 1 })),
    capabilities: t.Optional(t.Array(agentMailTrialCapabilitySchema, { minItems: 1 })),
    host_public_key: publicJwkBodySchema,
    name: t.Optional(t.String({ maxLength: 128 })),
    post_claim_capabilities: t.Optional(t.Array(agentMailTrialCapabilitySchema, { minItems: 1 }))
  },
  { additionalProperties: false }
)
const agentMailTrialGrantResponseSchema = t.Object({
  capability: agentMailTrialCapabilitySchema,
  constraints: t.Record(t.String(), t.String()),
  expiresAt: t.String(),
  status: t.Literal('active')
})
const agentMailTrialStartResponseSchema = t.Object({
  agent_capability_grants: t.Array(agentMailTrialGrantResponseSchema),
  agent_id: t.String(),
  capabilities: t.Array(agentMailTrialCapabilitySchema),
  claim: t.Object({
    expires_at: t.String(),
    url: t.String()
  }),
  expires_at: t.String(),
  host_id: t.String(),
  mailbox: t.Object({
    address: t.String()
  }),
  mode: t.Literal('autonomous'),
  name: t.String(),
  post_claim_capabilities: t.Array(agentMailTrialCapabilitySchema),
  status: t.Literal('active'),
  trial_id: t.String()
})
const apiErrorResponseSchemas = {
  400: publicErrorResponseBodySchema,
  401: publicErrorResponseBodySchema,
  403: publicErrorResponseBodySchema,
  404: publicErrorResponseBodySchema,
  409: publicErrorResponseBodySchema,
  410: publicErrorResponseBodySchema,
  429: publicErrorResponseBodySchema,
  502: publicErrorResponseBodySchema,
  503: publicErrorResponseBodySchema
}

export const backendApiApp = new Elysia({
  name: 'api',
  normalize: false,
  prefix: '/api',
  strictPath: false
})
  .use(createMailHttpRoutes())
  .mount('/auth', (request) =>
    handleBetterAuthProtocolRequest(request, {
      consumerClass: 'api-client',
      publicMountPath: '/api/auth'
    })
  )
  .post(
    '/agent-access/trials',
    async ({ body, request, set }) =>
      handleApiError(() => startAgentMailTrial(body), request, set, 'api_agent_access_trial_start'),
    {
      body: agentMailTrialStartBodySchema,
      response: {
        200: typedResponseSchema<AgentMailTrialStartResult>(agentMailTrialStartResponseSchema),
        ...apiErrorResponseSchemas
      }
    }
  )

async function handleApiError<T>(
  operation: () => Promise<T>,
  request: Request,
  set: ApiResponseSet,
  operationName: string
): Promise<T | ApiErrorBody> {
  try {
    return await operation()
  } catch (error) {
    if (isAgentMailTrialError(error)) {
      if (error.status === HTTP_STATUS_UNAUTHORIZED) {
        set.headers['WWW-Authenticate'] = 'Bearer realm="agentteam-api"'
      }
      const publicError = mapPublicErrorResponse({ code: error.status, error, request })
      set.status = publicError.status
      logHandledApiError(error, request, publicError, operationName)
      return publicError.body
    }
    throw error
  }
}

function logHandledApiError(
  error: unknown,
  request: Request,
  publicError: PublicErrorResponse,
  operation: string
) {
  const errorLogDetails = createSafeErrorLogDetails(error)
  log('api_handled_error %o', {
    error: errorLogDetails,
    ...(errorLogDetails.code ? { errorCode: errorLogDetails.code } : {}),
    operation,
    publicError: {
      code: publicError.body.code,
      status: publicError.status,
      ...(publicError.body.supportReference ? { supportReference: publicError.body.supportReference } : {})
    },
    ...createSafeRequestCorrelationLogDetails(request),
    ...createSafeRequestLogDetails(request)
  })
}

export type BackendApiAppType = typeof backendApiApp
