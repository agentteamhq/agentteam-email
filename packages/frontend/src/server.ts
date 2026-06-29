import process from 'node:process'
import { fileURLToPath } from 'node:url'
import debug from 'debug'
import send from 'send'
import { fetchNodeHandler, serve } from 'srvx/node'

import { createWebRequest, getRequestOrigin } from './http'
import { handleBackendPackageRequest } from './backend-package-handlers'
import startWebServer from './start-web-server.js'
import { resolveClientStaticAssetPath } from './static-assets'
import type { Server, ServerRequest } from 'srvx'
import type { IncomingMessage, ServerResponse } from 'node:http'

const log = debug('app:frontend')
const clientDist = fileURLToPath(new URL('../client', import.meta.url))

type SendError = NodeJS.ErrnoException & {
  status?: number
}

export interface StartFrontendServerOptions {
  host?: string
  port?: number
}

export function startFrontendServer(options: StartFrontendServerOptions = {}): Server {
  const host = options.host ?? resolveHost()
  const port = options.port ?? resolvePort()
  const server = serve({
    fetch: handleServerRequest,
    hostname: host,
    manual: true,
    port,
    silent: true
  })

  Promise.resolve(server.serve())
    .then(() => {
      log('web server listening on %s:%d', host, port)
    })
    .catch((error: unknown) => {
      process.nextTick(() => {
        throw error
      })
    })

  return server
}

async function handleServerRequest(serverRequest: ServerRequest): Promise<Response> {
  const nodeRequest = resolveNodeRequest(serverRequest)
  const request = createWebRequest(nodeRequest, getRequestOrigin(nodeRequest))
  const backendPackageResponse = await handleBackendPackageRequest(request)

  if (backendPackageResponse) {
    return backendPackageResponse
  }

  const url = new URL(request.url)
  const staticAssetPath = await resolveStaticAssetRequestPath(nodeRequest, url)

  if (staticAssetPath) {
    const staticAssetHandler = (req: IncomingMessage, res: ServerResponse) =>
      sendStaticAsset(req, res, staticAssetPath)

    return fetchNodeHandler(staticAssetHandler, serverRequest)
  }

  return startWebServer.fetch(request, { context: {} })
}

async function sendStaticAsset(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    send(req, pathname, {
      index: false,
      root: clientDist
    })
      .on('error', (error: SendError) => {
        if (error.status === 404) {
          res.statusCode = 404
          res.end('Not Found')
          resolvePromise()
          return
        }

        reject(error)
      })
      .on('end', resolvePromise)
      .pipe(res)
  })
}

async function resolveStaticAssetRequestPath(req: IncomingMessage, url: URL): Promise<string | null> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return null
  }

  return resolveClientStaticAssetPath(clientDist, url.pathname)
}

function resolveNodeRequest(request: ServerRequest): IncomingMessage {
  const nodeContext = request.runtime?.node

  if (!nodeContext) {
    throw new Error('Frontend server requires the srvx Node runtime context.')
  }

  return nodeContext.req as IncomingMessage
}

function resolvePort(): number {
  const rawPort = process.env.PORT ?? process.env.FRONTEND_PORT ?? '4321'
  const port = Number.parseInt(rawPort, 10)

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid web server port: ${rawPort}`)
  }

  return port
}

function resolveHost(): string {
  return process.env.FRONTEND_HOST ?? process.env.HOST ?? '0.0.0.0'
}
