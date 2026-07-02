# Agent Mail Architecture

This document describes the Mail Control Service internals. The
repository-level service boundary is defined in `../../ARCHITECTURE.md`.
`AGENTS.md` contains the durable coding and operational rules.
`R2-BUCKET-LAYOUT.md` defines the required archive layout and reconciler SOP.
`PROVENANCE.md` defines ID, header, result metadata, and provider metadata
surfaces.

## Components

The mail runtime consists of:

- MongoDB for WildDuck mailbox storage and the Mail Control Service queue/state
  database.
- Redis for WildDuck tokens, counters, notifications, and Haraka coordination.
- Rspamd for spam scoring.
- WildDuck for IMAP and HTTP API.
- Haraka for canonical inbound SMTP delivery into WildDuck.
- ZoneMTA for canonical outbound queueing, retries, and bounce generation.
- Mail Control Service for runtime domain registry coordination,
  control/status APIs, inbound replay/reconciliation, internal ingest enqueue
  handling, the internal SMTP relay listener, outbound provider handling, and
  feedback processing.
- Internal ZoneMTA-only SMTP relay listener for Cloudflare Email Sending, SES,
  and active local-domain routing. ZoneMTA reaches this listener through the
  Mail Control Service endpoint.
- Inbound replay/reconciliation loop for archived inbound replay, recovery, and
  internal ingest enqueue handling. Its queue/state store is the
  `agent_mail_control` MongoDB database on the shared Agent Mail MongoDB server.
- Authenticated web server for operator and agent mailbox access.
- Configured Cloudflare Email Worker for inbound edge archiving.

The Mail Control Service is one process and one deployment with separate
runtime surfaces:

- internal ZoneMTA-only SMTP relay listener on `2587`
- provider feedback mailbox processing workflow
- internal Huma control HTTP API on `8081`

The internal control API runs on its own listener and exposes OpenAPI at
`/openapi.json` and `/openapi.yaml`. Status reports top-level readiness, issue
strings, runtime projection health, module health, dependency health, selected
outbound provider, and per-domain WildDuck feedback readiness to trusted
internal callers.

## Control Service Contract

The Mail Control Service wires the inbound replay/reconciliation module,
internal SMTP relay module, feedback processing module, and Huma control/status
API. ZoneMTA targets the Mail Control Service endpoint for the internal SMTP
relay hop, and the replay queue/state store is `agent_mail_control` in MongoDB.

The internal Huma control API service contract is:

- `GET /healthz`
- `POST /rpc/agentMail.status.get`
- `POST /rpc/agentMail.runtime.sync`
- `POST /rpc/agentMail.ingest.enqueue`
- `POST /rpc/agentMail.worker.archiveCredentials.issue`
- `POST /rpc/agentMail.send.submit`
- `POST /rpc/agentMail.message.provenance.get`
- `POST /rpc/agentMail.message.view.get`
- `POST /rpc/agentMail.message.security.get`
- OpenAPI schema publication at `/openapi.json` and `/openapi.yaml`

`agentMail.runtime.sync` is the authoritative snapshot handoff from web-owned
application state into the Mail Control Service runtime projection. The web
server calls it after authenticated Cloudflare/domain provisioning changes,
during web startup, and every 30 minutes as a repair sync. The snapshot carries
organization identity, the service-owned archive prefix, and Worker deployment
identifiers so replay, relay, feedback, and status operate from the same
active-domain view without granting mail-control access to the web app
database. Mail-control stores this projection only in memory; domains omitted
from the snapshot are removed from active routing.

Mail-control can also request the web server's internal runtime projection
snapshot during startup with `AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN`. That
startup bootstrap retries every 10 seconds for up to two minutes to tolerate
service startup ordering, but this is a bootstrap aid only. Web-initiated
runtime sync remains the steady-state contract.

`agentMail.ingest.enqueue` is the internal queue handoff for web-owned Worker
ingest. The web server verifies the public Worker request, resolves the active
connection, then calls this method with bundle metadata only. Mail-control
validates the organization identity, archive prefix, recipient domain, Worker
deployment identifiers, and archive keys against active control state before it
enqueues the bundle into the same Mongo-backed queue used by the R2 sweep.

`agentMail.worker.archiveCredentials.issue` is the internal seam for
prefix-scoped temporary Worker archive credentials. The credential issuer owns
secret material inside mail-control and must return it only through the internal
control API response. Public ingress must not route to mail-control; the web
server is the exposed authenticated boundary.

`agentMail.send.submit` reserves the internal send handoff from web to
mail-control. Until a send executor is wired, the endpoint must fail with a
not-implemented response rather than pretending an email was accepted.

`agentMail.message.provenance.get` is a narrow read-only handoff API for
controller-owned inbound tasking. Callers provide the WildDuck delivery
identity from the update stream: user ID, mailbox ID, UID, and optional WildDuck
message ObjectId. Agent Mail fetches the exact stored WildDuck RFC822 source,
parses allowlisted provenance headers with the service RFC822 parser support,
and returns a canonical delivery key plus trace metadata. Source-fetch or parse
failures are API errors; callers must retry and must not create downstream work
from incomplete provenance.

`agentMail.message.view.get` is the shared read-only message view API for the
web server and trusted internal callers. Callers provide the
same WildDuck delivery identity used by `agentMail.message.provenance.get`.
Agent Mail fetches the mailbox-visible WildDuck message source, parses MIME with
the service parser stack, returns text fallback and a sanitized display HTML fragment, rewrites
allowed message links to inert link ID markers with separate external-link
metadata, and blocks remote images by default unless an explicit
`remoteImages: allow` display request is made. Inline images may render only
when backed by message-owned attachments. The view response must label the
WildDuck `.eml` as a mailbox/display source, not as exact Cloudflare-boundary
raw bytes.

`agentMail.message.security.get` is the shared read-only security evidence API.
It returns the delivery key, WildDuck identity, trusted provenance headers,
Cloudflare raw archive evidence when available, persisted Worker edge evidence
from R2 `edge.json`, Cloudflare boundary auth evidence parsed from the
verified archived `raw.eml`, and Agent Mail boundary auth evidence. Missing
evidence must be explicit. The Worker archive must persist exact raw bytes and
Worker-observed edge facts; the Control API must bind `edge.json` to raw key,
envelope, timestamp, and raw SHA-256 before trusting Cloudflare-added headers
from `raw.eml`. Haraka/WildDuck SPF for replayed Worker archive mail is
internal replay SPF and must not be shown as original sender SPF.

Message-link warning behavior is generated only from
`agentMail.message.view.get` external-link metadata. Browser clients
must display the normalized destination URL and host, require explicit continue
action, and must not automatically redirect, preload, preconnect, or fetch the
destination.

## Required Domain Control Configuration

Agent Mail is a generic multi-domain service. The source of active-domain
desired state is the web-owned application state, not Mail Control Service
state, repo-edited per-domain files, deployment volumes, or environment
variables.

The owning application or controller owns company and agent intent:

- company-owned mail domains and their Agent Mail domain settings
- group mailboxes, aliases, and forwarding targets that map to WildDuck mailbox
  primitives
- per-agent mailbox intent when a runtime is explicitly mail-enabled

The web server owns customer-domain coordination:

- Cloudflare Email Routing catch-all state for each active domain.
- Cloudflare Worker deployment and binding/config through the connected user's
  Cloudflare OAuth grant.
- The MongoDB records that define active domains and runtime projection inputs.

Mail Control API owns only internal runtime coordination that is not a WildDuck
mailbox primitive:

- Service-owned structural feedback setup required by bounces and provider
  feedback for each active domain. The feedback address is derived by Agent
  Mail; callers do not configure it.
- Runtime domain registry projection consumed by inbound replay, internal SMTP
  relay, feedback processing, and status surfaces.
- Per-domain mail-from config supplied by the web-owned runtime projection and
  used by the selected outbound provider when the provider requires it.

Mail Control API does not own normal mailbox provisioning. The owning
application or controller uses the WildDuck admin API directly for ordinary
users, shared mailboxes, aliases, forwarded addresses, filters, and
mailbox-scoped tokens, then records the realized WildDuck IDs and credentials in
its own state. Agent Mail must not wrap those WildDuck primitives in a parallel
control API or store their desired state.

The same API surface must expose read-only status/reporting endpoints for the
web server and trusted internal controllers. Reporting endpoints show the current
runtime projection, service-owned feedback setup, active
domains, readiness, drift, and local dependency errors. They must not require
callers to read deployment storage, reconciler Mongo state, WildDuck admin
metadata, or Cloudflare state directly.

The same Control API surface owns shared message view and security behavior for
authenticated mailbox access. Web server callers must use the Control API message
view/security operations for rendering decisions, link warnings, remote image
blocking, source labeling, and authentication evidence. They must not duplicate
sanitizer or auth-evidence logic in separate clients.

The synced runtime domain record is intentionally small:

```json
{
  "domain": "example.com",
  "enabled": true,
  "cloudflare_zone_name": "example.com",
  "mail_from_domain": "mail.example.com"
}
```

`mail_from_domain` is optional. When omitted, it defaults to the exact domain.
When set, it must be the exact domain or a subdomain of that domain, such as
`mail.example.com`; wildcard and unrelated-domain MAIL FROM values are rejected.
The MAIL FROM domain does not create a separate active Agent Mail recipient or
sender domain.

User-domain outbound behavior is not selected by operator environment variables.
Domain mail behavior is derived from web-owned domain state and the connected
Cloudflare OAuth grant. The feedback address is not caller-configured;
mail-control derives and ensures the required service-owned feedback setup for
each active domain in the runtime projection.

Mail-control stores the runtime projection only in memory. It does not make
repo-tracked YAML/JSON files or deployment environment variables the live source
of domain truth. The replay/reconciliation queue and retry store is the
`agent_mail_control` MongoDB database.

The projected domain registry is the runtime read model. It is generated from
web-owned domain state and read by the Mail Control Service runtime modules
that need domain policy, including the internal SMTP relay, inbound
replay/reconciliation, feedback processing, and status reporting.

The required domain lifecycle is:

1. The web server records authenticated domain state in MongoDB.
2. The web server provisions Cloudflare Worker routing through the connected
   user's Cloudflare OAuth grant.
3. The web server sends `agentMail.runtime.sync` with the full current domain
   projection after startup, provisioning, disconnect, and scheduled repair.
4. Runtime modules consume the in-memory projection and fail closed when a
   sender or recipient domain is not active.
5. Status reports the current runtime projection and local dependency readiness
   without treating mail-control as the domain policy source of truth.

The runtime domain registry supplies the configured Cloudflare Email Routing
domains, outbound delivery domains, inbound replay domains, DSN domains, and
feedback sender/address lists used by the control service. Repo-tracked domain
lists are test fixtures only. New production domain additions, modifications,
disables, and removals must flow through the web server, then into mail-control
through the authoritative runtime snapshot.

Do not store controller-owned domain desired state in an Agent Mail deployment
volume. Agent Mail operational state such as idempotency hashes, leases,
blocked items, retries, and sweep cursors belongs in service-owned operational
surfaces including the `agent_mail_control` MongoDB database. Desired company
and runtime mailbox configuration belongs in the web application and, for
ordinary mailbox primitives, WildDuck.

Every provider-bound outbound submission is bound to the sender domain. The
internal SMTP relay must resolve the sender domain from the structured
message/envelope data, require an active registry entry for that exact domain,
use that domain's provider identity and feedback address, and write outbound
archive/results under that sender domain. It must fail clearly when a
provider-bound sender domain is not active. It must not fall back to the first
configured domain or any global default domain.

WildDuck native forwarding can also queue copies whose envelope recipients are
active local Agent Mail domains while the original visible sender belongs to a
domain Agent Mail does not own. Those copies are not provider-bound sends. The
internal SMTP relay must archive the ZoneMTA relay boundary under the relevant
Agent Mail mailbox domain, classify recipient domains through the active domain
registry, and hand all-local transactions back to Haraka/WildDuck for local
delivery. It must not require provider sender-domain policy for local routed
copies.

For example, `agent@alpha.example` must use the `alpha.example` registry entry,
provider identity, return/feedback address, and archive path; `agent@beta.example`
must use the `beta.example` registry entry. This is required even when both
domains use the same outbound provider account.

## Cloudflare Boundary

Cloudflare user-domain Worker provisioning is owned by the web server and uses
the connected user's Cloudflare OAuth grant. Mail-control does not provision or
status-check Cloudflare routes with admin Cloudflare credentials. Mail-control
only receives the resulting active runtime domain projection.

The R2 bucket is a pre-existing deployment dependency. Web-owned Worker
provisioning binds the Worker to the configured bucket name. It must not
create, delete, or preflight-check the bucket.

The Cloudflare Email Worker app owns the Worker source and bundle build. The
web server deploys and binds that Worker for customer domains through the
connected user's Cloudflare OAuth grant. Email Routing additions, disables,
removals, and status checks are coordinated by the web server through that
grant.

The Worker derives archive recipient domains from the envelope recipient. It
must not bind a single domain or zone name as runtime configuration.

## Worker Notification Ingest

After the Worker commits `edge.json`, it must attempt one Standard
Webhooks-signed HTTPS notification to the web server at
`/rpc/agent-mail/ingest/v1/{connectionPublicId}`. That notification carries
only bundle metadata and Standard Webhooks `webhook-id`, `webhook-timestamp`,
and `webhook-signature` headers; it never carries raw mail bytes. The web
server verifies the deployment-owned Worker webhook signing secret and calls
internal `agentMail.ingest.enqueue`. Accepted notifications upsert the committed
bundle into the same Mongo-backed queue used by the R2 sweep and wake the same
replay loop that leases due work and replays mail through Haraka.

The worker ingest route is not the source of truth. Worker notification
failure is logged and not retried by the Worker. Archive success is unchanged
because the R2 sweep is the authoritative recovery path for missed
notifications, temporary ingress outages, DNS issues, and web ingest outages.

The Worker ingest public URL is derived from the public web origin and public
connection identifier. Product Cloudflare provisioning binds the Worker to the
ingest URL and deployment-owned Worker webhook signing secret. Operator-owned
ingress must be running and forwarding the Worker ingest route to the web server
before Worker notification delivery can be considered live.

The web server is the mutating boundary for customer-domain Worker deployment
and Cloudflare Email Routing setup. Worker source/build tasks do not own
per-domain desired state.

## Inbound Archive and Reconciliation

Inbound archive layout, order of operations, Mongo queue state, retry behavior,
blocked-item behavior, and sweep behavior are specified in
`R2-BUCKET-LAYOUT.md`.

The short form is:

1. Worker writes exact `raw.eml`.
2. Worker writes `edge.json` as the inbound commit marker.
3. Worker sends one Standard Webhooks-signed worker notification through the configured
   Worker ingest URL.
4. The web server accepts signed `POST /rpc/agent-mail/ingest/v1/{connectionPublicId}`
   notifications, resolves the active org/domain Worker deployment, and calls
   internal `agentMail.ingest.enqueue`.
5. Mail-control validates the org, archive prefix, domain, and Worker metadata,
   then upserts the bundle into Mongo and wakes the normal due-work processing
   loop.
6. The periodic reconciler sweep lists committed bundles missing `result.json`
   and backfills missed Worker notifications into that same Mongo queue.
7. The reconciler processes due Mongo queue items and writes `result.json` only
   after WildDuck delivery is proven or after a no-local-mailbox failure is
   handled by the DSN path.
8. A six-hour sliding-window sweeper backfills Mongo queue items for any bundle
   missed by an earlier pass.

Internal SMTP relay local routing may also create target-side inbound records
under `orgs/<org_public_id>/domains/<target_domain>/mail/inbound/...` with
`edge.json`. These records must use a local-route edge schema, not the Worker
edge schema. The reconciler must classify inbound `edge.json` objects by schema
and enqueue only Worker-origin edges for replay; local-route edges are
already-delivered archive/provenance records.

The reconciler's `agent_mail_control` MongoDB database is service-owned
operational state. It is the durable store for retries, leases, blocked items,
DSN state, discovery diagnostics, and sweep cursors. Deployment config objects,
R2 metadata, temp files, and in-memory maps are not the reconciler queue/state
store.

The reconciler queue uses MongoDB atomic update operations for enqueue, lease,
retry, blocked, delivered, and completed transitions.

## Accept-Then-DSN Inbound Failures

Cloudflare catch-all routing means the edge accepts all domain mail first. The
reconciler then behaves like a mail server for local delivery failures:

- If the addressed WildDuck mailbox exists, the reconciler replays the exact
  archived message with inbound provenance headers and writes a delivered
  inbound result.
- If the local mailbox does not exist, or Haraka rejects the recipient with a
  permanent SMTP failure during replay, the reconciler generates a DSN from the
  per-domain feedback mailbox, stores `dsn.eml` beside the original inbound
  bundle, submits it to ZoneMTA with `MAIL FROM:<>`, and writes
  `delivery_failed_dsn_submitted`.
- If the original inbound message already had a null or invalid envelope sender,
  the reconciler suppresses the DSN to avoid backscatter and writes
  `delivery_failed_dsn_suppressed`.
- If DSN construction, R2 persistence, or ZoneMTA submission fails transiently,
  the original inbound work item remains in Mongo retry state. It does not get
  `result.json` until the DSN path completes or is explicitly suppressed.

The DSN path uses the same outbound service boundary as all other server-origin
mail: ZoneMTA queues it and hands it to the internal SMTP relay. The inbound
replay path submits DSNs to the dedicated internal `zonemta-dsn:2526`
interface, not the WildDuck MSA feeder interface. That interface is
network-policy scoped to the Mail Control Service deployment and exists because
system DSNs require `MAIL FROM:<>`; the WildDuck MSA plugin requires user
context and must not handle this traffic. The relay accepts an empty SMTP
envelope sender only for DSN MIME submissions and records the internal null
intent separately from provider-bound behavior.

SES `SendRawEmail` cannot be used with a true provider-bound null reverse path
for Agent Mail DSNs. SES custom MAIL FROM config controls the MAIL FROM domain,
not a null reverse path. Therefore SES DSN sends use the service-owned
per-domain feedback mailbox, such as `bounces@<sender-domain>`, as the
provider-bound `Return-Path` and record
`provider_reverse_path_mode: "provider_feedback_fallback"`. Cloudflare Email
Sending also does not expose a provider API field for true `MAIL FROM:<>`; the
relay calls the web server's internal Cloudflare raw-send endpoint, the web
server sends through the connected user's Cloudflare OAuth grant, and the relay
records `provider_reverse_path_mode: "cloudflare_send_raw_from"`.

The generated `dsn.eml` must be a complete bounce-style notice: the human
portion is a multipart alternative text/HTML report, the machine portion carries
populated `message/delivery-status` fields, and the original archived message is
returned as `message/rfc822` so the sender and mail client can correlate the
failure with the original submission.

## Outbound Mail

WildDuck `/users/:user/submit` is the authenticated user/agent submission
surface. WildDuck writes the user-visible Sent copy. ZoneMTA owns outbound MTA
queueing, retry, and bounce generation. ZoneMTA submits to the internal SMTP
relay listener exposed by the Mail Control Service.

WildDuck and the Haraka WildDuck plugin must write outbound queue entries into
the same Mongo sender database and queue collection that ZoneMTA drains.
Deployments use the `wildduck` sender database and `zone-queue` collection for
those shared queue entries. A sender database mismatch leaves native forwards
and other Haraka-originated outbound work undrained.

The internal SMTP relay:

- Accepts only authenticated ZoneMTA submissions.
- Requires `X-Agent-Mail-ZoneMTA-Queue-ID`.
- Archives exact relay-received SMTP DATA as `relay.eml`.
- Writes relay boundary metadata as `relay.json`.
- For provider-bound recipients, builds a sanitized provider-bound payload.
- For provider-bound recipients, writes provider payload as `provider.eml` for
  SES or `provider.json` for Cloudflare Email Sending.
- For Cloudflare provider-bound recipients, calls the web server's internal
  raw-send endpoint with `AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN`; the web
  server validates the active domain and sends with the connected user's
  Cloudflare OAuth grant.
- For all-local active Agent Mail recipients, builds a local delivery payload
  from the relay-received message, stamps internal local-route provenance
  headers, and delivers those exact local-delivery bytes back to
  Haraka/WildDuck instead of calling the outbound provider.
- Writes `result.json` with either provider outcome or local delivery outcome.

It does not own mailbox routing, aliases, feedback fanout, original-sender
inference, or Sent writeback.

## Native Forwarding

WildDuck user `targets`, forwarded addresses, and forwarding filters are
outbound forwarding surfaces. A message delivered to a forwarding-enabled
mailbox may retain a local copy, but each forward target must be queued by
WildDuck/ZoneMTA and sent through the internal SMTP relay. This is intentional
mail-server behavior, not an internal mailbox-copy optimization.

WildDuck owns the forwarding fanout. If a configured target resolves to an
active local Agent Mail domain, the internal SMTP relay keeps the ZoneMTA queue
boundary, archives the route under the relevant Agent Mail mailbox domain, then
delivers that target locally through Haraka/WildDuck with internal route
provenance headers. This preserves native WildDuck forwarding while avoiding an
external provider send and provider sender-domain policy for local routed
copies.
When the forwarded source was originally replayed from Cloudflare archive, the
internal SMTP relay uses the archived original envelope sender for the local
Haraka `MAIL FROM`; ZoneMTA's SRS-expanded reverse path remains queue transport
metadata.

External-domain targets, including personal mailbox destinations such as Gmail,
are first-class native forwarding targets. They leave through ZoneMTA, the
internal SMTP relay, and the configured outbound provider. Agent Mail does not
create a local mailbox copy for those external targets unless mail later
re-enters through the normal Cloudflare inbound path.

ZoneMTA is not the final-recipient MX client in this architecture. Its outbound
zones relay to the internal SMTP relay, so recipient-domain transport policy
such as MTA-STS is evaluated by the configured outbound provider when it
delivers the message onward.

## Feedback Routing

Bounce and feedback delivery must be treated as mail-server routing. Provider
feedback must land on a structural feedback address for the sender domain, such
as `bounces@<sender-domain>`.

SES feedback uses the provider return path to target that mailbox. Cloudflare
Email Sending controls the outbound `Return-Path` through its
`cf-bounce.<domain>` processor, so the Cloudflare-to-WildDuck feedback path must
be modeled explicitly before it is considered complete.

Mailbox-delivered feedback processing runs inside the Mail Control Service. It
listens through IMAP/IDLE or another explicit mail-server mechanism
and emits feedback notices from the same deployment that owns replay, outbound
provider handling, and status reporting.

## Feedback Address Topology

Each active sender domain must have a domain-local structural feedback address,
normally `bounces@<domain>`. That address is the provider feedback destination
and the visible/system sender for Agent Mail generated DSNs where provider
boundaries require a non-null fallback return path.

The WildDuck mailbox topology behind those addresses is implementation detail,
not a service-level contract. The preferred topology is one service-owned
feedback mailbox user with multiple domain-local addresses assigned to it, such
as `bounces@alpha.example` and `bounces@beta.example`. That keeps feedback
processing centralized while preserving per-domain addressing and provenance.

If the single-mailbox topology proves difficult to make correct or test, Agent
Mail may instead use separate service-owned feedback mailbox users per domain.
Any topology is valid only when these contracts hold:

- each enabled domain has its built-in `bounces@<domain>` address;
- outbound mail from a domain uses that domain's feedback address and provider
  identity;
- feedback received for each domain is accepted through normal inbound routing,
  lands in the configured feedback processing path, and is processed with the
  correct allowed sender-domain policy;
- multi-domain e2e tests prove that two domains do not share or fall back to the
  wrong provider identity, archive domain, or feedback address.

## Runtime Service State

Active domains, Cloudflare routing, and per-domain mail-from config converge in
web-owned application state and the connected user's Cloudflare account. The
Mail Control Service receives only the resulting runtime registry projection
and keeps it in memory.

The feedback mailbox/address is service-owned state because unknown-recipient
DSNs and provider feedback require a structural sender-domain address such as
`bounces@<sender-domain>`. That requirement does not make ordinary mailbox
users, aliases, forwarded addresses, filters, or mailbox tokens Mail Control API
state.

When a domain appears in the active runtime projection, mail-control ensures the
structural feedback address exists in WildDuck. It may attach that address to a
shared service-owned feedback mailbox or a per-domain service-owned mailbox,
but the choice is internal and must be idempotent. Removing a domain from the
projection disables runtime routing and must not delete mailbox data.

The feedback mailbox credential is also service-owned operational state for the
control service feedback workflow to read that mailbox. It is the only mailbox
credential in Control API scope and must not be generalized into agent or shared
mailbox credential management.

Runtime self-provisioning is limited to the exact service state a component
owns, and that self-provisioning must be idempotent and local to that
component.

## WildDuck Health Notes

WildDuck API access control makes `/health` fail closed without
`APPCONF_api_accessToken`. WildDuck health probes therefore authenticate with
that token when API access control is enabled.

## Test Harness Notes

Smoke tests that use a Go Testcontainers runner must use a repo-owned harness.

Helper images must be built from the directory that owns their `Containerfile`
inputs.

When a smoke test starts an upstream mail image with bundled config under the
same path as Agent Mail config, it must copy or mount each owned config file at
the exact runtime path. It must not rely on broad directory copy when the image
already contains default files at that path.
