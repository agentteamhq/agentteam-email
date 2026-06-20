# Frontend Package Rules

## Validation

- Frontend browser and interaction validation can use `pnpm playwright-cli`
  commands from the repository root.

## RPC Clients

- Frontend `/rpc/*` calls must use the typed Elysia Eden client derived from `@main/backend`
  `BackendRpcAppType`; raw `fetch` helpers, `as any`/`as unknown as`, and local RPC payload/client
  redeclarations are forbidden.
