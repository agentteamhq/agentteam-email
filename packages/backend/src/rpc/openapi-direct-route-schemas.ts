import { t } from 'elysia'
import type { TSchema } from '@sinclair/typebox'
import type { OpenAPIV3 } from 'openapi-types'

import { publicErrorResponseBodySchema } from '../public-error-response'

type OpenApiHttpMethod = 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put' | 'trace'
type OpenApiOperationObject = OpenAPIV3.OperationObject
type OpenApiResponsesObject = OpenAPIV3.ResponsesObject

const healthResponseSchema = t.Object(
  {
    message: t.Literal('Backend is healthy')
  },
  { additionalProperties: false }
)

const agentMailIngestAcceptedResponseSchema = t.Object(
  {
    ingest_id: t.String({ minLength: 1 }),
    status: t.Literal('enqueued')
  },
  { additionalProperties: false }
)

const agentMailRuntimeDomainProjectionSchema = t.Object(
  {
    archive_prefix: t.String({ minLength: 1 }),
    cloudflare_zone_name: t.String({ minLength: 1 }),
    domain: t.String({ minLength: 1 }),
    enabled: t.Boolean(),
    mail_from_domain: t.String({ minLength: 1 }),
    organization_id: t.String({ minLength: 1 }),
    organization_public_id: t.String({ minLength: 1 }),
    worker_connection_id: t.String({ minLength: 1 }),
    worker_domain_deployment_id: t.String({ minLength: 1 })
  },
  { additionalProperties: false }
)

const agentMailRuntimeSnapshotResponseSchema = t.Object(
  {
    domains: t.Array(agentMailRuntimeDomainProjectionSchema)
  },
  { additionalProperties: false }
)

const cloudflareControlSendRawResponseSchema = t.Object(
  {
    delivered: t.Array(t.String()),
    message_id: t.Optional(t.String({ minLength: 1 })),
    permanent_bounces: t.Array(t.String()),
    queued: t.Array(t.String())
  },
  { additionalProperties: false }
)

const forwardingGroupDeliveryResponseSchema = t.Object(
  {
    matched: t.Boolean(),
    modified: t.Boolean(),
    success: t.Literal(true)
  },
  { additionalProperties: false }
)

const dateTimeStringSchema = t.String({ format: 'date-time' })
const whoamiResponseSchema = t.Object(
  {
    whoami: t.Object(
      {
        db: t.Boolean(),
        session: t.Union([
          t.Object(
            {
              createdAt: dateTimeStringSchema,
              expiresAt: dateTimeStringSchema,
              updatedAt: dateTimeStringSchema,
              userAgent: t.Optional(t.String())
            },
            { additionalProperties: false }
          ),
          t.Null()
        ]),
        user: t.Union([
          t.Object(
            {
              email: t.String(),
              name: t.String()
            },
            { additionalProperties: false }
          ),
          t.Null()
        ])
      },
      { additionalProperties: false }
    )
  },
  { additionalProperties: false }
)

const workerIngestMethodNotAllowedMethods: OpenApiHttpMethod[] = [
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'put',
  'trace'
]

export function applyRpcDirectRouteOpenApiResponses(paths: OpenAPIV3.PathsObject): void {
  addResponses(paths, '/rpc/health', 'get', {
    200: jsonResponse(200, healthResponseSchema),
    ...publicErrorResponses(500)
  })

  addResponses(paths, '/rpc/agent-mail/ingest/v1/{connectionPublicId}', 'post', {
    202: jsonResponse(202, agentMailIngestAcceptedResponseSchema),
    ...publicErrorResponses(400, 401, 413, 415, 500, 503)
  })

  for (const method of workerIngestMethodNotAllowedMethods) {
    addResponses(paths, '/rpc/agent-mail/ingest/v1/{connectionPublicId}', method, {
      ...publicErrorResponses(405, 500)
    })
  }

  addResponses(paths, '/rpc/internal/agent-mail/runtime/snapshot', 'get', {
    200: jsonResponse(200, agentMailRuntimeSnapshotResponseSchema),
    ...publicErrorResponses(401, 500)
  })

  addResponses(paths, '/rpc/internal/agent-mail/cloudflare/send-raw', 'post', {
    200: jsonResponse(200, cloudflareControlSendRawResponseSchema),
    ...publicErrorResponses(400, 401, 403, 500, 502)
  })

  addResponses(paths, '/rpc/internal/agent-mail/forwarding-groups/deliveries', 'post', {
    200: jsonResponse(200, forwardingGroupDeliveryResponseSchema),
    ...publicErrorResponses(400, 401, 500)
  })

  addResponses(paths, '/rpc/whoami/', 'get', {
    200: jsonResponse(200, whoamiResponseSchema),
    ...publicErrorResponses(500)
  })
}

function addResponses(
  paths: OpenAPIV3.PathsObject,
  path: string,
  method: OpenApiHttpMethod,
  responses: OpenApiResponsesObject
): void {
  const operation = paths[path]?.[method]
  if (!operation) {
    return
  }

  operation.responses = {
    ...responses,
    ...(operation.responses ?? {})
  }
}

function publicErrorResponses(...statuses: number[]): OpenApiResponsesObject {
  return Object.fromEntries(
    statuses.map((status) => [String(status), jsonResponse(status, publicErrorResponseBodySchema)])
  )
}

function jsonResponse(status: number, schema: TSchema): OpenAPIV3.ResponseObject {
  return {
    content: {
      'application/json': {
        schema: plainJsonSchema(schema)
      }
    },
    description: `Response for status ${status}`
  }
}

function plainJsonSchema(schema: TSchema): OpenAPIV3.SchemaObject {
  return JSON.parse(JSON.stringify(schema)) as OpenAPIV3.SchemaObject
}
