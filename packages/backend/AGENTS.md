# Backend Package Rules

These rules apply to `packages/backend`.

## Public Origin And URLs

- Server code must not hard-code product-owned absolute origins or
  same-origin product URLs, including public API examples, OpenAPI/Scalar
  descriptions, auth URLs, callbacks, runtime/session URLs, RPC responses, test
  expectations for user-visible commands, or developer-facing copy. Use
  `PUBLIC_HOSTNAME`, a request-derived origin, or an explicitly injected
  public hostname according to
  [Environment Lifecycle Requirements](../../ARCHITECTURE.md#environment-lifecycle-requirements).
- Do not add hard-coded fallback app origins to shared server runtime code or
  user-visible tests. If code cannot derive the correct public origin from
  configuration or the current request, stop and fix the public hostname
  plumbing instead.
- External third-party service URLs are allowed only when they are the provider
  contract itself, such as Stripe or Scalar endpoints. They must not be used as
  substitutes for product-owned public app/API origins.

## OpenAPI Clients

- `openapi-typescript`, `openapi-fetch`, and generated OpenAPI clients are for
  server-to-server clients such as typed calls to Go services.
- They must not be used for first-party frontend `/rpc/*` calls; frontend RPC
  uses the Eden client typed from `BackendRpcAppType`.

## Backend Security Contracts

- The deployable web server must expose one backend Elysia route boundary for
  backend package HTTP traffic. That boundary must own both `/api/*` and
  `/rpc/*` dispatch.
- Do not expose separate backend Elysia mounts, apps, or public route
  collections for `/api/*` and `/rpc/*` at the web-server boundary. Internal
  Elysia groups, subapps, or handlers may separate API and RPC logic only inside
  the single exposed backend boundary.
- Backend HTTP entrypoints must route through a backend-owned boundary before
  dispatching to RPC, API, Better Auth, metadata, worker, or internal service
  handlers.
- Backend-exposed routes must declare their URL surface, accepted consumer
  class, accepted credential class, context resolver, and response boundary
  before protected logic runs.
- `/api/*` is the external product API surface. Its consumers are external
  agents, CLI clients, integrations, or API clients using API keys, OAuth access
  tokens, or Agent Auth credentials.
- Protected `/api/*` product routes must authenticate with an API-owned
  credential class: Agent Auth request-bound JWT, OAuth bearer access token, or
  API key. Browser sessions must not authorize external product API routes.
- `/api/*` routes may share backend service helpers with app RPC, but external
  callers must address `/api/*` and the route must enforce an API-owned
  credential, principal, and response contract.
- Do not expose `/api/*` as a redirect, alias, bridge, or compatibility path to
  `/rpc/*`. `/api/auth/*` must not mount, redirect, proxy, rewrite, or dispatch
  to Better Auth or `/rpc/auth/api/*`. API handlers must not call
  `backendRpcApp.handle`, construct `/rpc/*` requests, or rewrite API request
  paths into RPC paths.
- `/rpc/*` is internal app, control, and auth endpoint traffic, not an external
  product API.
- CLI clients and external API consumers must not call `/rpc/*` for product API
  operations. If a CLI or external API workflow needs behavior currently
  implemented by an RPC handler, add or fix the `/api/*` route instead of
  pointing the client at RPC.
- Before changing RPC routes, read [src/rpc/AGENTS.md](src/rpc/AGENTS.md). That
  file owns RPC-specific consumers, public unauthenticated exceptions,
  principal classes, and RPC response-boundary rules.
- API keys, OAuth access tokens, and Agent Auth credentials must not authorize
  browser RPC product routes.
- Backend service functions used by protected routes must accept an
  authenticated context or derive one through the owning auth helper before
  reading protected records, external service state, or operational status.
- Organization-scoped service functions must include `organizationId` in
  storage queries and external-status projections before returning DTOs.
- User-scoped or principal-scoped service functions must include the
  authenticated `userId`, principal id, or grant owner in storage queries before
  returning DTOs.
- Global operational diagnostics must live only behind global-admin or internal
  service-token boundaries.
- Backend DTOs returned outside global-admin or internal service-token
  boundaries must contain user-actionable product state only. They must not
  expose backend topology, dependency state, queue state, unscoped runtime
  snapshots, deployment identifiers, or credential lifecycle metadata.
- Backend DTOs, status enums, error codes, and workflow states consumed by the
  first-party browser UI must not introduce new user-visible frontend states
  unless the owning frontend controller maps that state and the owning
  Storybook `Screens/*` catalog covers it.
- Backend changes that add, remove, or reinterpret browser-consumed product
  states must update the frontend controller contract and Storybook state
  catalog in the same change.
- Security-boundary tests must prove unauthenticated rejection,
  wrong-organization rejection, insufficient-authority rejection, and
  non-disclosure of operational diagnostics for protected backend routes that
  return status, setup, admin, provider, runtime, or diagnostic data.
