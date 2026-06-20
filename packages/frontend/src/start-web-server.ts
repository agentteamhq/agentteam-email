import type { Register } from '@tanstack/react-router'
import { defaultStreamHandler } from '@tanstack/react-start-server'
import {
  createStartHandler,
  type RequestHandler
} from '@tanstack/start-server-core'

import { handleBackendPackageRequest } from './backend-package-handlers'
import { createFrontendServerRouteHandlers } from './server-route-handlers'
import type { FrontendStartRequestContext } from './types'

const startHandler = createStartHandler(defaultStreamHandler)

export type WebServerEntry = { fetch: RequestHandler<Register> }

export function createWebServerEntry(entry: WebServerEntry): WebServerEntry {
  return {
    async fetch(...args) {
      return entry.fetch(...args)
    }
  }
}

export default createWebServerEntry({
  async fetch(request, requestOptions) {
    const backendPackageResponse = await handleBackendPackageRequest(request)

    if (backendPackageResponse) {
      return backendPackageResponse
    }

    const context: FrontendStartRequestContext = {
      ...requestOptions?.context,
      request,
      serverRouteHandlers: createFrontendServerRouteHandlers()
    }

    return startHandler(request, {
      ...requestOptions,
      context
    })
  }
})
