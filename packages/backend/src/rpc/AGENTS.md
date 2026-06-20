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

## Sensitive Return Types

- RPC routes that return DB-owned records with secret, credential, internal-only,
  or otherwise restricted columns must declare their response type with the
  public/read DTO type exported by `@main/db`.
- RPC routes must not return raw encrypted values, decrypted secret values,
  secret-derived hashes, credential tokens, runtime JWTs, or internal service
  credentials to the frontend.
- Frontend fixture and Storybook types are not live RPC contracts. If the UI
  needs a new live field, add it to the DB-derived public/read type or compose
  it from exported public/read types instead of redeclaring the table shape in
  the frontend.
- RPC tests for product actions must assert externally meaningful state changes
  through the handler boundary, such as the created attachment, removed
  attachment, renamed row, or returned live session data. Tests that only prove
  a helper was called are not sufficient for RPC behavior.
