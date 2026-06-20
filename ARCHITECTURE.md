# AgentTeam Email Architecture

This is the repository-level architecture contract for AgentTeam Email.

Service-specific contracts live close to their owning code:

- `apps/mail-control-service/ARCHITECTURE.md` defines mail-control internals.
- `apps/mail-control-service/R2-BUCKET-LAYOUT.md` defines the self-host archive
  key layout and replay contract.
- `apps/mail-control-service/PROVENANCE.md` defines message provenance and
  security evidence surfaces.

## Public Boundary

AgentTeam Email has one public application boundary: the web server from
`apps/web-server`.

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

The mail control service exposes an internal service API for the web server
and trusted internal controllers. `AGENT_MAIL_CONTROL_API_TOKEN` is an internal
service credential for that API. It is not a browser credential, user
credential, or public API token, and it must not be exposed to clients.

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

## Internal Mail Runtime

The internal mail runtime consists of:

- MongoDB for application state, WildDuck mailbox state, and the
  `agent_mail_control` queue/state database;
- Redis for WildDuck tokens, counters, notifications, and Haraka coordination;
- WildDuck for mailbox storage, IMAP, and mailbox primitives;
- Haraka for inbound SMTP delivery into WildDuck;
- Rspamd for spam scoring;
- ZoneMTA for outbound queueing, retries, and bounce generation;
- Mail Control Service for mail-domain coordination, provisioning apply,
  inbound replay, outbound relay handling, feedback processing, and status.

The mail control service is one internal deployment with multiple internal
runtime surfaces:

- fast-path ingest HTTP listener;
- ZoneMTA-only SMTP relay listener;
- provider feedback mailbox processing;
- Huma-backed internal control API.

The control service sits around Haraka, ZoneMTA, WildDuck, Rspamd, MongoDB,
Redis, and archive storage. It coordinates mail runtime behavior; it does not
own public user authentication or browser-facing API policy.

## Control API Ownership

The web server is the public API for mail administration and message
review. The control API is the internal service API behind that frontend.

The control API owns domain-level mail coordination:

- desired domain state for mail-control behavior;
- provision apply for Cloudflare routing, Worker binding, runtime registry
  projection, and service-owned feedback setup;
- status and readiness reporting;
- read-only message provenance, safe view, and security evidence APIs.

The control API does not own ordinary mailbox primitives. User mailboxes,
aliases, forwarding targets, filters, and mailbox tokens remain WildDuck mailbox
primitives used by the web server or another authorized internal
controller.

## Inbound Mail

Inbound mail enters through Cloudflare Email Routing and the configured
Cloudflare Email Worker.

The Worker writes the raw inbound message and edge metadata to R2-compatible
archive storage before sending a signed fast-path notification. The notification
contains bundle metadata only. Raw mail bytes stay in archive storage.

The control service validates committed archive bundles, records work in
MongoDB, and replays inbound mail through Haraka into WildDuck. The R2 sweep is
the recovery path for missed notifications, listener outages, or temporary
provider failures.

For self-hosted installs, the Worker writes to the operator-provided
R2-compatible bucket and follows the archive contract in
`apps/mail-control-service/R2-BUCKET-LAYOUT.md`.

For the hosted product target, the Worker runs in the customer's Cloudflare
account and writes to AgentTeam-owned archive storage using only organization
scoped credentials.

## Outbound Mail

User and agent submission enters through WildDuck mailbox submission surfaces
owned by the authenticated product flow. WildDuck writes user-visible mailbox
state and queues outbound work through ZoneMTA.

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

The control service owns internal mail-runtime Cloudflare coordination:

- domain desired state for mail runtime;
- Email Routing and Worker binding steps performed by provision apply;
- runtime registry projection and status consumed by internal mail workflows.

Self-hosted operators provide their own Cloudflare account, Worker script name,
R2-compatible archive bucket, and provider credentials through Compose or Helm
configuration.

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

Self-hosted deployments may configure a dedicated fast-path URL for Cloudflare
Worker notifications. That route is restricted to the signed
`POST /agent-mail/ingest/v1` notification flow and is not an admin, operator, or
mail-control API surface. Tailscale Funnel and Cloudflare Tunnel are optional
self-host ingress mechanisms for that route.

## Configuration

Deployment-specific origins, hostnames, ports, credentials, storage endpoints,
provider choices, and debug behavior must come from explicit configuration.

Compose reads required values from `.env` and fails when required inputs are
missing. Helm reads required values from chart values or referenced Kubernetes
Secret/ConfigMap sources and fails rendering when required inputs are missing.

The repository must not ship fixed runtime secrets for deployable defaults.
