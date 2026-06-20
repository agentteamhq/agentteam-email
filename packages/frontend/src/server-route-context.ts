import type {
  FrontendRouterContext,
  FrontendServerRouteHandlers,
  FrontendStartRequestContext
} from './types'

export interface FrontendLoaderInput {
  context: FrontendRouterContext
  serverContext?: FrontendStartRequestContext
}

export interface FrontendResolvedServerRouteContext {
  request: Request
  serverRouteHandlers: FrontendServerRouteHandlers
}

export function resolveFrontendServerRouteContext(
  loaderInput: FrontendLoaderInput
): FrontendResolvedServerRouteContext | null {
  const { request, serverRouteHandlers } = loaderInput.serverContext ?? {}

  if (!request || !serverRouteHandlers) {
    return null
  }

  return {
    request,
    serverRouteHandlers
  }
}
