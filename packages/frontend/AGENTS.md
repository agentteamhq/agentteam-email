# Frontend Package Rules

## Message Body Rendering

Frontend message viewers must render the message-view `displayHtml` without
rewriting the message body DOM. They must not replace message elements with
placeholders, status text, or explanatory UI. Resource blocking must be enforced
through iframe sandbox and CSP, with controls rendered outside the message body.

## Validation

- Frontend browser and interaction validation can use `pnpm playwright-cli`
  commands from the repository root.

## Registry-Owned UI

Agents must not manually edit registry-owned UI files:
`src/components/ui/**`, `src/hooks/use-mobile.ts`, `src/lib/utils.ts`,
`src/components/auth/**`, and `src/lib/auth/**`.

Change app behavior outside those paths. Registry files may change only through
their owning CLI or generated workflow with explicit current-task approval.

## Settings Concepts

Before changing settings routes, settings sections, settings Storybook catalogs,
or account/provider/integration/domain settings state, agents must read
[../../ARCHITECTURE.md](../../ARCHITECTURE.md) and preserve its account,
integration, credential, and settings ownership vocabulary.

Linked accounts are Better Auth sign-in/account-linking identities and belong
to Better Auth account or security settings. Product connected accounts must
not be used for sign-in account linking.

Connected accounts are upstream provider OAuth grants where AgentTeam Email is
the OAuth client. They are provider-generic; Cloudflare is the current connected
account provider.

Integrations are downstream OAuth clients where AgentTeam Email is the OAuth
authorization server and resource server.

Domains consume connected-account authority for domain provisioning and status;
domain state must not be treated as the connected-account inventory.

Settings owns account, security, linked account, organization, connected
account, integration, domain, API key, and device login credential surfaces.

Agent Access is not a general settings credential surface. Agent hosts, agent
identities, enrollment and bootstrap commands, approval requests, capability
grants, mailbox constraints, grant expiry, last-used state, and revocation
belong in the mail administration Agent Access surface, not in Settings.

API keys and device login credentials represent the owning user's access level.
Agent Auth credentials are separately permissioned by Agent Access grants and
must not be presented as user-level settings credentials.

## Navigation And Route Transitions

The product web UI is a single-page application. Smooth, continuous
client-side navigation is a product contract with the same standing as
Storybook coverage. A change that satisfies a Storybook rule by degrading
navigation continuity is wrong and must be reworked until both hold.

In-app navigation must use TanStack Router client-side navigation. Product
navigation must not trigger full document loads and must not use raw anchors
or `window.location`, except for documented external or OAuth redirect flows.

Client-side navigation, including search-param-only navigation, must not
replace an already-rendered shell, sidebar, list, or content region with a
loading, skeleton, or placeholder state. Each rendered region must keep its
last rendered data visible until the replacement data is ready.

Loading and skeleton states may render only where the session has no prior
data for that region: initial document load, hard refresh, and cache-empty
cold loads. They must not render as a transition state between two loaded
views.

Every route-keyed or search-keyed query must either preserve the previous
result while the next key resolves (TanStack Query
`placeholderData: keepPreviousData`) or be resolved by the owning route
loader (`queryClient.ensureQueryData`) so the router holds the current view
during the transition. Adding such a query with neither mechanism is a
defect.

Routes that present the same product shell, including dashboard, settings
sections, and organization sections, must mount that shell through one shared
owner such as a layout route. Navigating between them must not unmount and
remount the shell and must not discard in-progress local state such as
compose drafts.

Authenticated screen routes must prefetch their first-paint data in the
owning route loader so server-rendered HTML delivers the screen's data
instead of skeleton-only markup.

TanStack Query keys must contain only JSON-serializable values. Function
references must not appear in query keys.

Changes to navigation, route loaders, query keys, or shell mounting must be
validated in the running app with `pnpm playwright-cli` by exercising the
changed navigation and confirming previously rendered regions do not flash
loading states.

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

Storybook catalogs document which states exist; they do not decide when
states render. A loading state's presence in the catalog does not permit
rendering that state during navigation between already-loaded views.

Storybook injection seams, including injectable loader props and fixture
boundaries, must not alter or motivate weakening production loading, caching,
or navigation behavior. Production data flow is owned by the app, not by what
makes a state easy to stage in a story.

Storybook `meta.title` must use the approved sidebar roots (`Screens`, `Components`, `Mocks`, `Showcase`, and existing `Controllers`); story `name` values must be flat human-readable labels and must not contain `/` because story names do not create sidebar groups.

Storybook stories must be grouped by the rendered product surface; implementation-backed stories, including controller, route, RPC, loader, and interaction-test stories, must live under that product surface's `Integration` subgroup.

Storybook `Screens/*` stories must represent production-reachable screen states
through the same route, page, or controller owner used by the app.

`Screens/*` stories may mock data at loader, RPC, API, or service boundaries,
but must not handcraft state that is derived by an owning route, page,
controller, or shell model.

Production-reachable frontend state must have one production owner.

Storybook and tests may supply that owner with fixture data. Production app
paths must supply that owner only with production runtime data.

Production app paths must not import Storybook or test fixtures, hardcode
fixture-derived state, or derive the same state outside its production owner.

Storybook and test coverage must not count as production implementation.
Production implementation requires the production app path to derive the state
and pass it through its production owner.

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
