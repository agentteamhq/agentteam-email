import { globals } from '../globals'

export function isCloudflareOAuthCallbackRequestPath(pathname: string): boolean {
  return pathname === '/api/oauth2/callback/cloudflare' || pathname === '/api/oauth2/callback/cloudflare/'
}

export async function handleCloudflareOAuthCallbackRequest(request: Request): Promise<Response> {
  const { auth } = await globals()
  return auth.handler(request)
}
