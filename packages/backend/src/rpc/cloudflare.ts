import { Elysia, t } from 'elysia'

import {
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

const cloudflare = new Elysia({
  name: 'cloudflare',
  prefix: '/cloudflare'
})
  .post('/oauth/start', async ({ request, set, status }) => {
    try {
      const { responseHeaders, ...body } = await startCloudflareOAuth(request.headers)
      applySetCookieHeaders(set.headers, responseHeaders)
      return body
    } catch (error) {
      if (isCloudflareAccessError(error)) {
        return status(error.status, { error: error.message })
      }
      throw error
    }
  })
  .post(
    '/oauth/finalize',
    async ({ body, request, status }) => {
      try {
        return await finalizeCloudflareOAuth({
          headers: request.headers,
          intentPublicId: body.intentPublicId
        })
      } catch (error) {
        if (isCloudflareAccessError(error)) {
          return status(error.status, { error: error.message })
        }
        throw error
      }
    },
    {
      body: t.Object({
        intentPublicId: t.String({ minLength: 1 })
      })
    }
  )
  .get('/accounts', async ({ request, status }) => {
    try {
      const accounts = await listConnectedCloudflareAccounts(request.headers)
      return { accounts }
    } catch (error) {
      if (isCloudflareAccessError(error)) {
        return status(error.status, { error: error.message })
      }
      throw error
    }
  })
  .get(
    '/zones',
    async ({ query, request, status }) => {
      try {
        const zones = await listConnectedCloudflareZones({
          cloudflareAccountId: query.accountId,
          headers: request.headers
        })
        return { zones }
      } catch (error) {
        if (isCloudflareAccessError(error)) {
          return status(error.status, { error: error.message })
        }
        throw error
      }
    },
    {
      query: t.Object({
        accountId: t.Optional(t.String({ minLength: 1 }))
      })
    }
  )
  .post(
    '/connections',
    async ({ body, request, status }) => {
      try {
        const connection = await connectCloudflareDomain({
          headers: request.headers,
          input: {
            cloudflareAccountId: body.cloudflareAccountId,
            cloudflareAccountName: body.cloudflareAccountName,
            cloudflareZoneId: body.cloudflareZoneId,
            cloudflareZoneName: body.cloudflareZoneName,
            domain: body.domain
          }
        })
        return { connection }
      } catch (error) {
        if (isCloudflareAccessError(error)) {
          return status(error.status, { error: error.message })
        }
        throw error
      }
    },
    {
      body: t.Object({
        cloudflareAccountId: t.String({ minLength: 1 }),
        cloudflareAccountName: t.Optional(t.Nullable(t.String())),
        cloudflareZoneId: t.String({ minLength: 1 }),
        cloudflareZoneName: t.Optional(t.Nullable(t.String())),
        domain: t.String({ minLength: 1 })
      })
    }
  )
  .post(
    '/connections/:connectionPublicId/provision',
    async ({ params, request, status }) => {
      try {
        const connection = await applyCloudflareConnectionProvisioning({
          connectionPublicId: params.connectionPublicId,
          headers: request.headers
        })
        return { connection }
      } catch (error) {
        if (isCloudflareAccessError(error)) {
          return status(error.status, { error: error.message })
        }
        throw error
      }
    },
    {
      params: t.Object({
        connectionPublicId: t.String({ minLength: 1 })
      })
    }
  )
  .get('/status', async ({ request, status }) => {
    try {
      return await getCloudflareStatus(request.headers)
    } catch (error) {
      if (isCloudflareAccessError(error)) {
        return status(error.status, { error: error.message })
      }
      throw error
    }
  })
  .post(
    '/disconnect',
    async ({ body, request, status }) => {
      try {
        return await disconnectCloudflare({
          grantPublicId: body.grantPublicId,
          headers: request.headers
        })
      } catch (error) {
        if (isCloudflareAccessError(error)) {
          return status(error.status, { error: error.message })
        }
        throw error
      }
    },
    {
      body: t.Object({
        grantPublicId: t.Optional(t.String({ minLength: 1 }))
      })
    }
  )

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] }
  const setCookieHeaders = withGetSetCookie.getSetCookie?.()
  if (setCookieHeaders?.length) {
    return setCookieHeaders
  }
  return splitCombinedSetCookie(headers.get('set-cookie'))
}

function applySetCookieHeaders(targetHeaders: Record<string, string | number>, sourceHeaders: Headers): void {
  const cookies = getSetCookieHeaders(sourceHeaders)
  if (cookies.length === 0) {
    return
  }
  targetHeaders['set-cookie'] = cookies.join(', ')
}

function splitCombinedSetCookie(value: string | null): string[] {
  if (!value) {
    return []
  }
  return value.split(/,(?=\s*[^;,]+=)/u)
}

export default cloudflare
