import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import debug from 'debug'
import send from 'send'

import { createWebRequest, getRequestOrigin, sendWebResponse } from './http'
import { handleBackendPackageRequest } from './backend-package-handlers'
import startWebServer from './start-web-server.js'

const log = debug('app:frontend')
const clientDist = fileURLToPath(new URL('../client', import.meta.url))

type SendError = NodeJS.ErrnoException & {
  status?: number
}

export interface StartFrontendServerOptions {
  host?: string
  port?: number
}

export function startFrontendServer(options: StartFrontendServerOptions = {}) {
  const host = options.host ?? resolveHost()
  const port = options.port ?? resolvePort()
  const server = createHttpServer((req, res) => {
    handleNodeRequest(req, res).catch((error: unknown) => {
      log('request failed: %O', error)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('content-type', 'text/plain; charset=utf-8')
      }
      res.end('Internal Server Error')
    })
  })

  // Container ingress and Testcontainers mapped ports cannot reach a listener
  // bound only to loopback, so the production default must be externally reachable.
  server.listen(port, host, () => {
    log('web server listening on %s:%d', host, port)
  })

  return server
}

async function handleNodeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const request = createWebRequest(req, getRequestOrigin(req))
  const backendPackageResponse = await handleBackendPackageRequest(request)

  if (backendPackageResponse) {
    await sendWebResponse(backendPackageResponse, res)
    return
  }

  const url = new URL(request.url)

  if (isStaticAssetRequest(req, url)) {
    await sendStaticAsset(req, res, url.pathname)
    return
  }

  const response = await startWebServer.fetch(request, { context: {} })

  await sendWebResponse(response, res)
}

async function sendStaticAsset(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<void> {
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

function isStaticAssetRequest(req: IncomingMessage, url: URL): boolean {
  return (req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/_build/')
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
