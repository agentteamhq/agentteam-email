import debug from 'debug'
import { Elysia, t } from 'elysia'

import {
  CloudflareOAuthReturnTargetValues,
  applyCloudflareConnectionProvisioning,
  connectCloudflareDomain,
  disconnectCloudflare,
  finalizeCloudflareOAuth,
  getCloudflareStatus,
  isCloudflareAccessError,
  listConnectedCloudflareAccounts,
  listConnectedCloudflareZones,
  removeCloudflareDomain,
  startCloudflareOAuth
} from '../cloudflare/service'
import { createSafeErrorLogDetails, createSafeRequestLogDetails } from '../auth/log-redaction'
import {
  createSafeRequestCorrelationLogDetails,
  mapPublicErrorResponse,
  publicErrorResponseBodySchema
} from '../public-error-response'
import { typedResponseSchema } from './response-schema'
import type {
  CloudflareAccountSummary,
  CloudflareStatusResult,
  CloudflareZoneSummary,
  FinalizeCloudflareOAuthResult
} from '../cloudflare/service'
import type { PublicErrorResponseBody } from '../public-error-response'

const cloudflareErrorResponseSchemas = {
  401: publicErrorResponseBodySchema,
  403: publicErrorResponseBodySchema,
  500: publicErrorResponseBodySchema
}

type CloudflareResponseSet = {
  status?: number | string
}
type CloudflareResponseHeaders = Record<string, string | number | string[]>
type CloudflareRpcOperation =
  | 'cloudflare_accounts'
  | 'cloudflare_connections_create'
  | 'cloudflare_connections_provision'
  | 'cloudflare_connections_remove'
  | 'cloudflare_disconnect'
  | 'cloudflare_oauth_finalize'
  | 'cloudflare_oauth_start'
  | 'cloudflare_status'
  | 'cloudflare_zones'

const optionalDateLikeSchema = t.Optional(t.Any())
const optionalNullableStringSchema = t.Optional(t.Nullable(t.String()))
const log = debug('app:rpc:cloudflare')
const cloudflareOAuthReturnTargetSchema = t.Enum(enumObject(CloudflareOAuthReturnTargetValues))
const cloudflareOAuthGrantResponseSchema = t.Object({
  cloudflareEmail: optionalNullableStringSchema,
  isUsable: t.Boolean(),
  lastErrorMessage: optionalNullableStringSchema,
  missingRequiredScopeCount: t.Number({ minimum: 0 }),
  publicId: t.String(),
  requiresReconnect: t.Boolean(),
  status: t.String()
})
const cloudflareConnectionResponseSchema = t.Object({
  cloudflareAccountId: t.String(),
  cloudflareAccountName: optionalNullableStringSchema,
  cloudflareZoneId: t.String(),
  cloudflareZoneName: optionalNullableStringSchema,
  createdAt: optionalDateLikeSchema,
  domain: t.String(),
  lastErrorCode: optionalNullableStringSchema,
  lastErrorMessage: optionalNullableStringSchema,
  lastProvisionedAt: optionalDateLikeSchema,
  provisioningStatus: t.String(),
  publicId: t.String(),
  status: t.String(),
  updatedAt: optionalDateLikeSchema,
  workerScriptName: optionalNullableStringSchema
})
const cloudflareOAuthIntentResponseSchema = t.Object({
  createdAt: optionalDateLikeSchema,
  errorCode: optionalNullableStringSchema,
  errorMessage: optionalNullableStringSchema,
  expiresAt: optionalDateLikeSchema,
  publicId: t.String(),
  status: t.String(),
  updatedAt: optionalDateLikeSchema
})
const cloudflareAccountResponseSchema = t.Object({
  grantPublicId: t.String(),
  id: t.String(),
  name: t.String(),
  type: t.Union([t.Literal('standard'), t.Literal('enterprise')])
})
const cloudflareZoneResponseSchema = t.Object({
  accountId: t.String(),
  accountName: t.Nullable(t.String()),
  grantPublicId: t.String(),
  id: t.String(),
  name: t.String(),
  status: t.Nullable(t.String())
})
const cloudflareStatusResponseSchema = t.Object({
  connections: t.Array(cloudflareConnectionResponseSchema),
  grants: t.Array(cloudflareOAuthGrantResponseSchema)
})

const cloudflare = new Elysia({
  name: 'cloudflare',
  prefix: '/cloudflare'
})
  .post(
    '/oauth/start',
    async ({ body, request, set }) => {
      try {
        const { responseHeaders, ...responseBody } = await startCloudflareOAuth({
          headers: request.headers,
          returnTarget: body.returnTarget
        })
        applySetCookieHeaders(set.headers, responseHeaders)
        set.headers['content-type'] = 'application/json'
        return responseBody
      } catch (error) {
        return cloudflareErrorResponse(error, set, request, 'cloudflare_oauth_start')
      }
    },
    {
      body: t.Object({
        returnTarget: cloudflareOAuthReturnTargetSchema
      }),
      response: {
        200: typedResponseSchema<{
          intent: Awaited<ReturnType<typeof startCloudflareOAuth>>['intent']
          redirectUrl: string
        }>(
          t.Object({
            intent: cloudflareOAuthIntentResponseSchema,
            redirectUrl: t.String()
          })
        ),
        ...cloudflareErrorResponseSchemas
      }
    }
  )
  .post(
    '/oauth/finalize',
    async ({ body, request, set }) => {
      try {
        return await finalizeCloudflareOAuth({
          headers: request.headers,
          intentPublicId: body.intentPublicId
        })
      } catch (error) {
        return cloudflareErrorResponse(error, set, request, 'cloudflare_oauth_finalize')
      }
    },
    {
      body: t.Object({
        intentPublicId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<FinalizeCloudflareOAuthResult>(
          t.Object({
            grant: cloudflareOAuthGrantResponseSchema,
            missingRequiredScopeCount: t.Number({ minimum: 0 })
          })
        ),
        ...cloudflareErrorResponseSchemas
      }
    }
  )
  .get(
    '/accounts',
    async ({ request, set }) => {
      try {
        const accounts = await listConnectedCloudflareAccounts(request.headers)
        return { accounts }
      } catch (error) {
        return cloudflareErrorResponse(error, set, request, 'cloudflare_accounts')
      }
    },
    {
      response: {
        200: typedResponseSchema<{ accounts: CloudflareAccountSummary[] }>(
          t.Object({
            accounts: t.Array(cloudflareAccountResponseSchema)
          })
        ),
        ...cloudflareErrorResponseSchemas
      }
    }
  )
  .get(
    '/zones',
    async ({ query, request, set }) => {
      try {
        const zones = await listConnectedCloudflareZones({
          cloudflareAccountId: query.accountId,
          grantPublicId: query.grantPublicId,
          headers: request.headers
        })
        return { zones }
      } catch (error) {
        return cloudflareErrorResponse(error, set, request, 'cloudflare_zones')
      }
    },
    {
      query: t.Object({
        accountId: t.Optional(t.String({ minLength: 1 })),
        grantPublicId: t.Optional(t.String({ minLength: 1 }))
      }),
      response: {
        200: typedResponseSchema<{ zones: CloudflareZoneSummary[] }>(
          t.Object({
            zones: t.Array(cloudflareZoneResponseSchema)
          })
        ),
        ...cloudflareErrorResponseSchemas
      }
    }
  )
  .post(
    '/connections',
    async ({ body, request, set }) => {
      try {
        const connection = await connectCloudflareDomain({
          headers: request.headers,
          input: {
            cloudflareAccountId: body.cloudflareAccountId,
            cloudflareAccountName: body.cloudflareAccountName,
            cloudflareZoneId: body.cloudflareZoneId,
            cloudflareZoneName: body.cloudflareZoneName,
            domain: body.domain,
            grantPublicId: body.grantPublicId
          }
        })
        return { connection }
      } catch (error) {
        return cloudflareErrorResponse(error, set, request, 'cloudflare_connections_create')
      }
    },
    {
      body: t.Object({
        cloudflareAccountId: t.String({ minLength: 1 }),
        cloudflareAccountName: t.Optional(t.Nullable(t.String())),
        cloudflareZoneId: t.String({ minLength: 1 }),
        cloudflareZoneName: t.Optional(t.Nullable(t.String())),
        domain: t.String({ minLength: 1 }),
        grantPublicId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<{ connection: CloudflareStatusResult['connections'][number] }>(
          t.Object({ connection: cloudflareConnectionResponseSchema })
        ),
        ...cloudflareErrorResponseSchemas
      }
    }
  )
  .post(
    '/connections/:connectionPublicId/provision',
    async ({ params, request, set }) => {
      try {
        const connection = await applyCloudflareConnectionProvisioning({
          connectionPublicId: params.connectionPublicId,
          headers: request.headers
        })
        return { connection }
      } catch (error) {
        return cloudflareErrorResponse(error, set, request, 'cloudflare_connections_provision')
      }
    },
    {
      params: t.Object({
        connectionPublicId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<{ connection: CloudflareStatusResult['connections'][number] }>(
          t.Object({ connection: cloudflareConnectionResponseSchema })
        ),
        ...cloudflareErrorResponseSchemas
      }
    }
  )
  .delete(
    '/connections/:connectionPublicId',
    async ({ params, request, set }) => {
      try {
        return await removeCloudflareDomain({
          connectionPublicId: params.connectionPublicId,
          headers: request.headers
        })
      } catch (error) {
        return cloudflareErrorResponse(error, set, request, 'cloudflare_connections_remove')
      }
    },
    {
      params: t.Object({
        connectionPublicId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<CloudflareStatusResult>(cloudflareStatusResponseSchema),
        ...cloudflareErrorResponseSchemas
      }
    }
  )
  .get(
    '/status',
    async ({ request, set }) => {
      try {
        return await getCloudflareStatus(request.headers)
      } catch (error) {
        return cloudflareErrorResponse(error, set, request, 'cloudflare_status')
      }
    },
    {
      response: {
        200: typedResponseSchema<CloudflareStatusResult>(cloudflareStatusResponseSchema),
        ...cloudflareErrorResponseSchemas
      }
    }
  )
  .post(
    '/disconnect',
    async ({ body, request, set }) => {
      try {
        return await disconnectCloudflare({
          grantPublicId: body.grantPublicId,
          headers: request.headers
        })
      } catch (error) {
        return cloudflareErrorResponse(error, set, request, 'cloudflare_disconnect')
      }
    },
    {
      body: t.Object({
        grantPublicId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<CloudflareStatusResult>(cloudflareStatusResponseSchema),
        ...cloudflareErrorResponseSchemas
      }
    }
  )

function cloudflareErrorResponse(
  error: unknown,
  set: CloudflareResponseSet,
  request: Request,
  operation: CloudflareRpcOperation
): PublicErrorResponseBody {
  const status = isCloudflareAccessError(error) ? error.status : 500
  const publicError = mapPublicErrorResponse({ code: status, error, request })
  set.status = publicError.status
  log('cloudflare_rpc_error %o', {
    error: createSafeErrorLogDetails(error),
    ...createSafeRequestCorrelationLogDetails(request),
    ...createSafeRequestLogDetails(request),
    operation,
    publicError: {
      code: publicError.body.code,
      status: publicError.status,
      ...(publicError.body.supportReference ? { supportReference: publicError.body.supportReference } : {})
    },
    status: publicError.status
  })
  return publicError.body
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] }
  const setCookieHeaders = withGetSetCookie.getSetCookie?.()
  if (setCookieHeaders?.length) {
    return setCookieHeaders
  }
  return splitCombinedSetCookie(headers.get('set-cookie'))
}

function applySetCookieHeaders(targetHeaders: CloudflareResponseHeaders, sourceHeaders: Headers): void {
  const cookies = getSetCookieHeaders(sourceHeaders)
  if (cookies.length === 0) {
    return
  }
  targetHeaders['set-cookie'] = cookies
}

function splitCombinedSetCookie(value: string | null): string[] {
  if (!value) {
    return []
  }
  return value.split(/,(?=\s*[^;,]+=)/u)
}

function enumObject<const TValues extends readonly string[]>(
  values: TValues
): { [TValue in TValues[number]]: TValue } {
  return Object.fromEntries(values.map((value) => [value, value])) as {
    [TValue in TValues[number]]: TValue
  }
}

export default cloudflare
