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
  startCloudflareOAuth
} from '../cloudflare/service'
import { typedResponseSchema } from './response-schema'
import type {
  CloudflareAccountSummary,
  CloudflareStatusResult,
  CloudflareZoneSummary,
  FinalizeCloudflareOAuthResult
} from '../cloudflare/service'

const cloudflareErrorResponseSchemas = {
  401: t.Object({ error: t.String() }),
  403: t.Object({ error: t.String() })
}

type CloudflareResponseSet = {
  status?: number | string
}
type CloudflareResponseHeaders = Record<string, string | number | string[]>

const optionalDateLikeSchema = t.Optional(t.Any())
const optionalNullableStringSchema = t.Optional(t.Nullable(t.String()))
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
        return cloudflareErrorResponse(error, set)
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
        return cloudflareErrorResponse(error, set)
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
        return cloudflareErrorResponse(error, set)
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
        return cloudflareErrorResponse(error, set)
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
        return cloudflareErrorResponse(error, set)
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
        return cloudflareErrorResponse(error, set)
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
  .get(
    '/status',
    async ({ request, set }) => {
      try {
        return await getCloudflareStatus(request.headers)
      } catch (error) {
        return cloudflareErrorResponse(error, set)
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
        return cloudflareErrorResponse(error, set)
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

function cloudflareErrorResponse(error: unknown, set: CloudflareResponseSet): { error: string } {
  if (isCloudflareAccessError(error)) {
    set.status = error.status
    return { error: error.message }
  }
  throw error
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
