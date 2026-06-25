# Mail Control E2E Remaining Gaps

## Status

Partially implemented. Service-owned inbound replay and SMTP relay
Testcontainers suites exist, org-prefixed archive keys are implemented, and
temporary Worker R2 credentials are implemented. This file keeps only remaining
setup, boundary, and E2E gaps.

## Remaining Runtime Ownership Work

### Domain Control State

- Add a Mongo-backed domain-control state store owned by the mail-control
  service, or update the docs/chart to explicitly state the current runtime
  state backend.
- Make deployed runtime fail fast instead of silently using in-memory control
  state.
- Decide whether the Kubernetes ConfigMap backend and `configmap` status fields
  are deprecated, retained for self-hosting, or removed.
- Add restart tests proving domain add, modify, remove, provision apply, status,
  and runtime registry projection survive process restart.

### Poller Configuration Ownership

- Move poller sweep interval, retry delay, archive start, safety lag, overlap,
  lease duration, and test-shortened timings into the owning runtime
  configuration surface.
- Keep production sweep interval and retry policy explicit in configuration or
  durable docs.
- Add status fields and validation errors identifying missing or invalid poller
  settings.

## Remaining Harness Work

- Persist a result summary for each mail-control E2E top-level run.
- Persist artifact-submission output, or explicitly document that submission is
  skipped when `TEST_ARTIFACT_SUBMIT_SKIP` is set.
- Route verbose logs and subprocess/container logs into the single run
  directory for each invocation.
- Wire the SMTP relay contract suite into the root `mise run test:e2e` aggregate
  if it is intended to be part of repo-wide E2E validation.

## Remaining Worker And Storage E2E

- Add Miniflare or Wrangler-local coverage that executes the Cloudflare Worker
  `email` handler in a Worker-like runtime.
- Assert the Worker derives recipient domain from the envelope recipient, not
  stale bound config or untrusted message headers.
- Assert raw bytes are written before `edge.json`.
- Assert the Worker notification is metadata-only, signed, uses
  `/rpc/agent-mail/ingest/v1`, and does not retry from the Worker.
- Expand MinIO/R2-compatible tests for continuation-token listing, metadata,
  missing-object behavior, and prefix-scoped listing.
- Add hosted-mode assertions that temporary credentials cannot write outside the
  assigned org/domain prefix.
- Add encrypted-object assertions only after archive encryption is implemented.

## Remaining Full-Circle Mail Tests

### Inbound

- Add a full-circle path from Worker runtime to signed web ingest, mail-control
  queue, real Haraka replay, real WildDuck delivery proof, and `result.json`.
- Keep direct internal enqueue tests, but do not treat them as proof of the
  public Worker ingest boundary.
- Add bucket-sweep recovery where Worker notification is dropped and the
  committed `edge.json` is discovered.
- Add pagination/cursor hardening for bucket sweep.

### Outbound

- Add a full-circle path that enters through real ZoneMTA rather than directly
  connecting to the mail-control relay.
- Prove provider-bound outbound delivery to a fake provider and local active
  domain routing without provider fallback.
- Add multi-domain tests for sender domain, archive domain, feedback address,
  and provider identity.

## Remaining Web Ingest Hardening

- Decide whether unknown JSON fields in Worker notifications should be rejected
  instead of ignored.
- Keep tests proving HMAC, timestamp, content type, active deployment, org,
  domain, connection, prefix, and key authority are validated before queue
  mutation.

## Acceptance Checks

- Deployed mail-control runtime uses durable control state or clearly documents
  the chosen non-durable mode.
- E2E artifacts are collected once per top-level invocation.
- Worker runtime, web ingest, mail-control queue, Haraka, WildDuck, ZoneMTA, and
  fake provider boundaries are covered by full-circle tests.
- Prefix escape, cross-org, duplicate, retry, blocked, and pagination cases are
  covered without weakening the architecture boundary.
