import { Elysia, t } from 'elysia'

import {
  applyCloudflareConnectionProvisioning,
  connectCloudflareDomain,
  disconnectCloudflare,
  finalizeCloudflareOAuth,
  getCloudflareStatus,
  listConnectedCloudflareAccounts,
  listConnectedCloudflareZones,
  startCloudflareOAuth
} from '../cloudflare/service'

const cloudflare = new Elysia({
  name: 'cloudflare',
  prefix: '/cloudflare'
})
  .post('/oauth/start', async ({ request }) => {
    return startCloudflareOAuth(request.headers)
  })
  .post(
    '/oauth/finalize',
    async ({ body, request }) => {
      return finalizeCloudflareOAuth({
        headers: request.headers,
        intentPublicId: body.intentPublicId
      })
    },
    {
      body: t.Object({
        intentPublicId: t.String({ minLength: 1 })
      })
    }
  )
  .get('/accounts', async ({ request }) => {
    const accounts = await listConnectedCloudflareAccounts(request.headers)
    return { accounts }
  })
  .get(
    '/zones',
    async ({ query, request }) => {
      const zones = await listConnectedCloudflareZones({
        cloudflareAccountId: query.accountId,
        headers: request.headers
      })
      return { zones }
    },
    {
      query: t.Object({
        accountId: t.Optional(t.String({ minLength: 1 }))
      })
    }
  )
  .post(
    '/connections',
    async ({ body, request }) => {
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
    async ({ params, request }) => {
      const connection = await applyCloudflareConnectionProvisioning({
        connectionPublicId: params.connectionPublicId,
        headers: request.headers
      })
      return { connection }
    },
    {
      params: t.Object({
        connectionPublicId: t.String({ minLength: 1 })
      })
    }
  )
  .get('/status', async ({ request }) => {
    return getCloudflareStatus(request.headers)
  })
  .post(
    '/disconnect',
    async ({ body, request }) => {
      return disconnectCloudflare({
        grantPublicId: body.grantPublicId,
        headers: request.headers
      })
    },
    {
      body: t.Object({
        grantPublicId: t.Optional(t.String({ minLength: 1 }))
      })
    }
  )

export default cloudflare
