# Full-Stack Helm E2E Plan

## Goal

Build a stack-wide E2E suite that installs the system through the Helm chart and
proves the deployed shape before continuing feature-level mail-control work.

This suite is intentionally allowed to fail at first. Its purpose is to expose
where the current chart, service wiring, public boundary, mail flows, and fake
provider setup do not match the intended architecture.

## Boundary Under Test

The target P1 boundary is:

- Public browser and public API traffic reaches only the web server.
- The frontend uses only web-server RPC/API routes.
- The mail control API, WildDuck API, Haraka, ZoneMTA, Rspamd, MongoDB, Redis,
  object storage, and provider fakes are internal.
- Any Worker fast-path handoff used by this suite must be reachable through the
  web-server boundary or be recorded as a current architecture mismatch.
- Internal test actors may run inside the cluster to observe and drive internal
  service boundaries, but they do not represent public ingress.

This is stricter than the older mail-runtime plan that allowed a separate
fast-path gate as public Worker ingress. For this P1 stack suite, exposing that
gate directly is treated as a failing boundary assertion unless the architecture
is explicitly revised.

## Existing Starting Point

`test-containers/kind-e2e` is the closest existing harness. It already:

- builds web-server and mail-control images;
- creates a kind cluster;
- installs `charts/agentteam-email` through Helm;
- waits for MongoDB, Redis, Rspamd, WildDuck, Haraka, ZoneMTA, mail-control,
  and web-server deployments;
- checks service types are `ClusterIP`;
- port-forwards the web server and checks `/health`.

It does not yet prove the stack works as a mail system:

- object storage is configured to an invalid endpoint;
- no MinIO or R2-compatible test service is installed;
- no Mailpit or fake external SMTP/provider sink is installed;
- no fake Cloudflare API is installed;
- no in-cluster test actor drives SMTP, Worker archive, or internal probes;
- no web-server domain-management API path is exercised;
- no mail is sent or received through WildDuck, Haraka, ZoneMTA, or the relay;
- the Helm chart does not currently prove that web-server-to-control-service
  configuration matches the compose setup.

## Harness Shape

Add a stack-owned suite under `test-containers/full-stack-e2e` or extend
`test-containers/kind-e2e` with named phases. Prefer a new suite if the current
kind smoke test should remain fast.

The suite should own one top-level command:

```bash
mise run //test-containers/full-stack-e2e:test
```

The command must create one run directory containing:

- rendered Helm manifests and values;
- cluster, pod, deployment, service, endpoint, ingress, and event snapshots;
- sanitized logs for web-server, mail-control, Haraka, WildDuck, ZoneMTA,
  Rspamd, MongoDB, Redis, MinIO, Mailpit, and fake providers;
- HTTP request/response traces with secrets redacted;
- SMTP transcripts with credentials redacted;
- object storage inventories and selected non-secret fixture objects;
- Mailpit or fake-provider message snapshots;
- explicit pass/fail status for every scenario phase.

## Test Dependencies

Install test-only dependencies through either Helm test values or separate
manifests applied by the harness:

- MinIO as the R2/S3-compatible archive bucket.
- Bucket/bootstrap job for required archive buckets and prefixes.
- Mailpit for application transactional email and optional SMTP sink assertions.
- Fake Cloudflare API for OAuth, account/zone selection, Worker deploy, Worker
  secrets, Email Routing rules, and R2 credential/status calls.
- Fake external outbound provider or SMTP sink for provider-bound mail.
- In-cluster test actor image with HTTP, SMTP, DNS, and object-storage tooling.

These dependencies are test infrastructure. They must not become production
chart defaults.

## Phase 0: Chart And Boundary Assertions

Assertions:

- Helm render succeeds with full-stack test values.
- Only the web server has public ingress or port-forwarded public access.
- No ingress routes to mail-control, WildDuck, Haraka, ZoneMTA, Rspamd, MongoDB,
  Redis, MinIO, Mailpit, or fake providers.
- Non-web runtime services remain `ClusterIP`.
- Browser/API health works through the web server.
- Direct public access attempts to internal APIs and SMTP listeners fail.
- Internal test actor can resolve and reach expected internal services by
  service DNS.
- Web-server deployment has the configuration it needs to call the internal
  control service; if it does not, the suite reports this as a wiring failure.

Expected current failures:

- The chart likely lacks the web-server internal mail-control API configuration
  present in compose.
- The existing kind values use an invalid object-storage endpoint.
- There is no chart-level fake provider or bucket bootstrap path.

## Phase 1: Web-Server-Only Actor Setup

Assertions:

- Test principal creation or sign-up is performed only through the web server.
- Test-only support endpoints are enabled only by test values and require the
  test support bearer token.
- Browser/client routes never receive internal control tokens, WildDuck admin
  credentials, parent R2 credentials, temporary R2 credentials, or archive
  encryption material.
- Domain setup is initiated through web-server RPC/API only.
- The web server records or reports integration/domain status without exposing
  internal provider or mail-runtime credentials.

Expected current failures:

- The web server may not yet expose the required mail-domain orchestration API.
- Current backend Cloudflare code may not align with the target internal
  control-service boundary or hosted shared-bucket model.

## Phase 2: Multi-Domain Provisioning Contract

Use two exact domains:

- `example.test`
- `second.test`

Assertions:

- A domain can be configured through the web server without direct browser
  access to mail-control or WildDuck.
- If no separate MAIL FROM domain is configured, the sender domain is used as
  the exact MAIL FROM domain.
- If a separate MAIL FROM domain is configured, validation and provider setup
  use that exact configured domain without wildcard fallback.
- Fake Cloudflare records the expected zone, Worker, secret, Email Routing, and
  status operations.
- Mail-control runtime/domain state becomes active only for domains successfully
  provisioned through the web-server-owned flow.
- `example.test` and `second.test` remain isolated: status, archive prefix,
  feedback route, and sender identity do not fall back across domains.

Expected current failures:

- Current domain state may still be control-service-owned memory or ConfigMap
  state rather than durable deployed state.
- The web-server/control-service ownership boundary may not exist in deployable
  form yet.

## Phase 3: Inbound Mail Full Stack

Target flow:

```text
fake Worker email event
-> MinIO archive raw.eml and edge.json
-> signed web-server-visible ingest notification
-> internal mail-control queue
-> Haraka SMTP replay
-> WildDuck delivery
-> result.json and web-server-visible message/provenance status
```

Assertions:

- Raw message bytes are stored before the edge manifest.
- Notification body is metadata-only and signed.
- The public notification entrypoint is through the web server for this suite.
- Mail-control creates exactly one queue item for the committed bundle.
- Replay enters real Haraka and delivery is proven from real WildDuck state.
- `result.json` records the terminal delivered result.
- Re-delivering the same notification is idempotent: one queue item, one
  Haraka delivery, one terminal result.
- Dropping the notification still converges through bucket sweep/catch-up.
- Unknown or inactive domain archive objects are rejected or left unprocessed
  with an explicit failure status.

Expected current failures:

- The web-server-visible ingest route may not exist.
- The deployed stack does not currently include MinIO-backed archive wiring.
- The chart may not configure durable queue/domain state for replay.

## Phase 4: Outbound Mail Full Stack

Target flow:

```text
authenticated mailbox/user action or internal submission
-> WildDuck or ZoneMTA submission path
-> ZoneMTA queue
-> mail-control SMTP relay
-> fake external provider or local-domain route
-> archive objects and result.json
```

Assertions:

- User-visible outbound submission enters through web-server-owned or mailbox
  submission surfaces, not by calling mail-control directly.
- ZoneMTA adds queue/provenance information before relay handling.
- The relay rejects missing or malformed queue/provenance data.
- Provider-bound mail reaches the fake provider or Mailpit sink with internal
  headers removed.
- Local route mail from `example.test` to `second.test` does not call the fake
  external provider.
- Sender-domain feedback route and provider identity are selected per domain.
- Permanent provider failure writes a terminal failed result and retains
  sanitized diagnostics.

Expected current failures:

- There may be no web-server-visible outbound product/API flow for this path.
- Provider sink configuration is not present in the chart-level test harness.

## Phase 5: Real-World Failure Matrix

Add explicit non-happy-path scenarios before broadening feature assertions:

- Web server unavailable during archive write: the Worker/archive path must not
  lose committed mail; catch-up behavior must be explicit.
- Object storage unavailable: the stack must not report healthy mail ingest.
- Bad signature, malformed signature, inactive domain, and wrong MAIL FROM
  domain are rejected without creating successful runtime state.
- Haraka accepts SMTP but WildDuck delivery proof is missing: result remains
  retryable, not delivered.
- Existing `result.json` prevents duplicate delivery.
- Sweep pagination processes objects beyond the first list page.
- Restart recovery proves queued inbound and outbound work survives process
  restarts.
- Cross-domain archive prefixes are not listed or processed by the wrong
  domain.

## Implementation Order

1. Split or extend the current kind harness into a full-stack suite with one
   run directory and richer artifact capture.
2. Add MinIO, Mailpit, fake Cloudflare, fake provider, and test actor manifests
   as test-only dependencies.
3. Add Phase 0 chart and public-boundary assertions. This should be the first
   failing/passing gate.
4. Add Phase 1 web-server-only test principal and domain setup entrypoint
   assertions.
5. Add Phase 2 fake multi-domain provisioning assertions.
6. Add Phase 3 inbound archive-to-WildDuck flow.
7. Add Phase 4 outbound ZoneMTA/relay/provider and local-route flow.
8. Add Phase 5 failure matrix cases as regressions are fixed.

## Success Criteria

P1 stack E2E is complete when a clean checkout can run:

```bash
TEST_ARTIFACT_SUBMIT_SKIP=1 mise run //test-containers/full-stack-e2e:test
```

and the suite proves:

- Helm chart deployment shape matches the intended public/internal boundary.
- The web server is the only public browser/API entrypoint.
- Fake provider dependencies are sufficient to avoid live Cloudflare, live DNS,
  live R2, and external SMTP.
- At least one inbound message reaches WildDuck through the deployed stack.
- At least one outbound message reaches a fake provider or local-domain route
  through the deployed stack.
- Two exact domains remain isolated across provisioning, archive paths,
  routing, and feedback identity.
- Expected unsupported or invalid states fail explicitly instead of appearing
  healthy.
