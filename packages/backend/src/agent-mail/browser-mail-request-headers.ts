/**
 * Approved exception: the human operator granted `SECURITY.md` alteration permission for the
 * mail credential-header scope — this module, the `rpc/mail.ts` header refactor,
 * `loadMailWorkspaceRoute` in `routes/webapp.ts`, and the `/rpc/mail/workspace` query-schema
 * extraction in `webmail-request-schemas.ts`. No other security surface is covered.
 *
 * Owns the browser-session-only Agent Mail request header contract.
 *
 * Browser mail surfaces authenticate with the Better Auth browser session only. Every
 * other credential class that could ride on the same request — API keys, `Authorization`
 * bearer tokens, Agent Auth JWTs, Paperclip run-context headers, and caller-supplied
 * organization overrides — must be removed before the request headers reach an Agent
 * Mail authorization helper, and the surface marker must pin the helper to the
 * browser-session path.
 *
 * Both the browser `/rpc/mail/*` route boundary and the server-rendered webapp route
 * handlers derive their headers here so the two surfaces cannot drift apart.
 */

export const AGENT_MAIL_AUTH_SURFACE_HEADER = 'x-agentteam-mail-auth-surface'
export const AGENT_MAIL_BROWSER_RPC_AUTH_SURFACE = 'browser-rpc'
export const AGENT_MAIL_ROUTE_PREFIX_HEADER = 'x-agentteam-mail-route-prefix'
export const AGENT_MAIL_BROWSER_RPC_ROUTE_PREFIX = '/rpc/mail'

/**
 * Credential and caller-context headers that must never reach an Agent Mail
 * authorization helper on a browser surface.
 */
const NON_BROWSER_MAIL_CREDENTIAL_HEADERS = [
  'authorization',
  'x-api-key',
  'x-agentteam-organization-id',
  'x-agentteam-paperclip-agent-id',
  'x-agentteam-paperclip-company-id',
  'x-agentteam-paperclip-operation',
  'x-agentteam-paperclip-plugin-id',
  'x-agentteam-paperclip-project-id',
  'x-agentteam-paperclip-run-id',
  'x-agentteam-request-method',
  'x-agentteam-request-url'
] as const

/**
 * Builds browser-session-only Agent Mail headers from an inbound browser request.
 *
 * The returned headers keep the Better Auth session cookie, drop every non-browser
 * credential class, and pin both the authorization surface and the response route
 * prefix to the browser RPC contract so server-rendered reads produce the same DTO the
 * browser receives from `/rpc/mail/*`.
 */
export function browserSessionMailRequestHeaders(request: Request): Headers {
  const headers = new Headers(request.headers)

  stripNonBrowserMailCredentialHeaders(headers)
  headers.set(AGENT_MAIL_AUTH_SURFACE_HEADER, AGENT_MAIL_BROWSER_RPC_AUTH_SURFACE)
  headers.set(AGENT_MAIL_ROUTE_PREFIX_HEADER, AGENT_MAIL_BROWSER_RPC_ROUTE_PREFIX)

  return headers
}

export function stripNonBrowserMailCredentialHeaders(headers: Headers) {
  for (const name of NON_BROWSER_MAIL_CREDENTIAL_HEADERS) {
    headers.delete(name)
  }
}
