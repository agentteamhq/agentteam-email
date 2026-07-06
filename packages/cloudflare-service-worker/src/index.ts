import {
  OAUTH_TOKEN_EXCHANGE_PATH,
  WORKER_ROLE,
  exchangeCloudflareOAuthTokenRequest,
  isAuthorized,
  jsonResponse
} from './lib.ts'

import type { WorkerEnvironment } from './lib.ts'

export type { WorkerEnvironment } from './lib.ts'

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    if (!isAuthorized(request.headers, env.AGENTTEAM_WORKER_PASSWORD)) {
      return jsonResponse(401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' })
    }

    const url = new URL(request.url)
    if (url.pathname !== OAUTH_TOKEN_EXCHANGE_PATH) {
      return jsonResponse(404, { error: 'not_found' })
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method_not_allowed' }, { allow: 'POST' })
    }

    return exchangeCloudflareOAuthTokenRequest(request)
  }
}

export const workerRole = WORKER_ROLE
