# Frontend Package Rules

## Validation

- Frontend browser and interaction validation can use `pnpm playwright-cli`
  commands from the repository root.

## Registry-Owned UI

Agents must not manually edit registry-owned UI files:
`src/components/ui/**`, `src/hooks/use-mobile.ts`, `src/lib/utils.ts`,
`src/components/auth/**`, and `src/lib/auth/**`.

Change app behavior outside those paths. Registry files may change only through
their owning CLI or generated workflow with explicit current-task approval.

## Storybook

Storybook stories must render canonical product components only.

Stories must not define product layout, component hierarchy, controller logic, or product behavior.

Stories must pass props to the canonical screen, page, or block component and let that component render its own children.

Story fixture data must live outside `.stories.tsx` files unless the data is trivial.

If a story requires a UI state that the canonical component cannot express through props, agents must update the component contract instead of building the state in Storybook.

Story-only mocks, draft layouts, and prototype hierarchies are forbidden unless the user explicitly asks for a mock, draft, or prototype.

Stories that do not render production-reachable app UI through the canonical app component contract are mock stories.
Mock stories must include `Mock` in the Storybook title or story name and must set Storybook `tags: ['mock']`.

## RPC Clients

- Frontend `/rpc/*` calls must use the typed Elysia Eden client derived from `@main/backend`
  `BackendRpcAppType`; raw `fetch` helpers, `as any`/`as unknown as`, and local RPC payload/client
  redeclarations are forbidden.
