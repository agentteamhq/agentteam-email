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
