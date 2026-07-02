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

Every production-reachable user-visible state in the frontend must have
Storybook coverage in the owning `Screens/*` catalog. Frontend code must not
display user-visible states, status messages, empty states, success states,
error states, loading states, gated states, or workflow steps that are absent
from the owning Storybook screen catalog.

Storybook `Screens/*` catalogs are the canonical inventory of user-visible
screen states. Production routes and Storybook stories must drive the same
route, page, controller, or canonical component contract with the same
controller-derived props or the same mocked loader, RPC, API, or service
boundary data.

Storybook `meta.title` must use the approved sidebar roots (`Screens`, `Components`, `Mocks`, `Showcase`, and existing `Controllers`); story `name` values must be flat human-readable labels and must not contain `/` because story names do not create sidebar groups.

Storybook stories must be grouped by the rendered product surface; implementation-backed stories, including controller, route, RPC, loader, and interaction-test stories, must live under that product surface's `Integration` subgroup.

Storybook `Screens/*` stories must represent production-reachable screen states
through the same route, page, or controller owner used by the app.

`Screens/*` stories may mock data at loader, RPC, API, or service boundaries,
but must not handcraft state that is derived by an owning route, page,
controller, or shell model.

Direct prop-driven stories for product components are component state stories or
mock stories unless the rendered component is itself the production owner for
that screen state.

When a screen surface has an owning controller, `Screens/*` stories for that
surface must render through that controller or a Storybook frame that renders
that controller.

Storybook screen state catalogs must keep viewport variants shallow with sibling `meta.title` leaves such as `Screens/<Surface>/States - Desktop` and `Screens/<Surface>/States - Mobile`.

Storybook mobile screen state catalogs must set the mobile viewport with `globals.viewport.value = 'mobile1'` and `globals.viewport.isRotated = false`.

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
- Production frontend code must not call `/rpc/internal/*`, debug, test, e2e,
  setup, or unauthenticated diagnostic RPC routes.
- User-facing screens must not require backend operational diagnostics from
  non-admin RPC routes.
- Frontend state, fixtures, and Storybook stories must not define live product
  contracts that include backend diagnostics, internal ids, worker names, queue
  counts, credential metadata, or cross-organization snapshots.
