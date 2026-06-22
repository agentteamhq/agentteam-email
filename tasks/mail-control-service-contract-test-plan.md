# Mail Control Service Contract Test Plan

## Goal

Build behavior-level tests that prove the Mail Control Service does the work it
is responsible for today: control API orchestration, provisioning apply, inbound
archive replay, SMTP relay, feedback handling, status reporting, and deployment
boundary enforcement.

This plan intentionally starts from the current implementation instead of a
large ownership cutover. Mongo-backed desired domain state, hosted org prefixes,
temporary R2 credentials, and per-org archive encryption get their own tests
only after those behaviors exist.

## Sources Reviewed

- `apps/mail-control-service/ARCHITECTURE.md`
- `apps/mail-control-service/README.md`
- `apps/mail-control-service/R2-BUCKET-LAYOUT.md`
- `apps/mail-control-service/internal/control`
- `apps/mail-control-service/internal/modules/poller`
- `apps/mail-control-service/internal/modules/smtprelay`
- `apps/mail-control-service/internal/provisioning`
- `apps/mail-control-service/test-containers/inbound-replay-smoke-e2e`
- `apps/cloudflare-email-worker/src`
- `apps/cloudflare-email-worker/test`
- `charts/agentteam-email/templates`
- `tasks/cloudflare-worker-r2-temporary-credentials.md`
- `tasks/mail-control-e2e-testing-and-setup-gaps.md`

## Current Coverage Baseline

The repo already has useful unit coverage for small contracts:

- Archive key layout and UUIDv7 validation.
- Worker archive library behavior, including edge manifest shape and stale
  Analytics binding avoidance.
- Control API token checks, status RPC, domain desired-state mutations,
  provision apply with fakes, and OpenAPI coverage.
- Memory and Kubernetes ConfigMap control-state behavior.
- Cloudflare provisioning rule replacement with fake HTTP calls.
- WildDuck API client helpers and message-source fetching.
- Poller notification validation, retry-policy math, DSN config validation, and
  forwarded-recipient classification.
- SMTP relay helpers for provider payloads, local routing classification,
  ZoneMTA queue ID validation, and feedback return paths.
- Message provenance, view, and security parsing.
- One Go Testcontainers smoke path covering MongoDB, MinIO, fast-path enqueue,
  SMTP replay, WildDuck delivery discovery, and `result.json`.

The missing layer is service-contract coverage: tests that run real service
boundaries with controlled fakes and assert complete externally meaningful
outcomes.

## Test Harness Policy

- Mail Control Service E2E tests should be Go Testcontainers suites owned under
  `apps/mail-control-service/test-containers`.
- Each suite should start only the dependencies it owns: MongoDB, MinIO, fake
  WildDuck API, fake SMTP/Haraka, fake provider APIs, and fake Cloudflare API.
- Each top-level run should produce one run directory with logs, object
  snapshots, request traces, and a result summary.
- Worker runtime behavior should be tested with Miniflare or Wrangler-local
  because library-only tests do not prove the Cloudflare `email` handler runtime
  contract.
- Helm and ingress exposure should stay in chart or kind E2E tests, not the Go
  service harness.

## Contract-First Test Design

Every new service-contract test must start from the promised behavior, not the
current code path. The test author should write the scenario first in this
shape:

- Contract: the externally meaningful promise being verified.
- Given: archive objects, HTTP request, SMTP input, persisted state, and active
  domain config supplied to the service boundary.
- When: the real boundary action, such as fast-path POST, sweep tick, SMTP DATA,
  or control RPC.
- Then: terminal user/operator-visible outcome, persisted state, archive object,
  status response, or SMTP/provider effect.
- Must not: forbidden side effects, especially duplicate delivery, result writes
  before proof, provider fallback, cross-domain fallback, queue mutation after
  invalid input, raw payload logging, or stale lease overwrite.
- Classification: accepted, rejected, unsupported/skipped, retryable,
  terminal-failed, or operator-action-required.

The first version of each scenario should be authored from architecture docs and
bucket-layout contracts only. Implementation code may be consulted later only to
wire the harness or diagnose why a contract test fails.

## Delegated Test Author Workflow

Use a two-agent split when implementing the first P0 suites:

1. A docs-only contract agent reads only durable docs and writes a behavior
   matrix. It must not inspect implementation files or existing smoke-test code.
2. A test-implementation agent receives that matrix plus the narrow harness
   ownership scope. It may inspect existing test harness setup and exported
   signatures needed to compile, but it should not inspect implementation
   branches to decide what to assert.
3. The main agent reviews failing tests against the contract. If the contract is
   ambiguous, update the plan or architecture doc before changing code. If the
   contract is clear, fix implementation until the boundary test passes.

The prompt for a delegated implementation agent should include:

```text
Implement only the assigned contract tests. Do not change production behavior
unless explicitly asked. Do not inspect service implementation logic to choose
assertions; use the provided behavior matrix. You may inspect existing harness
helpers and package signatures only as needed to compile the tests. Assert
externally visible outcomes at the service boundary: HTTP responses, SMTP
deliveries, archive objects, Mongo queue state, provider calls, and status
responses. Include negative and unsupported cases. Do not add source-string or
mock-call assertions that do not prove behavior.
```

## First Triage Area: Inbound Replay Adversarial Matrix

The first expansion should target inbound replay because it is the place where
stale refs, partial archive commits, duplicate notifications, sweep catch-up,
Mongo queue state, SMTP proof, and DSN behavior all meet.

### Accepted Paths

- Valid fast-path notification after committed `raw.eml` and `edge.json`:
  exactly one queue item, one SMTP replay, one delivery proof, one terminal
  `result.json`.
- Dropped fast-path notification with committed archive bundle: sweep discovers
  the bundle and converges on the same terminal result.
- Fast-path and sweep race for the same bundle: one queue item and one delivery
  only.
- Existing WildDuck delivery proof for the ingest ID: no SMTP replay, terminal
  delivered result.
- Forward-only recipient: terminal forward-only delivery outcome without local
  mailbox proof.

### Rejected At Notification Boundary

- Missing, malformed, non-lowercase, stale, future, or wrong HMAC signature:
  HTTP rejection, no queue mutation, no archive reads, no SMTP delivery.
- Wrong content type, oversized body, malformed JSON, unknown JSON fields, wrong
  fast-path schema, uppercase SHA digest, or invalid UUIDv7 ingest ID: HTTP
  rejection and no queue mutation.
- Notification body that carries RFC822 bytes or raw-mail-like payload fields:
  HTTP rejection or invalid-metadata rejection. Raw bytes are never trusted from
  the notification body.
- Notification keys that disagree with each other, disagree with recipient
  domain, or point outside the inbound bundle layout: HTTP rejection and no
  queue mutation.
- Notification for an inactive or unconfigured domain: contract should be
  rejected before queue mutation. If the current service cannot do this, record
  it as a P0 contract gap instead of weakening the test.

### Unsupported Or Skipped During Sweep

- Local-route edge schema in the inbound prefix: record skip/diagnostic, do not
  enqueue, do not replay SMTP, and do not write a new result.
- Unsupported edge schema: diagnostic only, no delivery, no DSN, and sweep
  continues.
- Malformed key layout, non-UUIDv7 ingest ID, object outside sweep time window,
  or object inside the safety-lag window: diagnostic or deferred handling, no
  delivery.
- Existing `result.json`: mark or preserve completed state and do not replay or
  read raw message bytes.

### Retryable Failures

- `edge.json` exists before `raw.eml`: queue item is retryable, no result, no
  SMTP delivery until raw exists.
- Raw object read fails transiently: `retry_wait`, no result, no DSN.
- SMTP replay returns transient failure: `retry_wait`, no result, no DSN.
- SMTP accepts DATA but WildDuck delivery proof never appears: retryable because
  SMTP acceptance is not proof of delivery.
- DSN submission has a transient relay/provider failure: original work remains
  incomplete or retryable; no terminal failed result is written until DSN
  handling reaches a terminal outcome.

### Terminal Failures

- Raw SHA mismatch: terminal blocked work item, no SMTP delivery, no DSN, no
  successful `result.json`.
- Retryable failures after initial attempt plus exactly two retries: work item
  becomes blocked with failure class and last error.
- Unknown recipient with valid sender: writes `dsn.eml`, submits DSN, and writes
  `delivery_failed_dsn_submitted`.
- Unknown recipient with null or invalid sender: suppresses DSN and writes
  `delivery_failed_dsn_suppressed`.
- DSN generation state must be durable: retry reuses the same DSN ID, message
  ID, and raw key.

### Stale State And Concurrency

- Duplicate fast-path notification: no duplicate work item, no duplicate
  delivery, no duplicate terminal result.
- Duplicate sweep discovery: same idempotency as duplicate notification.
- Blocked item rediscovered by sweep: blocked state is preserved and the item is
  not reset to pending without an explicit operator reset path.
- Leased item whose lease expires: later worker can recover and process it.
- Stale worker with old lease tries to finish after another lease owns the item:
  stale completion is rejected and cannot overwrite newer state.
- Processing one bad item does not stop later due items from processing.
- Sweep cursor advances only after the sweep pass succeeds; diagnostics for bad
  objects do not hide unprocessed good objects.

### DSN And Sender Edge Cases

- Unknown recipient DSN submission must use the system DSN relay boundary with
  null SMTP reverse path. It must not use a user MSA submission path.
- If a provider cannot preserve a true null reverse path, the outbound result
  must record the fallback sender mode instead of claiming a null reverse path
  was preserved.
- Inbound replay with a null original sender projects `<>` in provenance
  headers, keeps raw archive bytes unchanged, and does not lose null-sender
  evidence.
- A permanent local-recipient rejection from the SMTP/Haraka boundary is treated
  as permanent recipient failure and flows to DSN submitted or suppressed based
  on the original sender. It must not retry forever.

## P0 Tests For Current Behavior

Core P0 is the send/receive contract: inbound replay, DSN outcomes, outbound
provider relay, local routing, and the minimum control/provisioning behavior
needed for those paths to be operated. Queue race hardening, pagination,
deployment exposure, and full status matrices remain important, but they are
tracked as P0 hardening rather than blockers for core send/receive coverage.

### 1. Inbound Replay Fast Path - Core Covered

Extend `apps/mail-control-service/test-containers/inbound-replay-smoke-e2e` into
a table-driven inbound replay suite.

Assertions:

- A signed `POST /agent-mail/ingest/v1` with matching keys inserts exactly one
  Mongo `inbound_work_items` row.
- Reposting the same notification remains idempotent: no duplicate queue row, no
  duplicate SMTP delivery, and no second `result.json` terminal write.
- Invalid HMAC, stale timestamp, non-JSON content type, unknown JSON fields,
  wrong schema, uppercase digest, mismatched key family, or mismatched domain is
  rejected before queue mutation.
- The notification body remains metadata-only. Raw RFC822 bytes must only be
  read from the archive object.
- A valid notification wakes processing without waiting for a sweep tick.
- The final receipt includes delivered status, delivery source, WildDuck user,
  mailbox, message ID, and the archive result key.
- The replayed SMTP message includes the ingest ID and projected Cloudflare edge
  provenance headers.

### 2. Bucket Sweep Catch-Up - Core Covered, Hardening Remains

Add a catch-up scenario in the same Go Testcontainers suite.

Assertions:

- When the Worker writes `raw.eml` and `edge.json` but the fast-path
  notification is never posted, the sweep discovers the edge object and enqueues
  it.
- P0 hardening: the sweep uses the configured domain prefix and does not list
  unrelated domains.
- P0 hardening: listing handles continuation tokens by processing objects beyond
  the first page.
- If `result.json` already exists, the work item is marked completed and the
  poller does not replay SMTP.
- If an object has the local-route edge schema, the poller records it as skipped
  and never enqueues it for inbound replay.
- Malformed edge JSON, unsupported schema, invalid key layout, UUIDv7 time
  outside the sweep window, and missing raw object create diagnostics without
  stopping the sweep.
- P0 hardening: sweep cursor advancement only happens after a successful sweep
  pass.

### 3. Queue Retry, Lease, And Blocking - Core Covered, Hardening Remains

Add Mongo-backed retry and lease scenarios against a real MongoDB container.

Assertions:

- A transient archive or SMTP failure moves a leased item to `retry_wait`.
- The retry timer processes the item again when `next_attempt_at` is reached
  without requiring another sweep.
- The policy is exactly initial attempt plus two retries; the third failed
  processing attempt marks the item `blocked`.
- P0 hardening: a stale lease can be recovered by a later worker after
  `lease_until`.
- P0 hardening: a stale worker cannot mark delivered or completed after another
  lease owns the item.
- Processing failure for one item does not block later due items.
- P0 hardening: queue status reports pending, leased, retry wait, blocked,
  delivered, and completed counts accurately.

### 4. Inbound Delivery Outcomes And DSN - Core Covered

Add controlled fake WildDuck/Haraka scenarios to the inbound suite.

Assertions:

- Existing WildDuck delivery for the same ingest ID is detected before SMTP
  replay and produces a terminal delivered result without duplicate delivery.
- A forwarded-only address is classified as forward-only and does not require a
  local mailbox delivery proof.
- Unknown recipient with a valid sender writes `dsn.eml`, submits the DSN
  through outbound SMTP/provider plumbing, and writes
  `delivery_failed_dsn_submitted` to `result.json`.
- Unknown recipient with null or invalid sender suppresses DSN submission and
  writes `delivery_failed_dsn_suppressed`.
- DSN ID, DSN message ID, and DSN raw key are durable in Mongo and terminal
  duplicate notifications do not resubmit DSNs.
- P0 hardening: DSN state is reused across a transient DSN-send retry.
- Raw SHA mismatch is terminal blocked behavior, never delivered, and never
  writes a successful result.
- Missing edge or raw objects are retryable until the retry policy is exhausted.

### 5. SMTP Relay Provider Path - Cloudflare Core Covered, Provider Hardening Remains

Add a new Go Testcontainers suite for the SMTP relay with fake provider
endpoints.

Assertions:

- SMTP `MAIL FROM` is rejected before authentication.
- P0 hardening: authenticated relay requires `X-Agent-Mail-ZoneMTA-Queue-ID`.
- P0 hardening: mixed local and external recipients are rejected.
- Provider-bound mail writes `mail/outbound/<source_domain>/.../relay.eml`,
  `relay.json`, sanitized provider payload, and `result.json`.
- Provider payloads exclude internal provenance, loop, and boundary-auth
  headers.
- Cloudflare provider mode produces the expected request shape.
- P0 hardening: SES provider mode produces the expected request shape through a
  fake SES endpoint or a deliberately exported test seam.
- Provider failure still writes a terminal result that records the provider
  failure.
- P0 hardening: feedback return path is selected from the sender domain and
  never falls back to the first configured domain.
- P0 hardening: DSN null reverse-path submissions are accepted only for
  DSN-shaped messages.

### 6. SMTP Relay Local Routing - Core Covered

Add local active-domain routing scenarios to the SMTP relay suite.

Assertions:

- All-local recipients route internally without calling the external provider.
- Local route writes the source outbound archive result and the target inbound
  local-route `raw.eml`, `edge.json`, and `result.json`.
- The local route uses the original replay envelope sender when available.
- Null replay envelope sender is projected correctly.
- Existing target local-route proof is reused instead of creating a duplicate
  route ID.
- The poller sweep ignores the target local-route edge object.
- Multi-domain local routing chooses distinct source and target archive domains.
- P0 hardening: feedback route selection is asserted independently in a
  multi-domain local route.

### 7. Provision Apply With Fake Cloudflare And WildDuck - Core Covered, Hardening Remains

Create a service-boundary provisioning suite with the control API, fake
Cloudflare API, fake WildDuck API, and the current control-state backend.

Assertions:

- `agentMail.domain.add`, `modify`, and `remove` mutate only desired control
  state; fake Cloudflare and fake WildDuck receive no calls until
  `agentMail.provision.apply`.
- `agentMail.provision.apply` reads active desired state and ensures WildDuck
  feedback mailbox and aliases before applying Cloudflare routing.
- Apply fails clearly when there are no active domains.
- Apply fails clearly when Cloudflare API config is incomplete or the Worker
  script is missing.
- Apply deletes regular Cloudflare Email Routing rules and creates/enables the
  catch-all Worker rule for each active domain.
- Re-running apply is idempotent: no duplicate aliases, no duplicate routing
  rules, and stable applied status.
- Modifying a domain zone invalidates prior Cloudflare provision metadata and
  requires a new apply.
- Removing a domain deactivates it so runtime projection, poller, relay, and
  feedback config no longer treat it as active.
- P0 hardening: status includes desired state, applied state, Cloudflare status,
  WildDuck feedback status, module health, dependency health, queue status, and
  issues.

### 8. Control API Boundary - Core Covered

Keep these as in-process HTTP tests unless a full binary harness is needed.

Assertions:

- Control RPC endpoints require `X-Agent-Mail-Control-Token`.
- Tokens are never accepted through query strings, request body fields, or
  browser-readable public endpoints.
- `GET /healthz` remains unauthenticated and only returns readiness data safe
  for probes.
- Unknown methods, wrong methods, invalid JSON-RPC shapes, and missing required
  fields return stable errors.
- OpenAPI documents the internal control contract and does not document
  WildDuck, Mongo, provider, or R2 parent credentials.

### 9. Helm And Deployment Exposure - P0 Hardening

Extend chart or kind E2E tests for the deployment boundary.

Assertions:

- Public ingress routes only to the web server service.
- The mail-control service remains `ClusterIP`.
- The control admin port, WildDuck API, MongoDB, Redis, Haraka, ZoneMTA, Rspamd,
  and internal SMTP listeners are not exposed by ingress.
- Worker ingest is exposed only through the web server route
  `POST /agent-mail/ingest/v1`.
- Deployed runtime does not silently use in-memory domain control state.
- Current ConfigMap-backed domain state is either explicitly configured for the
  current implementation or replaced by Mongo-backed state when that work lands.

## P1 Full-Circle Runtime Tests

P1 is the first layer that must prove the mail runtime as a real data plane, not
only as package-level logic with fakes. A P1 full-circle test has to enter
through the same boundary a real message uses and has to observe the next
external boundary result.

Full-circle inbound means:

```text
Miniflare Worker email event
-> archive raw.eml and edge.json
-> signed fast-path notification
-> Mail Control Service queue
-> real Haraka SMTP replay
-> real WildDuck delivery storage/API
-> result.json and message provenance
```

Full-circle outbound means:

```text
real ZoneMTA feeder or DSN interface
-> ZoneMTA queue and Agent Mail provenance plugin
-> Mail Control Service SMTP relay
-> fake external provider or real local-domain route
-> outbound/local-route archive objects and result.json
```

Cloudflare's public API, public DNS, and outbound provider APIs may remain fake
in P1. MongoDB, Redis, Haraka, WildDuck, ZoneMTA, MinIO or R2-compatible
storage, and the Mail Control Service runtime path must be real containers or
real Worker runtime instances in the P1 acceptance suites. A bridge may mirror
Miniflare R2 objects into MinIO only to make the same archived objects visible
to the Go mail-control harness; it must forward the Worker's original signed
notification unchanged.

### 10. Worker Runtime Contract

Add Miniflare or Wrangler-local coverage for
`apps/cloudflare-email-worker/src/index.js`. This suite must execute the Worker
`email` handler through a Worker-like runtime. It must not only call
`archiveInboundMessage` or other library helpers directly.

Assertions:

- The Worker `email` handler derives recipient domain from the envelope
  recipient.
- Raw bytes are written before `edge.json`.
- Edge manifest fields match the Go parser fixture.
- Fast-path notification is signed, metadata-only, sent once, and uses the fixed
  `/agent-mail/ingest/v1` path.
- Worker failures after archive write do not delete committed archive objects.
- Stale Analytics or GraphQL bindings are ignored in the real Worker runtime,
  not just in library calls.
- The run directory retains the Worker request, notification body, notification
  headers with secrets redacted, and the archived object inventory.

### 11. Worker To Haraka/WildDuck Inbound Full Circle

Add a service-owned full-circle inbound runtime suite under
`apps/mail-control-service/test-containers`. The first acceptable topology is a
Go Testcontainers suite with MongoDB, Redis, Rspamd, WildDuck, Haraka, MinIO,
the Mail Control Service runtime path, and a Miniflare Worker actor. The suite
may use a harness bridge that mirrors Miniflare R2 objects into MinIO before
forwarding the Worker's original signed notification to the control fast-path
endpoint.

Assertions:

- A Worker `email` event for `agent@example.test` writes exact `raw.eml` bytes
  and a matching `edge.json`, then sends one signed metadata-only notification.
- The fast-path endpoint accepts the Worker's notification and creates exactly
  one Mongo queue item for the committed bundle.
- The Mail Control Service replays SMTP into real Haraka, not a fake SMTP
  server.
- Haraka stores the replayed message into real WildDuck storage.
- The final `result.json` records `status=delivered`, `delivery_source=replayed`,
  and the WildDuck user, mailbox, and message identifiers discovered from the
  real WildDuck store.
- The WildDuck-visible source contains the replay provenance headers that the
  control service projects, including the ingest ID and allowlisted Cloudflare
  edge evidence.
- The archived `raw.eml` object remains the exact Worker boundary bytes and is
  not replaced by the replayed Haraka/WildDuck source.
- Reposting or redelivering the same Worker notification remains idempotent: one
  queue item, one Haraka delivery, and one terminal result.
- If the notification is dropped, the bucket sweep discovers the Worker-written
  `edge.json` and converges on the same delivered result.

Regression cases:

- Haraka or WildDuck unavailable after archive commit leaves the item retryable
  without writing a successful result.
- SMTP acceptance without WildDuck delivery proof remains retryable; SMTP
  acceptance alone is not delivery proof.
- Existing `result.json` prevents a second Haraka replay.
- Local-route `edge.json` objects are skipped by inbound sweep.

### 12. ZoneMTA To Provider Outbound Full Circle

Add a full-circle outbound runtime suite that enters through real ZoneMTA, not
by connecting directly to the Mail Control Service SMTP relay.

Assertions:

- Submitting outbound mail through the ZoneMTA feeder queues the message in
  real ZoneMTA.
- The ZoneMTA Agent Mail provenance plugin adds
  `X-Agent-Mail-ZoneMTA-Queue-ID` before the Mail Control Service relay sees
  the message.
- ZoneMTA authenticates to the Mail Control Service SMTP relay with the
  configured relay credentials.
- The relay rejects a message when the ZoneMTA queue ID header is missing or
  malformed.
- Provider-bound mail writes `relay.eml`, `relay.json`, the sanitized provider
  payload, and terminal `result.json`.
- The fake provider receives the expected Cloudflare request shape and does not
  receive internal provenance, loop, relay-auth, or boundary-only headers.
- Provider permanent failure writes a terminal provider-failed result and keeps
  the archived relay payload for diagnosis.

Regression cases:

- Sender-domain feedback return path is selected from the sender domain, not
  the first configured domain.
- Mixed local and external recipients are rejected before provider submission.
- Oversized or malformed provider payloads fail with archived diagnostics and no
  partial provider success result.

### 13. ZoneMTA Local Route Full Circle

Add a full-circle local-routing suite that also enters through real ZoneMTA and
exercises the Mail Control Service local-domain branch.

Assertions:

- Mail submitted through ZoneMTA to an active local recipient routes through the
  Mail Control Service relay without calling the external provider.
- The source outbound archive and the target inbound local-route `raw.eml`,
  `edge.json`, and `result.json` are written with the correct source and target
  domains.
- The local route uses the original replay envelope sender when present and
  preserves a null reverse path when the ZoneMTA DSN interface submits a DSN.
- Existing local-route proof is reused and does not create a second local
  delivery or route ID.
- The inbound poller sweep skips the generated local-route edge object.
- Multi-domain local routing chooses source archive domain, target archive
  domain, feedback route, and provider identity independently.

### 14. DSN And Feedback Full Circle

Add runtime tests for the system DSN path and provider feedback path.

Assertions:

- Unknown inbound recipient with a valid sender causes the poller to submit a
  DSN through the real ZoneMTA DSN interface, not a user MSA path.
- ZoneMTA adds a queue ID to the DSN relay hop and the Mail Control Service
  accepts the null reverse path only for DSN-shaped messages.
- Unknown inbound recipient with a null sender suppresses DSN submission and
  writes `delivery_failed_dsn_suppressed`.
- Provider feedback delivered into the service-owned feedback mailbox is fetched
  from real WildDuck source and associated with the original sender or provider
  message record.
- Permanent recipient feedback is marked terminal; transient feedback remains
  retryable.
- Feedback processing emits structured logs without raw message bodies,
  credentials, tokens, or broad payload dumps.

### 15. Message Provenance API Boundary

Add a real Mongo/MinIO/fake-WildDuck API-level suite.

Assertions:

- Message provenance returns the canonical delivery archive key for messages
  delivered from replay.
- Source fetching uses exact WildDuck message source, not archive raw bytes, for
  mailbox views.
- Security evidence trusts Cloudflare edge evidence only when archive recipient,
  received-at, and ingest binding match the message.
- Forged local or upstream `Authentication-Results` headers are reported as
  untrusted.
- Remote images are blocked by default and external links are marked.

### 16. Runtime Regression Matrix

The full-circle suites must include explicit regression scenarios for the
failure modes that are most likely to produce stale references or false success.

Assertions:

- Stale queue lease recovery: a later worker can process after `lease_until`.
- Stale worker rejection: an old lease cannot mark delivered or completed after
  another lease owns the item.
- Sweep pagination: objects beyond the first list page are processed.
- Domain prefix isolation: sweep for one active domain does not list or process
  another domain's prefix.
- Restart recovery: a queued inbound bundle survives Mail Control Service
  process restart and finishes after restart.
- Provider retry/restart: an outbound result is not marked successful until the
  provider or local-route outcome is durably recorded.
- Worker archive partial failure: `raw.eml` without `edge.json` is ignored until
  the manifest appears; `edge.json` before `raw.eml` is retryable.

### 17. Feedback Runtime

Add an integration suite around the feedback router and mailbox processing once
the runtime loop is wired deeply enough to observe externally.

Assertions:

- Permanent recipient failures are marked seen and associated with the original
  sender.
- Transient recipient failures remain retryable.
- Non-recipient SMTP failures do not mark a recipient permanently failed.
- Feedback mailbox route selection is per-domain.
- Feedback processing emits structured logs without raw message or credential
  payload dumps.

### 18. Durable Desired Domain State

When Mongo-backed domain-control state is implemented, add a migration suite.

Assertions:

- Domain add, modify, remove, apply status, and runtime projection survive
  process restart.
- Deployed runtime defaults to Mongo state and fails fast if it would use memory
  state.
- ConfigMap state is either migrated once or rejected explicitly.
- Status no longer exposes stale ConfigMap metadata after the migration.
- Separate WildDuck and control Mongo databases remain separate.

## P2 Tests For Hosted Archive Work

These tests should not be written as passing E2E tests until the corresponding
implementation exists.

### 19. Org-Scoped Archive Prefix

Assertions:

- Hosted archive keys use
  `orgs/{org_public_id}/domains/{domain}/mail/inbound/...`.
- Poller, relay, provenance, and Worker parsers reject objects outside the
  persisted org/domain binding.
- Self-host and hosted layouts are selected by one explicit config owner.
- Multi-org tests prove one org cannot list, process, or decrypt another org's
  objects.

### 20. Temporary R2 Credentials

Assertions:

- Worker credentials can write only inside `orgs/{org_public_id}/`.
- Writes outside the prefix fail in the fake S3/R2 provider.
- Credential expiry and refresh status are persisted in server-owned state.
- Refresh updates Worker secrets/config without redeploying unchanged Worker
  code.
- Revoked grants, missing Workers, secret update failures, wrong Email Routing
  rules, credential mint failures, and archive write probe failures surface as
  degraded or down integration statuses.

### 21. Per-Org Archive Encryption

Assertions:

- Each organization uses distinct encryption material.
- Worker receives only the org-scoped encryption material needed for its writes.
- Raw keys never appear in browser APIs, logs, diagnostics, or public status.
- Archive decrypt happens only after org/domain binding validation.
- Key version, algorithm, salt or derivation metadata, and rotation status are
  stored with enough information to read old objects.
- Rotation can read old archives and write new archives with the new key
  version.

## Immediate Next Implementation Sequence

1. Add Miniflare Worker runtime coverage for `apps/cloudflare-email-worker` and
   retain Worker runtime artifacts in one run directory.
2. Add `mail-runtime-full-circle-e2e` under
   `apps/mail-control-service/test-containers` for Worker -> fast path ->
   Haraka -> WildDuck -> `result.json`.
3. Add real ZoneMTA outbound full-circle coverage for feeder -> ZoneMTA queue ->
   Mail Control Service relay -> fake Cloudflare provider.
4. Add real ZoneMTA local-route full-circle coverage for feeder or DSN
   interface -> Mail Control Service relay -> local-route archive/result.
5. Add DSN and feedback full-circle scenarios with the real ZoneMTA DSN
   interface and real WildDuck message source.
6. Add runtime regression cases for stale leases, stale workers, restart
   recovery, sweep pagination, domain prefix isolation, and partial Worker
   archives.
7. Extend chart or kind E2E to assert public ingress, internal service exposure,
   and the deployed runtime's use of durable control and queue state.

## Test Data To Standardize

- One active domain: `example.test`.
- Second active domain for no-fallback assertions: `second.test`.
- External sender: `sender@example.net`.
- Null sender: empty envelope sender rendered as `<>`.
- Local mailbox: `agent@example.test`.
- Unknown local mailbox: `missing@example.test`.
- Forward-only address: `forward@example.test`.
- Fixed raw fixture with stable `Message-ID` and Cloudflare provenance headers.
- UUIDv7 ingest IDs with decoded timestamps inside and outside sweep windows.

## Success Criteria

The Mail Control Service is adequately covered when a clean checkout can run:

```bash
mise run //apps/mail-control-service:check
TEST_ARTIFACT_SUBMIT_SKIP=1 mise run //apps/mail-control-service:test:e2e
corepack pnpm --filter agent-mail-cloudflare-worker test
mise run //charts:check
```

P1 is adequately covered when a clean checkout can additionally run:

```bash
TEST_ARTIFACT_SUBMIT_SKIP=1 mise run //apps/cloudflare-email-worker:test:miniflare
TEST_ARTIFACT_SUBMIT_SKIP=1 mise run //apps/mail-control-service/test-containers/mail-runtime-full-circle-e2e:test
TEST_ARTIFACT_SUBMIT_SKIP=1 mise run //apps/mail-control-service/test-containers/zonemta-full-circle-e2e:test
```

Those P1 task names are the required target ownership surfaces unless the
implementation discovers a concrete reason to merge the two mail-control
full-circle suites into one service-owned suite with separate scenarios under a
single run directory.

Together, these commands prove the current control service behavior across
control API, provisioning, inbound replay, queue state, SMTP relay, Worker
archive handoff, Haraka/WildDuck/ZoneMTA runtime paths, and deployment exposure
without relying on live Cloudflare, live R2, public DNS, or external SMTP
providers.
