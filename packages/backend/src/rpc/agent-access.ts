import { Elysia, t } from 'elysia'
import parseForwarded from 'forwarded-parse'
import ipaddr from 'ipaddr.js'
import proxyaddr from 'proxy-addr'
import {
  AgentAuthAgentStatusValues,
  AgentAuthApprovalMethodValues,
  AgentAuthApprovalStatusValues,
  AgentAuthGrantStatusValues,
  AgentAuthHostStatusValues,
  AgentAuthModeValues,
  AgentMailCapabilityValues,
  AgentMailTrialCapabilityValues
} from '@main/db'

import {
  decideAgentAccessApprovalForWeb,
  getAgentAccessApprovalForWeb,
  getAgentAccessViewForWeb,
  isAgentAccessError,
  revokeAgentAccessAgentForWeb,
  revokeAgentAccessCapabilitiesForWeb
} from '../agent-access/service'
import {
  AgentMailTrialError,
  decideAgentMailTrialClaimForWeb,
  getAgentMailTrialClaimForWeb,
  isAgentMailTrialError,
  startAgentMailTrial
} from '../agent-access/trial-service'
import { PUBLIC_VARS } from '../vars.public'
import { typedResponseSchema } from './response-schema'
import type { IncomingMessage } from 'node:http'
import type {
  AgentAccessApprovalPreview,
  AgentAccessMutationResult,
  AgentAccessView
} from '../agent-access/service'
import type {
  AgentMailTrialClaimDecisionResult,
  AgentMailTrialClaimView
} from '../agent-access/trial-service'

type AgentAccessErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 410 | 412 | 429 | 502 | 503
type AgentAccessErrorBody = {
  code?: 'webauthn_not_enrolled' | 'webauthn_required' | 'webauthn_verification_failed'
  error: string
  webauthnOptions?: Record<string, unknown>
}
type AgentAccessResponseSet = {
  headers: Record<string, number | string>
  status?: number | string
}
interface TrialStartRateLimitBucket {
  count: number
  resetAt: number
}
function enumObject<const TValues extends readonly string[]>(
  values: TValues
): { [TValue in TValues[number]]: TValue } {
  return Object.fromEntries(values.map((value) => [value, value])) as { [TValue in TValues[number]]: TValue }
}

const TRIAL_START_RATE_LIMIT = {
  max: 5,
  windowMs: 60_000
} as const
const trialStartRateLimitBuckets = new Map<string, TrialStartRateLimitBucket>()

const agentMailCapabilitySchema = t.Enum(enumObject(AgentMailCapabilityValues))
const agentMailTrialCapabilitySchema = t.Enum(enumObject(AgentMailTrialCapabilityValues))
const agentAccessHostStatusSchema = t.Enum(enumObject(AgentAuthHostStatusValues))
const agentAccessAgentStatusSchema = t.Enum(enumObject(AgentAuthAgentStatusValues))
const agentAccessModeSchema = t.Enum(enumObject(AgentAuthModeValues))
const agentAccessGrantStatusSchema = t.Enum(enumObject(AgentAuthGrantStatusValues))
const agentAccessApprovalMethodSchema = t.Enum(enumObject(AgentAuthApprovalMethodValues))
const agentAccessApprovalStatusSchema = t.Enum(enumObject(AgentAuthApprovalStatusValues))
const agentAccessApprovalStrengthSchema = t.Union([
  t.Literal('none'),
  t.Literal('session'),
  t.Literal('webauthn')
])
const nullableStringResponseSchema = t.Nullable(t.String())
const unknownRecordResponseSchema = t.Record(t.String(), t.Any())
const agentAccessPublicErrorCodeSchema = t.Union([
  t.Literal('webauthn_not_enrolled'),
  t.Literal('webauthn_required'),
  t.Literal('webauthn_verification_failed')
])
const agentAccessErrorResponseSchema = t.Object({
  code: t.Optional(agentAccessPublicErrorCodeSchema),
  error: t.String(),
  webauthnOptions: t.Optional(unknownRecordResponseSchema)
})
const agentAccessErrorResponseSchemas = {
  400: agentAccessErrorResponseSchema,
  401: agentAccessErrorResponseSchema,
  403: agentAccessErrorResponseSchema,
  404: agentAccessErrorResponseSchema,
  409: agentAccessErrorResponseSchema,
  410: agentAccessErrorResponseSchema,
  412: agentAccessErrorResponseSchema,
  429: agentAccessErrorResponseSchema,
  502: agentAccessErrorResponseSchema,
  503: agentAccessErrorResponseSchema
}
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
const agentAccessApprovalLookupBodySchema = t.Object(
  {
    agentId: t.Optional(t.String({ minLength: 1 })),
    approvalId: t.Optional(t.String({ minLength: 1 })),
    userCode: t.String({ maxLength: 128, minLength: 1 })
  },
  { additionalProperties: false }
)
const agentAccessApprovalDecisionBodySchema = t.Object(
  {
    action: t.Union([t.Literal('approve'), t.Literal('deny')]),
    agentId: t.Optional(t.String({ minLength: 1 })),
    approvalId: t.Optional(t.String({ minLength: 1 })),
    capabilities: t.Optional(t.Array(agentMailCapabilitySchema, { minItems: 1 })),
    reason: t.Optional(t.String({ maxLength: 512 })),
    ttl: t.Optional(t.Integer({ maximum: 60 * 60 * 24 * 30, minimum: 1 })),
    userCode: t.Optional(t.String({ maxLength: 128, minLength: 1 })),
    webauthnResponse: t.Optional(unknownRecordResponseSchema)
  },
  { additionalProperties: false }
)
const agentAccessCapabilityRevokeBodySchema = t.Object(
  {
    capabilities: t.Optional(t.Array(agentMailCapabilitySchema, { minItems: 1 })),
    grantId: t.Optional(t.String({ minLength: 1 }))
  },
  { additionalProperties: false }
)
const agentAccessAgentParamsSchema = t.Object(
  {
    agentId: t.String({ minLength: 1 })
  },
  { additionalProperties: false }
)
const agentAccessTrialTokenParamsSchema = t.Object(
  {
    token: t.String({ minLength: 1 })
  },
  { additionalProperties: false }
)
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
const agentMailTrialClaimDecisionBodySchema = t.Object(
  {
    action: t.Union([t.Literal('approve'), t.Literal('deny')]),
    target_organization_id: t.Optional(t.String({ minLength: 1 }))
  },
  { additionalProperties: false }
)
const agentAccessPermissionOptionResponseSchema = t.Object({
  description: t.String(),
  label: t.String(),
  value: agentMailCapabilitySchema
})
const agentAccessCapabilityCatalogResponseSchema = t.Object({
  capabilities: t.Array(agentMailCapabilitySchema),
  capabilityOptions: t.Array(agentAccessPermissionOptionResponseSchema)
})
const agentAccessHostResponseSchema = t.Object({
  activatedAt: nullableStringResponseSchema,
  agentCount: t.Number(),
  createdAt: nullableStringResponseSchema,
  defaultCapabilities: t.Array(agentMailCapabilitySchema),
  expiresAt: nullableStringResponseSchema,
  id: t.String(),
  lastUsedAt: nullableStringResponseSchema,
  name: t.String(),
  organizationId: t.String(),
  status: agentAccessHostStatusSchema
})
const agentAccessAgentResponseSchema = t.Object({
  activatedAt: nullableStringResponseSchema,
  activeCapabilityCount: t.Number(),
  canRevoke: t.Boolean(),
  createdAt: nullableStringResponseSchema,
  expiresAt: nullableStringResponseSchema,
  hostId: t.String(),
  id: t.String(),
  lastUsedAt: nullableStringResponseSchema,
  mode: agentAccessModeSchema,
  name: t.String(),
  organizationId: t.String(),
  pendingCapabilityCount: t.Number(),
  status: agentAccessAgentStatusSchema
})
const agentAccessUserActorResponseSchema = t.Object({
  id: t.String(),
  type: t.Literal('user')
})
const agentAccessGrantResponseSchema = t.Object({
  agentId: t.String(),
  canRevoke: t.Boolean(),
  capability: agentMailCapabilitySchema,
  constraints: t.Nullable(unknownRecordResponseSchema),
  createdAt: nullableStringResponseSchema,
  deniedBy: t.Nullable(agentAccessUserActorResponseSchema),
  deniedByUser: t.Boolean(),
  expiresAt: nullableStringResponseSchema,
  grantedBy: t.Nullable(agentAccessUserActorResponseSchema),
  grantedByUser: t.Boolean(),
  id: t.String(),
  organizationId: nullableStringResponseSchema,
  reason: nullableStringResponseSchema,
  status: agentAccessGrantStatusSchema
})
const agentAccessApprovalCapabilityResponseSchema = t.Object({
  approvalStrength: agentAccessApprovalStrengthSchema,
  capability: agentMailCapabilitySchema,
  constraints: t.Nullable(unknownRecordResponseSchema),
  reason: nullableStringResponseSchema
})
const agentAccessApprovalResponseSchema = t.Object({
  agentId: nullableStringResponseSchema,
  bindingMessage: nullableStringResponseSchema,
  canDeny: t.Boolean(),
  canReview: t.Boolean(),
  capabilityRequests: t.Array(agentAccessApprovalCapabilityResponseSchema),
  capabilities: t.Array(agentMailCapabilitySchema),
  createdAt: nullableStringResponseSchema,
  expiresAt: nullableStringResponseSchema,
  hostId: nullableStringResponseSchema,
  id: t.String(),
  method: agentAccessApprovalMethodSchema,
  status: agentAccessApprovalStatusSchema
})
const agentAccessAllowedActionsResponseSchema = t.Object({
  denyApproval: t.Boolean(),
  reviewApproval: t.Boolean(),
  revokeAgent: t.Boolean(),
  revokeCapabilityGrant: t.Boolean()
})
const agentAccessViewResponseSchema = t.Object({
  agents: t.Array(agentAccessAgentResponseSchema),
  allowedActions: agentAccessAllowedActionsResponseSchema,
  approvals: t.Array(agentAccessApprovalResponseSchema),
  capabilityCatalog: agentAccessCapabilityCatalogResponseSchema,
  grants: t.Array(agentAccessGrantResponseSchema),
  hosts: t.Array(agentAccessHostResponseSchema),
  organizationId: t.String(),
  state: t.Union([t.Literal('empty'), t.Literal('ready')])
})
const agentAccessApprovalPreviewResponseSchema = t.Object({
  approval: agentAccessApprovalResponseSchema,
  capabilityCatalog: agentAccessCapabilityCatalogResponseSchema,
  organizationId: t.String()
})
const agentAccessMutationResponseSchema = t.Object({
  status: nullableStringResponseSchema,
  success: t.Literal(true),
  view: agentAccessViewResponseSchema
})
const agentMailTrialGrantResponseSchema = t.Object({
  capability: agentMailTrialCapabilitySchema,
  constraints: t.Record(t.String(), t.String()),
  expiresAt: t.String(),
  status: t.Literal('active')
})
const agentMailTrialClaimTargetOrganizationResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
  slug: nullableStringResponseSchema
})
const agentMailTrialClaimViewResponseSchema = t.Object({
  agent: t.Object({
    id: t.String(),
    name: t.String(),
    status: t.String()
  }),
  capabilities: t.Array(agentMailTrialCapabilitySchema),
  claim: t.Object({
    expires_at: t.String(),
    status: t.String()
  }),
  mailbox: t.Object({
    address: t.String()
  }),
  organization_id: t.String(),
  post_claim_capabilities: t.Array(agentMailTrialCapabilitySchema),
  target_organizations: t.Array(agentMailTrialClaimTargetOrganizationResponseSchema),
  trial_id: t.String()
})
const agentMailTrialStartResponseSchema = t.Object({
  agent_capability_grants: t.Array(agentMailTrialGrantResponseSchema),
  agent_id: t.String(),
  claim: t.Object({
    expires_at: t.String(),
    url: t.String()
  }),
  capabilities: t.Array(agentMailTrialCapabilitySchema),
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
const agentMailTrialClaimDecisionResponseSchema = t.Object({
  action: t.Union([t.Literal('approve'), t.Literal('deny')]),
  claim: t.Object({
    status: t.Union([t.Literal('approved'), t.Literal('denied')])
  }),
  success: t.Literal(true),
  view: agentMailTrialClaimViewResponseSchema
})

const agentAccess = new Elysia({
  name: 'agent-access',
  normalize: false,
  prefix: '/agent-access'
})
  .get(
    '/',
    async ({ request, set }) =>
      handleAgentAccessError(() => getAgentAccessViewForWeb({ headers: request.headers }), set),
    {
      response: {
        200: typedResponseSchema<AgentAccessView>(agentAccessViewResponseSchema),
        ...agentAccessErrorResponseSchemas
      }
    }
  )
  .post(
    '/approvals/lookup',
    async ({ body, request, set }) =>
      handleAgentAccessError(
        () => getAgentAccessApprovalForWeb({ headers: request.headers, input: body }),
        set
      ),
    {
      body: agentAccessApprovalLookupBodySchema,
      response: {
        200: typedResponseSchema<AgentAccessApprovalPreview>(agentAccessApprovalPreviewResponseSchema),
        ...agentAccessErrorResponseSchemas
      }
    }
  )
  .post(
    '/approvals/decision',
    async ({ body, request, set }) =>
      handleAgentAccessError(
        () => decideAgentAccessApprovalForWeb({ headers: request.headers, input: body }),
        set
      ),
    {
      body: agentAccessApprovalDecisionBodySchema,
      response: {
        200: typedResponseSchema<AgentAccessMutationResult>(agentAccessMutationResponseSchema),
        ...agentAccessErrorResponseSchemas
      }
    }
  )
  .post(
    '/agents/:agentId/revoke',
    async ({ params, request, set }) =>
      handleAgentAccessError(
        () => revokeAgentAccessAgentForWeb({ headers: request.headers, input: { agentId: params.agentId } }),
        set
      ),
    {
      params: agentAccessAgentParamsSchema,
      response: {
        200: typedResponseSchema<AgentAccessMutationResult>(agentAccessMutationResponseSchema),
        ...agentAccessErrorResponseSchemas
      }
    }
  )
  .post(
    '/agents/:agentId/capabilities/revoke',
    async ({ body, params, request, set }) =>
      handleAgentAccessError(
        () =>
          revokeAgentAccessCapabilitiesForWeb({
            headers: request.headers,
            input: {
              ...(body && typeof body === 'object' ? body : {}),
              agentId: params.agentId
            }
          }),
        set
      ),
    {
      body: agentAccessCapabilityRevokeBodySchema,
      params: agentAccessAgentParamsSchema,
      response: {
        200: typedResponseSchema<AgentAccessMutationResult>(agentAccessMutationResponseSchema),
        ...agentAccessErrorResponseSchemas
      }
    }
  )
  .post(
    '/trials',
    async ({ body, request, set }) =>
      handleAgentAccessError(async () => {
        assertTrialStartRateLimit(request)
        return startAgentMailTrial(body)
      }, set),
    {
      body: agentMailTrialStartBodySchema,
      response: {
        200: typedResponseSchema<Awaited<ReturnType<typeof startAgentMailTrial>>>(
          agentMailTrialStartResponseSchema
        ),
        ...agentAccessErrorResponseSchemas
      }
    }
  )
  .get(
    '/trials/claim/:token',
    async ({ params, request, set }) =>
      handleAgentAccessError(
        () => getAgentMailTrialClaimForWeb({ headers: request.headers, token: params.token }),
        set
      ),
    {
      params: agentAccessTrialTokenParamsSchema,
      response: {
        200: typedResponseSchema<AgentMailTrialClaimView>(agentMailTrialClaimViewResponseSchema),
        ...agentAccessErrorResponseSchemas
      }
    }
  )
  .post(
    '/trials/claim/:token/decision',
    async ({ body, params, request, set }) =>
      handleAgentAccessError(
        () => decideAgentMailTrialClaimForWeb({ headers: request.headers, input: body, token: params.token }),
        set
      ),
    {
      body: agentMailTrialClaimDecisionBodySchema,
      params: agentAccessTrialTokenParamsSchema,
      response: {
        200: typedResponseSchema<AgentMailTrialClaimDecisionResult>(
          agentMailTrialClaimDecisionResponseSchema
        ),
        ...agentAccessErrorResponseSchemas
      }
    }
  )

async function handleAgentAccessError<T>(
  operation: () => Promise<T>,
  set: AgentAccessResponseSet
): Promise<T | AgentAccessErrorBody> {
  try {
    return await operation()
  } catch (error) {
    if (isAgentAccessError(error)) {
      if (error.status === 401) {
        set.headers['WWW-Authenticate'] = 'Bearer realm="agentteam-agent-access"'
      }
      set.status = error.status satisfies AgentAccessErrorStatusCode
      const details = error.details ?? {}
      return {
        ...(details.code ? { code: details.code } : {}),
        error: error.message,
        ...(details.webauthnOptions ? { webauthnOptions: details.webauthnOptions } : {})
      }
    }
    if (isAgentMailTrialError(error)) {
      if (error.status === 401) {
        set.headers['WWW-Authenticate'] = 'Bearer realm="agentteam-agent-access"'
      }
      set.status = error.status satisfies AgentAccessErrorStatusCode
      return { error: error.message }
    }
    throw error
  }
}

function assertTrialStartRateLimit(request: Request) {
  if (!PUBLIC_VARS.PROD) {
    return
  }

  const key = trialStartRateLimitKey(request.headers)
  const now = Date.now()
  const bucket = trialStartRateLimitBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    trialStartRateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + TRIAL_START_RATE_LIMIT.windowMs
    })
    return
  }

  if (bucket.count >= TRIAL_START_RATE_LIMIT.max) {
    throw new AgentMailTrialError('Too many requests. Please try again later.', 429)
  }

  bucket.count += 1
}

function trialStartRateLimitKey(headers: Headers) {
  return (
    forwardedHeaderClientIP(headers.get('forwarded')) ||
    xForwardedForClientIP(headers.get('x-forwarded-for')) ||
    normalizeIPAddress(headers.get('cf-connecting-ip')) ||
    normalizeIPAddress(headers.get('x-real-ip')) ||
    normalizeHostHeader(headers.get('host')) ||
    'unknown'
  )
}

function forwardedHeaderClientIP(header: string | null) {
  if (!header) {
    return null
  }
  try {
    for (const entry of parseForwarded(header)) {
      const normalized = normalizeIPAddress(entry.for)
      if (normalized) {
        return normalized
      }
    }
  } catch {
    return null
  }
  return null
}

function xForwardedForClientIP(header: string | null) {
  if (!header) {
    return null
  }
  const request = {
    connection: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': header },
    socket: { remoteAddress: '127.0.0.1' }
  } as unknown as IncomingMessage
  const candidates = proxyaddr.all(request).slice(1).reverse()
  for (const candidate of candidates) {
    const normalized = normalizeIPAddress(candidate)
    if (normalized) {
      return normalized
    }
  }
  return null
}

function normalizeIPAddress(value: string | null | undefined) {
  const host = hostFromHTTPHeaderIdentifier(value)
  if (!host) {
    return null
  }
  try {
    return ipaddr.process(host).toString()
  } catch {
    return null
  }
}

function normalizeHostHeader(value: string | null | undefined) {
  const host = hostFromHTTPHeaderIdentifier(value)
  if (!host) {
    return null
  }
  try {
    const parsed = new URL(`http://${host}`)
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null
    }
    return parsed.host.toLowerCase()
  } catch {
    return null
  }
}

function hostFromHTTPHeaderIdentifier(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = new URL(`http://${trimmed}`)
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null
    }
    return unbracketHostname(parsed.hostname)
  } catch {
    return unbracketHostname(trimmed)
  }
}

function unbracketHostname(value: string) {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
}

export default agentAccess
