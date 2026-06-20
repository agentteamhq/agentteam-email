import { HttpStatusCode } from '@main/common'
import debug from 'debug'
import { Elysia } from 'elysia'

import { globals } from '../globals'
import { rewritePublicOAuthMetadataResponse } from '../auth/oauth-metadata'
import { PUBLIC_VARS } from '../vars.public'

import cloudflare from './cloudflare'
import debugRoute from './debug'
import e2eTestSupport from './e2e-test-support'
import test from './test'
import whoami from './whoami'
import { PRIVATE_VARS } from '../vars.private'

const apiLog = debug('api:backend')

const internalRpcApp = new Elysia({ name: 'rpc-internal', prefix: '/internal' })

if (PUBLIC_VARS.DEV) {
  internalRpcApp.use(debugRoute).use(test)
}

if (PRIVATE_VARS.E2E_TEST_SUPPORT_ENABLED) {
  internalRpcApp.use(e2eTestSupport)
}

/**
 * Main Routes app with /api prefix
 */
export const backendRpcApp = new Elysia({ name: 'rpc', prefix: '/rpc', normalize: false, strictPath: false })
  .onRequest(({ request, set }) => {
    const url = new URL(request.url)
    apiLog(`${request.method} ${url.pathname}`)
    set.headers['cache-control'] = 'private, no-cache, no-store'
  })
  .get('/health', async ({ status }) => {
    await globals()
    return status(HttpStatusCode.Ok, { message: 'Backend is healthy' })
  })
  .get('/auth/api/.well-known/oauth-authorization-server', async ({ request }) => {
    const { auth } = await globals()
    return rewritePublicOAuthMetadataResponse(await auth.handler(request))
  })
  .get('/auth/api/.well-known/openid-configuration', async ({ request }) => {
    const { auth } = await globals()
    return rewritePublicOAuthMetadataResponse(await auth.handler(request))
  })
  .all('/auth/api/admin/oauth2', ({ status }) => status(404, { error: 'Not found' }))
  .all('/auth/api/admin/oauth2/*', ({ status }) => status(404, { error: 'Not found' }))
  // Better Auth is mounted at /rpc/auth while keeping /api as its logical
  // Better Auth basePath. Public OAuth metadata routes above rewrite generated
  // /api URLs back to this public /rpc/auth/api mount.
  .mount('/auth', async (req) => {
    const { auth } = await globals()
    return auth.handler(req)
  })
  // Mount route modules
  .use(internalRpcApp)
  .use(cloudflare)
  .use(whoami)

export type BackendRpcAppType = typeof backendRpcApp
