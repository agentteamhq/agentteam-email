# Mail Control E2E Testing And Setup Gaps

## Goal

Validate the current mail-control, Cloudflare Worker, archive bucket, SMTP, and
frontend ownership model against the repository architecture contract before
expanding hosted-domain provisioning.

This document tracks pending implementation and test work discovered during the
initial setup review. The hosted shared-R2 temporary credential and encryption
contract is defined in `tasks/cloudflare-worker-r2-temporary-credentials.md`;
this document references that contract and focuses on the remaining setup,
boundary, and E2E validation gaps.

The detailed behavior-level contract test plan is tracked in
`tasks/mail-control-service-contract-test-plan.md`.

## Current Setup Baseline

- Local worktree setup uses `.env` with a worktree-specific `WT` slug and
  `CONTAINER_ENGINE=podman`.
- `mise install` completes with the pinned toolchain already installed.
- `pnpm install` completes with the current workspace lockfile and build-script
  approvals.
- `mise run //apps/mail-control-service:test` passes.
- `corepack pnpm --filter agent-mail-cloudflare-worker exec node --test --test-reporter tap`
  passes.
- `mise run //charts:template` passes.
- `apps/mail-control-service/test-containers/inbound-replay-smoke-e2e` now owns
  the first Go Testcontainers smoke path for MinIO, MongoDB, fast-path enqueue,
  SMTP replay, WildDuck delivery discovery, and `result.json`.

## Confirmed Architecture Boundaries

- Public browser and public API ingress must terminate at the web server.
- The mail control API, WildDuck API, MongoDB, Redis, Haraka, ZoneMTA, Rspamd,
  and internal SMTP listeners must remain internal.
- The frontend must use the web server API. It must not expose the mail control
  API token, WildDuck admin API, R2 parent credentials, Worker temporary
  credentials, or archive encryption material to the browser.
- The web server owns customer-facing Cloudflare OAuth, account and zone
  selection, Worker deployment or update, Worker secret refresh, integration
  status, and remediation messages.
- The mail control service owns mail-runtime coordination: domain runtime state,
  provision apply, inbound replay and queue processing, SMTP relay behavior,
  feedback processing, archive status, and internal status/reporting.

## Current Mismatches

- `apps/mail-control-service/internal/control/controlstate` still has a
  Kubernetes ConfigMap backend and package documentation that describes
  Kubernetes-native control state, while current docs say domain-control state
  belongs in MongoDB-backed service state.
- The mail control service currently defaults control state to memory unless
  `AGENT_MAIL_CONTROL_STATE_BACKEND` selects another backend. The Helm chart
  does not configure a durable domain-control state backend.
- `domainregistry.ControlStateStatus` still exposes `configmap` metadata.
- `controlservice.canonicalModuleConfig` hard-codes poller timing values such as
  sweep interval, retry delay, archive start, safety lag, and overlap instead of
  reading an owning configuration surface.
- `packages/backend/src/cloudflare/client.ts` currently creates or ensures a
  customer-account R2 bucket and deploys a generated Worker with a direct R2
  binding. The target hosted shape is one AgentTeam-owned archive bucket with
  org-scoped prefixes and temporary credentials.
- The checked-in Worker and Go archive key builders still use the self-host
  layout rooted at `mail/inbound/...`. The hosted org-prefixed layout is not
  implemented in the Worker, Go archive parser, poller, SMTP relay, or fixtures.
- The current Worker unit tests use an in-memory mock bucket, not Miniflare with
  real Worker runtime behavior or an S3-compatible fake.
- There is no MinIO-backed E2E path proving R2/S3 list, head, get, put,
  continuation, metadata, and prefix-scope behavior.
- The kind E2E harness proves deployment readiness and that services remain
  ClusterIP, but it does not yet send mail through Cloudflare Worker ingress,
  MinIO/R2 archive storage, fast-path notification, Mongo queue catch-up,
  Haraka/WildDuck replay, DSN generation, ZoneMTA, or the SMTP relay.

## Pending Implementation Work

### 1. Domain Control State Ownership

- Add a Mongo-backed domain-control state store owned by the mail control
  service.
- Make durable Mongo domain-control state the default in deployed runtime.
- Remove or formally deprecate the Kubernetes ConfigMap backend and stale
  `configmap` status fields after migration.
- Add startup validation that fails when deployed runtime would use memory state.
- Add tests proving domain add, modify, remove, provision apply, status, and
  runtime registry projection survive process restart.

### 2. Frontend And Web Server Ownership

- Keep browser UI flows in `packages/frontend` using web-server RPC only.
- Keep all Cloudflare OAuth tokens, internal control API tokens, WildDuck admin
  credentials, parent R2 credentials, temporary R2 credentials, and archive
  encryption material inside server-owned boundaries.
- Extend web-server RPC/service code so customer domain setup writes frontend
  integration state and then calls internal mail control operations only from
  the server side.
- Ensure ordinary mailbox, alias, forwarding, filter, and mailbox-token
  operations do not expose WildDuck admin credentials to the browser.

### 3. Hosted Shared Bucket With Org Prefixes

- Implement the hosted archive prefix contract:

```text
orgs/{org_public_id}/domains/{domain}/mail/inbound/{yyyy}/{mm}/{dd}/{ingest_id}/
```

- Decide whether self-host and hosted layouts are separate modes or one unified
  parser with explicit deployment mode.
- Update shared key builders, parsers, Worker fixtures, mail-control poller,
  SMTP relay archive writes, status surfaces, and tests.
- Add prefix-scope validation so mail control rejects archive objects whose org
  prefix does not match persisted org/domain binding.

### 4. Temporary R2 Credentials

- Move hosted Worker archive writes from direct R2 bindings to S3-compatible
  temporary credentials scoped to `orgs/{org_public_id}/`.
- Persist temporary credential expiry and integration status in backend-owned
  state.
- Add the daily refresh job and operator-triggered retry path.
- Prove refresh updates only Worker secrets/config when Worker code is
  unchanged.
- Add failure states for revoked grant, missing Worker, failed secret update,
  missing or wrong Email Routing rule, credential mint failure, and archive write
  probe failure.

### 5. Per-Org Archive Encryption

- Add an optional hosted archive encryption mode before Worker writes to R2.
- Use organization-scoped encryption material only. Workers must never receive
  parent archive encryption material or another organization's key material.
- Store only the server-owned encrypted key material, wrapped key, or secret
  reference needed by the backend to recover the org key. Do not return raw keys
  through UI, RPC, logs, diagnostics, or public APIs.
- Include key version, algorithm, salt or derivation metadata, and rotation
  status in persisted operational state.
- Update Worker, mail-control replay, message security evidence, and archive
  tooling to decrypt only after validating org/domain binding.

Security-sensitive implementation of this section requires current-task
alteration approval under `SECURITY.md`.

### 6. Poller And Catch-Up Configuration

- Move poller sweep interval, retry delay, archive start, safety lag, overlap,
  lease duration, and any test-shortened timings into the owning runtime
  configuration surface.
- Keep production sweep interval at six hours unless explicitly configured for a
  test fixture.
- Keep `max_retries` fixed at exactly `2` unless the architecture contract is
  changed.
- Add status fields and validation errors that identify which poller setting is
  missing or invalid.
- Add E2E test configuration with short intervals for fast catch-up validation.

## E2E Test Gaps

### Harness Discipline

- Add `result-summary.txt` or equivalent machine-readable result summaries to
  each E2E run directory.
- Route verbose logs and subprocess/container logs into the single top-level run
  directory for each invocation.
- Add artifact submission once per top-level invocation, gated by
  `TEST_ARTIFACT_SUBMIT_SKIP`.
- Avoid package test tasks that rerun `pnpm install` and fail on unrelated
  build-script approval gates after the workspace is already installed.

### Cloudflare Worker And Miniflare

- Add a Miniflare or Wrangler-local test that executes the Worker `email`
  handler in a Worker-like runtime rather than only calling library functions.
- Assert the Worker derives recipient domain from the envelope recipient, not
  stale bound domain config or untrusted message headers.
- Assert raw bytes are written before `edge.json`.
- Assert fast-path notification is metadata-only, signed, uses the fixed
  `/agent-mail/ingest/v1` path, and does not retry from the Worker.
- Assert stale Analytics or GraphQL bindings are ignored.

### MinIO / R2-Compatible Storage

- Expand the MinIO-backed mail-control smoke harness beyond replay coverage.
- Cover list with continuation, content type metadata, missing object behavior,
  and prefix-scoped listing.
- Add hosted-mode assertions that temporary credentials can write only inside
  `orgs/{org_public_id}/` and cannot write outside that prefix.
- Add encrypted-object assertions once archive encryption is implemented.

### SMTP And Mail Runtime

- Extend the first inbound replay smoke into the full runtime path:
  Worker archive bundle -> web server Worker ingest -> mail-control queue ->
  Haraka -> WildDuck -> `result.json`.
- Add a catch-up test where fast-path notification is dropped and the bucket
  sweep discovers and processes the committed `edge.json`.
- Add unknown-recipient tests for both DSN submitted and DSN suppressed paths.
- Add SMTP relay tests for provider-bound outbound archive writes and local
  active-domain routing without provider fallback.
- Add multi-domain tests proving sender domain, archive domain, feedback
  address, and provider identity do not fall back to the first configured
  domain.
- Add stale-result tests proving completed bundles are not reprocessed and
  local-route `edge.json` objects are not enqueued for replay.

### Kubernetes / Helm

- Extend kind E2E beyond readiness to validate:
  web server public ingress only;
  Worker ingest public route through the web server;
  control API and WildDuck remain internal;
  no CRD or ConfigMap domain-control backend is required for steady state;
  mail-control status reports Mongo-backed control state and queue state.
- Add fake Cloudflare and fake R2/S3 services to kind E2E for repeatable
  provisioning and archive tests.

## Open Questions

- Should self-host continue using the existing `mail/inbound/...` layout while
  hosted uses `orgs/{org_public_id}/...`, or should all deployments migrate to
  the org-prefixed parser with a default self-host org?
- What server-owned secret-storage surface should hold parent R2 credentials and
  parent archive encryption material?
- Should the database store a wrapped per-org archive key, a secret reference,
  or both?
- Which Cloudflare API endpoint is the canonical source for R2 temporary
  credential minting in the target implementation?
- Which E2E suite should own the first full SMTP + MinIO + Worker runtime path:
  a new dedicated test container, or an expanded kind E2E harness?
