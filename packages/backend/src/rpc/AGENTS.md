# App RPC Route Rules

This directory owns same-origin app RPC under `/rpc/*`.

## App RPC Boundary

- `/rpc/*` is for the first-party web UI and internal compatibility.
- Product UI workflows that need same-origin app data must use RPC
  routes owned here, not public `/api/*` routes, unless the same operation is
  also an explicitly documented public API contract.
- RPC routes must be designed for the first-party screen/controller that calls
  them. Use one efficient route per page read model or user action instead of
  forcing REST resource shapes onto app RPC.
- Frontend controllers must call `/rpc/*` for web-app product workflows.
- OAuth/OIDC, Better Auth, API-key management, settings, and durable app-owned
  CRUD/read/reporting routes may use app RPC routes with strict authorization
  and public return types.

## Authorization And Data Boundary

- Every `/rpc/*` route must declare its accepted principal class by using the
  owning Better Auth session helper, bearer agent/OAuth/API-key helper, or
  explicit internal service-token helper before protected service logic runs.
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
- `/rpc/internal/*`, debug, test, e2e, and setup routes must require explicit
  internal, test, or setup credentials before returning data or mutating state.
  Environment flags are not authorization.
- Shared admission, setup, or service credentials must not be accepted in JSON
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
