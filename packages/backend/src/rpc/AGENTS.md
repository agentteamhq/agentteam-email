# App RPC Route Rules

This directory owns internal app and control RPC under `/rpc/*`.

## App RPC Boundary

- `/rpc/*` is not an external product API. Do not add CLI, integration,
  customer automation, or public API client workflows to RPC.
- The only allowed RPC surfaces are first-party browser UI routes, mail control
  service routes, signed Worker ingest webhooks, browser/internal Better
  Auth/Agent Auth endpoints under `/rpc/auth/api/*`, and the public
  unauthenticated routes listed below.
- Public unauthenticated RPC exceptions are limited to `/rpc/health`,
  `/rpc/whoami`, and `/rpc/admin/setup/first-admin`. First-admin setup must stop
  accepting setup once an admin exists and must not require or introduce a setup
  secret environment variable.
- The web server may expose `/health` as the same health check as
  `/rpc/health`. Do not add other unauthenticated health, status, diagnostics,
  debug, or setup routes.
- `/rpc/auth/api/*` is the browser/internal Better Auth and Agent Auth endpoint
  family. Some endpoints in that family are unauthenticated because the auth
  protocol requires them, but they are not app product RPC exceptions. Do not
  add product RPC behavior under `/rpc/auth/api/*`, and do not use this path
  family for CLI or external API clients.
- `/api/auth/*` is the API-client Better Auth and Agent Auth protocol mount.
  It may mount the Better Auth handler directly as a full auth protocol mount.
  It is not an app RPC route and must not host product API behavior.
- The Worker ingest route is public-addressable because Cloudflare Workers must
  reach the web server, but it is not a public unauthenticated API. It must use
  the `signed_worker_webhook` principal class.
- Mail control service RPC access must use explicit internal service
  credentials and explicitly named internal/control routes. The mail control
  service must not use browser-session product RPC routes or `/api/*`
  credentials.
- External API clients, agent runtimes, and the at-email CLI must address
  `/api/*` for product API operations and `/api/auth/*` for API-client auth
  protocol operations. They must not call `/rpc/*`.
- `/api/*` product routes must not be implemented as redirects, aliases,
  bridges, or compatibility paths to `/rpc/*`.
- `/api/auth/*` is reserved for API-client auth protocol consumers: the
  at-email CLI, API integrations, external agent runtimes, and external API
  clients. Browser frontend auth, browser app sessions, Worker ingest, mail
  control service traffic, and other internal controlled consumers must not use
  `/api/auth/*`. Those consumers must use their own RPC, Worker, or internal
  service boundary.
- `/rpc/*` routes must be registered through the backend RPC boundary before
  dispatch. Route modules must not add Elysia routes or mount subapps that
  bypass the RPC boundary entrypoint.
- Product UI workflows that need same-origin app data must use RPC
  routes owned here, not public `/api/*` routes, unless the same operation is
  also an explicitly documented public API contract.
- RPC routes must be designed for the first-party screen/controller that calls
  them. Use one efficient route per page read model or user action instead of
  forcing REST resource shapes onto app RPC.
- Frontend controllers must call `/rpc/*` for web-app product workflows.
- Browser settings and durable app-owned CRUD/read/reporting routes may use app
  RPC routes with strict authorization and public return types.
- Browser/internal OAuth/OIDC, Better Auth, and Agent Auth endpoints use
  `/rpc/auth/api/*`. API-client OAuth, device login, and Agent Auth protocol
  flows use `/api/auth/*`. API-key management screens may call browser-session
  RPC routes, but API-key credentials themselves must authorize only `/api/*`
  product API routes.

## RPC Credential Requirements

- `/rpc/health` must be public and must not derive or return caller identity.
- `/rpc/whoami` may use an optional Better Auth browser session to describe the
  current browser user/session. It must not treat API keys, OAuth bearer tokens,
  Agent Auth JWTs, or internal service tokens as user identity.
- `/rpc/admin/setup/first-admin` must be public only until the first admin
  exists. After an admin exists, it must not create users, mutate setup state, or
  require any setup credential.
- `/rpc/admin/*` routes must require a Better Auth browser session whose user
  has global `admin` role. Organization admin, API keys, OAuth tokens, Agent
  Auth tokens, and internal service tokens must not authorize global admin RPC
  routes.
- `/rpc/cloudflare/*`, `/rpc/agent-access/*`, `/rpc/mail/*`, and other product
  RPC routes must require a Better Auth browser session and derive the active
  organization from that session before applying CASL permissions. They must not
  accept API keys, OAuth bearer tokens, Agent Auth JWTs, Paperclip run-context
  headers, or caller-supplied organization headers as credentials.
- `/rpc/mail/admin/*` is organization mail administration, not global admin. It
  must use the browser-session active organization and Agent Mail CASL
  permissions for mailbox, agent, grant, forwarding group, and account
  operations.
- Cloudflare setup and OAuth RPC routes must use browser-session organization
  context and Agent Mail domain-management permission. Caller-supplied provider,
  account, zone, grant, connection, or deployment ids are selectors only.
- Agent access management and trial claim RPC routes must use browser-session
  organization context and Agent Mail permissions. CLI-facing trial start,
  enrollment, and connect flows belong under `/api/*`; RPC routes must not
  accept shared trial-admission credentials or other caller-provided secrets as
  product credentials.
- `/rpc/agent-mail/ingest/v1/:connectionPublicId` must require a
  deployment-specific signed Worker webhook. The route must resolve the
  connection and Worker deployment from persisted state, verify the signature
  with the deployment-owned secret, and validate notification organization,
  domain, connection, and archive scope before enqueueing ingest.
- `/rpc/internal/*` routes must require explicit internal service credentials.
  They must not accept browser sessions, API keys, OAuth bearer tokens, Agent
  Auth JWTs, or unsigned service hints.
- `/rpc/auth/api/*` routes are owned by Better Auth and Agent Auth endpoint
  behavior. Do not reuse that path family for product RPC credentials or
  product RPC handlers.

## Authorization And Data Boundary

- Every `/rpc/*` route must declare exactly one accepted principal class:
  `public`, `optional_browser_session`, `browser_session`, `browser_org`,
  `browser_mail_org`, `global_admin`, `mail_control_service`,
  `signed_worker_webhook`, `better_auth_protocol`, or `e2e_test`.
- Use `better_auth_protocol` only for Better Auth and Agent Auth endpoints
  under `/rpc/auth/api/*`.
- Do not add a new RPC principal class without first updating this file with
  the accepted consumer, credential, context resolver, and response boundary for
  that class.
- Every `/rpc/*` route must declare its accepted principal class at the route
  boundary and, unless it is a `public` route, use the owning Better Auth
  browser-session helper, `/rpc/auth/api/*` endpoint helper, signed Worker
  webhook verifier, or explicit internal service-token helper before protected
  service logic runs.
- Browser RPC route handlers must pass browser-only headers to downstream
  services. Browser RPC routes must not forward API keys, OAuth bearer tokens,
  Agent Auth JWTs, Paperclip run-context headers, or caller-supplied
  organization override headers into authorization helpers.
- Public API, agent CLI, OAuth bearer, API-key, and Agent Auth credential
  consumers must use the `/api/*` boundary for product API operations and
  `/api/auth/*` for API-client auth protocol operations. They must not use
  `/rpc/*`.
- Protected RPC routes must authenticate the caller, derive the authoritative
  user, organization, and principal context on the server, and authorize the
  exact action through the owning permission contract.
- Caller-supplied organization ids, public ids, domains, account ids, labels,
  route params, and query params are filters only. They must not establish
  authority.
- Non-internal, non-global-admin RPC routes must not return backend operational
  diagnostics, dependency or module status, queue state, runtime snapshots,
  setup state, deployment names, credential lifecycle metadata, raw provider
  ids, raw provider errors, or unscoped service status.
- RPC read models must query or filter by the authenticated `organizationId`,
  `userId`, and/or principal id before mapping response DTOs.
- Cross-organization and global operational data must live only behind
  global-admin or internal service-token routes.
- `/rpc/admin/setup/first-admin` is the only public setup route.
- `/rpc/internal/*`, debug, test, and e2e routes must require explicit
  internal or test credentials before returning data or mutating state.
  Environment flags are not authorization.
- Shared admission or service credentials must not be accepted in JSON
  bodies. Use `Authorization: Bearer` or a named internal header and compare
  credentials in constant time.
- RPC tests for protected routes must prove unauthenticated rejection,
  wrong-organization rejection, insufficient-authority rejection, and no
  operational or cross-organization data disclosure.

## Sensitive Return Types

- RPC routes that return DB-owned records with secret, credential, internal-only,
  or otherwise restricted columns must declare their response type with the
  public/read DTO type exported by `@main/db`.
- RPC routes must not return raw encrypted values, decrypted secret values,
  secret-derived hashes, credential tokens, runtime JWTs, or internal service
  credentials to the frontend.
- RPC routes must not include backend dependency names, internal config paths,
  archive prefixes, worker script names, queue counts, raw provider diagnostic
  payloads, or unscoped object snapshots in public response schemas.
- Frontend fixture and Storybook types are not live RPC contracts. If the UI
  needs a new live field, add it to the DB-derived public/read type or compose
  it from exported public/read types instead of redeclaring the table shape in
  the frontend.
- RPC tests for product actions must assert externally meaningful state changes
  through the handler boundary, such as the created attachment, removed
  attachment, renamed row, or returned live session data. Tests that only prove
  a helper was called are not sufficient for RPC behavior.
