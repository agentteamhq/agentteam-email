import { HttpStatusCode } from '@main/common'
import { AgentMailTrialCapabilityValues } from '@main/db'
import { Elysia, t } from 'elysia'

import { isAgentMailTrialError, startAgentMailTrial } from '../agent-access/trial-service'
import { handleBetterAuthProtocolRequest } from '../auth/protocol-handler'
import { typedResponseSchema } from '../rpc/response-schema'
import { createMailHttpRoutes } from '../rpc/mail'
import type { AgentMailTrialStartResult } from '../agent-access/trial-service'

type ApiResponseSet = {
  headers: Record<string, number | string>
  status?: number | string
}
type ApiErrorBody = { error: string }

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
  400: t.Object({ error: t.String() }),
  401: t.Object({ error: t.String() }),
  403: t.Object({ error: t.String() }),
  404: t.Object({ error: t.String() }),
  409: t.Object({ error: t.String() }),
  410: t.Object({ error: t.String() }),
  429: t.Object({ error: t.String() }),
  502: t.Object({ error: t.String() }),
  503: t.Object({ error: t.String() })
}

export const backendApiApp = new Elysia({
  name: 'api',
  normalize: false,
  prefix: '/api',
  strictPath: false
})
  .use(createMailHttpRoutes())
  .mount('/auth', handleBetterAuthProtocolRequest)
  .post(
    '/agent-access/trials',
    async ({ body, set }) => handleApiError(() => startAgentMailTrial(body), set),
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
  set: ApiResponseSet
): Promise<T | ApiErrorBody> {
  try {
    return await operation()
  } catch (error) {
    if (isAgentMailTrialError(error)) {
      if (error.status === HttpStatusCode.Unauthorized) {
        set.headers['WWW-Authenticate'] = 'Bearer realm="agentteam-api"'
      }
      set.status = error.status
      return { error: error.message }
    }
    throw error
  }
}

export type BackendApiAppType = typeof backendApiApp
