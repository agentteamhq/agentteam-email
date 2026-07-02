# AgentTeam Email Architecture

This is the repository-level architecture contract for AgentTeam Email.

Service-specific contracts live close to their owning code:

- `apps/mail-control-service/ARCHITECTURE.md` defines mail-control internals.
- `apps/mail-control-service/R2-BUCKET-LAYOUT.md` defines the self-host archive
  key layout and replay contract.
- `apps/mail-control-service/PROVENANCE.md` defines message provenance and
  security evidence surfaces.

## Rule Surfaces

This file defines repository-level architecture. Agent rules that enforce this
architecture live in the closest owning `AGENTS.md` file.

- Security-sensitive authentication, authorization, credential, token, OAuth,
  session, cookie, API key, and route changes must follow `SECURITY.md`.
- Backend route, credential, and web-server Elysia boundary changes must follow
  `packages/backend/AGENTS.md`.
- RPC route, principal class, public exception, credential, and response
  boundary changes must follow `packages/backend/src/rpc/AGENTS.md`.
- Frontend settings, Storybook, and browser UI ownership changes must follow
  `packages/frontend/AGENTS.md`.

## Public Boundary

AgentTeam Email has one public application boundary: the web server from
`apps/web-server`. Every external request enters through that web server.

The web server owns:

- browser and public API ingress;
- Better Auth sessions, OAuth, API keys, cookies, and user authorization;
- credential management and customer-facing integration flows;
- the authenticated product UI;
- high-level coordination for domains, mailboxes, Cloudflare setup, and message
  review.

Every other runtime service is internal. Browsers, customer integrations, and
operator workflows must not talk directly to the mail control service, WildDuck,
Haraka, ZoneMTA, Rspamd, MongoDB, Redis, or internal SMTP listeners.

All public mailbox clients, including the browser UI, CLI clients, public API
clients, and agent runtime tools, must call the web server. The web server
authenticates the caller, authorizes the exact organization, mailbox, and
operation, maps that authority to internal WildDuck or mail-control identities,
and performs the internal call server-side. Public clients must not receive
WildDuck admin credentials, WildDuck mailbox tokens, or raw internal service
URLs.

## Credential And Product Terms

These terms are canonical across backend, frontend, CLI, and documentation.

| Term | Kind | Access Level | Surface |
| --- | --- | --- | --- |
| Browser session | Better Auth web session | User + active org | `/rpc/*` |
| API key | Better Auth API key | Owning user | Settings, `/api/*` |
| Device login | Better Auth device auth | Signed-in user | `at-email auth login`, `/api/*` |
| Agent Auth | Better Auth Agent Auth JWT | Agent grants | Mail admin Agent Access, `/api/*` |
| Linked account | Sign-in account link | Account identity | Account/security settings |
| Connected account | Upstream OAuth grant | Provider resources | Settings connected accounts |
| Integration | Downstream OAuth client | Integration-specific | Settings integrations, `/api/*` |
| Internal service credential | Service credential | Service principal | Internal RPC/service boundary |
| Signed Worker webhook | Worker signature | Worker deployment | Worker ingest |
| Domain | Email domain state | Uses connected account | Settings domains |

Definitions:

- `Browser session`: Better Auth browser session for first-party web UI. It is
  not an API, Agent Auth, or service credential.
- `API key`: Better Auth API key for API automation, shell use, or
  environment-based API clients. It acts with the owning user's access level and
  is not an Agent Access capability grant.
- `Device login`: Better Auth device authorization used by `at-email auth
  login`. It creates a personal CLI credential. It is not `at-email agent
  connect`, Agent Auth, or Agent Access.
- `Agent Auth`: Better Auth Agent Auth for agent runtimes. Resource access uses
  request-bound `agent+jwt` and `host+jwt` JWTs and authorizes through Agent
  Access grants, capabilities, constraints, expiry, and revocation. It does not
  inherit the approving user's full access level.
- `Linked account`: Better Auth account-linking identity for sign-in. It is not
  a connected account or provider-resource grant.
- `Connected account`: upstream provider OAuth grant where AgentTeam Email is
  the OAuth client. It is provider-generic; Cloudflare is the current provider.
  It is not a sign-in identity, integration, or public API credential.
- `Integration`: downstream OAuth client where AgentTeam Email is the OAuth
  authorization server and resource server. Authorization is
  integration-specific.
- `OAuth integration access token`: `/api/*` bearer credential issued to an
  integration according to that integration's authorization model.
- `Internal service credential`: credential for an internal service principal.
- `Signed Worker webhook`: Cloudflare Worker ingest credential.
- `Domain`: product state for an email domain. It is not connected-account
  inventory.

Agent Auth provisioning flows:

- Agent-initiated: `at-email agent connect` creates local host and agent keys,
  requests delegated Agent Auth access, and gives the user a browser approval
  URL.
- UI-initiated: the web UI creates an enrollment or bootstrap command or URL for
  the intended agent to consume.
- Autonomous trial flows, when enabled, also produce Agent Auth credentials.

The `/api/*` product API accepts API-owned credentials only: API keys, device
login credentials, Agent Auth credentials, and OAuth integration access tokens.
The `/api/auth/*` mount is the API-client Better Auth and Agent Auth protocol
mount.

The `/rpc/*` product surface accepts browser and internal controlled credentials
only. The `/rpc/auth/api/*` mount is the browser/internal Better Auth and Agent
Auth protocol mount. API keys, device login credentials, Agent Auth credentials,
and OAuth integration access tokens must not authorize browser product RPC
routes.

## Settings Ownership

Settings owns user, organization, system, and account configuration for the
first-party browser UI. Settings includes account and security settings, linked
accounts, organization settings, connected accounts, integrations, domains,
API keys, and device login credentials.

Agent Access is not a general settings credential surface. Agent hosts, agent
identities, enrollment and bootstrap commands, approval requests, capability
grants, mailbox constraints, grant expiry, last-used state, and revocation
belong in the mail administration Agent Access surface.

## Paperclip OAuth Integration

Paperclip connects to AgentTeam Email as an OAuth client of the AgentTeam Email
web server. AgentTeam Email is the OAuth authorization server, token issuer,
resource server, consent owner, and revocation owner for this integration.

The Paperclip plugin initiates authorization against AgentTeam Email. AgentTeam
Email owns connection state, token behavior, requested scopes, mailbox grant
enforcement, and audit events at the web-server boundary.

AgentTeam Email settings expose Paperclip authorization status and revoke
user/org consent. Paperclip OAuth client registration is provisioning, not an
end-user settings action.

Paperclip context identifies the calling plugin, company, agent, project, run,
and operation. That context does not define mailbox policy by itself. Mailbox,
domain, and agent access remain AgentTeam Email authorization state.

The mail control service exposes an internal service API for the web server
and trusted internal controllers only. That API is secured by deployment
topology: it must stay on the internal Compose or cluster network and must not
be exposed to browsers, public API clients, operators, or the internet.

## Web Server

`apps/web-server` is the deployable Node entrypoint. It imports the workspace
packages that implement the frontend and backend behavior, and it supplies the
concrete runtime dependencies for those packages.

Workspace packages such as `packages/frontend`, `packages/backend`,
`packages/db`, and `packages/common` keep package dependencies as peer contracts
where the package boundary requires it. The deployable web-server package owns
the complete dependency closure for the running web server.

The web server is the only public place where customer credentials,
organization identity, public API authorization, and browser sessions are
accepted. Server-side code may call internal services after authenticating and
authorizing the public request at the web boundary.

The web application database stores product control state, authorization state,
integration state, and realized internal identifiers needed to mediate mailbox
access. It must not store email messages, parsed message bodies, conversation
threads, or mailbox contents as product state. WildDuck owns mailbox storage
and message state. Archive storage owns raw boundary copies. The mail-control
service owns queue, replay, provenance, safe message-view, feedback-processing,
and internal relay state needed by the mail runtime.

Mailbox assignment state belongs at the web boundary. A user, organization,
agent, or API client may be granted access to an assigned mailbox, but the
persisted grant must identify the allowed mailbox and internal WildDuck
identity or credential reference. Requests for any other mailbox must fail at
the web authorization layer before WildDuck or mail-control calls are made.

## Mailbox API Boundary

WildDuck is the email server. WildDuck owns mailbox users, folders, message
state, message actions, submission, aliases, forwarding, filters, mailbox-token
primitives, and mailbox storage. AgentTeam Email must not rebuild email
management by storing mailbox contents in the web application database.

The web server uses the WildDuck API as its server-side mailbox primitive.
WildDuck-compatible mailbox routes exposed to public clients are web-server
routes, not direct WildDuck exposure. Each request must be authenticated by the
web server and authorized against persisted organization, actor, mailbox, and
operation permission state before the web server calls WildDuck.

The CLI target is a WildDuck-compatible API surface at the web server. The CLI
keeps the request shapes it uses for WildDuck mailbox operations, but its base
URL must point at the web server and its credential must be an AgentTeam Email
public credential accepted by the web server. The web server must not pass that
public credential through to WildDuck. It must translate the authorized request
into an internal WildDuck API call using server-owned configuration.

The web server must not expose a generic open WildDuck proxy. It must expose
only the mailbox operations AgentTeam Email supports, enforce mailbox
permissions before every WildDuck call, and route safe message rendering and
security evidence through the mail-control service APIs server-side.

## Internal Mail Runtime

The internal mail runtime consists of:

- MongoDB for application state, WildDuck mailbox state, and the
  `agent_mail_control` queue/state database;
- Redis for WildDuck tokens, counters, notifications, and Haraka coordination;
- WildDuck for mailbox storage, IMAP, and mailbox primitives;
- Haraka for inbound SMTP delivery into WildDuck;
- Rspamd for spam scoring;
- ZoneMTA for outbound queueing, retries, and bounce generation;
- Mail Control Service for runtime domain projection coordination, inbound
  replay, outbound relay handling, feedback processing, and status.

The mail control service is one internal deployment with multiple internal
runtime surfaces:

- internal ingest enqueue handling;
- ZoneMTA-only SMTP relay listener;
- provider feedback mailbox processing;
- Huma-backed internal control API.

The control service sits around Haraka, ZoneMTA, WildDuck, Rspamd, MongoDB,
Redis, and archive storage. It coordinates mail runtime behavior; it does not
own public user authentication or browser-facing API policy.

## Control API Ownership

The web server is the public API for mail administration and message
review. The control API is the internal service API behind that frontend.

The control API owns internal mail-runtime coordination:

- authoritative runtime snapshot sync from web-owned domain state;
- internal ingest enqueue from the web Worker boundary;
- prefix-scoped Worker archive credential issuance;
- internal send submission handoff;
- status and readiness reporting;
- read-only message provenance, safe view, and security evidence APIs.

The control API does not own customer-domain desired state, Cloudflare Email
Routing, or Worker deployment. The web server owns those flows through persisted
application state and the connected user's Cloudflare OAuth grant, then sends
mail-control the resulting runtime projection.

The control API does not own ordinary mailbox primitives. User mailboxes,
aliases, forwarding targets, filters, and mailbox tokens remain WildDuck mailbox
primitives used by the web server or another authorized internal controller.
Those primitives are never a direct public-client contract.

## Inbound Mail

Inbound mail enters through Cloudflare Email Routing and the configured
Cloudflare Email Worker.

The Worker writes the raw inbound message and edge metadata to R2-compatible
archive storage before sending a signed worker notification. The notification
contains bundle metadata only. Raw mail bytes stay in archive storage.

The control service validates committed archive bundles, records work in
MongoDB, and replays inbound mail through Haraka into WildDuck. The R2 sweep is
the recovery path for missed notifications, web ingest outages, or temporary
provider failures.

For self-hosted installs, the Worker writes to the operator-provided
R2-compatible bucket and follows the archive contract in
`apps/mail-control-service/R2-BUCKET-LAYOUT.md`.

For the hosted product target, the Worker runs in the customer's Cloudflare
account and writes to AgentTeam-owned archive storage using only organization
scoped credentials.

## Outbound Mail

User and agent submission enters through the authenticated product flow at the
web server. After authorization, the web server uses WildDuck mailbox submission
surfaces on behalf of the allowed principal. WildDuck writes user-visible
mailbox state and queues outbound work through ZoneMTA.

ZoneMTA submits each outbound queue item to the Mail Control Service internal SMTP
relay. The relay:

- authenticates ZoneMTA submissions;
- archives the relay boundary payload and metadata;
- resolves the active sender-domain policy;
- sends provider-bound messages through the selected outbound provider;
- routes all-local active AgentTeam domains back through Haraka/WildDuck without
  calling the outbound provider;
- records result metadata in archive storage.

ZoneMTA owns outbound queueing, retries, and bounce generation. The control
service owns the provider handoff and archive/provenance records at the internal
relay boundary.

## Feedback And DSNs

Each active sender domain has a structural feedback address such as
`bounces@<domain>`.

Provider feedback and Agent Mail-generated DSNs use that structural address when
provider boundaries require a non-null return path. Mailbox-delivered feedback
is processed by the control service. Unknown-recipient inbound failures are
accepted at the Cloudflare edge, resolved by replay, and converted into DSN
behavior inside the mail runtime.

## Cloudflare Responsibilities

Cloudflare responsibilities are split by boundary.

The web server owns customer-facing Cloudflare work:

- Cloudflare OAuth and account selection;
- customer integration status;
- hosted Worker deployment and Worker secret refresh;
- customer-facing remediation messages.

The control service does not own customer-domain Cloudflare coordination. It
receives the web-owned runtime projection and uses that projection for internal
mail workflows and status.

Self-hosted operators configure the admin instance with Cloudflare OAuth
credentials, archive bucket credentials, and transactional SMTP settings through
Compose or Helm. Customer-domain Cloudflare credentials are connected in the web
UI and are not deployment environment variables.

## Hosted Archive Target

The hosted product target uses one shared AgentTeam archive bucket with
organization-scoped prefixes:

```text
orgs/{org_public_id}/domains/{domain}/mail/inbound/{yyyy}/{mm}/{dd}/{ingest_id}/
```

`org_public_id` is the organization's public identifier. It must be generated
from a UUIDv7 and encoded as base62. Organization slugs must not be used in
archive paths or credential scopes.

Customer Workers receive only short-lived R2 temporary credentials scoped to the
organization prefix. The TTL is `604800` seconds. The web server refreshes
Worker credentials on a daily schedule and records integration status for
ready, degraded, expiring, and down states.

Hosted archive objects must be encrypted with an organization-scoped archive
encryption key before being written to R2. The Worker receives only the key
material required to write that organization's archive objects. Parent R2
credentials and parent encryption material stay in backend-owned secret storage
and must never be written to customer Worker secrets.

The org-prefixed hosted archive target requires coordinated implementation in
the Worker, archive key parser, control service, frontend credential refresh,
and integration-status workflows before hosted production uses that layout.

## Deployment Shapes

The public self-host deployment surfaces are:

- root `compose.yaml` for a single-host install;
- `charts/agentteam-email` for Kubernetes installs.

Compose publishes the web server port. The mail control service and mail
stack services stay on the Compose network.

The Helm chart exposes the web service through optional Ingress. The
control service, mail stack, MongoDB, Redis, and internal SMTP listeners are
cluster-internal services.

Self-hosted deployments must configure a public Worker ingest URL for
Cloudflare Worker notifications. Operator-owned ingress forwards
`POST /rpc/agent-mail/ingest/v1` to the web server. The route accepts only signed
Worker notifications and is not an admin, operator, or mail-control API surface.

## Configuration

Deployment-specific origins, hostnames, ports, credentials, storage endpoints,
provider choices, and debug behavior must come from explicit configuration.

Compose reads required values from `.env` and fails when required inputs are
missing. Helm reads required values from chart values or referenced Kubernetes
Secret/ConfigMap sources and fails rendering when required inputs are missing.

The repository must not ship fixed runtime secrets for deployable defaults.
